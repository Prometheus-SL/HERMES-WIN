# Autenticación JWT para HERMES Agent

El agente HERMES ahora implementa autenticación JWT con **almacenamiento seguro de credenciales** siguiendo la documentación del backend. Esta guía explica cómo configurar y usar la nueva funcionalidad de autenticación.

## 🔐 Almacenamiento Seguro de Credenciales

Las credenciales del usuario se almacenan de manera segura en el sistema operativo:
- **Windows Credential Manager**: Almacenamiento principal de email y contraseña
- **Directorio del usuario**: Tokens JWT encriptados y configuración de respaldo
- **Archivo de configuración**: Solo URL del servidor (sin credenciales sensibles)

### Ubicaciones de Almacenamiento

- **Credenciales**: `Windows Credential Manager` → Servicio "HERMES-WIN-Agent"
- **Tokens JWT**: `%APPDATA%\HERMES-WIN\tokens.json` (encriptados)
- **Configuración**: `%APPDATA%\HERMES-WIN\user_config.json` (sin contraseñas)

## Configuración

### 1. Configuración Inicial de Credenciales

**⚠️ IMPORTANTE**: Las credenciales ya NO se almacenan en `config.toml` por seguridad.

Ejecuta la herramienta de configuración inicial:

```bash
cargo run --example credential_setup
```

Esta herramienta te permitirá:
- Introducir tu email y contraseña de forma segura
- Almacenar las credenciales en Windows Credential Manager
- Verificar que las credenciales funcionan con el servidor
- Configurar el almacenamiento automático de tokens

### 2. Archivo de Configuración

El archivo `config.toml` solo contiene la URL del servidor:

```toml
[auth]
# Server URL para autenticación (HTTP/HTTPS)
server_url = "http://localhost:3000"
# Note: Email y contraseña se almacenan de forma segura en Windows Credential Manager
```

### 3. Verificar Configuración

Para verificar que todo está configurado correctamente:

```bash
cargo run --example auth_demo
```

## Funcionalidad Implementada

### 1. Login automático del agente

El agente realiza automáticamente el login al iniciar:

```
POST /auth/agent/login
Content-Type: application/json

{
  "email": "usuario@dominio.com",
  "password": "*******",
  "agentId": "PC-<HOSTNAME>"
}
```

**Respuesta exitosa:**
- `tokens.accessToken`: JWT para Authorization Bearer
- `tokens.refreshToken`: Token para renovación  
- `agent`: Información del agente vinculado

### 2. Identificación WebSocket con token

Cuando se conecta por WebSocket, el agente se identifica con:

```json
{
  "type": "agent",
  "agentId": "PC-<HOSTNAME>",
  "token": "<accessToken>"
}
```

### 3. Envío de datos por HTTP

El agente puede enviar datos usando autenticación JWT:

```
POST /api/v1/agents/data
Authorization: Bearer <accessToken>
Content-Type: application/json
x-agent-id: <AGENT_ID>

{
  "data": { "type": "performance", "cpu": 20 },
  "dataType": "sensor", 
  "priority": "normal",
  "tags": ["demo"]
}
```

## Comportamiento del Sistema

### Inicio del Agente

1. El agente lee las credenciales del archivo `config.toml`
2. Realiza POST a `/auth/agent/login` con email, password y agentId
3. Guarda los tokens JWT en memoria
4. Se conecta por WebSocket e incluye el token en la identificación
5. El servidor valida el token y vincula el agentId al usuario

## Gestión de Credenciales

### Configurar/Reconfigurar Credenciales
```bash
cargo run --example credential_setup
```

### Verificar Estado de Autenticación
```bash
cargo run --example auth_demo
```

### Limpiar Credenciales (Reset)
```bash
# Desde código
agent.clear_credentials().await?;

# O manualmente desde Windows:
# Control Panel → Credential Manager → Windows Credentials → "HERMES-WIN-Agent"
```

### Ubicaciones de Archivos
- **Windows Credential Manager**: `Control Panel → Credential Manager`
- **Tokens**: `%APPDATA%\HERMES-WIN\tokens.json`
- **Config backup**: `%APPDATA%\HERMES-WIN\user_config.json`

### Casos de Error

- **Credenciales incorrectas**: Login fallará, agente continúa sin autenticación
- **AgentId ya vinculado**: Si el agentId pertenece a otro usuario, devuelve 403
- **Token expirado**: Las comunicaciones HTTP fallarán con 401

## API del Cliente

### Métodos Principales

```rust
// Login manual (se hace automáticamente al iniciar)
agent.login().await?;

// Enviar datos de rendimiento
agent.send_performance_data().await?;

// Enviar datos personalizados  
let data = serde_json::json!({"custom": "data"});
agent.send_data_http(data, "sensor", "high", vec!["tag1".to_string()]).await?;

// Obtener token actual
let token = agent.get_access_token().await;
```

### Estructura de Configuración

```rust
pub struct AuthConfig {
    pub server_url: String,     // URL del servidor de autenticación
    pub email: String,          // Email del usuario propietario  
    pub password: String,       // Contraseña del usuario
    pub access_token: Option<String>,   // Token JWT (auto-gestionado)
    pub refresh_token: Option<String>,  // Token de renovación (auto-gestionado)
}
```

## Seguridad

### ✅ Ventajas del Nuevo Sistema
- **Windows Credential Manager**: Credenciales protegidas por el SO
- **Tokens encriptados**: Los JWT se almacenan con encriptación básica
- **Sin credenciales en archivos**: El `config.toml` no contiene información sensible
- **Gestión automática**: Los tokens se renuevan y gestionan automáticamente

### 🔒 Mejores Prácticas
- Usa HTTPS para comunicaciones en producción
- Los tokens tienen expiración automática (1 hora por defecto)
- Las credenciales se pueden gestionar desde Windows Credential Manager
- El agente detecta tokens expirados y realiza re-autenticación automática

### 🛡️ Consideraciones de Seguridad
- Las credenciales están protegidas por las credenciales de Windows del usuario
- Los tokens se almacenan en el directorio del usuario con permisos restringidos
- El agente limpia automáticamente tokens expirados

## Ejemplo Completo

### 1. Configuración Inicial
```bash
# Paso 1: Configurar credenciales
cargo run --example credential_setup

# Introducir:
# Email: admin@empresa.com  
# Password: [contraseña segura]
```

### 2. Verificar Funcionamiento
```bash
# Paso 2: Probar autenticación
cargo run --example auth_demo
```

### 3. Ejecutar Agente
```bash
# Paso 3: Iniciar agente en producción
cargo run --bin agent-tray
```

### Flujo Automático:
1. **Configuración inicial** → Credenciales en Windows Credential Manager
2. **Login automático** → Obtiene tokens JWT del servidor
3. **Conexión WebSocket** → Se identifica con token JWT
4. **Envío de datos** → Usa Authorization Bearer automáticamente
5. **Renovación automática** → Gestiona expiración de tokens

## Migración desde Configuración Anterior

Si tenías credenciales en `config.toml`, ejecuta:

```bash
# 1. Configurar credenciales seguras
cargo run --example credential_setup

# 2. Limpiar config.toml (opcional)
# Remover líneas de email/password del archivo

# 3. Verificar funcionamiento
cargo run --example auth_demo
```