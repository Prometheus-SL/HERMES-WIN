# HERMES-WIN

> Agente de escritorio de PROMETEO para Windows, Linux y macOS. Una sola sesion compartida entre la app Electron, el runtime local y el agente en segundo plano.

## Vista general

HERMES-WIN cubre dos escenarios sobre la misma maquina:

- consola Electron para login, estado del runtime, gestion del agente y lectura de logs
- agente en segundo plano gestionado por plataforma: servicio de Windows, `systemd --user` en Linux y modo manual en macOS v1

El estado compartido se persiste por plataforma:

- Windows: `%ProgramData%\HERMES-WIN\runtime-state.json`
- Linux: `~/.local/state/hermes/runtime-state.json`
- macOS: `~/Library/Application Support/Prometeo Hermes/runtime-state.json`

## Lo importante de un vistazo

| Area | Como funciona |
| --- | --- |
| Login | La app autentica contra `/auth/agent/login` y guarda la sesion compartida. |
| Runtime | El agente se conecta por Socket.IO y envia snapshots `system_status`. |
| Servicio | La UI expone el agente real de cada plataforma y sus acciones disponibles. |
| Logs | La app muestra el contenido del log local en tiempo real desde la ruta de runtime de cada sistema. |
| Audio | Windows mantiene el camino PowerShell; Linux usa `wpctl` con fallback a `pactl`; macOS v1 queda en modo no soportado. |
| Media bridge | Windows puede exponer un bridge local para la extension `Hermes Media Bridge` y publicar `media_update` hacia PROMETEO. |
| Releases | Se generan artefactos por plataforma y bundles cliente con checksums. |

## Instalar la extension de navegador

1. Abre la tarjeta `Now Playing bridge` en Hermes.
2. Pulsa `Install in browser`.
3. Hermes activara el bridge si hace falta, preparara una copia de la extension con la URL y el token ya configurados, e intentara abrir la pagina de extensiones de Chrome, Edge o Brave.
4. Pulsa `Open prepared folder` si necesitas abrir la carpeta que Hermes ha dejado lista.
5. En la pagina de extensiones, activa `Developer mode`, usa `Load unpacked` y selecciona esa carpeta preparada.

## Arquitectura operativa

1. El usuario inicia sesion desde la app Electron con email, password y URL del servidor.
2. HERMES guarda `agentId`, `serverUrl`, tokens y estado del runtime en la ruta nativa del sistema.
3. El runtime manual o el agente en segundo plano reutilizan esa sesion y publican telemetria normalizada.
4. La UI actua como panel de control para el agente, el estado de conexion y los logs locales.

## Telemetria que envia

El payload principal del agente es `system_status` e incluye:

- identificacion basica del equipo
- CPU, memoria y discos
- informacion de red
- estado del audio cuando esta disponible
- estado multimedia del navegador en `media_update` cuando el bridge local esta activo
- modo de ejecucion (`manual` o `service`) y capacidades de la plataforma

## Desarrollo local

### Requisitos

- Windows, Linux o macOS
- Node.js 20
- npm

Rust no forma parte del camino feliz del proyecto. Solo hace falta si quieres compilar el addon nativo opcional de audio.

### Scripts mas utiles

```powershell
npm run dev
npm run start
npm run start:dev
npm run start:local
npm run start:agent
npm run start:agent:local
npm run typecheck
npm test -- --ci
npm run build
npm run build:bundle
npm run service:status:local
npm run service:install:local
npm run service:start:local
npm run service:stop:local
npm run service:uninstall:local
npm run service:install
npm run service:uninstall
```

### Canales local y pro

HERMES separa dos canales operativos:

- `pro`: canal por defecto. Usa el servicio estable `HermesNodeAgent` en Windows, `hermes-agent.service` en Linux y las rutas de datos normales.
- `local`: canal de desarrollo. Se activa con `HERMES_CHANNEL=local` o con los scripts `npm run dev`, `npm run start:local` y `npm run service:*:local`.

El canal local no toca el servicio estable. Usa:

- Windows: servicio `HermesNodeAgentLocal` y datos en `%ProgramData%\HERMES-WIN-LOCAL`
- Linux: servicio `hermes-agent-local.service` y datos en `~/.local/state/hermes-local`
- macOS: datos en `~/Library/Application Support/Prometeo Hermes Local`

Para trabajar en local:

```powershell
npm ci
npm run dev
```

Si quieres probar el servicio local real en lugar del runtime manual:

```powershell
npm run service:install:local
npm run dev
```

Los comandos sin sufijo `:local` siguen apuntando a `pro`.

### Flujo recomendado

```powershell
npm ci
npm run typecheck
npm test -- --ci
npm run build:bundle
```

## Releases

El pipeline genera siempre artefactos por plataforma:

- Windows: `HERMES-windows-Setup-<version>.exe`, `HERMES-windows-<version>-x64.zip`, `HERMES-windows-client-bundle-<version>.zip`
- Linux: `HERMES-linux-<version>-x64.AppImage`, `HERMES-linux-<version>-x64.deb`, `HERMES-linux-client-bundle-<version>.zip`
- macOS: `HERMES-macos-<version>-<arch>.dmg`, `HERMES-macos-<version>-<arch>.zip`, `HERMES-macos-client-bundle-<version>.zip`
- Checksums: `SHA256SUMS-<plataforma>.txt`

## CI/CD

Los workflows de GitHub Actions ahora trabajan con una matrix multi-OS:

- `CI`: instala dependencias, hace typecheck, ejecuta tests y construye artefactos para Windows, Linux y macOS
- `Release`: repite la validacion y publica los artefactos por plataforma al crear tags `v*`

El addon Rust queda fuera del pipeline por defecto porque HERMES ya funciona sin el camino nativo en la ruta principal. Si algun dia hace falta activarlo, esta documentado aparte.

## Documentacion

- [Instalacion rapida](docs/CLIENT_QUICKSTART.md)
- [Consentimiento y privacidad](docs/CONSENT.md)
- [Seguridad](docs/SECURITY.md)
- [Audio nativo opcional](docs/NATIVE_AUDIO.md)
