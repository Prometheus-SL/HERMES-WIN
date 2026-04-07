const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const entry = path.join(__dirname, '..', 'src', 'renderer', 'index.tsx');
const out = path.join(__dirname, '..', 'dist', 'renderer', 'index.js');

// Try to load .env from project root to get default URLs if present
function loadDotEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    const result = {};
    try {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eq = trimmed.indexOf('=');
            if (eq === -1) continue;
            const key = trimmed.slice(0, eq).trim();
            let val = trimmed.slice(eq + 1).trim();
            // remove surrounding quotes
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            result[key] = val;
        }
    } catch (e) {
        // ignore if no .env
    }
    return result;
}

const dotEnv = loadDotEnv();

const define = {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    'process.env.WEBSOCKET_URL': JSON.stringify(process.env.WEBSOCKET_URL || dotEnv.WEBSOCKET_URL || ''),
    'process.env.AUTH_SERVER_URL': JSON.stringify(process.env.AUTH_SERVER_URL || dotEnv.AUTH_SERVER_URL || ''),
};

esbuild.build({
    entryPoints: [entry],
    bundle: true,
    minify: false,
    sourcemap: true,
    outfile: out,
    platform: 'browser',
    target: ['chrome100', 'firefox100', 'safari13'],
    define,
    loader: { '.png': 'file', '.svg': 'file' },
}).catch((e) => { console.error(e); process.exit(1); });
