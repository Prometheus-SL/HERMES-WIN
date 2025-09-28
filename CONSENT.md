# User Consent and Privacy Notice

## Important: Please Read Before Installation

By installing and using HERMES-WIN, you acknowledge that you have read, understood, and agree to the following terms regarding data collection, monitoring, and remote access capabilities.

## What HERMES-WIN Does

HERMES-WIN is a remote monitoring and management agent that:

- **Monitors your system** and collects performance data
- **Connects to a remote server** via encrypted WebSocket connection
- **Transmits system information** to the configured server
- **Can execute limited commands** on your system when instructed by the server

## Data Collection

### Information We Collect

HERMES-WIN automatically collects and transmits the following information:

1. **System Identification**
   - Computer hostname
   - Operating system name and version
   - Unique agent identifier (generated randomly)

2. **Performance Metrics**
   - CPU usage percentage (updated every 5 seconds)
   - Total and used memory amounts
   - Disk usage information (when available)

3. **Operational Data**
   - Connection timestamps
   - Command execution logs
   - Error and status messages

### Information We Do NOT Collect

- Personal files or documents
- Passwords or credentials
- Browsing history
- Personal communications
- Keystrokes or screen captures (unless specifically configured)

## Remote Access Capabilities

### Commands That Can Be Executed

The agent can execute the following types of commands when instructed by the remote server:

1. **Volume Control**
   - Adjust system volume levels
   - Mute or unmute speakers

2. **Application Launch**
   - Start applications installed on your system
   - Limited to applications you specifically allow (if configured)

### Security Safeguards

- Only pre-approved command types can be executed
- All commands are logged for your review
- You can configure which applications can be launched
- All communications are encrypted using TLS

## Your Rights and Choices

### You Have the Right To:

1. **Know what data is collected** - This document outlines all data collection
2. **Control command execution** - Configure which commands are allowed
3. **View logs** - All agent activities are logged in `agent.log`
4. **Uninstall at any time** - Remove the agent completely
5. **Modify configuration** - Adjust settings in `config.toml`

### Configuration Options

You can control the agent's behavior by editing `config.toml`:

```toml
[commands]
# Disable all command execution
allowed_commands = []

# Or limit to specific commands
allowed_commands = ["volume"]  # Only allow volume control

# Restrict application launching
allowed_apps = ["notepad.exe", "calculator.exe"]
```

## Legal Considerations

### Authorized Use Only

- **Only install on systems you own** or have explicit permission to monitor
- **Comply with all applicable laws** regarding monitoring software
- **Respect privacy rights** of other users who may use the system
- **Follow workplace policies** if installing on corporate systems

### Workplace Installation

If installing on a work computer:
- ✅ **Obtain IT department approval** before installation
- ✅ **Verify compliance** with company policies
- ✅ **Ensure legal authorization** for monitoring
- ❌ **Do not install** without proper authorization

## Data Security

### How We Protect Your Data

- **Encryption in Transit**: All data is encrypted using TLS/SSL
- **Minimal Data Collection**: We only collect necessary operational data
- **Secure Configuration**: TLS certificate verification enabled by default
- **Local Logging**: Activity logs stored locally for your review

### Your Responsibilities

- **Secure your configuration**: Protect `config.toml` from unauthorized access
- **Monitor agent activity**: Review logs regularly
- **Keep software updated**: Install security updates promptly
- **Report issues**: Report any suspicious activity immediately

## Consent Requirements

### Before Installation

You must have:
- [ ] Read and understood this privacy notice
- [ ] Legal authority to install monitoring software on this system
- [ ] Appropriate authorization if on a shared or corporate system
- [ ] Understanding of the remote access capabilities

### Ongoing Consent

- You can withdraw consent by uninstalling the software
- You can modify consent by adjusting configuration settings
- You should review this notice periodically for changes

## Contact and Support

If you have questions about:
- **Data collection practices**: Review this document and the logs
- **Security concerns**: See SECURITY.md
- **Technical issues**: Check the GitHub repository for support
- **Privacy questions**: Contact the system administrator who deployed this agent

## Uninstallation

### To Remove HERMES-WIN:

1. **Stop the service**:
   ```cmd
   net stop HermesAgent
   ```

2. **Uninstall the service**:
   ```cmd
   agent-service.exe uninstall
   ```

3. **Delete files**:
   - Remove the installation directory
   - Delete `config.toml` and `agent.log`

4. **Verify removal**:
   - Check that no agent processes are running
   - Verify network connections are closed

## Changes to This Notice

This privacy notice may be updated to reflect changes in:
- Data collection practices
- Legal requirements
- Software capabilities
- Security measures

Check the GitHub repository for the latest version of this document.

## Acknowledgment

By proceeding with the installation, you acknowledge that:

- ✅ You have read and understood this privacy notice
- ✅ You consent to the data collection and processing described
- ✅ You have the legal authority to install this software
- ✅ You understand the remote access capabilities
- ✅ You will comply with all applicable laws and policies

---

**Installation Date**: ________________

**Installed By**: ________________

**System Administrator**: ________________

**Date of Consent**: ________________

---

*This consent notice is part of the HERMES-WIN project and is subject to the terms of the GNU General Public License v2.0 or later.*