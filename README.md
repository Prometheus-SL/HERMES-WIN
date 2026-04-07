# HERMES-WIN

> Agente de escritorio de PROMETEO para Windows. Una sola sesion compartida entre la app Electron, el runtime local y el servicio del sistema.

## Vista general

HERMES-WIN cubre dos escenarios sobre la misma maquina:

- consola Electron para login, estado del runtime, gestion del servicio y lectura de logs
- servicio de Windows para mantener el agente activo en segundo plano

Ambos modos reutilizan el mismo estado persistido en:

`%ProgramData%\HERMES-WIN\runtime-state.json`

## Lo importante de un vistazo

| Area | Como funciona |
| --- | --- |
| Login | La app autentica contra `/auth/agent/login` y guarda la sesion compartida. |
| Runtime | El agente se conecta por Socket.IO y envia snapshots `system_status`. |
| Servicio | La UI instala, arranca, detiene y desinstala `HermesNodeAgent`. |
| Logs | La app muestra el contenido de `logs/agent.log` en tiempo real. |
| Audio | El camino por defecto usa PowerShell. El addon Rust es opcional. |
| Releases | Se generan instalador, zip portable y bundle cliente con checksums. |

## Arquitectura operativa

1. El usuario inicia sesion desde la app Electron con email, password y URL del servidor.
2. HERMES guarda `agentId`, `serverUrl`, tokens y estado del runtime en `ProgramData`.
3. El runtime manual o el servicio reutilizan esa sesion y publican telemetria normalizada.
4. La UI actua como panel de control para el servicio, el estado de conexion y los logs locales.

## Telemetria que envia

El payload principal del agente es `system_status` e incluye:

- identificacion basica del equipo
- CPU, memoria y discos
- informacion de red
- estado del audio cuando esta disponible
- modo de ejecucion (`manual` o `service`)

## Desarrollo local

### Requisitos

- Windows
- Node.js 20
- npm

Rust no forma parte del camino feliz del proyecto. Solo hace falta si quieres compilar el addon nativo opcional de audio.

### Scripts mas utiles

```powershell
npm run start
npm run start:dev
npm run start:agent
npm run typecheck
npm test -- --ci
npm run build
npm run build:bundle
npm run service:install
npm run service:uninstall
```

### Flujo recomendado

```powershell
npm ci
npm run typecheck
npm test -- --ci
npm run build:bundle
```

## Releases

El pipeline genera siempre estos artefactos:

- `HERMES-WIN-Setup-<version>.exe`: instalador recomendado para usuarios finales
- `HERMES-WIN-<version>-x64.zip`: build portable para soporte o despliegues manuales
- `HERMES-WIN-client-bundle-<version>.zip`: paquete de entrega con binarios, guia rapida y checksums
- `SHA256SUMS.txt`: hashes SHA-256 de los artefactos principales

## CI/CD

Los workflows de GitHub Actions se han simplificado para el caso real del proyecto:

- `CI`: instala dependencias, hace typecheck, ejecuta tests y construye el bundle completo
- `Release`: repite la validacion y publica los artefactos al crear tags `v*`

El addon Rust queda fuera del pipeline por defecto porque HERMES ya funciona con el camino PowerShell. Si algun dia hace falta activarlo, esta documentado aparte.

## Documentacion

- [Instalacion rapida](docs/CLIENT_QUICKSTART.md)
- [Consentimiento y privacidad](docs/CONSENT.md)
- [Seguridad](docs/SECURITY.md)
- [Audio nativo opcional](docs/NATIVE_AUDIO.md)
