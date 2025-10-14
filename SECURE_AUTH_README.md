# 🔐 HERMES Agent - Sistema de Autenticación JWT Seguro

## ✨ Características Principales

- **🔒 Almacenamiento Seguro**: Credenciales en Windows Credential Manager
- **🎫 Gestión Automática de JWT**: Tokens con expiración y renovación automática
- **🚀 Configuración Simple**: Herramientas interactivas incluidas
- **🔄 Re-autenticación Inteligente**: Evita logins innecesarios
- **🛡️ Sin Credenciales en Archivos**: Configuración segura por defecto

## 🚀 Inicio Rápido

### 1. Configuración Inicial
```bash
# Configurar credenciales (solo una vez)
cd agent-core
cargo run --example credential_setup
```

### 2. Verificar Estado
```bash
# Verificar que todo está configurado
cargo run --example auth_status
```

### 3. Ejecutar Agente
```bash
# Iniciar el agente completo
cd ..
cargo run --bin agent-tray
```

## 🔧 Herramientas Disponibles

| Comando | Descripción |
|---------|-------------|
| `cargo run --example credential_setup` | Configurar/reconfigurar credenciales |
| `cargo run --example auth_status` | Verificar estado de autenticación |
| `cargo run --example auth_demo` | Demostración completa del sistema |
| `cargo run --bin agent-tray` | Ejecutar agente en producción |

## 📁 Almacenamiento de Datos

### Credenciales (Seguro)
- **Ubicación**: Windows Credential Manager
- **Servicio**: "HERMES-WIN-Agent"
- **Contenido**: Email y contraseña del usuario

### Tokens JWT (Encriptados)
- **Ubicación**: `%APPDATA%\HERMES-WIN\tokens.json`
- **Expiración**: 1 hora (renovación automática)
- **Formato**: Encriptado en hexadecimal

### Configuración de Respaldo
- **Ubicación**: `%APPDATA%\HERMES-WIN\user_config.json`
- **Contenido**: Email y URL del servidor (sin contraseña)

## 🔍 Verificación del Sistema

### Estado de Credenciales
```bash
# Verificar que las credenciales están almacenadas
cargo run --example auth_status
```

**Salida esperada:**
```
✅ Credenciales almacenadas en Windows Credential Manager
✅ Autenticación exitosa!
🔑 Token obtenido: eyJhbGciOiJIUzI1NiIs...
```

### Gestión Manual
- **Windows Credential Manager**: `Control Panel → User Accounts → Credential Manager`
- **Buscar**: "HERMES-WIN-Agent"
- **Operaciones**: Ver, editar o eliminar credenciales

## 🔄 Flujo de Autenticación

1. **Verificación de Tokens** → Carga tokens válidos existentes
2. **Carga de Credenciales** → Desde Windows Credential Manager
3. **Login HTTP** → POST `/auth/agent/login` si es necesario
4. **Almacenamiento Seguro** → Tokens encriptados en directorio del usuario
5. **Identificación WebSocket** → Conexión con token JWT automático

## ⚙️ Configuración

### Archivo `config.toml`
```toml
[auth]
# Solo se almacena la URL del servidor
server_url = "http://localhost:3000"
# Credenciales se gestionan de forma segura por separado
```

### Variables de Configuración
- `server_url`: URL del backend de autenticación
- **Email/Password**: Almacenados en Windows Credential Manager
- **Tokens**: Gestionados automáticamente

## 🛡️ Seguridad

### ✅ Ventajas del Sistema
- **Windows Credential Manager**: Protección a nivel del SO
- **Tokens encriptados**: Almacenamiento seguro en disco
- **Sin credenciales en código**: Archivos de configuración limpios
- **Expiración automática**: Tokens con vida limitada
- **Re-autenticación transparente**: Sin intervención manual

### 🔒 Mejores Prácticas Implementadas
- Credenciales nunca en archivos de texto plano
- Tokens con expiración automática (1 hora)
- Verificación de validez antes de cada uso
- Limpieza automática de tokens expirados
- Logs de seguridad sin información sensible

## 🚨 Solución de Problemas

### Error: No hay credenciales almacenadas
```bash
# Solución: Configurar credenciales
cargo run --example credential_setup
```

### Error: Autenticación fallida
```bash
# Verificar estado
cargo run --example auth_status

# Reconfigurar si es necesario
cargo run --example credential_setup
```

### Error: Servidor no disponible
- Verificar que el backend esté ejecutándose
- Comprobar la URL en `config.toml`
- Verificar conectividad de red

### Limpiar Credenciales Completamente
```bash
# Desde código
cargo run --example auth_status  # Y elegir la opción de limpiar

# O manualmente:
# Control Panel → Credential Manager → Windows Credentials → "HERMES-WIN-Agent" → Remove
```

## 📋 API del Desarrollador

### Métodos Principales
```rust
// Configuración inicial
agent.setup_credentials(email, password).await?;

// Verificación de estado
let status = agent.get_auth_status().await;

// Login (automático)
agent.login().await?;

// Envío de datos autenticado
agent.send_performance_data().await?;

// Limpieza
agent.clear_credentials().await?;
```

### Estructura de Estado
```rust
pub struct AuthStatus {
    pub has_stored_credentials: bool,
    pub has_valid_token: bool,
    pub server_url: String,
    pub agent_id: String,
}
```

## 📚 Documentación Adicional

- **[AUTHENTICATION.md](AUTHENTICATION.md)**: Documentación técnica completa
- **[JWT_IMPLEMENTATION_SUMMARY.md](JWT_IMPLEMENTATION_SUMMARY.md)**: Resumen de implementación
- **Ejemplos**: Ver directorio `agent-core/examples/`

## 🎯 Siguiente Paso

Una vez configurado, el agente:
1. **Se autentica automáticamente** al iniciar
2. **Mantiene tokens válidos** en segundo plano  
3. **Se conecta por WebSocket** con autenticación JWT
4. **Envía datos** usando Authorization Bearer
5. **Gestiona renovación** de tokens automáticamente

¡Tu agente HERMES está listo para usar con seguridad empresarial! 🚀