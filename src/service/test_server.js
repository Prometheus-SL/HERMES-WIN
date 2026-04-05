// Simple Socket.IO server for local testing of agent
const http = require('http');
const { Server } = require('socket.io');

function start(port = 3000) {
    const server = http.createServer();
    const io = new Server(server, { cors: { origin: '*' } });

    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);

        socket.on('register', (payload) => {
            console.log('Register received:', payload);
            socket.emit('welcome', { msg: 'welcome' });
        });

        socket.on('identify', (payload) => {
            console.log('Identify received:', payload);
        });

        socket.on('command_response', (resp) => {
            console.log('Command response:', resp);
        });

        // Send a test command after 2s
        setTimeout(() => {
            socket.emit('command', { command_type: 'volume', request_id: 'test-1', parameters: { action: 'mute' } });
        }, 2000);
    });

    server.listen(port, () => console.log('Test server listening on', port));
    return { server, io };
}

if (require.main === module) start(3000);

module.exports = { start };
