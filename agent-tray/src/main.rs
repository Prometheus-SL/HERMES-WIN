//! HERMES System Tray Application
//!
//! System tray application for the HERMES remote agent.

use agent_core::Agent;
use std::sync::mpsc;
use tracing::{error, info};

fn main() -> anyhow::Result<()> {
    // Initialize logging
    tracing_subscriber::fmt::init();

    info!("Starting HERMES agent system tray");

    // For now, run as a simple console application since cross-platform tray is complex
    let config_path = "config.toml";
    let agent = Agent::from_config_file(config_path)?;

    // Set up Ctrl+C handler
    let (shutdown_tx, shutdown_rx) = mpsc::channel();
    ctrlc::set_handler(move || {
        info!("Received shutdown signal");
        let _ = shutdown_tx.send(());
    })?;

    info!("HERMES agent tray started. Press Ctrl+C to exit.");

    // Create Tokio runtime
    let rt = tokio::runtime::Runtime::new()?;

    rt.block_on(async {
        // Run the agent
        let agent_task = tokio::spawn(async move {
            if let Err(e) = agent.run().await {
                error!("Agent error: {}", e);
            }
        });

        // Wait for shutdown signal
        let shutdown_rx_clone = shutdown_rx;
        tokio::task::spawn_blocking(move || {
            let _ = shutdown_rx_clone.recv();
        })
        .await?;

        info!("Shutting down...");
        agent_task.abort();

        Ok::<(), anyhow::Error>(())
    })?;

    Ok(())
}

// TODO: Implement proper system tray with menu items:
// - Start/Stop agent
// - View status
// - Open config
// - Exit
// This would require a more sophisticated UI framework like tauri or native Windows APIs
