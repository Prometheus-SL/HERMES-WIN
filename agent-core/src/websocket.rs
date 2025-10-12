//! WebSocket client implementation for the HERMES agent (migrado a Socket.IO)

use futures_util::FutureExt;
use serde_json;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::{interval, sleep};
use tracing::{debug, error, info, warn};

use crate::commands::{CommandResponse, IncomingCommand};
use crate::config::ConnectionConfig;
use crate::media::MediaMonitor;
use crate::system::{RegistrationMessage, AgentIdentifyMessage};

use rust_socketio::asynchronous::{Client, ClientBuilder};
use rust_socketio::{Payload, TransportType};
use url::Url;

/// WebSocket client for communicating with the HERMES server via Socket.IO
pub struct WebSocketClient {
    config: ConnectionConfig,
}

impl WebSocketClient {
    /// Create a new WebSocket client
    pub fn new(config: ConnectionConfig) -> Self {
        Self { config }
    }

    /// Connect to the Socket.IO server and handle communication
    pub async fn run<F, G>(&self, mut on_command: F, mut get_cpu_usage: G, access_token: Option<String>) -> crate::Result<()>
    where
        F: FnMut(IncomingCommand) -> tokio::task::JoinHandle<CommandResponse> + Send + Sync,
        G: FnMut() -> f32 + Send + Sync,
    {
        // La librería de Socket.IO soporta reconexión automática, pero mantenemos un bucle externo por si falla la construcción del cliente
        loop {
            match self
                .connect_and_run(&mut on_command, &mut get_cpu_usage, access_token.clone())
                .await
            {
                Ok(_) => {
                    info!("Socket.IO connection closed normally");
                    break;
                }
                Err(e) => {
                    error!("Socket.IO connection failed: {}", e);
                    warn!(
                        "Reintentando en {} segundos...",
                        self.config.reconnect_interval
                    );
                    sleep(Duration::from_secs(self.config.reconnect_interval)).await;
                }
            }
        }

        Ok(())
    }

