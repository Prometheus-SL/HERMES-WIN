//! Configuration handling for the HERMES agent

use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::debug;

/// Main configuration structure
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Config {
    pub connection: ConnectionConfig,
    pub agent: AgentConfig,
    pub security: SecurityConfig,
    pub commands: CommandsConfig,
    pub logging: LoggingConfig,
}

/// WebSocket connection configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ConnectionConfig {
    pub url: String,
    pub timeout: u64,
    pub reconnect_interval: u64,
}

/// Agent behavior configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AgentConfig {
    pub name: String,
    pub cpu_interval: u64,
    pub enable_tray: bool,
}

/// Security and TLS configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SecurityConfig {
    pub verify_tls: bool,
    pub ca_cert_path: Option<String>,
    pub client_cert_path: Option<String>,
    pub client_key_path: Option<String>,
}

/// Command whitelist configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CommandsConfig {
    pub allowed_commands: Vec<String>,
    pub allow_volume_control: bool,
    pub allow_app_launch: bool,
    pub allowed_apps: Vec<String>,
}

/// Logging configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LoggingConfig {
    pub level: String,
    pub log_to_file: bool,
    pub log_file: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            connection: ConnectionConfig {
                url: "wss://localhost:8080/agent".to_string(),
                timeout: 30,
                reconnect_interval: 5,
            },
            agent: AgentConfig {
                name: "HERMES-WIN-Agent".to_string(),
                cpu_interval: 5,
                enable_tray: true,
            },
            security: SecurityConfig {
                verify_tls: true,
                ca_cert_path: None,
                client_cert_path: None,
                client_key_path: None,
            },
            commands: CommandsConfig {
                allowed_commands: vec!["volume".to_string(), "open_app".to_string()],
                allow_volume_control: true,
                allow_app_launch: true,
                allowed_apps: vec![],
            },
            logging: LoggingConfig {
                level: "info".to_string(),
                log_to_file: true,
                log_file: "agent.log".to_string(),
            },
        }
    }
}

impl Config {
    /// Load configuration from a TOML file
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> crate::Result<Self> {
        debug!("Loading configuration from {:?}", path.as_ref());

        let content = std::fs::read_to_string(&path).map_err(|e| {
            anyhow::anyhow!("Failed to read config file {:?}: {}", path.as_ref(), e)
        })?;

        let config: Config = toml::from_str(&content)
            .map_err(|e| anyhow::anyhow!("Failed to parse config file: {}", e))?;

        debug!("Configuration loaded successfully");
        Ok(config)
    }

    /// Save configuration to a TOML file
    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> crate::Result<()> {
        debug!("Saving configuration to {:?}", path.as_ref());

        let content = toml::to_string_pretty(self)
            .map_err(|e| anyhow::anyhow!("Failed to serialize config: {}", e))?;

        std::fs::write(&path, content).map_err(|e| {
            anyhow::anyhow!("Failed to write config file {:?}: {}", path.as_ref(), e)
        })?;

        debug!("Configuration saved successfully");
        Ok(())
    }

    /// Load configuration from file, or create default if file doesn't exist
    pub fn load_or_default<P: AsRef<Path>>(path: P) -> crate::Result<Self> {
        match Self::load_from_file(&path) {
            Ok(config) => Ok(config),
            Err(_) => {
                debug!("Config file not found, creating default configuration");
                let config = Self::default();
                config.save_to_file(&path)?;
                Ok(config)
            }
        }
    }
}
