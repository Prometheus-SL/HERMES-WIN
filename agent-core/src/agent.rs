//! Main agent implementation that coordinates all components

use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};

use crate::auth::AuthManager;
use crate::commands::{CommandExecutor, IncomingCommand};
use crate::config::Config;
use crate::system::SystemMonitor;
use crate::websocket::WebSocketClient;

/// Main HERMES agent that coordinates all functionality
pub struct Agent {
    config: Config,
    system_monitor: Arc<Mutex<SystemMonitor>>,
    command_executor: CommandExecutor,
    websocket_client: WebSocketClient,
    auth_manager: Arc<Mutex<AuthManager>>,
}

impl Agent {
    /// Create a new agent with the given configuration
    pub fn new(config: Config) -> crate::Result<Self> {
        // Ensure a rustls crypto provider is installed (ring). Ignore error if already set.
        let _ = rustls::crypto::ring::default_provider().install_default();

        info!("Initializing HERMES agent");
        debug!("Agent configuration: {:?}", config);

        let system_monitor = Arc::new(Mutex::new(SystemMonitor::new()));
        let command_executor = CommandExecutor::new(config.commands.clone());
        let websocket_client = WebSocketClient::new(config.connection.clone());
        
        // Get agent ID from system monitor for auth manager initialization
        let temp_monitor = SystemMonitor::new();
        let agent_id = temp_monitor.agent_id().to_string();
        let auth_manager = Arc::new(Mutex::new(
            AuthManager::new(config.auth.clone(), agent_id)
                .map_err(|e| anyhow::anyhow!("Failed to create AuthManager: {}", e))?
        ));

        Ok(Self {
            config,
            system_monitor,
            command_executor,
            websocket_client,
            auth_manager,
        })
    }

    /// Create agent from configuration file
    pub fn from_config_file(config_path: &str) -> crate::Result<Self> {
        let config = Config::load_or_default(config_path)?;
        Self::new(config)
    }

    /// Get the agent ID
    pub async fn agent_id(&self) -> String {
        let monitor = self.system_monitor.lock().await;
        monitor.agent_id().to_string()
    }

    /// Perform agent login to get JWT tokens
    pub async fn login(&self) -> crate::Result<()> {
        let mut auth_manager = self.auth_manager.lock().await;
        
        match auth_manager.login().await {
            Ok(tokens) => {
                info!("Agent login successful");
                debug!("Access token obtained: {}...", &tokens.access_token[..20]);
                
                info!("Authentication tokens stored successfully");
                Ok(())
            }
            Err(e) => {
                error!("Agent login failed: {}", e);
                Err(e)
            }
        }
    }

    /// Get the current access token for WebSocket authentication
    pub async fn get_access_token(&self) -> Option<String> {
        let auth_manager = self.auth_manager.lock().await;
        auth_manager.get_access_token().cloned()
    }

    /// Send data to the server via HTTP with authentication
    pub async fn send_data_http(&self, data: serde_json::Value, data_type: &str, priority: &str, tags: Vec<String>) -> crate::Result<()> {
        let mut auth_manager = self.auth_manager.lock().await;
        let agent_id = self.agent_id().await;
        
        let data_request = crate::auth::AgentDataRequest {
            data,
            data_type: data_type.to_string(),
            priority: priority.to_string(),
            tags,
            agent_id: Some(agent_id),
        };
        
        auth_manager.send_data(data_request).await
    }

    /// Send performance data to the server via HTTP
    pub async fn send_performance_data(&self) -> crate::Result<()> {
        let system_info = self.get_system_info().await;
        let mut monitor = self.system_monitor.lock().await;
        let cpu_usage = monitor.get_cpu_usage();
        
        let performance_data = serde_json::json!({
            "type": "performance",
            "cpu": cpu_usage,
            "hostname": system_info.hostname,
            "os_name": system_info.os_name,
            "os_version": system_info.os_version,
            "timestamp": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
        });
        
        self.send_data_http(
            performance_data,
            "sensor",
            "normal",
            vec!["performance".to_string(), "cpu".to_string()]
        ).await
    }

    /// Setup user credentials for authentication (first-time setup)
    pub async fn setup_credentials(&self, email: String, password: String) -> crate::Result<()> {
        let auth_manager = self.auth_manager.lock().await;
        auth_manager.setup_credentials(email, password)?;
        info!("User credentials configured successfully");
        Ok(())
    }