    /// Internal method to handle a single connection session
    async fn connect_and_run<F, G>(
        &self,
        on_command: &mut F,
        get_cpu_usage: &mut G,
        access_token: Option<String>,
    ) -> crate::Result<()>
    where
        F: FnMut(IncomingCommand) -> tokio::task::JoinHandle<CommandResponse> + Send + Sync,
        G: FnMut() -> f32 + Send + Sync,
    {
        let _ = get_cpu_usage;
        info!("Connecting to Socket.IO server: {}", self.config.url);

        // Normalizar URL: Socket.IO espera http(s) o ws(s); permitimos wss/ws/http/https

        // Construir cliente asíncrono con callbacks
        let mut system_monitor = crate::system::SystemMonitor::new();
        let media_monitor = MediaMonitor::new();
        let system_info = system_monitor.get_system_info();
        let agent_id = system_info.agent_id.clone();

        // Canal para delegar ejecución de comandos fuera del callback
        let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<IncomingCommand>();

        // Callback de comandos: parsea y envía al canal
        let on_command_sender = cmd_tx.clone();
        let on_command_cb = move |payload: Payload, _client: Client| {
            // Clonar el sender ANTES del async move para que el future no capture el original
            let sender = on_command_sender.clone();
            async move {
                match payload {
                    Payload::Text(values) => {
                        for v in values {
                            match serde_json::from_value::<IncomingCommand>(v.clone()) {
                                Ok(cmd) => {
                                    info!("Received command: {}", cmd.command_type);
                                    if let Err(e) = sender.send(cmd) {
                                        error!("Failed to queue command: {}", e);
                                    }
                                }
                                Err(e) => {
                                    warn!("Failed to parse command payload: {}", e);
                                }
                            }
                        }
                    }
                    Payload::Binary(_) => {
                        warn!("Binary payload for command not supported");
                    }
                    _ => {}
                }
            }
            .boxed()
        };

        // Construcción del cliente con opciones de transporte y reconexión
        let reconnect_min = self.config.reconnect_interval.max(1);
        let reconnect_max = reconnect_min * 4;

        // Si la URL incluye path, úsalo como namespace
        let (address, namespace) = self.socketio_address_and_namespace(&self.config.url)?;

        // Preparar mensajes para emitir al abrir conexión
        let registration_value =
            serde_json::to_value(&RegistrationMessage::new(system_info.clone()))
                .map_err(|e| anyhow::anyhow!("Failed to serialize registration message: {}", e))?;
        
        // Preparar mensaje de identificación con token si está disponible
        let identify_value = if let Some(token) = access_token.clone() {
            Some(serde_json::to_value(&AgentIdentifyMessage::new(agent_id.clone(), token))
                .map_err(|e| anyhow::anyhow!("Failed to serialize identify message: {}", e))?)
        } else {
            None
        };
        
        let reg_agent_id = agent_id.clone();

        let mut builder = ClientBuilder::new(address)
            // Namespace por defecto "/"; si tu server usa "/agent" puedes cambiarlo aquí
            .on("open", move |_p, client| {
                let registration_value = registration_value.clone();
                let identify_value = identify_value.clone();
                let reg_agent_id = reg_agent_id.clone();
                async move {
                    info!("Socket.IO open");
                    
                    // Primero, enviar identificación con token si está disponible
                    if let Some(identify_msg) = identify_value {
                        if let Err(e) = client.emit("identify", identify_msg).await {
                            error!("Failed to emit identify on open: {}", e);
                        } else {
                            info!("Agent identify event emitted with token for agent: {}", reg_agent_id);
                        }
                    }
                    
                    // Luego, enviar registro tradicional
                    if let Err(e) = client.emit("register", registration_value).await {
                        error!("Failed to emit register on open: {}", e);
                    } else {
                        info!("Registration event emitted for agent: {}", reg_agent_id);
                    }
                }
                .boxed()
            })
            .on("close", |_p, _| {
                async {
                    info!("Socket.IO close");
                }
                .boxed()
            })
            .on("error", |err, _| {
                async move {
                    error!("Socket.IO error: {:?}", err);
                }
                .boxed()
            })
            .on("command", on_command_cb.clone())
            .transport_type(TransportType::Websocket)
            .reconnect(true)
            .reconnect_on_disconnect(true)
            .reconnect_delay(reconnect_min, reconnect_max);

        if let Some(ns) = namespace {
            builder = builder.namespace(ns);
        }

        // Intentar conectar; si el server devuelve Invalid namespace, reintentar sin namespace
        let client = match builder.connect().await {
            Ok(c) => c,
            Err(e) => {
                let msg = e.to_string();
                if msg.contains("Invalid namespace") {
                    warn!(
                        "Invalid namespace detectado, reintentando con namespace por defecto '/'"
                    );
                    // Clonar valores necesarios para el segundo builder
                    let agent_for_retry = agent_id.clone();
                    let system_info_retry = system_info.clone();
                    let nb = ClientBuilder::new(self.normalize_socketio_url(&self.config.url)?)
                        .on("open", move |_p, client| {
                            let registration_value = serde_json::to_value(
                                &RegistrationMessage::new(system_info_retry.clone()),
                            )
                            .unwrap_or(serde_json::json!({"error":"serialize"}));
                            let a = agent_for_retry.clone();
                            async move {
                                info!("Socket.IO open");
                                if let Err(e) = client.emit("register", registration_value).await {
                                    error!("Failed to emit register on open: {}", e);
                                } else {
                                    info!("Registration event emitted for agent: {}", a);
                                }
                            }
                            .boxed()
                        })
                        .on("close", |_p, _| {
                            async {
                                info!("Socket.IO close");
                            }
                            .boxed()
                        })
                        .on("error", |err, _| {
                            async move {
                                error!("Socket.IO error: {:?}", err);
                            }
                            .boxed()
                        })
                        .on("command", on_command_cb)
                        .transport_type(TransportType::Websocket)
                        .reconnect(true)
                        .reconnect_on_disconnect(true)
                        .reconnect_delay(reconnect_min, reconnect_max)
                        .connect()
                        .await;
                    match nb {
                        Ok(c2) => c2,
                        Err(e2) => {
                            return Err(anyhow::anyhow!("Failed to connect to Socket.IO: {}", e2))
                        }
                    }
                } else {
                    return Err(anyhow::anyhow!("Failed to connect to Socket.IO: {}", e));
                }
            }
        };

        // Enviar CPU updates y procesar comandos periódicamente
        let mut media_info_interval = interval(Duration::from_secs(5));
        // Enviar agent-data (estado/performance) de vez en cuando
        let mut agent_data_interval = interval(Duration::from_secs(30));
        loop {
            tokio::select! {
                // Publicación periódica de información general del agente
                _ = agent_data_interval.tick() => {
                    // Recopilar snapshot del sistema
                    let info = system_monitor.get_system_info();
                    let payload = serde_json::json!({
                        "agentId": info.agent_id,
                        "data": info,
                        "dataType": "system_status",
                        "tags": ["agent", "windows"]
                    });
                    match client.emit("agent-data", payload).await {
                        Ok(_) => debug!("agent-data enviado"),
                        Err(e) => {
                            error!("No se pudo enviar agent-data: {}", e);
                            sleep(Duration::from_secs(1)).await;
                        }
                    }
                },
                _ = media_info_interval.tick() => {
                    // Media update (solo si hay sesión activa y está reproduciendo)
                    match media_monitor.get_media_info() {
                        Ok(Some(info)) => {
                            let timestamp = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_secs();
                            let payload = serde_json::json!({
                                "dataType": "media_update",
                                "agentId": agent_id,
                                "data": info,
                                "timestamp": timestamp,
                                "tags": ["media", "windows"]
                            });
                            match client.emit("agent-data", payload).await {
                                Ok(_) => debug!("Media update sent"),
                                Err(e) => {
                                    error!("Failed to send media update: {}", e);
                                    sleep(Duration::from_secs(1)).await;
                                }
                            }
                        },
                        Ok(_) => { /* sin sesión o no reproduciendo: no enviar */ },
                        Err(e) => debug!("Media info not available: {}", e),
                    }
                }
                Some(cmd) = cmd_rx.recv() => {
                    let handle = on_command(cmd);
                    let response = handle.await.unwrap_or_else(|e| {
                        error!("Command execution task failed: {}", e);
                        CommandResponse {
                            message_type: "command_response".to_string(),
                            request_id: None,
                            success: false,
                            result: None,
                            error: Some("Internal error".to_string()),
                        }
                    });
                    if let Err(e) = client.emit("command_response", serde_json::to_value(&response).unwrap_or(serde_json::json!({"error":"serialize"}))).await {
                        error!("Failed to send command response: {}", e);
                    }
                }
            }
        }
    }

