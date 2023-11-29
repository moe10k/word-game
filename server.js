// Import required modules
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');

// Initialize Express and HTTP server
const app = express();
const server = http.createServer(app);
// Initialize Socket.IO with the HTTP server
const io = socketIo(server);

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Initialize game state variables
let currentLetters = generateRandomLetters();
let scores = {}; // Stores players' scores
let userMap = {}; // Maps socket IDs to user info
let lives = {}; // Stores players' lives
let totalPlayers = 0;
let readyPlayers = 0;

// Handle new socket connections
io.on('connection', (socket) => {
    console.log(`A new player connected: ${socket.id}`);

    totalPlayers++;
    updateReadinessStatus();


    // Handle username setting
    socket.on('setUsername', (username) => {
        // Prevent duplicate usernames
        if (Object.values(userMap).some(user => user.name === username)) {
            socket.emit('usernameError', 'Username already taken');
            return;
        }

        // Update userMap and scores
        socket.username = username;
        lives[username] = 3; // Initialize lives when player joins
        userMap[socket.id] = { name: username, ready: false };
        updatePlayerStatus();
        console.log(`Username set for ${socket.id}: ${username}`);
    });

    // Handle guess submissions
    socket.on('guess', async (word) => {
        if (socket.username) {
            const isValidWord = await checkWordValidity(word);
            if (isValidWord && isValidGuess(word, currentLetters)) {
                scores[socket.username] += 1;
                currentLetters = generateRandomLetters();
            } else {
                socket.emit('invalidWord', 'The word is not valid');
                lives[socket.username] -= 1; // Decrement a life for wrong guess
                if (lives[socket.username] <= 0) {
                    // Handle the situation when player loses all lives
                    // e.g., emit a 'gameOver' event to this player
                    socket.emit('gameOver');
                    console.log(`${socket.username} has 0 lives`);
                }
            }
            if (scores[socket.username] >= 3) {
                io.emit('gameWin', socket.username); // Emit the winner's username
                console.log(`${socket.username} Won!`);
            }
            updateAllPlayers();
        }
    });

    // Handle player ready status
    socket.on('playerReady', () => {
        console.log(`${socket.username} is Ready!`);
        readyPlayers++;
        updateReadinessStatus();
        if (userMap[socket.id]) {
            userMap[socket.id].ready = true;
            scores[socket.username] = scores[socket.username] || 0; // Initialize score if not set
            updatePlayerStatus();
            checkAllPlayersReady();
        }
    });


    socket.on('playerNotReady', () => {
        readyPlayers--;
        updateReadinessStatus();
    });

    // Handle player disconnection
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.username}`);
        totalPlayers--;
        if (socket.isReady) {
            readyPlayers--;
        }
        updateReadinessStatus();
        if (socket.username) {
            delete scores[socket.username];
            delete userMap[socket.id];
            updateAllPlayers();
            updatePlayerStatus();
        }
    });
        socket.on('typing', ({ username, text }) => {
            // Broadcast the typing event to all other clients
            socket.broadcast.emit('playerTyping', { username, text });

    });

    function updateReadinessStatus() {
        io.emit('readinessUpdate', { totalPlayers, readyPlayers });
    }
});

// Start the server on port 3000
const PORT = 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));


async function checkWordValidity(word) {
    try {
        const response = await axios.get(`https://api.datamuse.com/words?sp=${word}&md=d`);
        // If the word exists, the response will not be empty
        return response.data.length > 0 && response.data[0].word === word;
    } catch (error) {
        console.error('Error validating word:', error);
        return false;
    }
}


// Check if all players are ready and start the game
function checkAllPlayersReady() {
    // Check if all connected players are ready
    const allReady = Object.values(userMap).every(user => user.ready);
    if (allReady && Object.keys(userMap).length > 1) { // Ensure there's more than one player
        console.log(`Game has Started...`);
        currentLetters = generateRandomLetters();
        io.emit('gameUpdate', {
            letters: currentLetters,
            scores: scores,
            lives: lives, // Include lives in the initial update
            gameStarted: true
        });

        // Reset ready status after starting the game
        Object.values(userMap).forEach(user => user.ready = false);
        updatePlayerStatus();
    }
}

// Update and emit the player status to all clients
function updatePlayerStatus() {
    const playerStatus = Object.values(userMap).map(({ name, ready }) => ({
        name,
        ready
    }));
    io.emit('playerStatusUpdate', playerStatus);
}

// Generate two random, distinct letters
function generateRandomLetters() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randomIndex1 = Math.floor(Math.random() * alphabet.length);
    let randomIndex2;
    do {
        randomIndex2 = Math.floor(Math.random() * alphabet.length);
    } while (randomIndex1 === randomIndex2);
    return alphabet[randomIndex1] + alphabet[randomIndex2];
}

// Check if a guess is valid based on current letters
function isValidGuess(word, letters) {
    return word.toUpperCase().includes(letters[0]) && word.toUpperCase().includes(letters[1]);
}

// Update and emit the game state to all clients
function updateAllPlayers() {
    io.emit('gameUpdate', {
        letters: currentLetters,
        scores: scores,
        lives: lives // Send updated lives to all clients
    });
}