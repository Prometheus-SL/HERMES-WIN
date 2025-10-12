//! Herramienta para verificar el estado de autenticación del agente

use agent_core::Agent;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Configurar logging
    tracing_subscriber::fmt::init();

    println!("🔍 HERMES Agent - Estado de Autenticación");
    println!("=========================================");
    println!();

    // Cargar configuración
    let agent = Agent::from_config_file("config.toml")?;
    
    // Obtener estado de autenticación
    let status = agent.get_auth_status().await;
    
    println!("📋 Información del Agente:");
    println!("   • Agent ID: {}", status.agent_id);
    println!("   • Servidor: {}", status.server_url);
    println!();
    
    println!("🔐 Estado de Credenciales:");
    if status.has_stored_credentials {
        println!("   ✅ Credenciales almacenadas en Windows Credential Manager");
    } else {
        println!("   ❌ No hay credenciales almacenadas");
        println!("   💡 Ejecuta: cargo run --example credential_setup");
    }
    
    println!();
    println!("🎫 Estado de Tokens:");
    if status.has_valid_token {
        println!("   ✅ Tokens JWT válidos disponibles");
    } else {
        println!("   ❌ No hay tokens válidos");
        if status.has_stored_credentials {
            println!("   💡 Los tokens se obtendrán automáticamente al hacer login");
        } else {
            println!("   💡 Configura credenciales primero");
        }
    }
    
    println!();
    
    // Probar login si hay credenciales
    if status.has_stored_credentials {
        println!("🔄 Probando autenticación...");
        match agent.login().await {
            Ok(_) => {
                println!("   ✅ Autenticación exitosa!");
                
                if let Some(token) = agent.get_access_token().await {
                    println!("   🔑 Token obtenido: {}...", &token[..20]);
                }
            }
            Err(e) => {
                println!("   ❌ Error de autenticación: {}", e);
                println!("   🔍 Posibles causas:");
                println!("      • Servidor no disponible");
                println!("      • Credenciales incorrectas");
                println!("      • Problemas de red");
            }
        }
    }
    
    println!();
    println!("🛠️  Comandos disponibles:");
    println!("   • Configurar credenciales: cargo run --example credential_setup");
    println!("   • Verificar estado: cargo run --example auth_status");
    println!("   • Probar autenticación: cargo run --example auth_demo");
    println!("   • Ejecutar agente: cargo run --bin agent-tray");
    
    println!();
    println!("📁 Ubicaciones de almacenamiento:");
    println!("   • Credenciales: Windows Credential Manager → 'HERMES-WIN-Agent'");
    println!("   • Tokens: %APPDATA%\\HERMES-WIN\\tokens.json");
    println!("   • Configuración: %APPDATA%\\HERMES-WIN\\user_config.json");

    Ok(())
}