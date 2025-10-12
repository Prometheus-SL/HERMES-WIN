//! Ejemplo de uso del sistema de autenticación JWT

use agent_core::{Agent, Config};
use tracing::{info, error};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Configurar logging
    tracing_subscriber::fmt::init();

    // Cargar configuración desde archivo
    let agent = Agent::from_config_file("config.toml")?;
    
    info!("=== HERMES Agent - JWT Authentication Demo ===");
    
    // Obtener Agent ID
    let agent_id = agent.agent_id().await;
    info!("Agent ID: {}", agent_id);
    
    // Intentar login
    info!("1. Performing agent login...");
    match agent.login().await {
        Ok(_) => {
            info!("✓ Login successful!");
            
            // Verificar token
            if let Some(token) = agent.get_access_token().await {
                info!("✓ Access token obtained: {}...", &token[..20]);
            }
            
            // Enviar datos de ejemplo
            info!("2. Sending performance data...");
            match agent.send_performance_data().await {
                Ok(_) => info!("✓ Performance data sent successfully!"),
                Err(e) => error!("✗ Failed to send performance data: {}", e),
            }
            
            // Enviar datos personalizados
            info!("3. Sending custom data...");
            let custom_data = serde_json::json!({
                "event": "agent_started",
                "version": "0.1.0",
                "status": "online"
            });
            
            match agent.send_data_http(
                custom_data,
                "event",
                "normal",
                vec!["startup".to_string(), "status".to_string()]
            ).await {
                Ok(_) => info!("✓ Custom data sent successfully!"),
                Err(e) => error!("✗ Failed to send custom data: {}", e),
            }
            
        }
        Err(e) => {
            error!("✗ Login failed: {}", e);
            info!("Please check your credentials in config.toml:");
            info!("- auth.email should contain your user email");
            info!("- auth.password should contain your password");
            info!("- auth.server_url should point to the correct backend");
        }
    }
    
    info!("4. Starting WebSocket connection...");
    info!("The agent will now connect to the server with JWT authentication...");
    
    // Iniciar el agente (esto incluye la conexión WebSocket con token)
    agent.run().await?;
    
    Ok(())
}