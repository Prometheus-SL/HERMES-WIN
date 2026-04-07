const io = require('socket.io-client');
let logger = null;
try { logger = require('./logger'); } catch (e) { logger = null; }

class WSClient {
  constructor(url, asyncGetToken) {
    this.url = url;
    this.asyncGetToken = asyncGetToken;
    this.socket = null;
    this.backoff = { min: 1000, max: 30000 };
  }

  _logInfo(...args) { if (logger) logger.info(args.join(' ')); else console.log(...args); }
  _logWarn(...args) { if (logger) logger.warn(args.join(' ')); else console.warn(...args); }
  _logError(...args) { if (logger) logger.error(args.join(' ')); else console.error(...args); }

  async connect() {
    const token = this.asyncGetToken ? await this.asyncGetToken() : null;
    this._logInfo('WSClient connecting to', this.url, 'with tokenPresent=' + !!token);

    this.socket = io(this.url, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: this.backoff.max,
    });

    this.socket.on('connect', () => {
      this._logInfo('WS connected to', this.url);
      // Emit identify if token present
      if (token) {
        try { this.socket.emit('identify', { token }); } catch (e) { }
      }
    });

    this.socket.on('disconnect', (reason) => {
      this._logInfo('WS disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      // engine.io may wrap errors; attempt to inspect
      let msg = (err && (err.message || err)) || String(err);
      this._logWarn('WS connect error:', msg);
      // If the error appears to be a 404 from polling transport, suggest verifying WS URL
      try {
        if (err && err.response && err.response.status === 404) {
          this._logWarn('Server returned 404 when attempting socket.io handshake. Verify that the websocket endpoint is correct and that the server exposes socket.io at the given URL. Consider setting WEBSOCKET_URL to the socket server.');
        }
      } catch (e) { }
    });

    return this.socket;
  }

  async reconnectWithNewToken() {
    const token = this.asyncGetToken ? await this.asyncGetToken() : null;
    if (!this.socket) return this.connect();
    try {
      // Update auth and reconnect
      this.socket.io.opts.auth = { token };
      this.socket.connect();
      if (token) this.socket.emit('identify', { token });
    } catch (e) {
      this._logWarn('Reconnect with new token failed:', (e && (e.message || e)) || String(e));
    }
  }

  emit(event, payload) {
    this.socket?.emit(event, payload);
  }

  on(event, cb) {
    this.socket?.on(event, cb);
  }
}

module.exports = WSClient;
