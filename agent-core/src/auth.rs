//! Authentication module for JWT-based agent authentication

use crate::config::AuthConfig;
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
    config: AuthConfig,
    client: reqwest::Client,
    agent_id: String,
}

impl AuthManager {
    /// Create a new authentication manager
    pub fn new(config: AuthConfig, agent_id: String) -> Self {
        let client = reqwest::Client::builder()
            .user_agent("HERMES-WIN-Agent/0.1.0")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            config,
            client,
            agent_id,
        }
    }

    /// Perform agent login and get JWT tokens
    pub async fn login(&mut self) -> Result<TokenPair> {
        if self.config.email.is_empty() || self.config.password.is_empty() {
            return Err(anyhow::anyhow!(
                "Email and password must be configured for authentication"
            ));
        }

        info!("Attempting agent login for email: {}", self.config.email);
        
        let login_request = AgentLoginRequest {
            email: self.config.email.clone(),
            password: self.config.password.clone(),
            agent_id: self.agent_id.clone(),
        };

        let login_url = format!("{}/auth/agent/login", self.config.server_url);
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
        
        // Update config with new tokens
        self.config.access_token = Some(login_response.data.tokens.access_token.clone());
        self.config.refresh_token = Some(login_response.data.tokens.refresh_token.clone());

        info!("Agent login successful for agent: {}", login_response.data.agent.id);
        debug!("Received access token: {}...", &login_response.data.tokens.access_token[..20]);

        Ok(login_response.data.tokens)
    }

    /// Send data to the server with authentication
    pub async fn send_data(&self, data_request: AgentDataRequest) -> Result<()> {
        let access_token = self
            .config
            .access_token
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No access token available. Please login first."))?;

        let data_url = format!("{}/api/v1/agents/data", self.config.server_url);
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
        self.config.access_token.is_some()
    }

    /// Get the current access token for WebSocket authentication
    pub fn get_access_token(&self) -> Option<&String> {
        self.config.access_token.as_ref()
    }

    /// Update the authentication configuration
    pub fn update_config(&mut self, config: AuthConfig) {
        self.config = config;
    }

    /// Get the current authentication configuration
    pub fn get_config(&self) -> &AuthConfig {
        &self.config
    }

    /// Clear stored tokens (for logout)
    pub fn clear_tokens(&mut self) {
        self.config.access_token = None;
        self.config.refresh_token = None;
        info!("Authentication tokens cleared");
    }
}