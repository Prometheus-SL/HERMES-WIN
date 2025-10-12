# Autenticación JWT para HERMES Agent

El agente HERMES ahora implementa autenticación JWT siguiendo la documentación del backend. Esta guía explica cómo configurar y usar la nueva funcionalidad de autenticación.

## Configuración

### 1. Configurar credenciales de usuario

Edita el archivo `config.toml` y completa las credenciales en la sección `[auth]`:

```toml
[auth]
# Server URL para autenticación (HTTP/HTTPS)
server_url = "http://localhost:3000"
# Email del usuario propietario del agente
email = "usuario@dominio.com"
# Contraseña del usuario
password = "tu_contraseña_segura"
```

### 2. Verificar configuración del servidor

Asegúrate de que la URL del servidor en `[auth]` apunte al backend correcto:
- Para desarrollo local: `http://localhost:3000`
- Para producción: `https://tu-servidor.com`

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

### Gestión de Tokens

- Los tokens se almacenan en memoria durante la ejecución
- El `accessToken` se usa para todas las comunicaciones autenticadas
- Si la autenticación falla, el agente continúa pero puede tener funcionalidad limitada

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

- Las contraseñas se almacenan en texto plano en `config.toml` - considera usar variables de entorno en producción
- Los tokens JWT se almacenan solo en memoria, no se persisten en disco
- Usa HTTPS para comunicaciones en producción

## Ejemplo Completo

```toml
# config.toml
[auth]
server_url = "https://hermes-backend.com"
email = "admin@empresa.com"
password = "password123"

[connection]
url = "wss://hermes-backend.com/"
```

Al ejecutar el agente:

1. Login automático → Obtiene tokens JWT
2. Conexión WebSocket → Se identifica con token
3. Envío de datos → Usa Authorization Bearer
4. El servidor valida el agentId contra el propietario del token

## Migración desde API Key

La implementación anterior con API Key ya no es necesaria para la ruta `/api/v1/agents/data`. El middleware de API Key se mantiene en el backend para compatibilidad con otras rutas, pero la autenticación JWT es ahora el método principal.