// Minimal Node agent skeleton to replace Rust agent core gradually
// - connects to Socket.IO server
// - executes incoming commands by delegating to platform implementations (PowerShell on Windows)

const io = require('socket.io-client');
const AuthManager = require('./auth');
const credentials = require('./credentials');
const CommandExecutor = require('./commandExecutor');

const SERVER_URL = process.env.HERMES_SERVER || 'http://localhost:3000';

async function main() {
  console.log('Starting Node agent (iterative migration)...');

  // Agent ID placeholder (could be derived from machine info)
  const agentId = `node-agent-${Math.random().toString(36).slice(2, 9)}`;

  const auth = new AuthManager(SERVER_URL, agentId);
  const cmdExec = new CommandExecutor();
  const WSClient = require('./wsClient');

  // Ensure we have a valid token before connecting
  try {
    await auth.ensureValidToken();
    console.log('Auth tokens ready');
  } catch (e) {
    console.warn('Auth not available at startup:', e.message);
  }

  const ws = new WSClient(SERVER_URL, async () => {
    try {
      return await auth.ensureValidToken();
    } catch (e) {
      return null;
    }
  });

  const socket = await ws.connect();

  socket.on('connect', () => {
    console.log('Connected to server:', SERVER_URL);
    socket.emit('register', { agentId });
  });

  socket.on('command', async (cmd) => {
    console.log('Received command:', cmd);
    const response = await cmdExec.execute(cmd);
    socket.emit('command_response', { request_id: cmd.request_id, ...response });
  });

  socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
  });

  // When tokens may refresh in background, ensure WS is updated
  // Hook into auth.ensureValidToken flow by wrapping it
  const originalEnsure = auth.ensureValidToken.bind(auth);
  auth.ensureValidToken = async function() {
    const token = await originalEnsure();
    // token may be new; tell WS to reconnect with new token
    try { await ws.reconnectWithNewToken(); } catch (e) { console.warn('WS reconnect after token refresh failed', e.message); }
    return token;
  };
}

main().catch(err => {
  console.error('Agent failed:', err);
  process.exit(1);
});
