//! HERMES Windows Service
//!
//! Windows service wrapper for the HERMES remote agent.

use agent_core::Agent;
use std::env;
use std::sync::mpsc;
use std::time::Duration;
use tracing::{error, info};

fn main() -> anyhow::Result<()> {
    // Initialize basic logging for the service
    tracing_subscriber::fmt()
        .with_target(false)
        .try_init()
        .unwrap_or_else(|_| {}); // Ignore if already initialized

    // rustls provider is installed in agent-core::Agent::new

    let args: Vec<String> = env::args().collect();

    if args.len() > 1 {
        match args[1].as_str() {
            "install" => return install_service(),
            "uninstall" => return uninstall_service(),
            "console" => return run_console(),
            _ => {
                println!("Usage: {} [install|uninstall|console]", args[0]);
                println!("  install   - Install as Windows service");
                println!("  uninstall - Uninstall Windows service");
                println!("  console   - Run in console mode for testing");
                return Ok(());
            }
        }
    }

    #[cfg(windows)]
    {
        // Run as Windows service
        windows_service::service_dispatcher::start("HermesAgent", ffi_service_main)?;
    }

    #[cfg(not(windows))]
    {
        warn!("Windows service mode is only available on Windows. Running in console mode.");
        run_console()?;
    }

    Ok(())
}

/// Run the agent in console mode (for testing)
fn run_console() -> anyhow::Result<()> {
    info!("Starting HERMES agent in console mode");

    let config_path = "config.toml";
    let agent = Agent::from_config_file(config_path)?;

    // Set up Ctrl+C handler
    let (shutdown_tx, shutdown_rx) = mpsc::channel();
    ctrlc::set_handler(move || {
        info!("Received shutdown signal");
        let _ = shutdown_tx.send(());
    })?;

    // Create Tokio runtime and run the agent
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

#[cfg(windows)]
fn install_service() -> anyhow::Result<()> {
    use windows_service::{
        service::{ServiceAccess, ServiceErrorControl, ServiceInfo, ServiceStartType, ServiceType},
        service_manager::{ServiceManager, ServiceManagerAccess},
    };

    info!("Installing HERMES agent as Windows service");

    let manager =
        ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CREATE_SERVICE)?;

    let current_exe = env::current_exe()?;

    let service_info = ServiceInfo {
        name: "HermesAgent".into(),
        display_name: "HERMES Remote Agent".into(),
        service_type: ServiceType::OWN_PROCESS,
        start_type: ServiceStartType::AutoStart,
        error_control: ServiceErrorControl::Normal,
        executable_path: current_exe,
        launch_arguments: vec![],
        dependencies: vec![],
        account_name: None,
        account_password: None,
    };

    let _service = manager.create_service(&service_info, ServiceAccess::CHANGE_CONFIG)?;
    info!("Service installed successfully");

    Ok(())
}

#[cfg(windows)]
fn uninstall_service() -> anyhow::Result<()> {
    use windows_service::service_manager::{ServiceManager, ServiceManagerAccess};

    info!("Uninstalling HERMES agent Windows service");

    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)?;
    let service = manager.open_service(
        "HermesAgent",
        windows_service::service::ServiceAccess::DELETE,
    )?;
    service.delete()?;

    info!("Service uninstalled successfully");
    Ok(())
}

#[cfg(not(windows))]
fn install_service() -> anyhow::Result<()> {
    error!("Service installation is only supported on Windows");
    Ok(())
}

#[cfg(not(windows))]
fn uninstall_service() -> anyhow::Result<()> {
    error!("Service uninstallation is only supported on Windows");
    Ok(())
}

#[cfg(windows)]
windows_service::define_windows_service!(ffi_service_main, service_main);

#[cfg(windows)]
fn service_main(_arguments: Vec<std::ffi::OsString>) {
    if let Err(e) = run_service() {
        error!("Service error: {}", e);
    }
}

#[cfg(windows)]
fn run_service() -> anyhow::Result<()> {
    use windows_service::{
        service::{
            ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus,
            ServiceType,
        },
        service_control_handler::{self, ServiceControlHandlerResult},
    };

    let (shutdown_tx, shutdown_rx) = mpsc::channel();

    // Define service control handler
    let shutdown_tx_clone = shutdown_tx.clone();
    let event_handler = move |control_event| -> ServiceControlHandlerResult {
        match control_event {
            ServiceControl::Stop | ServiceControl::Shutdown => {
                let _ = shutdown_tx_clone.send(());
                ServiceControlHandlerResult::NoError
            }
            ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    };

    // Register service control handler
    let status_handle = service_control_handler::register("HermesAgent", event_handler)?;

    // Set service status to running
    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Running,
        controls_accepted: ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    })?;

    info!("Windows service started");

    // Create and run the agent
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(async {
        let config_path = "config.toml";
        match Agent::from_config_file(config_path) {
            Ok(agent) => {
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

                info!("Shutdown signal received, stopping agent");
                agent_task.abort();
            }
            Err(e) => {
                error!("Failed to create agent: {}", e);
            }
        }

        Ok::<(), anyhow::Error>(())
    })?;

    // Set service status to stopped
    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Stopped,
        controls_accepted: ServiceControlAccept::empty(),
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    })?;

    info!("Windows service stopped");
    Ok(())
}
