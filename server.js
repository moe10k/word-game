// Required modules import
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');

// Express and HTTP server initialization
const app = express();
const server = http.createServer(app);
const io = socketIo(server);  // Socket.IO with the HTTP server
const path = require('path');

// Serve static files from 'public' directory
app.use(express.static('public'));

/*
app.get('/winner', (req, res) => {
    res.sendFile(path.join(__dirname, 'path/to/your/winner.html')); // Make sure to provide the correct path
});
*/

// Game state variables
let currentLetters = generateRandomLetters();
let scores = {};     // Player scores
let userMap = {};    // Maps socket IDs to user info
let lives = {};      // Player lives
let totalPlayers = 0;
let readyPlayers = 0;
let currentPlayerTurn = null;
let gameInProgress = false;


// New socket connection handler
io.on('connection', (socket) => {
    // Player connection logic
    console.log(`New player connected: ${socket.id}`);
    totalPlayers++;
    //updateReadinessStatus();


    // Username setting event
    socket.on('setUsername', setUsernameHandler(socket));

    // Guess submission event
    socket.on('guess', guessHandler(socket));

    // Player ready status event
    socket.on('playerReady', playerReadyHandler(socket));

    // Player not ready event
    socket.on('playerNotReady', playerNotReadyHandler(socket));

    // Player disconnection event
    socket.on('disconnect', playerDisconnectHandler(socket));

    // Typing event
    socket.on('typing', typingHandler(socket));

    // Readiness status update function
    /*
    function updateReadinessStatus() {
        io.emit('readinessUpdate', { totalPlayers, readyPlayers });
    }
    */
    socket.on('resetGameRequest', () => {
        resetGameState();
        io.emit('gameReset'); // Notify all clients to reset their UI
    });

    socket.on('clearTyping', () => {
        socket.broadcast.emit('typingCleared'); // Notify all other clients to clear player typingstatus
    });
});

// Start the server on port 3000
const PORT = 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

//io.emit('turnUpdate', currentPlayerTurn);


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
        gameInProgress = true; // Correctly set the global variable
        console.log(`Game has Started...`);
        currentLetters = generateRandomLetters();
        io.emit('gameUpdate', {
            letters: currentLetters,
            scores: scores,
            lives: lives, // Include lives in the initial update
            gameStarted: true
        });

        // Randomly selects the first player for whose turn it is
        const playerIds = Object.keys(userMap);
        currentPlayerTurn = playerIds[Math.floor(Math.random() * playerIds.length)];

        emitCurrentTurn();

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








function setUsernameHandler(socket) {
    return function(username) {
        if (gameInProgress) {
            socket.emit('gameInProgress');
            return;
        }
        if (!username || typeof username !== 'string' || username.length < 3 || username.length > 20) {
            socket.emit('usernameError', 'Invalid username. Must be 3-20 characters long.');
            return;
        }
        if (Object.values(userMap).some(user => user.name === username)) {
            socket.emit('usernameError', 'Username already taken');
            return;
        }
        socket.username = username;
        lives[username] = 3;
        userMap[socket.id] = { name: username, ready: false };
        updatePlayerStatus();
        console.log(`Username set for ${socket.id}: ${username}`);
    };
}

function guessHandler(socket) {
    return async function(word) {
        if (gameInProgress && socket.id !== currentPlayerTurn) {
            socket.emit('actionBlocked', 'Wait for your turn.');
            return;
        }
        if (lives[socket.username] <= 0) { // Check if the player has zero or fewer lives
            console.log(`${socket.username} has no more lives. Guess ignored.`);
            return;
        }


        if (!word || typeof word !== 'string' || word.length < 1) {
            socket.emit('invalidWord', 'Invalid guess.');
            return;
        }
        if (socket.username) {
            const isValidWord = await checkWordValidity(word);
            if (isValidWord && isValidGuess(word, currentLetters)) {
                scores[socket.username] = (scores[socket.username] || 0) + 1;
                currentLetters = generateRandomLetters();
            } else {
                socket.emit('invalidWord', 'The word is not valid');
                lives[socket.username] = (lives[socket.username] || 0) - 1;
                if (lives[socket.username] <= 0) {
                    socket.emit('gameOver');
                    console.log(`${socket.username} has 0 lives`);
                    checkForLastPlayerStanding();
                }
            }
            if (scores[socket.username] >= 3) {
                io.emit('gameWin', socket.username);
                console.log(`${socket.username} Won!`);
            }
            updateAllPlayers();
        }
        nextPlayerTurn();
    };
}

function playerReadyHandler(socket) {
    return function() {
        if (gameInProgress) {
            socket.emit('actionBlocked', 'Game in progress. Wait for the next round.');
            return;
        }
        console.log(`${socket.username} is Ready!`);
        readyPlayers++;
        //updateReadinessStatus();
        if (userMap[socket.id]) {
            userMap[socket.id].ready = true;
            scores[socket.username] = scores[socket.username] || 0; // Initialize score if not set
            updatePlayerStatus();
            checkAllPlayersReady();
        }
}}

function playerNotReadyHandler(socket) {
    return function() {
        readyPlayers--;
        //updateReadinessStatus();
}}

function playerDisconnectHandler(socket) {
    return function() {
        console.log(`Player disconnected: ${socket.username}`);
        totalPlayers--;
        if (socket.isReady) {
            readyPlayers--;
        }
        //updateReadinessStatus();
        if (socket.username) {
            delete scores[socket.username];
            delete userMap[socket.id];
            updateAllPlayers();
            updatePlayerStatus();
        }
}}

function typingHandler(socket) {
    // Broadcast the typing event to all other clients
    return function({ username, text }) {
        socket.broadcast.emit('playerTyping', { username, text });
}}


function resetGameState() {
    gameInProgress = false;
    scores = {}; // Reset scores
    userMap = {}; // Reset user map
    lives = {}; // Reset lives
    totalPlayers = 0;
    readyPlayers = 0;
    // ... any other necessary resets ...
    io.emit('gameReset');

    console.log('Game state has been reset'); // Optional logging
}


function nextPlayerTurn() {
    const playerIds = Object.keys(userMap);
    let currentIndex = playerIds.indexOf(currentPlayerTurn);
    
    // Loop to find the next player with lives remaining
    let attempts = 0; // To prevent an infinite loop in case all players are out
    do {
        currentIndex = (currentIndex + 1) % playerIds.length;
        currentPlayerTurn = playerIds[currentIndex];
        attempts++;
    } while (lives[userMap[currentPlayerTurn].name] <= 0 && attempts < playerIds.length);

    // Check if all players are out of lives
    if (attempts >= playerIds.length) {
        console.log("All players are out of lives. Game Over or Reset required.");
        // Here you can implement additional logic to handle this scenario,
        // such as automatically resetting the game or declaring a winner.
    } else {
        emitCurrentTurn(); // Notify clients of the current player's turn
    }
}

function emitCurrentTurn() {
    const currentUsername = userMap[currentPlayerTurn]?.name || 'Unknown';
    io.emit('turnUpdate', currentUsername);
}


function checkForLastPlayerStanding() {
    const playersWithLives = Object.keys(userMap).filter(socketId => lives[userMap[socketId].name] > 0);

    if (playersWithLives.length === 1) {
        // Last player standing
        const winningPlayerName = userMap[playersWithLives[0]].name;
        console.log(`${winningPlayerName} is the last player standing and wins the game!`);
        io.emit('gameWin', winningPlayerName); // Notify all clients that this player has won
        // Optionally, you can also reset the game state here or implement other end-game logic
    }
}

