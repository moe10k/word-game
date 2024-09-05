// server.js

// Imports and Initial Setup
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
app.use(express.static('public'));

// Global Variables
let currentLetters = generateRandomLetters();
let scores = {};
let userMap = {};
let lives = {};
let totalPlayers = 0;
let readyPlayers = 0;
let currentPlayerTurn = null;
let gameInProgress = false;
let playerTimer = {};



// Helper Functions
function generateRandomLetters() { // Generates two random letters for the current round of the game
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randomIndex1 = Math.floor(Math.random() * alphabet.length);
    let randomIndex2;
    do {
        randomIndex2 = Math.floor(Math.random() * alphabet.length);
    } while (randomIndex1 === randomIndex2);
    return alphabet[randomIndex1] + alphabet[randomIndex2];
}

function logAllPlayers() { // Logs all connected players to the console
    console.log('Current Players:');
    Object.keys(userMap).forEach(socketId => {
        const username = userMap[socketId].name || 'not set';
        console.log(`${socketId}: ${username}`);
    });
}

function updateAllPlayers() { // Updates all connected players with the current game state (leteers, scores, lives)
    io.emit('gameUpdate', {
        letters: currentLetters,
        scores: scores,
        lives: lives
    });
}

function handleError(socket, error) { // Handles errors by logging them to the console and emitting an error message to the client
    console.error('Error:', error);
    socket.emit('error', 'An error occurred processing your request.');
}



// Socket Event Handlers
function setUsernameHandler(socket) { // Handles setting the username for a new player
    return function(username) {
        try {
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
            logAllPlayers();
        } catch (error) {
            handleError(socket, error);
        }
    };
}

function guessHandler(socket) { // Handles a player's guess, validating it, and updating the game state
    return async function (word) {
        try {
            if (!isPlayersTurn(socket) || !hasPlayerLives(socket)) {
                return;
            }

            if (!isValidGuessInput(socket, word)) {
                handleInvalidGuess(socket);
                nextPlayerTurn();
                clearPlayerTimer(socket.id);
                return;
            }

            const isValidWord = await checkWordValidity(word);
            if (isValidWord && isValidGuess(word, currentLetters)) {
                processValidGuess(socket, word);
                clearPlayerTimer(socket.id);
            } else {
                handleInvalidGuess(socket);
                clearPlayerTimer(socket.id);
            }

            nextPlayerTurn();
            clearPlayerTimer(socket.id);
        } catch (error) {
            handleError(socket, error);
        }
    };
}

function updatePlayerStatus() { // Updates all connected players with the current player status (ready or not)
    const playerStatus = Object.values(userMap).map(({ name, ready }) => ({
        name,
        ready
    }));
    io.emit('playerStatusUpdate', playerStatus);
}

function playerReadyHandler(socket) { // Handles a player's ready status and starts the game if all players are ready
    return function() {
        try {
            if (gameInProgress) {
                socket.emit('actionBlocked', 'Game in progress. Wait for the next round.');
                return;
            }
            console.log(`${socket.username} is Ready!`);
            readyPlayers++;
            if (userMap[socket.id]) {
                userMap[socket.id].ready = true;
                scores[socket.username] = scores[socket.username] || 0;
                updatePlayerStatus();
                checkAllPlayersReady();
            }
        } catch (error) {
            handleError(socket, error);
        }
    };
}

function checkAllPlayersReady() { // Checks if all players are ready and starts the game if they are
    const allReady = Object.values(userMap).every(user => user.ready);
    if (allReady && Object.keys(userMap).length > 1) {
        gameInProgress = true;
        console.log(`Game has Started...`);
        currentLetters = generateRandomLetters();
        io.emit('gameUpdate', {
            letters: currentLetters,
            scores: scores,
            lives: lives,
            gameStarted: true
        });
        const playerIds = Object.keys(userMap);
        currentPlayerTurn = playerIds[Math.floor(Math.random() * playerIds.length)];
        emitCurrentTurn();
        Object.values(userMap).forEach(user => user.ready = false);
        updatePlayerStatus();
        startPlayerTimer(currentPlayerTurn);
    }
}

