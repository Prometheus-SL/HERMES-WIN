//! # HERMES Windows Agent Core
//!
//! Core functionality for the HERMES Windows remote agent.
//! Provides WebSocket connectivity, system monitoring, and command execution.

pub mod agent;
pub mod commands;
pub mod config;
pub mod system;
pub mod websocket;

pub use agent::Agent;
pub use config::Config;

/// Result type used throughout the agent core
pub type Result<T> = anyhow::Result<T>;

/// Version information
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const NAME: &str = env!("CARGO_PKG_NAME");
