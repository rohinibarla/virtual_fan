const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files
app.use(express.static('public'));

// Store active rooms
const rooms = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Create a new room
    socket.on('createRoom', () => {
        const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
        rooms.set(roomId, {
            host: socket.id,
            controller: null
        });
        socket.join(roomId);
        socket.emit('roomCreated', { roomId });
        console.log('Room created:', roomId);
    });
    
    // Join existing room as controller
    socket.on('joinRoom', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }
        
        if (room.controller && room.controller !== socket.id) {
            socket.emit('error', { message: 'Room already has a controller' });
            return;
        }
        
        room.controller = socket.id;
        socket.join(roomId);
        socket.emit('joinedAsController', { roomId });
        
        // Notify host
        io.to(room.host).emit('controllerJoined');
        console.log('Controller joined room:', roomId);
    });
    
    // Handle fan control
    socket.on('controlFan', ({ roomId, speed }) => {
        const room = rooms.get(roomId);
        if (!room || room.controller !== socket.id) return;
        
        // Send speed to host
        io.to(room.host).emit('fanSpeed', { speed });
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Check if user was host or controller
        for (const [roomId, room] of rooms.entries()) {
            if (room.host === socket.id) {
                // Host left, notify controller and delete room
                if (room.controller) {
                    io.to(room.controller).emit('error', { message: 'Host disconnected' });
                }
                rooms.delete(roomId);
                console.log('Room deleted:', roomId);
            } else if (room.controller === socket.id) {
                // Controller left, notify host
                room.controller = null;
                io.to(room.host).emit('controllerLeft');
                console.log('Controller left room:', roomId);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});