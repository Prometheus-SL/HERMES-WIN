//! Test sleep command

use agent_core::commands::CommandExecutor;
use agent_core::config::CommandsConfig;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing for debug output
    tracing_subscriber::fmt::init();

    println!("😴 Probando comando de suspensión del sistema");
    println!("==============================================");

    // Create command executor with sleep command enabled
    let config = CommandsConfig {
        allowed_commands: vec!["sleep".to_string()],
        allow_volume_control: false,
        allow_app_launch: false,
        allowed_apps: vec![],
    };

    let executor = CommandExecutor::new(config);

    println!("⚠️  ADVERTENCIA: Este test va a suspender tu sistema!");
    println!("Presiona Ctrl+C en los próximos 5 segundos para cancelar...");
    
    // Give user time to cancel
    for i in (1..=5).rev() {
        println!("   Suspendiendo en {} segundos...", i);
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }

    // Test suspend
    println!("💤 Ejecutando suspensión del sistema...");
    let suspend_command = agent_core::commands::IncomingCommand {
        command_type: "sleep".to_string(),
        parameters: json!({
            "type": "blocking"  // or "non-blocking"
        }),
        request_id: Some("test-suspend".to_string()),
    };

    let response = executor.execute(suspend_command).await;
    println!("   Resultado: {}", serde_json::to_string_pretty(&response)?);

    // This code might not be reached if the system actually suspends
    println!("✅ Comando ejecutado!");

    Ok(())
}