function emitCurrentTurn() { // Emits the current player's turn to all connected players
    try {
        const currentUsername = userMap[currentPlayerTurn]?.name || 'Unknown';
        io.emit('turnUpdate', currentUsername);
    } catch (error) {
        console.error('Error in emitCurrentTurn:', error);
    }
}

function processValidGuess(socket, word) { // Processes a valid guess by updating the game state and notifying all players
    scores[socket.username] = (scores[socket.username] || 0) + 1;
    currentLetters = generateRandomLetters();
    updateAllPlayers();
}

function resetPlayerState() { // Resets the game state for all players
    try {
        console.log(`Resetting game state for all players.`);
        scores = {}; // Reset scores
        lives = {}; // Reset lives
        userMap = {}; // Reset user map
        totalPlayers = 0; // Reset player count
        readyPlayers = 0; // Reset ready player count
        gameInProgress = false; // Set game status to not in progress
        currentPlayerTurn = null; // Clear current player turn
        currentLetters = generateRandomLetters(); // Reset letters for a new game

        // Clear all player timers
        Object.keys(playerTimer).forEach(timerId => {
            clearInterval(playerTimer[timerId]);
        });
        playerTimer = {}; // Reset the timer object

        updateAllPlayers();
        updatePlayerStatus();
        io.emit('gameReset'); // Notify all clients to reset their UI
        logAllPlayers();
    } catch (error) {
        console.error('Error resetting player state:', error);
    }
}

function checkForLastPlayerStanding() { // Checks if there is only one player remaining with lives and declares them the winner
    try {
        const playersWithLives = Object.keys(userMap).filter(socketId => lives[userMap[socketId].name] > 0);

        if (playersWithLives.length === 1) {
            const winningPlayerName = userMap[playersWithLives[0]].name;
            console.log(`${winningPlayerName} is the last player standing and wins the game!`);
            io.emit('gameWin', winningPlayerName);
            resetPlayerState();
        } else if (playersWithLives.length === 0) {
            console.log("No players with lives left. Game over.");
            io.emit('gameOver', 'No players have lives remaining. The game is over!');
            resetPlayerState();
        }
    } catch (error) {
        console.error('Error in checkForLastPlayerStanding:', error);
    }
}

function isPlayersTurn(socket) { // Checks if it is the player's turn to guess
    if (!gameInProgress) {
        socket.emit('actionBlocked', 'The game is not in progress.');
        return false;
    }
    if (socket.id !== currentPlayerTurn) {
        socket.emit('actionBlocked', 'Wait for your turn.');
        return false;
    }
    return true;
}

function hasPlayerLives(socket) { // Checks if the player has any lives remaining
    if (lives[socket.username] <= 0) {
        console.log(`${socket.username} has no more lives. Guess ignored.`);
        return false;
    }
    return true;
}

function isValidGuessInput(socket, word) { // Validates the player's guess input
    if (!word || typeof word !== 'string' || word.trim().length === 0) {
        socket.emit('invalidWord', 'Invalid guess.');
        return false;
    }
    return true;
}

function handleInvalidGuess(socket) { // Handles an invalid guess by decrementing the player's lives and updating the game state
    socket.emit('invalidWord', 'The word is not valid');
    lives[socket.username] = (lives[socket.username] || 0) - 1;
    updateAllPlayers();
    if (lives[socket.username] <= 0) {
        socket.emit('gameOver');
        console.log(`${socket.username} has 0 lives`);
        checkForLastPlayerStanding();
    }
}

async function checkWordValidity(word) { // Checks if the guessed word is a valid English word using the Datamuse API
    try {
        const response = await axios.get(`https://api.datamuse.com/words?sp=${word}&md=d`);
        return response.data.length > 0 && response.data[0].word === word;
    } catch (error) {
        console.error('Error validating word:', error);
        return false;
    }
}

function isValidGuess(word, letters) { // Checks if the guessed word contains the required letters
    const [letter1, letter2] = letters.split('');
    const upperWord = word.toUpperCase();
    return upperWord.includes(letter1) && upperWord.includes(letter2);
}

