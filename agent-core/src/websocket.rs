//! WebSocket client implementation for the HERMES agent

use futures_util::{SinkExt, StreamExt};
use serde_json;
use std::time::Duration;
use tokio::time::{interval, sleep};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{debug, error, info, warn};

use crate::commands::{CommandResponse, IncomingCommand};
use crate::config::ConnectionConfig;
use crate::system::{CpuUpdateMessage, RegistrationMessage};

/// WebSocket client for communicating with the HERMES server
pub struct WebSocketClient {
    config: ConnectionConfig,
}

impl WebSocketClient {
    /// Create a new WebSocket client
    pub fn new(config: ConnectionConfig) -> Self {
        Self { config }
    }

    /// Connect to the WebSocket server and handle communication
    pub async fn run<F, G>(&self, mut on_command: F, mut get_cpu_usage: G) -> crate::Result<()>
    where
        F: FnMut(IncomingCommand) -> tokio::task::JoinHandle<CommandResponse> + Send + Sync,
        G: FnMut() -> f32 + Send + Sync,
    {
        loop {
            match self
                .connect_and_run(&mut on_command, &mut get_cpu_usage)
                .await
            {
                Ok(_) => {
                    info!("WebSocket connection closed normally");
                    break;
                }
                Err(e) => {
                    error!("WebSocket connection failed: {}", e);
                    warn!(
                        "Reconnecting in {} seconds...",
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
    ) -> crate::Result<()>
    where
        F: FnMut(IncomingCommand) -> tokio::task::JoinHandle<CommandResponse> + Send + Sync,
        G: FnMut() -> f32 + Send + Sync,
    {
        info!("Connecting to WebSocket server: {}", self.config.url);

        // Connect to the WebSocket server
        let (ws_stream, response) = connect_async(&self.config.url)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to connect to WebSocket: {}", e))?;

        info!(
            "WebSocket connection established. Status: {}",
            response.status()
        );
        debug!("Response headers: {:?}", response.headers());

        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        // Send registration message
        let system_info = {
            let mut monitor = crate::system::SystemMonitor::new();
            monitor.get_system_info()
        };

        let registration = RegistrationMessage::new(system_info.clone());
        let registration_json = serde_json::to_string(&registration)
            .map_err(|e| anyhow::anyhow!("Failed to serialize registration message: {}", e))?;

        ws_sender
            .send(Message::Text(registration_json))
            .await
            .map_err(|e| anyhow::anyhow!("Failed to send registration message: {}", e))?;

        info!(
            "Registration message sent for agent: {}",
            system_info.agent_id
        );

        // Set up CPU monitoring interval
        let mut cpu_interval = interval(Duration::from_secs(5)); // Fixed 5-second interval
        let agent_id = system_info.agent_id.clone();

        // Main communication loop
        loop {
            tokio::select! {
                // Handle incoming messages
                msg = ws_receiver.next() => {
                    match msg {
                        Some(Ok(message)) => {
                            if let Err(e) = self.handle_incoming_message(message, &mut ws_sender, on_command).await {
                                error!("Error handling incoming message: {}", e);
                            }
                        }
                        Some(Err(e)) => {
                            error!("WebSocket receive error: {}", e);
                            break;
                        }
                        None => {
                            info!("WebSocket connection closed by server");
                            break;
                        }
                    }
                }

                // Send CPU updates periodically
                _ = cpu_interval.tick() => {
                    let cpu_usage = get_cpu_usage();
                    let cpu_update = CpuUpdateMessage::new(agent_id.clone(), cpu_usage);

                    match serde_json::to_string(&cpu_update) {
                        Ok(json) => {
                            if let Err(e) = ws_sender.send(Message::Text(json)).await {
                                error!("Failed to send CPU update: {}", e);
                                break;
                            }
                            debug!("CPU update sent: {:.2}%", cpu_usage);
                        }
                        Err(e) => {
                            error!("Failed to serialize CPU update: {}", e);
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Handle incoming WebSocket messages
    async fn handle_incoming_message<F>(
        &self,
        message: Message,
        ws_sender: &mut futures_util::stream::SplitSink<
            tokio_tungstenite::WebSocketStream<
                tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
            >,
            Message,
        >,
        on_command: &mut F,
    ) -> crate::Result<()>
    where
        F: FnMut(IncomingCommand) -> tokio::task::JoinHandle<CommandResponse> + Send + Sync,
    {
        match message {
            Message::Text(text) => {
                debug!("Received text message: {}", text);

                // Try to parse as a command
                match serde_json::from_str::<IncomingCommand>(&text) {
                    Ok(command) => {
                        info!("Received command: {}", command.command_type);

                        // Execute command asynchronously
                        let response_task = on_command(command);

                        // We can't clone the sender, so we'll handle the response inline
                        let response = response_task.await.unwrap_or_else(|e| {
                            error!("Command execution task failed: {}", e);
                            CommandResponse {
                                message_type: "command_response".to_string(),
                                request_id: None,
                                success: false,
                                result: None,
                                error: Some("Internal error".to_string()),
                            }
                        });

                        match serde_json::to_string(&response) {
                            Ok(response_json) => {
                                if let Err(e) = ws_sender.send(Message::Text(response_json)).await {
                                    error!("Failed to send command response: {}", e);
                                }
                            }
                            Err(e) => {
                                error!("Failed to serialize command response: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        warn!("Failed to parse incoming message as command: {}", e);
                        debug!("Message content: {}", text);
                    }
                }
            }
            Message::Binary(data) => {
                debug!("Received binary message: {} bytes", data.len());
                warn!("Binary messages are not supported");
            }
            Message::Ping(data) => {
                debug!("Received ping, sending pong");
                ws_sender
                    .send(Message::Pong(data))
                    .await
                    .map_err(|e| anyhow::anyhow!("Failed to send pong: {}", e))?;
            }
            Message::Pong(_) => {
                debug!("Received pong");
            }
            Message::Close(frame) => {
                info!("Received close message: {:?}", frame);
                return Err(anyhow::anyhow!("Connection closed by server"));
            }
            Message::Frame(_) => {
                debug!("Received raw frame (should not happen in normal operation)");
            }
        }

        Ok(())
    }
}
