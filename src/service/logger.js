const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', '..', 'logs');
try { fs.mkdirSync(logDir, { recursive: true }); } catch (e) { }
const logFile = path.join(logDir, 'agent.log');

function timestamp() { return new Date().toISOString(); }

function write(level, msg) {
    const line = `[${timestamp()}] [${level}] ${msg}\n`;
    try { fs.appendFileSync(logFile, line); } catch (e) { /* ignore */ }
    // Also print to console
    if (level === 'ERROR') console.error(line.trim());
    else if (level === 'WARN') console.warn(line.trim());
    else console.log(line.trim());
}

module.exports = {
    info: (m) => write('INFO', m),
    debug: (m) => write('DEBUG', m),
    warn: (m) => write('WARN', m),
    error: (m) => write('ERROR', m),
};
