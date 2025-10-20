const axios = require('axios');
const credentials = require('./credentials');

class AuthManager {
  constructor(serverUrl, agentId) {
    this.serverUrl = serverUrl || null; // may be derived from stored creds
    this.agentId = agentId;
    this.tokens = null; // { access_token, refresh_token, expires_at }
    this.refreshInProgress = null;
  }

  async loadTokens() {
    try {
      const t = await credentials.loadTokens();
      this.tokens = t;
      return t;
    } catch (e) {
      return null;
    }
  }

  async login() {
    // Try existing tokens first
    const stored = await this.loadTokens();
    if (stored && !this._isExpired(stored.expires_at)) {
      return stored;
    }

    // If tokens expired but we have refresh token, try refresh
    if (stored && stored.refresh_token) {
      try {
        const refreshed = await this.refreshTokens(stored.refresh_token);
        await this._storeTokensFromResponse(refreshed);
        return this.tokens;
      } catch (e) {
        // fallthrough to full login
        console.warn('Refresh failed during login:', e.message);
      }
    }

    // Full login via stored credentials
    const creds = await credentials.loadCredentials();
    const loginUrl = `${creds.server_url.replace(/\/$/, '')}/auth/agent/login`;
    const payload = { email: creds.email, password: creds.password, agentId: this.agentId };

    const res = await axios.post(loginUrl, payload, { timeout: 30000 });
    if (res.status !== 200) throw new Error('Login failed: ' + res.status);
    const tokens = res.data.data.tokens;
    await this._storeTokensFromResponse(tokens);
    // persist serverUrl if not set
    if (!this.serverUrl) this.serverUrl = creds.server_url;
    return this.tokens;
  }

  async _storeTokensFromResponse(tokens) {
    // tokens may be shape { accessToken, refreshToken } or { access_token, refresh_token }
    const access = tokens.accessToken || tokens.access_token;
    const refresh = tokens.refreshToken || tokens.refresh_token;
    const expires_at = Date.now() + 3600 * 1000; // default 1h
    this.tokens = { access_token: access, refresh_token: refresh, expires_at };
    await credentials.storeTokens(this.tokens);
  }

  _isExpired(expires_at) {
    if (!expires_at) return true;
    return Date.now() >= expires_at - 30 * 1000; // treat near-expiry as expired (30s buffer)
  }

  async refreshTokens(refreshToken) {
    // Determine refresh endpoint from stored server url or credentials
    const server = this.serverUrl || (await (async () => { const c = await credentials.loadCredentials(); return c.server_url; })());
    const url = `${server.replace(/\/$/, '')}/auth/agent/refresh`;
    const payload = { refreshToken, agentId: this.agentId };
    const res = await axios.post(url, payload, { timeout: 15000 });
    if (res.status !== 200) throw new Error('Refresh failed: ' + res.status);
    const tokens = res.data.data.tokens || res.data.tokens || res.data;
    await this._storeTokensFromResponse(tokens);
    return this.tokens;
  }

  async ensureValidToken() {
    if (this.tokens && !this._isExpired(this.tokens.expires_at)) return this.tokens.access_token;

    // If refresh already in progress, await it
    if (this.refreshInProgress) return this.refreshInProgress;

    // Try to refresh using stored tokens
    this.refreshInProgress = (async () => {
      try {
        const stored = this.tokens || (await this.loadTokens());
        if (stored && stored.refresh_token) {
          await this.refreshTokens(stored.refresh_token);
          return this.tokens.access_token;
        }
        // fallback to full login
        await this.login();
        return this.tokens.access_token;
      } finally {
        this.refreshInProgress = null;
      }
    })();

    return this.refreshInProgress;
  }

  getAccessToken() {
    return this.tokens?.access_token || null;
  }

  async clearCredentials() {
    this.tokens = null;
    await credentials.clearAll();
  }

  async sendData(path, data) {
    const token = await this.ensureValidToken();
    if (!token) throw new Error('No access token');
    const url = `${this.serverUrl.replace(/\/$/, '')}${path}`;
    return axios.post(url, data, { headers: { Authorization: `Bearer ${token}` } });
  }
}

module.exports = AuthManager;
