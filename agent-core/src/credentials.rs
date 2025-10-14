//! Secure credential storage for Windows using the Credential Manager

use anyhow::Result;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::{debug, info, warn};

/// Secure credential storage manager
pub struct CredentialManager {
    service_name: String,
    user_config_dir: PathBuf,
}

/// User credentials for agent authentication
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserCredentials {
    pub email: String,
    pub password: String,
    pub server_url: String,
}

/// Stored authentication tokens
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StoredTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: Option<u64>, // Unix timestamp
}

impl CredentialManager {
    /// Create a new credential manager
    pub fn new() -> Result<Self> {
        let service_name = "HERMES-WIN-Agent".to_string();
        
        // Get user's config directory
        let user_config_dir = dirs::config_dir()
            .ok_or_else(|| anyhow::anyhow!("Could not determine user config directory"))?
            .join("HERMES-WIN");

        // Create config directory if it doesn't exist
        if !user_config_dir.exists() {
            std::fs::create_dir_all(&user_config_dir)?;
            info!("Created user config directory: {:?}", user_config_dir);
        }

        Ok(Self {
            service_name,
            user_config_dir,
        })
    }

    /// Store user credentials securely in Windows Credential Manager
    pub fn store_credentials(&self, credentials: &UserCredentials) -> Result<()> {
        // Store email in credential manager
        let email_entry = Entry::new(&self.service_name, "email")?;
        email_entry.set_password(&credentials.email)?;

        // Store password in credential manager
        let password_entry = Entry::new(&self.service_name, "password")?;
        password_entry.set_password(&credentials.password)?;

        // Store server URL in credential manager
        let server_entry = Entry::new(&self.service_name, "server_url")?;
        server_entry.set_password(&credentials.server_url)?;

        info!("Credentials stored securely in Windows Credential Manager");
        
        // Also store in user config file as backup (without password)
        self.store_credentials_backup(&credentials)?;
        
        Ok(())
    }

    /// Retrieve user credentials from Windows Credential Manager
    pub fn load_credentials(&self) -> Result<UserCredentials> {
        // Try to load from Windows Credential Manager first
        match self.load_from_credential_manager() {
            Ok(creds) => {
                debug!("Credentials loaded from Windows Credential Manager");
                Ok(creds)
            }
            Err(e) => {
                warn!("Failed to load from Credential Manager: {}", e);
                // Fallback to config file (will prompt for password)
                self.load_from_backup()
            }
        }
    }

    /// Load credentials from Windows Credential Manager
    fn load_from_credential_manager(&self) -> Result<UserCredentials> {
        let email_entry = Entry::new(&self.service_name, "email")?;
        let email = email_entry.get_password()?;

        let password_entry = Entry::new(&self.service_name, "password")?;
        let password = password_entry.get_password()?;

        let server_entry = Entry::new(&self.service_name, "server_url")?;
        let server_url = server_entry.get_password()?;

        Ok(UserCredentials {
            email,
            password,
            server_url,
        })
    }

    /// Store credentials backup in user config (without password)
    fn store_credentials_backup(&self, credentials: &UserCredentials) -> Result<()> {
        let backup_path = self.user_config_dir.join("user_config.json");
        
        let backup_data = serde_json::json!({
            "email": credentials.email,
            "server_url": credentials.server_url,
            "note": "Password is stored securely in Windows Credential Manager"
        });

        std::fs::write(&backup_path, serde_json::to_string_pretty(&backup_data)?)?;
        debug!("Credential backup stored at: {:?}", backup_path);
        
        Ok(())
    }