    /// Check if credentials are already configured
    pub async fn has_stored_credentials(&self) -> bool {
        let auth_manager = self.auth_manager.lock().await;
        auth_manager.has_stored_credentials()
    }

    /// Clear all stored credentials and tokens (logout/reset)
    pub async fn clear_credentials(&self) -> crate::Result<()> {
        let mut auth_manager = self.auth_manager.lock().await;
        auth_manager.clear_tokens()?;
        info!("All credentials and tokens cleared");
        Ok(())
    }

    /// Get authentication status information
    pub async fn get_auth_status(&self) -> AuthStatus {
        let auth_manager = self.auth_manager.lock().await;
        
        AuthStatus {
            has_stored_credentials: auth_manager.has_stored_credentials(),
            has_valid_token: auth_manager.has_valid_token(),
            server_url: auth_manager.get_server_url().clone(),
            agent_id: self.agent_id().await,
        }
    }

    /// Start the agent and run indefinitely
    pub async fn run(&self) -> crate::Result<()> {
        info!("Starting HERMES agent: {}", self.config.agent.name);

        // Initialize logging
        self.init_logging()?;

        let agent_id = self.agent_id().await;
        info!("Agent ID: {}", agent_id);

        // Perform authentication login
        info!("Attempting agent authentication...");
        match self.login().await {
            Ok(_) => {
                info!("Agent authentication successful");
            }
            Err(e) => {
                error!("Agent authentication failed: {}", e);
                warn!("Continuing without authentication - WebSocket connection may fail");
            }
        }

        // Create closures for WebSocket callbacks
        let command_executor = Arc::new(self.command_executor.clone());
        let system_monitor = Arc::clone(&self.system_monitor);

        // Command handler closure
        let on_command = {
            let executor = Arc::clone(&command_executor);
            move |command: IncomingCommand| {
                let executor = Arc::clone(&executor);
                tokio::spawn(async move { executor.execute(command).await })
            }
        };

        // CPU usage provider closure
        let get_cpu_usage = {
            let monitor = Arc::clone(&system_monitor);
            move || {
                let monitor = monitor.clone();
                tokio::task::block_in_place(|| {
                    tokio::runtime::Handle::current().block_on(async {
                        let mut monitor = monitor.lock().await;
                        monitor.get_cpu_usage()
                    })
                })
            }
        };

        // Start WebSocket connection
        info!("Connecting to server: {}", self.config.connection.url);
        let access_token = self.get_access_token().await;
        self.websocket_client.run(on_command, get_cpu_usage, access_token).await?;

        Ok(())
    }

    /// Get current system information
    pub async fn get_system_info(&self) -> crate::system::SystemInfo {
        let mut monitor = self.system_monitor.lock().await;
        monitor.get_system_info()
    }

    /// Initialize logging based on configuration
    fn init_logging(&self) -> crate::Result<()> {
        use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter, Layer};

        let env_filter = EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new(&self.config.logging.level));

        let mut layers = Vec::new();

        // Console output
        let fmt_layer = tracing_subscriber::fmt::layer()
            .with_target(false)
            .with_thread_ids(true)
            .with_level(true);
        layers.push(fmt_layer.boxed());

        // File output if enabled
        if self.config.logging.log_to_file {
            let file = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.config.logging.log_file)
                .map_err(|e| anyhow::anyhow!("Failed to open log file: {}", e))?;

            let file_layer = tracing_subscriber::fmt::layer()
                .with_writer(file)
                .with_target(false)
                .with_thread_ids(true)
                .with_level(true)
                .with_ansi(false);
            layers.push(file_layer.boxed());
        }

        // Try to initialize logging, but don't fail if already initialized
        if let Err(_) = tracing_subscriber::registry()
            .with(env_filter)
            .with(layers)
            .try_init() {
            // Logging already initialized, continue silently
        }

        info!(
            "Logging initialized - level: {}, file: {}",
            self.config.logging.level,
            if self.config.logging.log_to_file {
                &self.config.logging.log_file
            } else {
                "disabled"
            }
        );

        Ok(())
    }

    /// Shutdown the agent gracefully
    pub async fn shutdown(&self) {
        info!("Shutting down HERMES agent");
        // Add any cleanup logic here
    }
}

/// Authentication status information
#[derive(Debug, Clone)]
pub struct AuthStatus {
    pub has_stored_credentials: bool,
    pub has_valid_token: bool,
    pub server_url: String,
    pub agent_id: String,
}
