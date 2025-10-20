const io = require('socket.io-client');

class WSClient {
  constructor(url, asyncGetToken) {
    this.url = url;
    this.asyncGetToken = asyncGetToken;
    this.socket = null;
    this.backoff = { min: 1000, max: 30000 };
  }

  async connect() {
    const token = this.asyncGetToken ? await this.asyncGetToken() : null;
    this.socket = require('socket.io-client')(this.url, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: this.backoff.max,
    });

    this.socket.on('connect', () => {
      console.log('WS connected to', this.url);
      // Emit identify if token present
      if (token) {
        try { this.socket.emit('identify', { token }); } catch (e) { }
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WS disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('WS connect error:', err && (err.message || err));
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
      console.warn('Reconnect with new token failed:', e.message || e);
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
