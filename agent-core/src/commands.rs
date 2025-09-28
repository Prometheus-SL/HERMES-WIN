//! Command handling and execution

use crate::config::CommandsConfig;
use serde::{Deserialize, Serialize};
use std::process::Command;
use tracing::{debug, error, info, warn};

/// Incoming command from the server
#[derive(Debug, Deserialize, Serialize)]
pub struct IncomingCommand {
    pub command_type: String,
    pub parameters: serde_json::Value,
    pub request_id: Option<String>,
}

/// Response to a command execution
#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResponse {
    pub message_type: String,
    pub request_id: Option<String>,
    pub success: bool,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// Command executor that handles whitelisted commands
pub struct CommandExecutor {
    config: CommandsConfig,
}

impl Clone for CommandExecutor {
    fn clone(&self) -> Self {
        Self::new(self.config.clone())
    }
}

impl CommandExecutor {
    /// Create a new command executor with the given configuration
    pub fn new(config: CommandsConfig) -> Self {
        Self { config }
    }

    /// Execute a command if it's whitelisted
    pub async fn execute(&self, command: IncomingCommand) -> CommandResponse {
        info!("Executing command: {}", command.command_type);

        // Check if command is allowed
        if !self.config.allowed_commands.contains(&command.command_type) {
            warn!("Command '{}' is not in whitelist", command.command_type);
            return CommandResponse {
                message_type: "command_response".to_string(),
                request_id: command.request_id,
                success: false,
                result: None,
                error: Some("Command not allowed".to_string()),
            };
        }

        let result = match command.command_type.as_str() {
            "volume" => self.handle_volume_command(&command.parameters).await,
            "open_app" => self.handle_open_app_command(&command.parameters).await,
            _ => Err(anyhow::anyhow!("Unknown command: {}", command.command_type)),
        };

        match result {
            Ok(result_value) => {
                info!("Command '{}' executed successfully", command.command_type);
                CommandResponse {
                    message_type: "command_response".to_string(),
                    request_id: command.request_id,
                    success: true,
                    result: Some(result_value),
                    error: None,
                }
            }
            Err(e) => {
                error!("Command '{}' failed: {}", command.command_type, e);
                CommandResponse {
                    message_type: "command_response".to_string(),
                    request_id: command.request_id,
                    success: false,
                    result: None,
                    error: Some(e.to_string()),
                }
            }
        }
    }

    /// Handle volume control commands
    async fn handle_volume_command(
        &self,
        parameters: &serde_json::Value,
    ) -> crate::Result<serde_json::Value> {
        if !self.config.allow_volume_control {
            return Err(anyhow::anyhow!("Volume control is disabled"));
        }

        debug!("Handling volume command with parameters: {}", parameters);

        // Extract volume parameters
        let action = parameters
            .get("action")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'action' parameter"))?;

        match action {
            "set" => {
                let level = parameters
                    .get("level")
                    .and_then(|v| v.as_u64())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'level' parameter for set action"))?;

                self.set_volume(level as u32).await?;
                Ok(serde_json::json!({"action": "set", "level": level}))
            }
            "mute" => {
                self.mute_volume().await?;
                Ok(serde_json::json!({"action": "mute"}))
            }
            "unmute" => {
                self.unmute_volume().await?;
                Ok(serde_json::json!({"action": "unmute"}))
            }
            _ => Err(anyhow::anyhow!("Unknown volume action: {}", action)),
        }
    }

    /// Handle application launch commands
    async fn handle_open_app_command(
        &self,
        parameters: &serde_json::Value,
    ) -> crate::Result<serde_json::Value> {
        if !self.config.allow_app_launch {
            return Err(anyhow::anyhow!("Application launch is disabled"));
        }

        debug!("Handling open_app command with parameters: {}", parameters);

        let app_path = parameters
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'path' parameter"))?;

        // Check if app is in allowed list (if list is not empty)
        if !self.config.allowed_apps.is_empty()
            && !self.config.allowed_apps.contains(&app_path.to_string())
        {
            return Err(anyhow::anyhow!(
                "Application '{}' is not in allowed list",
                app_path
            ));
        }

        let args = parameters
            .get("args")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<&str>>())
            .unwrap_or_default();

        self.launch_application(app_path, &args).await?;

        Ok(serde_json::json!({
            "path": app_path,
            "args": args
        }))
    }

    /// Set system volume (Windows-specific implementation)
    async fn set_volume(&self, level: u32) -> crate::Result<()> {
        debug!("Setting volume to {}%", level);

        let _level = level.min(100); // Ensure level is between 0-100

        #[cfg(target_os = "windows")]
        {
            // Use PowerShell to set volume on Windows
            let script = format!(
                r#"
                Add-Type -TypeDefinition @'
                using System;
                using System.Runtime.InteropServices;
                public class VolumeControl {{
                    [DllImport("user32.dll")]
                    public static extern IntPtr SendMessageW(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);
                    public static void SetVolume(int volume) {{
                        IntPtr HWND_BROADCAST = new IntPtr(0xFFFF);
                        SendMessageW(HWND_BROADCAST, 0x319, IntPtr.Zero, new IntPtr(volume * 65535 / 100));
                    }}
                }}
'@
                [VolumeControl]::SetVolume({})
                "#,
                _level
            );

            let output = Command::new("powershell")
                .args(["-Command", &script])
                .output()?;

            if !output.status.success() {
                let error = String::from_utf8_lossy(&output.stderr);
                return Err(anyhow::anyhow!("Failed to set volume: {}", error));
            }

            info!("Volume set to {}%", _level);
            Ok(())
        }

        #[cfg(not(target_os = "windows"))]
        {
            Err(anyhow::anyhow!(
                "Volume control not available on this platform"
            ))
        }
    }

    /// Mute system volume
    async fn mute_volume(&self) -> crate::Result<()> {
        debug!("Muting volume");

        #[cfg(target_os = "windows")]
        {
            let output = Command::new("powershell")
                .args([
                    "-Command",
                    "(New-Object -comObject 'WScript.Shell').SendKeys([char]173)",
                ])
                .output()?;

            if !output.status.success() {
                let error = String::from_utf8_lossy(&output.stderr);
                return Err(anyhow::anyhow!("Failed to mute volume: {}", error));
            }

            info!("Volume muted");
            Ok(())
        }

        #[cfg(not(target_os = "windows"))]
        {
            Err(anyhow::anyhow!(
                "Volume mute not available on this platform"
            ))
        }
    }

    /// Unmute system volume
    async fn unmute_volume(&self) -> crate::Result<()> {
        debug!("Unmuting volume");

        #[cfg(target_os = "windows")]
        {
            let output = Command::new("powershell")
                .args([
                    "-Command",
                    "(New-Object -comObject 'WScript.Shell').SendKeys([char]173)",
                ])
                .output()?;

            if !output.status.success() {
                let error = String::from_utf8_lossy(&output.stderr);
                return Err(anyhow::anyhow!("Failed to unmute volume: {}", error));
            }

            info!("Volume unmuted");
            Ok(())
        }

        #[cfg(not(target_os = "windows"))]
        {
            Err(anyhow::anyhow!(
                "Volume unmute not available on this platform"
            ))
        }
    }

    /// Launch an application
    async fn launch_application(&self, path: &str, args: &[&str]) -> crate::Result<()> {
        debug!("Launching application: {} with args: {:?}", path, args);

        let mut command = Command::new(path);
        command.args(args);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            // Don't create a console window for GUI applications
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let child = command.spawn()?;

        info!("Application '{}' launched with PID: {}", path, child.id());
        Ok(())
    }
}
