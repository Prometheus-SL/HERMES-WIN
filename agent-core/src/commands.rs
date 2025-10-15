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
            "sleep" => self.handle_sleep_command(&command.parameters).await,
            "lock_screen" => self.handle_lock_screen_command(&command.parameters).await,
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

    /// Handle sleep/suspend command
    async fn handle_sleep_command(
        &self,
        parameters: &serde_json::Value,
    ) -> crate::Result<serde_json::Value> {
        debug!("Handling sleep command with parameters: {}", parameters);

        // Extract sleep type parameter (optional)
        let sleep_type = parameters
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("suspend"); // Default to suspend

        match sleep_type {
            "suspend" | "sleep" => {
                self.suspend_system().await?;
                Ok(serde_json::json!({"action": "suspend", "status": "executed"}))
            }
            "hibernate" => {
                self.hibernate_system().await?;
                Ok(serde_json::json!({"action": "hibernate", "status": "executed"}))
            }
            _ => Err(anyhow::anyhow!("Unknown sleep type: {}. Use 'suspend' or 'hibernate'", sleep_type)),
        }
    }

    /// Handle lock screen command
    async fn handle_lock_screen_command(
        &self,
        parameters: &serde_json::Value,
    ) -> crate::Result<serde_json::Value> {
        debug!("Handling lock screen command with parameters: {}", parameters);

        self.lock_screen().await?;
        Ok(serde_json::json!({"action": "lock_screen", "status": "executed"}))
    }
    

    /// Set system volume (Windows-specific implementation)
    async fn set_volume(&self, level: u32) -> crate::Result<()> {
        debug!("Setting volume to {}%", level);

        let _level = level.min(100); // Ensure level is between 0-100

        #[cfg(target_os = "windows")]
        {
            // Use PowerShell with Windows Audio Session API for more reliable volume control
            let script = format!(
                r#"
                try {{
                    # More reliable method using .NET audio APIs
                    Add-Type -TypeDefinition @'
                    using System;
                    using System.Runtime.InteropServices;
                    using System.ComponentModel;
                    
                    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
                    interface IAudioEndpointVolume {{
                        int RegisterControlChangeNotify(IntPtr pNotify);
                        int UnregisterControlChangeNotify(IntPtr pNotify);
                        int GetChannelCount(out int pnChannelCount);
                        int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
                        int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
                        int GetMasterVolumeLevel(out float pfLevelDB);
                        int GetMasterVolumeLevelScalar(out float pfLevel);
                        int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
                        int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
                        int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
                        int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
                        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
                        int GetMute(out bool pbMute);
                        int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
                        int VolumeStepUp(ref Guid pguidEventContext);
                        int VolumeStepDown(ref Guid pguidEventContext);
                        int QueryHardwareSupport(out int pdwHardwareSupportMask);
                        int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
                    }}
                    
                    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
                    interface IMMDevice {{
                        int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
                    }}
                    
                    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
                    interface IMMDeviceEnumerator {{
                        int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
                        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
                    }}
                    
                    [ComImport]
                    [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
                    class MMDeviceEnumerator {{
                    }}
                    
                    public class VolumeControl {{
                        public static void SetVolume(int volume) {{
                            var deviceEnumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
                            IMMDevice speakers;
                            deviceEnumerator.GetDefaultAudioEndpoint(0, 0, out speakers);
                            
                            Guid IID_IAudioEndpointVolume = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
                            object o;
                            speakers.Activate(ref IID_IAudioEndpointVolume, 0, IntPtr.Zero, out o);
                            IAudioEndpointVolume aev = (IAudioEndpointVolume)o;
                            
                            Guid guid = Guid.Empty;
                            aev.SetMasterVolumeLevelScalar((float)volume / 100.0f, ref guid);
                        }}
                    }}
'@
                    
                    [VolumeControl]::SetVolume({})
                    Write-Output "Volume successfully set to {}%"
                }} catch {{
                    # Fallback to simpler method if COM API fails
                    Write-Warning "COM API failed, trying simpler method..."
                    
                    # Alternative: Use keyboard simulation
                    Add-Type -AssemblyName System.Windows.Forms
                    
                    # Mute first to reset
                    [System.Windows.Forms.SendKeys]::SendWait("{{VOLUME_MUTE}}")
                    Start-Sleep -Milliseconds 300
                    
                    # Unmute to start fresh
                    [System.Windows.Forms.SendKeys]::SendWait("{{VOLUME_MUTE}}")
                    Start-Sleep -Milliseconds 300
                    
                    # Calculate steps (Windows has 50 volume steps typically)
                    $steps = [Math]::Round({} / 2)
                    
                    # Press volume up
                    for ($i = 0; $i -lt $steps; $i++) {{
                        [System.Windows.Forms.SendKeys]::SendWait("{{VOLUME_UP}}")
                        Start-Sleep -Milliseconds 50
                    }}
                    
                    Write-Output "Volume set to approximately {}% using keyboard simulation"
                }}
                "#,
                _level, _level, _level, _level
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

    /// Suspend the system (put to sleep)
    async fn suspend_system(&self) -> crate::Result<()> {
        debug!("Suspending system");

        #[cfg(target_os = "windows")]
        {
            // Use rundll32 to suspend the system
            let output = Command::new("rundll32.exe")
                .args(["powrprof.dll,SetSuspendState", "0,1,0"])
                .output()?;

            if !output.status.success() {
                let error = String::from_utf8_lossy(&output.stderr);
                return Err(anyhow::anyhow!("Failed to suspend system: {}", error));
            }

            info!("System suspended");
            Ok(())
        }

        #[cfg(not(target_os = "windows"))]
        {
            Err(anyhow::anyhow!(
                "System suspend not available on this platform"
            ))
        }
    }

    /// Hibernate the system
    async fn hibernate_system(&self) -> crate::Result<()> {
        debug!("Hibernating system");

        #[cfg(target_os = "windows")]
        {
            // Use rundll32 to hibernate the system
            let output = Command::new("rundll32.exe")
                .args(["powrprof.dll,SetSuspendState", "1,1,0"])
                .output()?;

            if !output.status.success() {
                let error = String::from_utf8_lossy(&output.stderr);
                return Err(anyhow::anyhow!("Failed to hibernate system: {}", error));
            }

            info!("System hibernated");
            Ok(())
        }

        #[cfg(not(target_os = "windows"))]
        {
            Err(anyhow::anyhow!(
                "System hibernation not available on this platform"
            ))
        }
    }

    /// Lock the screen
    async fn lock_screen(&self) -> crate::Result<()> {
        debug!("Locking screen");

        #[cfg(target_os = "windows")]
        {
            // Use rundll32 to lock the workstation
            let output = Command::new("rundll32.exe")
                .args(["user32.dll,LockWorkStation"])
                .output()?;

            if !output.status.success() {
                let error = String::from_utf8_lossy(&output.stderr);
                return Err(anyhow::anyhow!("Failed to lock screen: {}", error));
            }

            info!("Screen locked");
            Ok(())
        }

        #[cfg(not(target_os = "windows"))]
        {
            Err(anyhow::anyhow!(
                "Screen lock not available on this platform"
            ))
        }
    }
}
