# HERMES-WIN

✅ Resumen: Cómo arrancar HERMES-WIN
El proyecto está funcionando correctamente. Lo que estás viendo es el comportamiento esperado:

🟢 Estado actual:
✅ Rust instalado: Versión 1.90.0
✅ Proyecto compilado: Sin errores
✅ Agente ejecutándose: Sistema tray funcionando
⚠️ Error de conexión: Normal, porque wss://your-server.example.com/agent no existe
🔧 Configuración para probar:
1. Configurar un servidor de prueba (opcional)
Si quieres probarlo completamente, necesitas cambiar la URL en config.toml:

2. Formas de ejecutar el proyecto:
🔷 Opción A - System Tray (Recomendado para pruebas):

🔷 Opción B - Modo consola:

🔷 Opción C - Como servicio de Windows (Requiere permisos de administrador):

📋 Lo que hace el agente:
🔗 Se conecta al servidor WebSocket configurado
📊 Monitorea CPU, memoria y información del sistema
🔐 Solo ejecuta comandos de la whitelist de seguridad
📝 Registra todo en agent.log
🔄 Se reconecta automáticamente si pierde conexión
🎯 Estado actual:
El proyecto está completamente funcional. El "error" que ves es solo que está intentando conectarse a un servidor que no existe (your-server.example.com). ¡Esto es exactamente lo que debería pasar!


**HERMES Windows Remote Agent** - A secure, lightweight remote monitoring and management agent for Windows systems.

