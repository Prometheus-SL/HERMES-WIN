const axios = require('axios');
const credentials = require('./credentials');
const { normalizeServerUrl } = require('./serverUrl');
const {
    loadRuntimeState,
    saveRuntimeState,
    clearRuntimeSession,
} = require('./runtimeState');

class AuthManager {
    constructor(serverUrl, agentId) {
        this.serverUrl = serverUrl || null; // may be derived from stored creds
        this.agentId = agentId;
        this.tokens = null; // { access_token, refresh_token }
        this.refreshInProgress = null;
    }

    async loadTokens() {
        const state = loadRuntimeState();
        this.serverUrl = this.serverUrl || state.serverUrl || null;
        this.agentId = this.agentId || state.agentId || null;
        this.tokens = {
            access_token: state.accessToken || null,
            refresh_token: state.refreshToken || null,
        };
        return this.tokens;
    }

    async login() {
        const creds = await credentials.loadCredentials();
        return this.loginWithCredentials({
            email: creds.email,
            password: creds.password,
            serverUrl: creds.server_url,
        });
    }

    async loginWithCredentials({ email, password, serverUrl }) {
        const currentState = loadRuntimeState();
        const nextServerUrl = normalizeServerUrl(
            serverUrl || this.serverUrl || currentState.serverUrl || ''
        );
        const nextAgentId = this.agentId || currentState.agentId;

        if (!nextServerUrl) {
            throw new Error('Missing server URL');
        }

        if (!email || !password) {
            throw new Error('Missing user credentials');
        }

        const loginUrl = `${nextServerUrl}/auth/agent/login`;
        const payload = { email, password, agentId: nextAgentId };

        const res = await axios.post(loginUrl, payload, { timeout: 30000 });
        if (res.status !== 200) throw new Error('Login failed: ' + res.status);
        const tokens = res.data?.data?.tokens || res.data?.tokens || res.data;
        await this._storeTokensFromResponse(tokens, { serverUrl: nextServerUrl, agentId: nextAgentId });
        this.serverUrl = nextServerUrl;
        this.agentId = nextAgentId;
        return this.tokens;
    }

    async _storeTokensFromResponse(tokens, options = {}) {
        const access = tokens.accessToken || tokens.access_token;
        const refresh = tokens.refreshToken || tokens.refresh_token;
        this.tokens = { access_token: access || null, refresh_token: refresh || null };
        saveRuntimeState({
            serverUrl: options.serverUrl || this.serverUrl || loadRuntimeState().serverUrl || '',
            agentId: options.agentId || this.agentId || loadRuntimeState().agentId,
            accessToken: this.tokens.access_token,
            refreshToken: this.tokens.refresh_token,
            lastAuthAt: new Date().toISOString(),
        });
        return this.tokens;
    }

    async refreshTokens(refreshToken) {
        const state = loadRuntimeState();
        const server = normalizeServerUrl(this.serverUrl || state.serverUrl || '');
        if (!server) {
            throw new Error('Missing server URL');
        }

        const url = `${server}/auth/refresh`;
        const payload = { refreshToken };
        const res = await axios.post(url, payload, { timeout: 15000 });
        if (res.status !== 200) throw new Error('Refresh failed: ' + res.status);
        const tokens = res.data?.data || res.data?.tokens || res.data;
        await this._storeTokensFromResponse(tokens, {
            serverUrl: server,
            agentId: state.agentId || this.agentId,
        });
        return this.tokens;
    }

    async ensureValidToken() {
        const stored = this.tokens || (await this.loadTokens());
        if (stored?.access_token) return stored.access_token;

        // If refresh already in progress, await it
        if (this.refreshInProgress) return this.refreshInProgress;

        // Try to refresh using stored tokens
        this.refreshInProgress = (async () => {
            try {
                const latest = this.tokens || (await this.loadTokens());
                if (latest && latest.refresh_token) {
                    await this.refreshTokens(latest.refresh_token);
                    return this.tokens.access_token;
                }
                // fallback to full login
                await this.login();
                return this.tokens.access_token;
            } catch (_error) {
                return null;
            } finally {
                this.refreshInProgress = null;
            }
        })();

        return this.refreshInProgress;
    }

    getAccessToken() {
        return this.tokens?.access_token || null;
    }

    invalidateSessionTokens() {
        this.tokens = { access_token: null, refresh_token: null };
        clearRuntimeSession();
    }

    async clearCredentials() {
        this.tokens = null;
        await credentials.clearAll();
        clearRuntimeSession();
    }

    async sendData(path, data) {
        const token = await this.ensureValidToken();
        if (!token) throw new Error('No access token');
        const server = normalizeServerUrl(this.serverUrl || loadRuntimeState().serverUrl || '');
        const url = `${server}${path}`;
        return axios.post(url, data, { headers: { Authorization: `Bearer ${token}` } });
    }
}

module.exports = AuthManager;
