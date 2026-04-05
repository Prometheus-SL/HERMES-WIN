# Autenticacion JWT para HERMES-WIN

La implementacion activa de HERMES-WIN es la version JS/Electron y usa una sesion compartida entre la app y el servicio Windows.

## Almacenamiento actual

- Credenciales de usuario: `keytar` en la cuenta del usuario para facilitar re-login desde la app.
- Estado compartido de ejecucion: `%ProgramData%\HERMES-WIN\runtime-state.json`

El archivo `runtime-state.json` contiene:

- `serverUrl`
- `agentId`
- `accessToken`
- `refreshToken`
- `monitoringIntervalMs`
- `lastAuthAt`

## Flujo actual

1. La app Electron pide `email`, `password` y `server_url`.
2. Hace login contra `POST /auth/agent/login`.
3. Persiste la sesion compartida en `ProgramData`.
4. El runtime usa esa sesion para conectarse por Socket.IO con:
   - `{ type: "agent", agentId, token }`
5. Si el servicio Windows esta instalado, reutiliza el mismo `runtime-state`.

## Refresh y reautenticacion

- El refresh usa `POST /auth/refresh`.
- El servicio no depende de `keytar`.
- Si la sesion compartida deja de ser valida, el servicio espera una nueva autenticacion desde la app.

## Nota

Las secciones antiguas del repositorio que hablan de `cargo`, `agent-core` o rutas de tokens en `%APPDATA%` corresponden a iteraciones anteriores y ya no describen el flujo principal actual.