    fn normalize_socketio_url(&self, input: &str) -> crate::Result<String> {
        // Si el usuario pasó wss://.../agent como antes, lo aceptamos como está.
        // Socket.IO maneja http(s) y ws(s). Preferimos http(s) para handshake estándar.
        // Si la URL ya tiene esquema http/https/ws/wss, la retornamos.
        if let Ok(url) = Url::parse(input) {
            let scheme = url.scheme();
            if matches!(scheme, "http" | "https" | "ws" | "wss") {
                return Ok(input.to_string());
            }
        }
        // Si no tiene esquema, asumir http
        Ok(format!("http://{}", input))
    }

    fn socketio_address_and_namespace(
        &self,
        input: &str,
    ) -> crate::Result<(String, Option<String>)> {
        let normalized = self.normalize_socketio_url(input)?;
        let url = Url::parse(&normalized)
            .map_err(|e| anyhow::anyhow!("Invalid URL '{}': {}", input, e))?;
        let scheme = url.scheme();
        let host = url
            .host_str()
            .ok_or_else(|| anyhow::anyhow!("URL missing host"))?;
        let port_part = match url.port() {
            Some(p) => format!(":{}", p),
            None => String::new(),
        };
        let address = format!("{}://{}{}", scheme, host, port_part);
        let path = url.path();
        let namespace = if path != "/" && !path.is_empty() {
            Some(path.to_string())
        } else {
            None
        };
        Ok((address, namespace))
    }
}