![CI](https://github.com/Prometheus-SL/HERMES-WIN/workflows/CI/badge.svg)
![License](https://img.shields.io/github/license/Prometheus-SL/HERMES-WIN)
![Release](https://img.shields.io/github/v/release/Prometheus-SL/HERMES-WIN)

## 🔍 Overview

HERMES-WIN is a Rust-based remote agent that provides secure monitoring and limited control capabilities for Windows systems. It connects to a WebSocket server, reports system metrics, and can execute whitelisted commands with proper authorization.

### Key Features

- **Secure WebSocket Communication**: TLS-encrypted connection to remote server
- **System Monitoring**: Real-time CPU usage, memory, and disk information
- **Command Whitelisting**: Only pre-approved commands can be executed
- **Windows Service**: Runs as a native Windows service for reliability
- **System Tray Application**: User-friendly tray interface
- **Configurable**: Flexible TOML-based configuration
- **Audit Logging**: Comprehensive logging for security and debugging

## 🏗️ Architecture

The project is organized as a Cargo workspace with three main crates:

- **`agent-core`**: Core functionality including WebSocket client, system monitoring, and command execution
- **`agent-service`**: Windows service wrapper for running the agent as a system service
- **`agent-tray`**: System tray application for user interaction

## 🚀 Quick Start

### Prerequisites

- Windows 10/11 or Windows Server 2019/2022
- Administrator privileges (for service installation)

### Installation

1. **Download** the latest release from the [Releases page](https://github.com/Prometheus-SL/HERMES-WIN/releases)

2. **Extract** the archive to a folder (e.g., `C:\Program Files\HERMES-Agent\`)

3. **Configure** the agent by editing `config.toml`:
   ```toml
   [connection]
   url = "wss://your-server.example.com/agent"

   [agent]
   name = "MyWindows-PC"

   [commands]
   allowed_commands = ["volume", "open_app"]
   ```

4. **Install as Windows Service** (Recommended):

   **Option A: Automatic Installer (Easy)**
   ```cmd
   # Double-click install-service.bat or run:
   install-service.bat
   ```
   The installer will automatically request administrator privileges and guide you through the process.

   **Option B: Manual Installation**
   ```cmd
   # Run as Administrator
   agent-tray.exe install
   agent-tray.exe start
   ```

5. **Verify Installation**:
   ```cmd
   agent-tray.exe status
   ```

### Alternative Installation Options

**System Tray Application** (for testing):
```cmd
agent-tray.exe console
```

**Original Service** (alternative):
```cmd
# Run as Administrator  
agent-service.exe install
net start HermesAgent
```

📖 **For detailed installation instructions, see [SERVICE_INSTALLATION.md](SERVICE_INSTALLATION.md)**

### Alternative: Running as Tray Application

For testing or personal use, you can run the agent as a system tray application:

```cmd
agent-tray.exe
```

## ⚙️ Configuration

The agent is configured via `config.toml`. Key sections include:

### Connection Settings
```toml
[connection]
url = "wss://your-server.example.com/agent"
timeout = 30
reconnect_interval = 5
```

### Security Settings
```toml
[security]
verify_tls = true
# ca_cert_path = "path/to/ca.pem"  # Optional custom CA
```

### Command Whitelist
```toml
[commands]
allowed_commands = ["volume", "open_app"]
allow_volume_control = true
allow_app_launch = true
allowed_apps = []  # Empty = all apps allowed
```

## 🔐 Security Considerations

### User Consent and Privacy

- **Explicit Consent**: This agent should only be installed with explicit user consent
- **Data Collection**: The agent collects system information (CPU, memory, hostname) and sends it to the configured server
- **Command Execution**: Only whitelisted commands can be executed
- **Audit Trail**: All activities are logged for security auditing

### Security Features

- **TLS Encryption**: All communications are encrypted using WebSocket Secure (WSS)
- **Command Whitelisting**: Only pre-approved commands can be executed
- **Certificate Validation**: TLS certificates are validated by default
- **Minimal Privileges**: Runs with minimal required privileges
- **Audit Logging**: Comprehensive logging of all activities

### Recommended Security Practices

1. **Use Strong TLS**: Ensure your WebSocket server uses strong TLS configuration
2. **Limit Commands**: Only enable commands that are absolutely necessary
3. **Monitor Logs**: Regularly review agent logs for suspicious activity
4. **Network Segmentation**: Run agents in isolated network segments when possible
5. **Regular Updates**: Keep the agent updated to the latest version

## 🔧 Development

### Building from Source

1. **Install Rust**: https://rustup.rs/
2. **Clone the repository**:
   ```bash
   git clone https://github.com/Prometheus-SL/HERMES-WIN.git
   cd HERMES-WIN
   ```
3. **Build**:
   ```bash
   cargo build --release
   ```

### Running Tests

```bash
cargo test
```

### Code Formatting

```bash
cargo fmt
```

### Linting

```bash
cargo clippy
```

### Development Mode

For development and testing, you can run the agent in console mode:

```bash
cargo run --bin agent-service console
```

## 📝 Protocol

The agent communicates with the server using JSON messages over WebSocket:

### Registration Message
```json
{
  "message_type": "register",
  "agent_id": "uuid-here",
  "system_info": {
    "hostname": "PC-NAME",
    "os_name": "Windows",
    "os_version": "10.0.19041",
    "cpu_usage": 25.5,
    "memory_total": 16777216,
    "memory_used": 8388608,
    "timestamp": 1640995200
  }
}
```

### CPU Update Message
```json
{
  "message_type": "cpu_update",
  "agent_id": "uuid-here",
  "cpu_usage": 30.2,
  "timestamp": 1640995205
}
```

### Command Message
```json
{
  "command_type": "volume",
  "parameters": {
    "action": "set",
    "level": 50
  },
  "request_id": "optional-id"
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes and add tests
4. Run tests: `cargo test`
5. Run formatting: `cargo fmt`
6. Run linting: `cargo clippy`
7. Commit changes: `git commit -am 'Add some feature'`
8. Push to branch: `git push origin feature/my-feature`
9. Submit a Pull Request

## 📋 TODO

- [ ] **Enhanced Security**
  - [ ] Client certificate authentication
  - [ ] Command signing and verification
  - [ ] Rate limiting for commands

- [ ] **Monitoring Improvements**
  - [ ] Disk usage monitoring
  - [ ] Network statistics
  - [ ] Process monitoring
  - [ ] Event log monitoring

- [ ] **User Interface**
  - [ ] Full system tray implementation with menu
  - [ ] Configuration GUI
  - [ ] Status dashboard
  - [ ] Real-time notifications

- [ ] **Command Extensions**
  - [ ] File operations (with strict sandboxing)
  - [ ] Registry queries (read-only)
  - [ ] Service management
  - [ ] Scheduled task management

- [ ] **Cross-Platform Support**
  - [ ] Linux agent variant
  - [ ] macOS agent variant
  - [ ] Unified configuration format

- [ ] **Management Features**
  - [ ] Remote configuration updates
  - [ ] Agent auto-update mechanism
  - [ ] Health check endpoints
  - [ ] Performance metrics

## 📄 License

This project is licensed under the GNU General Public License v2.0 or later - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This software is provided "as is" without warranty of any kind. Users are responsible for ensuring compliance with all applicable laws and regulations regarding remote monitoring software. Only install and use this software on systems you own or have explicit permission to monitor.

## 🔗 Related Projects

- [HERMES Server](https://github.com/Prometheus-SL/HERMES-SERVER) - Server component for managing HERMES agents
- [HERMES Dashboard](https://github.com/Prometheus-SL/HERMES-DASHBOARD) - Web-based management interface

---

**Made with ❤️ and Rust** 🦀