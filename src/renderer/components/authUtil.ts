export function storeTokens(tokens: { access_token: string; refresh_token?: string }) {
    try {
        localStorage.setItem('hermes_tokens', JSON.stringify(tokens));
    } catch (e) {
        // ignore
    }
}

export function loadTokens(): { access_token: string; refresh_token?: string } | null {
    try {
        const v = localStorage.getItem('hermes_tokens');
        if (!v) return null;
        return JSON.parse(v);
    } catch (e) {
        return null;
    }
}

export function clearTokens() {
    try { localStorage.removeItem('hermes_tokens'); } catch (e) { }
}