function nextPlayerTurn() { // Moves the game to the next player's turn
    try {
        const playerIds = Object.keys(userMap).filter(id => lives[userMap[id].name] > 0); 
        if (playerIds.length === 0) {
            console.log("All players are out of lives. Game Over or Reset required.");
            currentPlayerTurn = null;
            gameInProgress = false;
            io.emit('gameOver', 'All players are out of lives. Game Over!');
            return;
        }

        let currentIndex = playerIds.indexOf(currentPlayerTurn)
        clearPlayerTimer(currentPlayerTurn); 

        let attempts = 0;
        do {
            currentIndex = (currentIndex + 1) % playerIds.length;
            currentPlayerTurn = playerIds[currentIndex];
            attempts++;
        } while (attempts < playerIds.length && (!userMap[currentPlayerTurn] || lives[userMap[currentPlayerTurn].name] <= 0));

        
        if (attempts >= playerIds.length) {
            console.log("All players are out of lives. Game Over or Reset required.");
            currentPlayerTurn = null;
            gameInProgress = false;
            io.emit('gameOver', 'All players are out of lives. Game Over!');
        } else {
            io.emit('turnEnded', { playerId: currentPlayerTurn }); 
            emitCurrentTurn();
            startPlayerTimer(currentPlayerTurn); 
        }
    } catch (error) {
        console.error('Error in nextPlayerTurn:', error);
    }
}

function typingHandler(socket) { // Handles a player typing a message and broadcasts it to all other players
    return function({ username, text }) {
        try {
            socket.broadcast.emit('playerTyping', { username, text });
        } catch (error) {
            console.error('Error in typingHandler:', error);
        }
    };
}

function handlePlayerDisconnect(socket) { // Handles a player disconnecting from the game
    try {
        if (socket.username) {
            console.log(`Player disconnected: ${socket.username}`);
            console.log(`Total connected sockets: ${io.engine.clientsCount}`);

            const wasCurrentPlayerTurn = socket.id === currentPlayerTurn;
            delete scores[socket.username];
            delete lives[socket.username];
            delete userMap[socket.id];

            totalPlayers--;

            clearPlayerTimer(socket.id);

            updateAllPlayers();
            updatePlayerStatus();
            logAllPlayers();

            if (wasCurrentPlayerTurn && gameInProgress) {
                nextPlayerTurn();
            }

            if (io.engine.clientsCount === 0) {
                resetPlayerState();
                console.log(`All players have been disconnected`);
            }
        }
    } catch (error) {
        handleError(socket, error);
    }
}

function startPlayerTimer(socketId) { // Starts the timer for a player's turn
    clearTimeout(playerTimer[socketId]);
    let remainingTime = 10;

    playerTimer[socketId] = setInterval(() => {
        if (remainingTime > 0) {
            remainingTime--;
            io.emit('timerUpdate', remainingTime);
        } else {
            clearInterval(playerTimer[socketId]);
            const username = userMap[socketId]?.name;
            if (username) {
                lives[username] = (lives[username] || 1) - 1;
                updateAllPlayers();

                if (lives[username] <= 0) {
                    io.to(socketId).emit('gameOver');
                    checkForLastPlayerStanding();
                } else {
                    nextPlayerTurn();
                }
            }
            io.emit('timerUpdate', null);
        }
    }, 1000);
}

function clearPlayerTimer(socketId) { // Clears the timer for a player's turn
    clearInterval(playerTimer[socketId]);
    io.emit('timerUpdate', null);
    io.emit('typingCleared');
}



// Socket Connection Handling
io.on('connection', socket => {
    try {
        console.log(`New player connected: ${socket.id}`);
        console.log(`Total connected sockets: ${io.engine.clientsCount}`);
        logAllPlayers();
        totalPlayers++;
        socket.on('setUsername', setUsernameHandler(socket));
        socket.on('guess', guessHandler(socket));
        socket.on('playerReady', playerReadyHandler(socket));
        socket.on('typing', typingHandler(socket));
        socket.on('resetGameRequest', () => {
            resetPlayerState(socket.id);
        });
        socket.on('clearTyping', () => socket.broadcast.emit('typingCleared'));
        socket.on('disconnect', () => handlePlayerDisconnect(socket));
    } catch (error) {
        console.error('Error during socket connection:', error);
    }
});

// Server Initialization
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});