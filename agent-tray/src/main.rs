//! HERMES System Tray Application
//!
//! System tray application for the HERMES remote agent.
//! Can run as a regular application or as a Windows service.

use agent_core::Agent;
use std::env;
use std::sync::mpsc;
use std::time::Duration;
use tracing::{error, info, warn};

fn main() -> anyhow::Result<()> {
    // Initialize logging
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
            "start" => return start_service(),
            "stop" => return stop_service(),
            "restart" => return restart_service(),
            "status" => return get_service_status(),
            "console" => return run_console(),
            _ => {
                println!("HERMES Agent Tray - Usage: {} [command]", args[0]);
                println!();
                println!("Commands:");
                println!("  install   - Install as Windows service (requires admin)");
                println!("  uninstall - Uninstall Windows service (requires admin)");
                println!("  start     - Start the service");
                println!("  stop      - Stop the service");
                println!("  restart   - Restart the service");
                println!("  status    - Show service status");
                println!("  console   - Run in console mode for testing");
                println!();
                println!("Run without arguments to start as Windows service.");
                return Ok(());
            }
        }
    }

    #[cfg(windows)]
    {
        // Run as Windows service
        windows_service::service_dispatcher::start("HermesAgentTray", ffi_service_main)?;
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

    info!("HERMES agent tray started. Press Ctrl+C to exit.");

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

    info!("Installing HERMES agent tray as Windows service");

    let manager =
        ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CREATE_SERVICE)?;

    let current_exe = env::current_exe()?;

    let service_info = ServiceInfo {
        name: "HermesAgentTray".into(),
        display_name: "HERMES Remote Agent Tray".into(),
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
    println!("✓ Service installed successfully!");
    println!("✓ Service configured to start automatically with Windows");
    println!("Service name: HermesAgentTray");
    println!("Display name: HERMES Remote Agent Tray");
    println!();
    println!("You can now:");
    println!("  - Start the service: agent-tray.exe start");
    println!("  - Check status: agent-tray.exe status");
    println!("  - Stop the service: agent-tray.exe stop");

    Ok(())
}

#[cfg(windows)]
fn uninstall_service() -> anyhow::Result<()> {
    use windows_service::service_manager::{ServiceManager, ServiceManagerAccess};

    info!("Uninstalling HERMES agent tray Windows service");

    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)?;
    let service = manager.open_service(
        "HermesAgentTray",
        windows_service::service::ServiceAccess::DELETE,
    )?;
    service.delete()?;

    println!("✓ Service uninstalled successfully!");
    Ok(())
}

#[cfg(windows)]
fn start_service() -> anyhow::Result<()> {
    use windows_service::{
        service::ServiceAccess,
        service_manager::{ServiceManager, ServiceManagerAccess},
    };

    info!("Starting HERMES agent tray service");

    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)?;
    let service = manager.open_service("HermesAgentTray", ServiceAccess::START)?;
    service.start(&[] as &[&str])?;

    println!("✓ Service started successfully!");
    Ok(())
}

#[cfg(windows)]
fn stop_service() -> anyhow::Result<()> {
    use windows_service::{
        service::ServiceAccess,
        service_manager::{ServiceManager, ServiceManagerAccess},
    };

    info!("Stopping HERMES agent tray service");

    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)?;
    let service = manager.open_service("HermesAgentTray", ServiceAccess::STOP)?;
    service.stop()?;

    println!("✓ Service stopped successfully!");
    Ok(())
}

#[cfg(windows)]
fn restart_service() -> anyhow::Result<()> {
    println!("Restarting HERMES agent tray service...");
    
    match stop_service() {
        Ok(_) => {
            println!("Waiting for service to stop...");
            std::thread::sleep(Duration::from_secs(2));
        }
        Err(e) => {
            warn!("Service might not be running: {}", e);
        }
    }
    
    start_service()?;
    println!("✓ Service restarted successfully!");
    Ok(())
}

#[cfg(windows)]
fn get_service_status() -> anyhow::Result<()> {
    use windows_service::{
        service::{ServiceAccess, ServiceState},
        service_manager::{ServiceManager, ServiceManagerAccess},
    };

    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)?;
    
    match manager.open_service("HermesAgentTray", ServiceAccess::QUERY_STATUS) {
        Ok(service) => {
            let status = service.query_status()?;
            println!("Service Status: {}", match status.current_state {
                ServiceState::Stopped => "STOPPED",
                ServiceState::StartPending => "START PENDING",
                ServiceState::StopPending => "STOP PENDING",
                ServiceState::Running => "RUNNING",
                ServiceState::ContinuePending => "CONTINUE PENDING",
                ServiceState::PausePending => "PAUSE PENDING",
                ServiceState::Paused => "PAUSED",
            });
            println!("Service Name: HermesAgentTray");
            println!("Display Name: HERMES Remote Agent Tray");
        }
        Err(_) => {
            println!("Service Status: NOT INSTALLED");
            println!("Use 'agent-tray.exe install' to install the service");
        }
    }

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

#[cfg(not(windows))]
fn start_service() -> anyhow::Result<()> {
    error!("Service management is only supported on Windows");
    Ok(())
}

#[cfg(not(windows))]
fn stop_service() -> anyhow::Result<()> {
    error!("Service management is only supported on Windows");
    Ok(())
}

#[cfg(not(windows))]
fn restart_service() -> anyhow::Result<()> {
    error!("Service management is only supported on Windows");
    Ok(())
}

#[cfg(not(windows))]
fn get_service_status() -> anyhow::Result<()> {
    error!("Service management is only supported on Windows");
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
    let status_handle = service_control_handler::register("HermesAgentTray", event_handler)?;

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

// TODO: Implement proper system tray with menu items:
// - Start/Stop agent
// - View status
// - Open config
// - Exit
// This would require a more sophisticated UI framework like tauri or native Windows APIs
