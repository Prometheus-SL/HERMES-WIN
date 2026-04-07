const fs = require('fs');
const { normalizeServerUrl } = require('./serverUrl');
const {
    getTokensFilePath,
    getUserConfigFilePath,
} = require('./platform/paths');

let keytar = null;
try {
    keytar = require('keytar');
} catch (_error) {
    keytar = null;
}

const SERVICE = 'HERMES-WIN-Agent';
const CONFIG_FILE = getUserConfigFilePath();
const TOKENS_FILE = getTokensFilePath();
const CONFIG_DIR = require('path').dirname(CONFIG_FILE);
const LOCAL_CREDENTIALS_FILE = require('path').join(CONFIG_DIR, 'credentials.dev.json');

async function ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
}

function canUseFileCredentialFallback() {
    return process.env.NODE_ENV === 'development' || process.env.HERMES_ALLOW_FILE_CREDENTIALS === '1';
}

async function storeSecret(account, value) {
    if (keytar) {
        await keytar.setPassword(SERVICE, account, value);
        return;
    }

    if (!canUseFileCredentialFallback()) {
        throw new Error('Secure credential storage is unavailable because keytar is not installed.');
    }

    await ensureConfigDir();
    const current = await loadFallbackCredentialFile();
    current[account] = value;
    fs.writeFileSync(LOCAL_CREDENTIALS_FILE, JSON.stringify(current, null, 2));
}

async function loadSecret(account) {
    if (keytar) {
        return keytar.getPassword(SERVICE, account);
    }

    if (!canUseFileCredentialFallback()) {
        return null;
    }

    const current = await loadFallbackCredentialFile();
    return current[account] || null;
}

async function deleteSecret(account) {
    if (keytar) {
        await keytar.deletePassword(SERVICE, account);
        return;
    }

    if (!canUseFileCredentialFallback()) {
        return;
    }

    const current = await loadFallbackCredentialFile();
    delete current[account];
    fs.writeFileSync(LOCAL_CREDENTIALS_FILE, JSON.stringify(current, null, 2));
}

async function loadFallbackCredentialFile() {
    await ensureConfigDir();
    if (!fs.existsSync(LOCAL_CREDENTIALS_FILE)) {
        return {};
    }

    try {
        return JSON.parse(fs.readFileSync(LOCAL_CREDENTIALS_FILE, 'utf8'));
    } catch (_error) {
        return {};
    }
}

async function storeCredentials({ email, password, server_url }) {
    const normalizedServerUrl = normalizeServerUrl(server_url);
    await storeSecret('email', email);
    await storeSecret('password', password);
    await storeSecret('server_url', normalizedServerUrl);
    await ensureConfigDir();
    const backup = { email, server_url: normalizedServerUrl, note: 'Password stored in system keychain' };
    if (!keytar && canUseFileCredentialFallback()) {
        backup.note = 'Password stored in local development file fallback';
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(backup, null, 2));
}

async function loadCredentials() {
    const email = await loadSecret('email');
    const password = await loadSecret('password');
    const server_url = await loadSecret('server_url');
    if (!email || !password || !server_url) {
        throw new Error('No stored credentials found');
    }
    return { email, password, server_url: normalizeServerUrl(server_url) };
}

async function storeTokens(tokens) {
    await ensureConfigDir();
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

async function loadTokens() {
    if (!fs.existsSync(TOKENS_FILE)) throw new Error('No stored tokens');
    const content = fs.readFileSync(TOKENS_FILE, 'utf8');
    return JSON.parse(content);
}

async function clearAll() {
    try { await deleteSecret('email'); } catch (e) { }
    try { await deleteSecret('password'); } catch (e) { }
    try { await deleteSecret('server_url'); } catch (e) { }
    try { if (fs.existsSync(LOCAL_CREDENTIALS_FILE)) fs.unlinkSync(LOCAL_CREDENTIALS_FILE); } catch (e) { }
    try { if (fs.existsSync(TOKENS_FILE)) fs.unlinkSync(TOKENS_FILE); } catch (e) { }
}

async function hasCredentials() {
    const email = await loadSecret('email');
    return !!email;
}

module.exports = {
    storeCredentials,
    loadCredentials,
    storeTokens,
    loadTokens,
    clearAll,
    hasCredentials,
};
