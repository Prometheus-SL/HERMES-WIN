//! Main agent implementation that coordinates all components

use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, info};

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
}

impl Agent {
    /// Create a new agent with the given configuration
    pub fn new(config: Config) -> Self {
        // Ensure a rustls crypto provider is installed (ring). Ignore error if already set.
        let _ = rustls::crypto::ring::default_provider().install_default();

        info!("Initializing HERMES agent");
        debug!("Agent configuration: {:?}", config);

        let system_monitor = Arc::new(Mutex::new(SystemMonitor::new()));
        let command_executor = CommandExecutor::new(config.commands.clone());
        let websocket_client = WebSocketClient::new(config.connection.clone());

        Self {
            config,
            system_monitor,
            command_executor,
            websocket_client,
        }
    }

    /// Create agent from configuration file
    pub fn from_config_file(config_path: &str) -> crate::Result<Self> {
        let config = Config::load_or_default(config_path)?;
        Ok(Self::new(config))
    }

    /// Get the agent ID
    pub async fn agent_id(&self) -> String {
        let monitor = self.system_monitor.lock().await;
        monitor.agent_id().to_string()
    }

    /// Start the agent and run indefinitely
    pub async fn run(&self) -> crate::Result<()> {
        info!("Starting HERMES agent: {}", self.config.agent.name);

        // Initialize logging
        self.init_logging()?;

        let agent_id = self.agent_id().await;
        info!("Agent ID: {}", agent_id);

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
        self.websocket_client.run(on_command, get_cpu_usage).await?;

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