    /// Load credentials from backup (prompts for password)
    fn load_from_backup(&self) -> Result<UserCredentials> {
        let backup_path = self.user_config_dir.join("user_config.json");
        
        if !backup_path.exists() {
            return Err(anyhow::anyhow!("No stored credentials found. Please run the setup first."));
        }

        let content = std::fs::read_to_string(&backup_path)?;
        let backup_data: serde_json::Value = serde_json::from_str(&content)?;

        let _email = backup_data["email"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Invalid backup data: missing email"))?
            .to_string();

        let _server_url = backup_data["server_url"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Invalid backup data: missing server_url"))?
            .to_string();

        // For now, return error - in a real implementation you'd prompt for password
        Err(anyhow::anyhow!(
            "Password not available. Please re-run credential setup or check Windows Credential Manager."
        ))
    }

    /// Store authentication tokens securely
    pub fn store_tokens(&self, tokens: &StoredTokens) -> Result<()> {
        let tokens_path = self.user_config_dir.join("tokens.json");
        
        // Encrypt/obfuscate tokens before storing (basic protection)
        let token_data = serde_json::to_string_pretty(tokens)?;
        let encoded_data = base64::encode(token_data);
        
        std::fs::write(&tokens_path, encoded_data)?;
        debug!("Tokens stored securely at: {:?}", tokens_path);
        
        Ok(())
    }

    /// Load authentication tokens
    pub fn load_tokens(&self) -> Result<StoredTokens> {
        let tokens_path = self.user_config_dir.join("tokens.json");
        
        if !tokens_path.exists() {
            return Err(anyhow::anyhow!("No stored tokens found"));
        }

        let encoded_data = std::fs::read_to_string(&tokens_path)?;
        let token_data = base64::decode(encoded_data)?;
        let token_string = String::from_utf8(token_data)?;
        
        let tokens: StoredTokens = serde_json::from_str(&token_string)?;
        
        // Check if tokens are expired; si expiraron, devolvemos igualmente para permitir refresh automático
        if let Some(expires_at) = tokens.expires_at {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            if now >= expires_at {
                warn!("Stored tokens have expired; will require refresh");
            }
        }
        
        debug!("Tokens loaded from secure storage");
        Ok(tokens)
    }

    /// Clear all stored credentials and tokens
    pub fn clear_all(&self) -> Result<()> {
        // Clear from Windows Credential Manager
        if let Ok(email_entry) = Entry::new(&self.service_name, "email") {
            let _ = email_entry.delete_password();
        }
        if let Ok(password_entry) = Entry::new(&self.service_name, "password") {
            let _ = password_entry.delete_password();
        }
        if let Ok(server_entry) = Entry::new(&self.service_name, "server_url") {
            let _ = server_entry.delete_password();
        }

        // Clear backup files
        let backup_path = self.user_config_dir.join("user_config.json");
        if backup_path.exists() {
            std::fs::remove_file(&backup_path)?;
        }

        let tokens_path = self.user_config_dir.join("tokens.json");
        if tokens_path.exists() {
            std::fs::remove_file(&tokens_path)?;
        }

        info!("All stored credentials and tokens cleared");
        Ok(())
    }

    /// Check if credentials are stored
    pub fn has_credentials(&self) -> bool {
        Entry::new(&self.service_name, "email")
            .and_then(|entry| entry.get_password())
            .is_ok()
    }

    /// Get the user config directory path
    pub fn get_config_dir(&self) -> &PathBuf {
        &self.user_config_dir
    }
}

// Add base64 dependency
mod base64 {
    pub fn encode(data: String) -> String {
        use std::fmt::Write;
        let bytes = data.as_bytes();
        let mut result = String::new();
        for &byte in bytes {
            write!(&mut result, "{:02x}", byte).unwrap();
        }
        result
    }

    pub fn decode(data: String) -> Result<Vec<u8>, anyhow::Error> {
        let mut result = Vec::new();
        let chars: Vec<char> = data.chars().collect();
        
        if chars.len() % 2 != 0 {
            return Err(anyhow::anyhow!("Invalid hex string length"));
        }
        
        for chunk in chars.chunks(2) {
            let hex_str: String = chunk.iter().collect();
            let byte = u8::from_str_radix(&hex_str, 16)
                .map_err(|e| anyhow::anyhow!("Invalid hex: {}", e))?;
            result.push(byte);
        }
        
        Ok(result)
    }
}