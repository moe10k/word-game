//server.js
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
let playerTimer = {};

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
        startPlayerTimer(currentPlayerTurn);
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
    return async function (word) {
        try {
            if (!isPlayersTurn(socket) || !hasPlayerLives(socket)) {
                return;
            }

            // Check if the input is valid (not empty or null)
            if (!isValidGuessInput(socket, word)) {
                handleInvalidGuess(socket);
                nextPlayerTurn();
                clearPlayerTimer(socket.id);
                return; // Return early since it's already handled
            }

            // Check if the word is valid
            const isValidWord = await checkWordValidity(word);
            if (isValidWord && isValidGuess(word, currentLetters)) {
                processValidGuess(socket, word);
                clearPlayerTimer(socket.id);
            } else {
                handleInvalidGuess(socket);
                clearPlayerTimer(socket.id);
            }

            // Proceed to the next player's turn
            nextPlayerTurn();
            clearPlayerTimer(socket.id);
        } catch (error) {
            handleError(socket, error);
        }
    };
}

function isPlayersTurn(socket) {
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

function hasPlayerLives(socket) {
    if (lives[socket.username] <= 0) {
        console.log(`${socket.username} has no more lives. Guess ignored.`);
        return false;
    }
    return true;
}

function isValidGuessInput(socket, word) {
    if (!word || typeof word !== 'string' || word.trim().length === 0) {
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

//going to turn this off for now
/*
function checkForGameWin(socket) {
    if (scores[socket.username] >= 3) {
        io.emit('gameWin', socket.username);
        console.log(`${socket.username} Won!`);

        // Stop the game and reset state
        gameInProgress = false;
        currentPlayerTurn = null;

        // Clear all player timers
        Object.keys(playerTimer).forEach(timerId => {
            clearInterval(playerTimer[timerId]);
        });
        playerTimer = {}; // Reset the timer object

        // Emit reset to all clients
        io.emit('gameReset');
    }
}
*/

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
    const [letter1, letter2] = letters.split('');
    const upperWord = word.toUpperCase();
    return upperWord.includes(letter1) && upperWord.includes(letter2);
}

function nextPlayerTurn() {
    try {
        const playerIds = Object.keys(userMap);
        if (playerIds.length === 0) {
            console.log("No players connected. Waiting for players.");
            currentPlayerTurn = null;
            gameInProgress = false;
            return;
        }

        let currentIndex = playerIds.indexOf(currentPlayerTurn);
        let attempts = 0;
        clearPlayerTimer(currentPlayerTurn); // Clear the timer of the previous player

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
            io.emit('turnEnded', { playerId: currentPlayerTurn }); // Add this line to notify clients
            emitCurrentTurn();
            startPlayerTimer(currentPlayerTurn); // Start timer for the new player's turn
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
            resetPlayerState(); // Resets game state after declaring a winner
        } else if (playersWithLives.length === 0) {
            console.log("No players with lives left. Game over.");
            io.emit('gameOver', 'No players have lives remaining. The game is over!');
            resetPlayerState(); // Ensures the game is reset if no players are left
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
        const wasCurrentPlayerTurn = socket.id === currentPlayerTurn;
        delete scores[socket.username];
        delete lives[socket.username];
        delete userMap[socket.id];

        // Update total players count
        totalPlayers--;

        // Clear player timer
        clearPlayerTimer(socket.id);

        // Update the game state and UI
        updateAllPlayers();
        updatePlayerStatus();
        logAllPlayers();

        // Check if the disconnected player was the current turn player
        if (wasCurrentPlayerTurn && gameInProgress) {
            nextPlayerTurn();
        }

        // Reset game state if all players have disconnected
        if (io.engine.clientsCount === 0) {
            resetPlayerState();
            console.log(`All players have been disconnected`);
        }
    }
}

function startPlayerTimer(socketId) {
    clearTimeout(playerTimer[socketId]); // Clear any existing timer
    let remainingTime = 10; // 10 seconds countdown

    playerTimer[socketId] = setInterval(() => {
        if (remainingTime > 0) {
            remainingTime--;
            io.emit('timerUpdate', remainingTime);
        } else {
            clearInterval(playerTimer[socketId]);
            const username = userMap[socketId]?.name;
            if (username) {
                lives[username] = (lives[username] || 1) - 1;
                updateAllPlayers(); // Update all players with the new state

                if (lives[username] <= 0) {
                    io.to(socketId).emit('gameOver');
                    checkForLastPlayerStanding(); // Ensure check when a player loses a life
                } else {
                    nextPlayerTurn();
                }
            }
            io.emit('timerUpdate', null); // Clear the timer on the client side
        }
    }, 1000); // Emit update every second
}

function clearPlayerTimer(socketId) {
    clearInterval(playerTimer[socketId]);
    io.emit('timerUpdate', null); // Clear the timer on the client side
    io.emit('typingCleared'); // Emit typing cleared to ensure the display is updated
}

function logAllPlayers() {
    console.log('Current Players:');
    Object.keys(userMap).forEach(socketId => {
        const username = userMap[socketId].name || 'not set';
        console.log(`${socketId}: ${username}`);
    });
}

function resetPlayerState() {
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