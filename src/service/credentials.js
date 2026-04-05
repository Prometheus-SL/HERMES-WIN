const keytar = require('keytar');
const fs = require('fs');
const path = require('path');

const SERVICE = 'HERMES-WIN-Agent';
const CONFIG_DIR = path.join(require('os').homedir(), '.hermes');
const TOKENS_FILE = path.join(CONFIG_DIR, 'tokens.json');

async function ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
}

async function storeCredentials({ email, password, server_url }) {
    await keytar.setPassword(SERVICE, 'email', email);
    await keytar.setPassword(SERVICE, 'password', password);
    await keytar.setPassword(SERVICE, 'server_url', server_url);
    // also write a small backup without password
    await ensureConfigDir();
    const backup = { email, server_url, note: 'Password stored in system keychain' };
    fs.writeFileSync(path.join(CONFIG_DIR, 'user_config.json'), JSON.stringify(backup, null, 2));
}

async function loadCredentials() {
    const email = await keytar.getPassword(SERVICE, 'email');
    const password = await keytar.getPassword(SERVICE, 'password');
    const server_url = await keytar.getPassword(SERVICE, 'server_url');
    if (!email || !password || !server_url) {
        throw new Error('No stored credentials found');
    }
    return { email, password, server_url };
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
    try { await keytar.deletePassword(SERVICE, 'email'); } catch (e) { }
    try { await keytar.deletePassword(SERVICE, 'password'); } catch (e) { }
    try { await keytar.deletePassword(SERVICE, 'server_url'); } catch (e) { }
    try { if (fs.existsSync(TOKENS_FILE)) fs.unlinkSync(TOKENS_FILE); } catch (e) { }
}

async function hasCredentials() {
    const email = await keytar.getPassword(SERVICE, 'email');
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
