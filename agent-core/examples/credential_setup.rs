//! Herramienta de configuración de credenciales para HERMES Agent

use agent_core::Agent;
use std::io::{self, Write};
use tracing::error;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Configurar logging
    tracing_subscriber::fmt::init();

    println!("🔐 HERMES Agent - Configuración de Credenciales");
    println!("===============================================");
    println!();

    // Cargar configuración
    let agent = Agent::from_config_file("config.toml")?;
    
    // Verificar si ya hay credenciales almacenadas
    if agent.has_stored_credentials().await {
        println!("✅ Ya tienes credenciales almacenadas.");
        print!("¿Deseas reconfigurar las credenciales? (s/N): ");
        io::stdout().flush()?;
        
        let mut input = String::new();
        io::stdin().read_line(&mut input)?;
        
        if !input.trim().to_lowercase().starts_with('s') {
            println!("Configuración cancelada.");
            return Ok(());
        }
        
        // Limpiar credenciales existentes
        agent.clear_credentials().await?;
        println!("✅ Credenciales anteriores eliminadas.");
        println!();
    }

    // Solicitar credenciales al usuario
    println!("Por favor, introduce tus credenciales de usuario:");
    println!();

    print!("📧 Email: ");
    io::stdout().flush()?;
    let mut email = String::new();
    io::stdin().read_line(&mut email)?;
    let email = email.trim().to_string();

    if email.is_empty() {
        eprintln!("❌ Error: El email no puede estar vacío");
        return Ok(());
    }

    print!("🔑 Contraseña: ");
    io::stdout().flush()?;
    
    // En un entorno real, usarías una librería para ocultar la entrada de la contraseña
    let mut password = String::new();
    io::stdin().read_line(&mut password)?;
    let password = password.trim().to_string();

    if password.is_empty() {
        eprintln!("❌ Error: La contraseña no puede estar vacía");
        return Ok(());
    }

    println!();
    println!("🔄 Configurando credenciales...");

    // Almacenar credenciales de forma segura
    match agent.setup_credentials(email.clone(), password).await {
        Ok(_) => {
            println!("✅ Credenciales almacenadas de forma segura en Windows Credential Manager");
            println!();
            
            // Intentar login para verificar que las credenciales funcionan
            println!("🔄 Verificando credenciales con el servidor...");
            match agent.login().await {
                Ok(_) => {
                    println!("✅ ¡Login exitoso! Las credenciales son válidas.");
                    println!();
                    
                    // Mostrar información sobre dónde se almacenan
                    let agent_id = agent.agent_id().await;
                    println!("📋 Información de configuración:");
                    println!("   • Agent ID: {}", agent_id);
                    println!("   • Email: {}", email);
                    println!("   • Credenciales: Almacenadas en Windows Credential Manager");
                    println!("   • Tokens: Se gestionan automáticamente");
                    println!();
                    
                    println!("🎉 Configuración completada exitosamente!");
                    println!();
                    println!("📝 Próximos pasos:");
                    println!("   1. Ejecuta 'cargo run --bin agent-tray' para iniciar el agente");
                    println!("   2. El agente se autenticará automáticamente usando las credenciales almacenadas");
                    println!("   3. Los tokens JWT se gestionarán automáticamente");
                }
                Err(e) => {
                    error!("❌ Error al verificar credenciales: {}", e);
                    println!();
                    println!("🔍 Posibles causas:");
                    println!("   • Email o contraseña incorrectos");
                    println!("   • Servidor no disponible");
                    println!("   • Problemas de conectividad");
                    println!();
                    println!("💡 Las credenciales se han almacenado, pero no se pudieron verificar.");
                    println!("   Puedes intentar ejecutar el agente más tarde.");
                }
            }
        }
        Err(e) => {
            error!("❌ Error al almacenar credenciales: {}", e);
            println!("🔍 Verifica que tienes permisos para acceder a Windows Credential Manager");
        }
    }

    println!();
    println!("🔧 Para gestionar credenciales en el futuro:");
    println!("   • Reconfigurar: cargo run --example credential_setup");
    println!("   • Limpiar todas: Usar Windows Credential Manager o el agente");
    println!("   • Ver estado: El agente mostrará información al iniciar");

    Ok(())
}