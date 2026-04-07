# HERMES-WIN

HERMES-WIN is the Windows desktop agent for PROMETEO. It can run in two modes over the same shared session:

- Electron app in manual mode while the control panel is open.
- Windows service for continuous background execution.

Both modes reuse the same `agentId`, `serverUrl`, and JWT session persisted in:

`%ProgramData%\HERMES-WIN\runtime-state.json`

## Runtime model

- The Electron app authenticates the user once with `/auth/agent/login`.
- HERMES stores the shared runtime state in `ProgramData`.
- The runtime connects to Socket.IO and identifies as:
  - `{ type: "agent", agentId, token }`
- Every `30000 ms` the runtime sends a normalized `system_status` snapshot with:
  - system
  - resources
  - network
  - tags
- If the Windows service is installed, the app stays in control-panel mode and does not start a second runtime.

## Authentication

- User credentials are stored with `keytar` to allow re-login from the Electron app.
- The service does not depend on `keytar`.
- The service reuses the shared session from `runtime-state.json`.
- If the shared refresh/session becomes invalid, the service waits until the app authenticates again and rewrites the runtime state.

## Commands

Available scripts:

```powershell
npm run start
npm run start:dev
npm run start:agent
npm run service:install
npm run service:uninstall
```

Notes:

- `npm run start` launches the Electron control panel.
- `npm run start:agent` runs the shared runtime directly in service mode.
- `npm run service:install` installs the Windows service `HermesNodeAgent`.

## Release artifacts

The automated workflows generate three user-facing outputs:

- `HERMES-WIN-Setup-<version>.exe`: recommended installer for end users.
- `HERMES-WIN-<version>-x64.zip`: packaged application zip for manual deployments or support.
- `HERMES-WIN-client-bundle-<version>.zip`: delivery bundle with binaries, quick-start guide, and checksums.

The client-facing installation steps live in `CLIENT_QUICKSTART.md` and are bundled automatically in release builds.

## Control panel

The Electron UI now acts as the control plane for:

- authenticating Hermes
- checking runtime status
- checking service status
- installing, starting, stopping, and uninstalling the Windows service
- reading runtime logs

## Telemetry payload

The agent sends one canonical payload for dashboard consumption:

```json
{
  "dataType": "system_status",
  "schemaVersion": 1,
  "sampledAt": "2026-04-05T18:00:00.000Z",
  "mode": "manual",
  "system": {
    "hostname": "PC-MYHOST",
    "username": "migue",
    "uptimeSeconds": 1200,
    "os": {
      "platform": "win32",
      "release": "10.0.22631",
      "arch": "x64"
    }
  },
  "resources": {
    "cpu": {
      "model": "Intel(R) Core(TM)...",
      "cores": 8,
      "speedMHz": 3200,
      "percent": 22
    },
    "memory": {
      "totalBytes": 17179869184,
      "freeBytes": 8589934592,
      "usedBytes": 8589934592,
      "percent": 50
    },
    "disks": [
      {
        "drive": "C:",
        "totalBytes": 512000000000,
        "freeBytes": 256000000000,
        "usedBytes": 256000000000,
        "percent": 50
      }
    ]
  },
  "network": {
    "ip": "192.168.1.10",
    "mac": "00-11-22-33-44-55",
    "interfaces": []
  },
  "tags": ["hermes", "windows"]
}
```

## Development notes

- This repository is the active JS/Electron implementation.
- Older Rust-oriented documentation in the repo may describe historical work; prefer the current runtime behavior documented here.
