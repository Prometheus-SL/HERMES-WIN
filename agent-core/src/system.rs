//! System monitoring and information gathering

use serde::{Deserialize, Serialize};
use sysinfo::System;
use tracing::debug;
use uuid::Uuid;
use std::fs;
use std::path::PathBuf;

/// System information snapshot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub agent_id: String,
    pub hostname: String,
    pub os_name: String,
    pub os_version: String,
    pub cpu_usage: f32,
    pub memory_total: u64,
    pub memory_used: u64,
    pub disk_usage: Vec<DiskInfo>,
    pub timestamp: u64,
}

/// Disk usage information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub total_space: u64,
    pub available_space: u64,
    pub usage_percent: f32,
}

/// System monitor for collecting system metrics
pub struct SystemMonitor {
    system: System,
    agent_id: String,
}

impl SystemMonitor {
    /// Create a new system monitor
    pub fn new() -> Self {
        let mut system = System::new_all();
        system.refresh_all();

        let agent_id = Self::load_or_create_persistent_agent_id();

        Self { system, agent_id }
    }

    /// Get the agent ID
    pub fn agent_id(&self) -> &str {
        &self.agent_id
    }

    /// Refresh system information
    pub fn refresh(&mut self) {
        debug!("Refreshing system information");
        self.system.refresh_all();
    }

    /// Get current system information
    pub fn get_system_info(&mut self) -> SystemInfo {
        self.refresh();

        let hostname = System::host_name().unwrap_or_else(|| "unknown".to_string());
        let os_name = System::name().unwrap_or_else(|| "unknown".to_string());
        let os_version = System::os_version().unwrap_or_else(|| "unknown".to_string());

        // Calculate average CPU usage
        let cpu_usage = if !self.system.cpus().is_empty() {
            self.system
                .cpus()
                .iter()
                .map(|cpu| cpu.cpu_usage())
                .sum::<f32>()
                / self.system.cpus().len() as f32
        } else {
            0.0
        };

        let memory_total = self.system.total_memory();
        let memory_used = self.system.used_memory();

        // Collect disk information - use empty vec for now as API has changed
        let disk_usage = vec![];

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        SystemInfo {
            agent_id: self.agent_id.clone(),
            hostname,
            os_name,
            os_version,
            cpu_usage,
            memory_total,
            memory_used,
            disk_usage,
            timestamp,
        }
    }

    /// Get only CPU usage for periodic updates
    pub fn get_cpu_usage(&mut self) -> f32 {
        debug!("Getting CPU usage");
        self.system.refresh_cpu_all();

        let usage = if !self.system.cpus().is_empty() {
            self.system
                .cpus()
                .iter()
                .map(|cpu| cpu.cpu_usage())
                .sum::<f32>()
                / self.system.cpus().len() as f32
        } else {
            0.0
        };

        debug!("CPU usage: {:.2}%", usage);
        usage
    }
}

impl Default for SystemMonitor {
    fn default() -> Self {
        Self::new()
    }
}

/// Registration message sent when connecting to the server
#[derive(Debug, Serialize, Deserialize)]
pub struct RegistrationMessage {
    pub message_type: String,
    pub agent_id: String,
    pub system_info: SystemInfo,
}

impl RegistrationMessage {
    pub fn new(system_info: SystemInfo) -> Self {
        Self {
            message_type: "register".to_string(),
            agent_id: system_info.agent_id.clone(),
            system_info,
        }
    }
}

/// Agent identification message with JWT token for WebSocket authentication
#[derive(Debug, Serialize, Deserialize)]
pub struct AgentIdentifyMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    #[serde(rename = "agentId")]
    pub agent_id: String,
    pub token: String,
}

impl AgentIdentifyMessage {
    pub fn new(agent_id: String, token: String) -> Self {
        Self {
            message_type: "agent".to_string(),
            agent_id,
            token,
        }
    }
}

/// CPU usage update message sent periodically
#[derive(Debug, Serialize, Deserialize)]
pub struct CpuUpdateMessage {
    pub message_type: String,
    pub agent_id: String,
    pub cpu_usage: f32,
    pub timestamp: u64,
}

impl CpuUpdateMessage {
    pub fn new(agent_id: String, cpu_usage: f32) -> Self {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        Self {
            message_type: "cpu_update".to_string(),
            agent_id,
            cpu_usage,
            timestamp,
        }
    }
}

impl SystemMonitor {
    /// Try to load a persistent agent ID from the user's config dir; if it doesn't exist, create and persist one.
    fn load_or_create_persistent_agent_id() -> String {
        // Resolve config dir, e.g., %APPDATA%/HERMES-WIN
        let base_dir = match dirs::config_dir() {
            Some(mut p) => {
                p.push("HERMES-WIN");
                p
            }
            None => {
                // Fallback: current directory
                PathBuf::from(".")
            }
        };

        // Ensure directory exists
        if let Err(e) = fs::create_dir_all(&base_dir) {
            debug!("Could not ensure config dir exists: {}", e);
        }

        let agent_id_path = base_dir.join("agent_id");

        // If exists, read and sanitize
        if let Ok(existing) = fs::read_to_string(&agent_id_path) {
            let trimmed = existing.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }

        // Create a new one and persist
        let new_id = Uuid::new_v4().to_string();
        if let Err(e) = fs::write(&agent_id_path, &new_id) {
            debug!("Failed to write persistent agent_id: {}", e);
        }
        new_id
    }
}
