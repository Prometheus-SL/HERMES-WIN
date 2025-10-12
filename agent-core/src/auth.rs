//! Authentication module for JWT-based agent authentication

use crate::config::AuthConfig;
use crate::credentials::{CredentialManager, UserCredentials, StoredTokens};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info, warn};

/// Request structure for agent login
#[derive(Debug, Serialize)]
pub struct AgentLoginRequest {
    pub email: String,
    pub password: String,
    #[serde(rename = "agentId")]
    pub agent_id: String,
}

#[derive(Debug, Deserialize)]
pub struct AgentLoginResponseData {
    pub success: bool,
    pub data: AgentLoginResponse,
}

/// Response structure for agent login
#[derive(Debug, Deserialize)]
pub struct AgentLoginResponse {
    pub tokens: TokenPair,
    pub agent: AgentInfo,

}

/// Token pair from authentication
#[derive(Debug, Deserialize)]
pub struct TokenPair {
    #[serde(rename = "accessToken")]
    pub access_token: String,
    #[serde(rename = "refreshToken")]
    pub refresh_token: String,
}

/// Agent information from server
#[derive(Debug, Deserialize)]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub owner: Option<serde_json::Value>,
}

/// Structure for sending data to the server
#[derive(Debug, Serialize)]
pub struct AgentDataRequest {
    pub data: serde_json::Value,
    #[serde(rename = "dataType")]
    pub data_type: String,
    pub priority: String,
    pub tags: Vec<String>,
    #[serde(rename = "agentId", skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
}

/// Authentication manager for handling JWT tokens and login
pub struct AuthManager {
    server_url: String,
    client: reqwest::Client,
    agent_id: String,
    credential_manager: CredentialManager,
    current_tokens: Option<StoredTokens>,
}

impl AuthManager {
    /// Create a new authentication manager
    pub fn new(config: AuthConfig, agent_id: String) -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent("HERMES-WIN-Agent/0.1.0")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| anyhow::anyhow!("Failed to create HTTP client: {}", e))?;

        let credential_manager = CredentialManager::new()?;

        Ok(Self {
            server_url: config.server_url,
            client,
            agent_id,
            credential_manager,
            current_tokens: None,
        })
    }

    /// Perform agent login and get JWT tokens
    pub async fn login(&mut self) -> Result<TokenPair> {
        // First try to load existing valid tokens
        if let Ok(stored_tokens) = self.credential_manager.load_tokens() {
            info!("Using stored authentication tokens");
            self.current_tokens = Some(stored_tokens.clone());
            return Ok(TokenPair {
                access_token: stored_tokens.access_token,
                refresh_token: stored_tokens.refresh_token,
            });
        }

        // Load credentials from secure storage
        let credentials = self.credential_manager.load_credentials()
            .map_err(|e| anyhow::anyhow!("No stored credentials found. Please run credential setup first: {}", e))?;

        info!("Attempting agent login for email: {}", credentials.email);
        
        let login_request = AgentLoginRequest {
            email: credentials.email,
            password: credentials.password,
            agent_id: self.agent_id.clone(),
        };

        let login_url = format!("{}/auth/agent/login", self.server_url);
        debug!("Sending login request to: {}", login_url);

        let response = self
            .client
            .post(&login_url)
            .header("Content-Type", "application/json")
            .json(&login_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            error!("Login failed with status {}: {}", status, error_text);
            return Err(anyhow::anyhow!(
                "Login failed with status {}: {}",
                status,
                error_text
            ));
        }

        let login_response: AgentLoginResponseData = response.json().await?;
        
        // Store tokens securely
        let stored_tokens = StoredTokens {
            access_token: login_response.data.tokens.access_token.clone(),
            refresh_token: login_response.data.tokens.refresh_token.clone(),
            expires_at: Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() + 3600, // 1 hour expiry
            ),
        };
        
        self.credential_manager.store_tokens(&stored_tokens)?;
        self.current_tokens = Some(stored_tokens);

        info!("Agent login successful for agent: {}", login_response.data.agent.id);
        debug!("Received access token: {}...", &login_response.data.tokens.access_token[..20]);

        Ok(login_response.data.tokens)
    }

    /// Send data to the server with authentication
    pub async fn send_data(&self, data_request: AgentDataRequest) -> Result<()> {
        let access_token = self
            .current_tokens
            .as_ref()
            .map(|t| &t.access_token)
            .ok_or_else(|| anyhow::anyhow!("No access token available. Please login first."))?;

        let data_url = format!("{}/api/v1/agents/data", self.server_url);
        debug!("Sending data to: {}", data_url);

        let response = self
            .client
            .post(&data_url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Content-Type", "application/json")
            .header("x-agent-id", &self.agent_id)
            .json(&data_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            
            // If we get 401, the token might be expired
            if status == 401 {
                warn!("Authentication failed, token might be expired");
                return Err(anyhow::anyhow!("Authentication failed: {}", error_text));
            }
            
            error!("Data send failed with status {}: {}", status, error_text);
            return Err(anyhow::anyhow!(
                "Data send failed with status {}: {}",
                status,
                error_text
            ));
        }

        debug!("Data sent successfully");
        Ok(())
    }

    /// Check if we have a valid access token
    pub fn has_valid_token(&self) -> bool {
        self.current_tokens.is_some()
    }

    /// Get the current access token for WebSocket authentication
    pub fn get_access_token(&self) -> Option<&String> {
        self.current_tokens.as_ref().map(|t| &t.access_token)
    }

    /// Update the server URL
    pub fn update_server_url(&mut self, server_url: String) {
        self.server_url = server_url;
    }

    /// Get the current server URL
    pub fn get_server_url(&self) -> &String {
        &self.server_url
    }

    /// Clear stored tokens (for logout)
    pub fn clear_tokens(&mut self) -> Result<()> {
        self.current_tokens = None;
        // Also clear from persistent storage
        if let Err(e) = self.credential_manager.clear_all() {
            warn!("Failed to clear persistent credentials: {}", e);
        }
        info!("Authentication tokens cleared");
        Ok(())
    }

    /// Setup credentials (for initial configuration)
    pub fn setup_credentials(&self, email: String, password: String) -> Result<()> {
        let credentials = UserCredentials {
            email,
            password,
            server_url: self.server_url.clone(),
        };
        
        self.credential_manager.store_credentials(&credentials)?;
        info!("Credentials stored securely");
        Ok(())
    }

    /// Check if credentials are already stored
    pub fn has_stored_credentials(&self) -> bool {
        self.credential_manager.has_credentials()
    }
}