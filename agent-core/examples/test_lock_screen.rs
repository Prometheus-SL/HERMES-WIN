//! Test lock screen command

use agent_core::commands::CommandExecutor;
use agent_core::config::CommandsConfig;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing for debug output
    tracing_subscriber::fmt::init();

    println!("🔒 Probando comando de bloqueo de pantalla");
    println!("==========================================");

    // Create command executor with lock_screen command enabled
    let config = CommandsConfig {
        allowed_commands: vec!["lock_screen".to_string()],
        allow_volume_control: false,
        allow_app_launch: false,
        allowed_apps: vec![],
    };

    let executor = CommandExecutor::new(config);

    println!("⚠️  ADVERTENCIA: Este test va a bloquear tu pantalla!");
    println!("Presiona Ctrl+C en los próximos 5 segundos para cancelar...");
    
    // Give user time to cancel
    for i in (1..=5).rev() {
        println!("   Bloqueando pantalla en {} segundos...", i);
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }

    // Test lock screen
    println!("🔐 Ejecutando bloqueo de pantalla...");
    let lock_command = agent_core::commands::IncomingCommand {
        command_type: "lock_screen".to_string(),
        parameters: json!({}), // No parameters needed
        request_id: Some("test-lock".to_string()),
    };

    let response = executor.execute(lock_command).await;
    println!("   Resultado: {}", serde_json::to_string_pretty(&response)?);

    // This code might not be reached if the screen actually locks
    println!("✅ Comando ejecutado!");

    Ok(())
}