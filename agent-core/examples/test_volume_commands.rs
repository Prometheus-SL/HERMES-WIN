//! Test volume control commands and availability

use agent_core::commands::CommandExecutor;
use agent_core::config::CommandsConfig;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing for debug output
    tracing_subscriber::fmt::init();

    println!("🔊 Probando comandos de control de volumen");
    println!("==========================================");

    // Create command executor with volume control enabled
    let config = CommandsConfig {
        allowed_commands: vec!["volume".to_string()],
        allow_volume_control: true,
        allow_app_launch: false,
        allowed_apps: vec![],
    };

    let executor = CommandExecutor::new(config);

    

    // Test 1: Get current volume (if possible)
    println!("\n1. Probando comandos de volumen:");

    // Test mute
    println!("   🔇 Probando mute...");
    let mute_command = agent_core::commands::IncomingCommand {
        command_type: "volume".to_string(),
        parameters: json!({
            "action": "mute"
        }),
        request_id: Some("test-mute".to_string()),
    };

    let response = executor.execute(mute_command).await;
    println!("   Resultado mute: {}", serde_json::to_string_pretty(&response)?);

    // Wait a bit
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    // Test unmute
    println!("   🔊 Probando unmute...");
    let unmute_command = agent_core::commands::IncomingCommand {
        command_type: "volume".to_string(),
        parameters: json!({
            "action": "unmute"
        }),
        request_id: Some("test-unmute".to_string()),
    };

    let response = executor.execute(unmute_command).await;
    println!("   Resultado unmute: {}", serde_json::to_string_pretty(&response)?);

    // Wait a bit
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    // Test set volume to 100%
    println!("   🔉 Estableciendo volumen al 100%...");
    let set_volume_command = agent_core::commands::IncomingCommand {
        command_type: "volume".to_string(),
        parameters: json!({
            "action": "set",
            "level": 100
        }),
        request_id: Some("test-set-100".to_string()),
    };

    let response = executor.execute(set_volume_command).await;
    println!("   Resultado set 50%: {}", serde_json::to_string_pretty(&response)?);

    // Wait a bit
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    // Test set volume to 80%
    println!("   🔊 Estableciendo volumen al 80%...");
    let set_volume_command = agent_core::commands::IncomingCommand {
        command_type: "volume".to_string(),
        parameters: json!({
            "action": "set",
            "level": 80
        }),
        request_id: Some("test-set-80".to_string()),
    };

    let response = executor.execute(set_volume_command).await;
    println!("   Resultado set 80%: {}", serde_json::to_string_pretty(&response)?);

    // Wait a bit
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    // Test set volume to 25%
    println!("   🔈 Estableciendo volumen al 25%...");
    let set_volume_low = agent_core::commands::IncomingCommand {
        command_type: "volume".to_string(),
        parameters: json!({
            "action": "set",
            "level": 25
        }),
        request_id: Some("test-set-25".to_string()),
    };

    let response = executor.execute(set_volume_low).await;
    println!("   Resultado set 25%: {}", serde_json::to_string_pretty(&response)?);

    println!("\n✅ Pruebas completadas!");
    println!("💡 Deberías haber escuchado cambios en el volumen del sistema.");
    println!("🎵 Niveles probados: Mute → Unmute → 100% → 80% → 25%");

    Ok(())
}