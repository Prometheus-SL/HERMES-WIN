const fs = require('fs');
const { getLogFilePath, getLogsDirectory } = require('./platform/paths');

const logDir = getLogsDirectory();
try { fs.mkdirSync(logDir, { recursive: true }); } catch (e) { }
const logFile = getLogFilePath();

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
    logFile,
    info: (m) => write('INFO', m),
    debug: (m) => write('DEBUG', m),
    warn: (m) => write('WARN', m),
    error: (m) => write('ERROR', m),
};
