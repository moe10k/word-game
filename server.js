const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
app.use(express.static('public'));

let currentLetters = generateRandomLetters();
let scores = {};
let userMap = {};
let lives = {};
let totalPlayers = 0;
let readyPlayers = 0;
let currentPlayerTurn = null;
let gameInProgress = false;

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

function setUsernameHandler(socket) {
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
            if (gameInProgress) {
                socket.emit('gameInProgress', 'Cannot join a game in progress. Please wait for the next game.');
                return;
            }
            socket.username = username;
            lives[username] = 3;
            userMap[socket.id] = { name: username, ready: false };
            updatePlayerStatus();
            console.log(`Username set for ${socket.id}: ${username}`);
            logAllPlayers();
        } catch (error) {
            console.error('Error in setUsernameHandler:', error);
            socket.emit('error', 'An error occurred setting the username.');
        }
    };
}

function playerReadyHandler(socket) {
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
            console.error('Error in playerReadyHandler:', error);
            socket.emit('error', 'An error occurred while marking player as ready.');
        }
    };
}

function checkAllPlayersReady() {
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
    }
}

function generateRandomLetters() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randomIndex1 = Math.floor(Math.random() * alphabet.length);
    let randomIndex2;
    do {
        randomIndex2 = Math.floor(Math.random() * alphabet.length);
    } while (randomIndex1 === randomIndex2);
    return alphabet[randomIndex1] + alphabet[randomIndex2];
}

function updateAllPlayers() {
    io.emit('gameUpdate', {
        letters: currentLetters,
        scores: scores,
        lives: lives
    });
}

function updatePlayerStatus() {
    const playerStatus = Object.values(userMap).map(({ name, ready }) => ({
        name,
        ready
    }));
    io.emit('playerStatusUpdate', playerStatus);
}

function guessHandler(socket) {
    return async function(word) {
        try {
            if (!isPlayersTurn(socket) || !hasPlayerLives(socket) || !isValidGuessInput(word)) {
                return;
            }
            const isValidWord = await checkWordValidity(word);
            if (isValidWord && isValidGuess(word, currentLetters)) {
                processValidGuess(socket, word);
            } else {
                handleInvalidGuess(socket);
            }
            checkForGameWin(socket);
            nextPlayerTurn();
        } catch (error) {
            handleError(socket, error);
        }
    };
}

function isPlayersTurn(socket) {
    if (gameInProgress && socket.id !== currentPlayerTurn) {
        socket.emit('actionBlocked', 'Wait for your turn.');
        return false;
    }
    return true;
}

function hasPlayerLives(socket) {
    if (lives[socket.username] <= 0) {
        console.log(`${socket.username} has no more lives. Guess ignored.`);
        return false;
    }
    return true;
}

function isValidGuessInput(word) {
    if (!word || typeof word !== 'string' || word.length < 1) {
        socket.emit('invalidWord', 'Invalid guess.');
        return false;
    }
    return true;
}

function processValidGuess(socket, word) {
    scores[socket.username] = (scores[socket.username] || 0) + 1;
    currentLetters = generateRandomLetters();
    updateAllPlayers();
}

function handleInvalidGuess(socket) {
    socket.emit('invalidWord', 'The word is not valid');
    lives[socket.username] = (lives[socket.username] || 0) - 1;
    updateAllPlayers();
    if (lives[socket.username] <= 0) {
        socket.emit('gameOver');
        console.log(`${socket.username} has 0 lives`);
        checkForLastPlayerStanding();
    }
}

function checkForGameWin(socket) {
    if (scores[socket.username] >= 3) {
        io.emit('gameWin', socket.username);
        console.log(`${socket.username} Won!`);
    }
}

function handleError(socket, error) {
    console.error('Error in guessHandler:', error);
    socket.emit('error', 'An error occurred processing your guess.');
}

async function checkWordValidity(word) {
    try {
        const response = await axios.get(`https://api.datamuse.com/words?sp=${word}&md=d`);
        return response.data.length > 0 && response.data[0].word === word;
    } catch (error) {
        console.error('Error validating word:', error);
        return false;
    }
}

function isValidGuess(word, letters) {
    return word.toUpperCase().includes(letters[0]) && word.toUpperCase().includes(letters[1]);
}

function nextPlayerTurn() {
    try {
        const playerIds = Object.keys(userMap);
        if (playerIds.length === 0) {
            console.log("No players connected. Waiting for players.");
            currentPlayerTurn = null;
            return;
        }

        let currentIndex = playerIds.indexOf(currentPlayerTurn);
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
        } else {
            emitCurrentTurn();
        }
    } catch (error) {
        console.error('Error in nextPlayerTurn:', error);
    }
}

function emitCurrentTurn() {
    try {
        const currentUsername = userMap[currentPlayerTurn]?.name || 'Unknown';
        io.emit('turnUpdate', currentUsername);
    } catch (error) {
        console.error('Error in emitCurrentTurn:', error);
    }
}

function checkForLastPlayerStanding() {
    try {
    const playersWithLives = Object.keys(userMap).filter(socketId => lives[userMap[socketId].name] > 0);

        if (playersWithLives.length === 1) {
            const winningPlayerName = userMap[playersWithLives[0]].name;
            console.log(`${winningPlayerName} is the last player standing and wins the game!`);
            io.emit('gameWin', winningPlayerName);
        }
    } catch (error) {
        console.error('Error in checkForLastPlayerStanding:', error);
    }
}

function typingHandler(socket) {
    return function({ username, text }) {
        try {
            socket.broadcast.emit('playerTyping', { username, text });
        } catch (error) {
            console.error('Error in typingHandler:', error);
        }
    };
}

function handlePlayerDisconnect(socket) {
    if (socket.username) {
        console.log(`Player disconnected: ${socket.username}`);
        console.log(`Total connected sockets: ${io.engine.clientsCount}`);

        // Remove player's data
        delete scores[socket.username];
        delete lives[socket.username];
        delete userMap[socket.id];

        // Update total players count
        totalPlayers--;

        // Emit updated game state to all players
        updateAllPlayers();
        updatePlayerStatus();
        logAllPlayers();

        // Additional game logic to handle disconnect during game
        if (gameInProgress) {
            checkForLastPlayerStanding();
            nextPlayerTurn();
            logAllPlayers();
        }

        // Reset game state if all players have disconnected
        if (io.engine.clientsCount === 0) {
            resetPlayerState();
            console.log(`All players have been disconnected`);
        } else {
            updateAllPlayers();
            updatePlayerStatus();
        }
    }
}

function logAllPlayers() {
    console.log('Current Players:');
    Object.keys(userMap).forEach(socketId => {
        const username = userMap[socketId].name || 'not set';
        console.log(`${socketId}: ${username}`);
    });
}

function resetPlayerState(playerId) {
    if (userMap[playerId]) {
        const username = userMap[playerId].name;
        console.log(`Resetting game state for player: ${username}`);
        currentLetters = generateRandomLetters();
        scores = {}; 
        lives = {};
        delete scores[username];
        delete lives[username];
        delete userMap[playerId];
        totalPlayers = 0;
        readyPlayers = 0;
        gameInProgress = false;
        currentPlayerTurn = null;
        totalPlayers--;
        updateAllPlayers();
        updatePlayerStatus();
        logAllPlayers();
    } else {
        console.log(`Player ID ${playerId} not found.`);
    }
}