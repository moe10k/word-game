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

function logAllPlayers() { 
    const playerList = Object.keys(userMap).map(socketId => {
        const username = userMap[socketId].name || 'not set';
        return `${username}`;
    }).join(', ');
    
    log(`Current Players: ${playerList}`, 'logAllPlayers');
}

function updateAllPlayers() { // Updates all connected players with the current game state (leteers, scores, lives)
    io.emit('gameUpdate', {
        letters: currentLetters,
        scores: scores,
        lives: lives
    });
}

function handleError(socket, error, context = '') { // Logs an error to the console and emits an error message to the client
    const errorMessage = context 
        ? `Error in ${context}: ${error.message || error}` 
        : `Error: ${error.message || error}`;
    
    console.error(errorMessage);
    if (socket) {
        socket.emit('error', 'An error occurred. Please try again.');
    }
}

function log(message, context = '') { // Logs a message to the console with a timestamp and optional context
    const timestamp = new Date().toISOString();
    const logMessage = context ? `[${context}] ${message}` : message;
    console.log(`[${timestamp}] ${logMessage}`);
}


// Socket Event Handlers
function setUsernameHandler(socket) { // Handles setting the username for a player and validates the input
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
            log(`Username set and joined for ${socket.id}: ${username}`, 'setUsernameHandler');
            logAllPlayers();
        } catch (error) {
            handleError(socket, error, 'setUsernameHandler');
        }
    };
}

function guessHandler(socket) { // Handles a player's guess and validates the input
    return async function (word) {
        try {
            if (!canPlayerGuess(socket)) return; // New helper function to check if the player can guess

            log(`${socket.username} guessed: ${word}`, 'guessHandler');

            const isValid = await handleGuessValidation(socket, word); // New function to handle guess validation

            clearPlayerTimer(socket.id);
            if (!isValid) { // Handle invalid guesses
                handleInvalidGuess(socket);
            } else { // Process valid guesses
                handleValidGuess(socket, word);
            }

            checkAndProceedToNextTurn(); // Move to the next turn
            updateAllPlayers(); // Update all players with the new game state

        } catch (error) {
            handleError(socket, error, 'guessHandler');
        }
    };
}

function canPlayerGuess(socket) { // Check if the player can guess
    if (!gameInProgress) { // Check if the game is in progress
        socket.emit('actionBlocked', 'The game is not in progress.');
        return false;
    }

    if (!isPlayersTurn(socket) || !hasPlayerLives(socket)) { // Check if it is the player's turn and they have lives
        return false;
    }

    return true;
}

async function handleGuessValidation(socket, word) { // Validate the player's guess
    if (!isValidGuessInput(socket, word)) {
        return false;
    }

    const isValidWord = await checkWordValidity(word);
    if (isValidWord && isValidGuess(word, currentLetters)) {
        log(`${socket.username} guessed correctly`, 'handleGuessValidation');
        return true;
    } else {
        log(`${socket.username} guessed incorrectly`, 'handleGuessValidation');
        return false;
    }
}



function updatePlayerStatus() { // Updates all connected players with the current player status (ready or not)
    const playerStatus = Object.values(userMap).map(({ name, ready }) => ({
        name,
        ready
    }));
    io.emit('playerStatusUpdate', playerStatus);
}

function setPlayerReady(socket, isReady) {
    try {
        if (gameInProgress) {
            socket.emit('actionBlocked', 'Game in progress. Wait for the next round.');
            return;
        }
        log(`${socket.username} is ${isReady ? 'Ready' : 'Unready'}!`, 'setPlayerReady');
        readyPlayers += isReady ? 1 : -1;
        if (userMap[socket.id]) {
            userMap[socket.id].ready = isReady;
            scores[socket.username] = scores[socket.username] || 0;
            updatePlayerStatus();
            checkAllPlayersReady();
        }
    } catch (error) {
        handleError(socket, error, 'setPlayerReady');
    }
}

function checkAllPlayersReady() { // Checks if all players are ready and starts the game if they are
    const allReady = Object.values(userMap).every(user => user.ready);
    if (allReady && Object.keys(userMap).length > 1) {
        gameInProgress = true;
        log(`Game has Started...`, 'checkAllPlayersReady'); // Log the game start
        currentLetters = generateRandomLetters();
        log(`Current Letters for start of game: ${currentLetters}`, 'checkAllPlayersReady'); // Log the currentletters for start of game
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
        log(`Current player's turn: ${currentUsername}`, 'emitCurrentTurn'); // Log the current player's turn
    } catch (error) {
        console.error('Error in emitCurrentTurn:', error);
    }
}

function resetPlayerState() { // Resets the game state for all players and notifies them to reset their UI
    try {
        log(`Resetting game state for all players.`,'resetPlayerState');
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
            clearInterval(playerTimer[timerId]); // Use clearInterval to reset player timers
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

function checkAndProceedToNextTurn() {
    try {
        // First clear any existing timer to prevent race conditions
        if (currentPlayerTurn) {
            clearPlayerTimer(currentPlayerTurn);
        }
        
        // Clean up any disconnected players or players with no lives
        const playersToRemove = [];
        
        Object.keys(userMap).forEach(socketId => {
            const username = userMap[socketId].name;
            if (!username || !lives[username] || lives[username] <= 0) {
                log(`Player ${username || socketId} has no more lives or is invalid`, 'checkAndProceedToNextTurn');
                playersToRemove.push(socketId);
            }
        });
        
        // Remove players who are out of the game
        playersToRemove.forEach(socketId => {
            // Don't delete game data here, just handle turn logic
            if (socketId === currentPlayerTurn) {
                currentPlayerTurn = null; // Clear current turn if it was this player's turn
            }
        });

        // Find all players with lives remaining
        const playersWithLives = Object.keys(userMap).filter(socketId => {
            const username = userMap[socketId]?.name;
            return username && lives[username] && lives[username] > 0;
        });

        log(`Players with lives remaining: ${playersWithLives.length}`, 'checkAndProceedToNextTurn');
        
        // Handle game end conditions
        if (playersWithLives.length === 1) {
            const winningSocketId = playersWithLives[0];
            const winningPlayerName = userMap[winningSocketId].name;
            
            log(`${winningPlayerName} wins the game!`, 'checkAndProceedToNextTurn');
            
            // Ensure all timers are cleared
            Object.keys(playerTimer).forEach(timerId => {
                clearInterval(playerTimer[timerId]);
            });
            
            // Emit the win event before resetting the state
            io.emit('gameWin', winningPlayerName);
            
            // Add a delay before resetting the game state
            setTimeout(() => {
                resetPlayerState();
            }, 1000);
            
            return; // Don't proceed to next turn after a win
        } else if (playersWithLives.length === 0) {
            // Handle the case where everyone is out
            log(`No players with lives remaining. Game Over!`, 'checkAndProceedToNextTurn');
            io.emit('gameOver', 'All players are out of lives. Game Over!');
            resetPlayerState();
            return;
        }
        
        // Continue the game with the remaining players
        moveToNextPlayerTurn(playersWithLives);
    } catch (error) {
        console.error('Error in checkAndProceedToNextTurn:', error);
        // Recovery: try to maintain game state or reset if severe error
        if (gameInProgress && Object.keys(userMap).length > 0) {
            moveToNextPlayerTurn(Object.keys(userMap));
        } else {
            resetPlayerState();
        }
    }
}

function moveToNextPlayerTurn(playerIds) {
    try {
        // Find the index of the current player in the active players array
        let currentIndex = playerIds.indexOf(currentPlayerTurn);
        
        // If current player isn't in the array (already out), start from beginning
        if (currentIndex === -1) currentIndex = 0;
        
        clearPlayerTimer(currentPlayerTurn);

        let nextPlayerFound = false;
        let attempts = 0;
        
        // Loop to find the next valid player
        while (!nextPlayerFound && attempts < playerIds.length) {
            currentIndex = (currentIndex + 1) % playerIds.length;
            const nextPlayerId = playerIds[currentIndex];
            
            // Verify player exists and has lives
            if (userMap[nextPlayerId] && lives[userMap[nextPlayerId].name] > 0) {
                currentPlayerTurn = nextPlayerId;
                nextPlayerFound = true;
            }
            
            attempts++;
        }

        if (!nextPlayerFound) {
            log("All players are out of lives. Game Over.", 'moveToNextPlayerTurn');
            currentPlayerTurn = null;
            gameInProgress = false;
            io.emit('gameOver', 'All players are out of lives. Game Over!');
        } else {
            emitCurrentTurn();
            startPlayerTimer(currentPlayerTurn);
        }
    } catch (error) {
        handleError(null, error, 'moveToNextPlayerTurn');
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

function handleInvalidGuess(socket) { // Handles an invalid guess by decrementing the player's lives and updating the game state
    socket.emit('invalidWord', 'The word is not valid');
    lives[socket.username] = (lives[socket.username] || 0) - 1;
    log(`${socket.username} now has ${lives[socket.username]} lives left`, 'handleInvalidGuess'); // Log lives remaining
    log(`Current Letters: ${currentLetters}`, 'handleInvalidGuess'); // Log the same current letters
    updateAllPlayers();
    if (lives[socket.username] <= 0) {
        socket.emit('gameOver');
        log(`${socket.username} has 0 lives`, 'handleInvalidGuess'); // Log when player has 0 lives
    }
}

function handleValidGuess(socket, word) { // Processes a valid guess by updating the game state and notifying all players
    scores[socket.username] = (scores[socket.username] || 0) + 1;
    log(`${socket.username} now has ${lives[socket.username]} lives left`, 'handleValidGuess'); // Log lives remaining
    currentLetters = generateRandomLetters(); // New letter for when a player guesses correctly
    log(`Current Letters: ${currentLetters}`, 'handleValidGuess'); // Log the new current letters
    updateAllPlayers();
}

function isValidGuessInput(socket, word) { // Validates the player's guess input
    if (!word || typeof word !== 'string' || word.trim().length === 0) {
        socket.emit('invalidWord', 'Invalid guess.');
        return false;
    }
    return true;
}

async function checkWordValidity(word) {
    try {
        // First attempt - Datamuse API
        const response = await axios.get(`https://api.datamuse.com/words?sp=${word}&md=d`, {
            timeout: 3000 // Add timeout to prevent hanging
        });
        
        if (response.data.length > 0 && response.data[0].word === word) {
            return true;
        }
        
        // Fall back to a basic dictionary check if available
        // This is a placeholder - you might want to implement a local dictionary
        if (word.length > 2) {
            // Simple validation for demonstration - allow words longer than 2 chars
            // In production you'd want a more robust fallback
            return true;
        }
        
        log(`Word validation failed for: ${word}`, 'checkWordValidity');
        return false;
    } catch (error) {
        log(`Error validating word: ${word}, Error: ${error.message}`, 'checkWordValidity');
        // Graceful degradation - if API fails, accept the word if it meets basic criteria
        // In production, you might want a more sophisticated fallback
        if (word.length > 2) {
            log(`Word accepted by fallback validation: ${word}`, 'checkWordValidity');
            return true;
        }
        return false;
    }
}

function isValidGuess(word, letters) { // Checks if the guessed word contains the required letters
    const [letter1, letter2] = letters.split('');
    const upperWord = word.toUpperCase();
    return upperWord.includes(letter1) && upperWord.includes(letter2);
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

function handlePlayerDisconnect(socket) {
    try {
        if (socket.username) {
            log(`Player disconnected: ${socket.username}`, 'handlePlayerDisconnect');
            log(`Total connected sockets: ${io.engine.clientsCount}`, 'handlePlayerDisconnect');

            const wasCurrentPlayerTurn = socket.id === currentPlayerTurn;
            
            // Always clear the timer for this player
            clearPlayerTimer(socket.id);
            
            // Remove player from game data
            delete scores[socket.username];
            delete lives[socket.username];
            delete userMap[socket.id];

            totalPlayers--;
            
            // Update all clients with new game state
            updateAllPlayers();
            updatePlayerStatus();

            // Handle turn transition if this was the current player's turn
            if (wasCurrentPlayerTurn && gameInProgress) {
                // Small delay to ensure state is updated before proceeding
                setTimeout(() => {
                    checkAndProceedToNextTurn();
                }, 100);
            } 
            
            // Check remaining players
            const remainingPlayers = Object.keys(userMap);
            
            if (remainingPlayers.length === 1 && gameInProgress) {
                const lastPlayerName = userMap[remainingPlayers[0]].name;
                log(`${lastPlayerName} is the last player standing!`, 'handlePlayerDisconnect');
                
                // Clear all timers to prevent race conditions
                Object.keys(playerTimer).forEach(timerId => {
                    clearInterval(playerTimer[timerId]);
                });
                
                io.emit('gameWin', lastPlayerName);
                
                // Delay reset to allow UI to update
                setTimeout(() => {
                    resetPlayerState();
                }, 1000);
            }

            // Reset game if all players disconnect
            if (io.engine.clientsCount === 0) {
                resetPlayerState();
                log(`All players have been disconnected`, 'handlePlayerDisconnect');
            }
        }
    } catch (error) {
        handleError(null, error, 'handlePlayerDisconnect');
    }
}

function startPlayerTimer(socketId) { // Starts the timer for a player's turn
    clearInterval(playerTimer[socketId]); // Clear any existing timer
    let remainingTime = 10; // Set the timer duration

    playerTimer[socketId] = setInterval(() => {
        if (remainingTime > 0) {
            remainingTime--;
            io.emit('timerUpdate', remainingTime); // Broadcast the remaining time to all players
        } else {
            clearInterval(playerTimer[socketId]); // Clear the timer when time runs out
            const username = userMap[socketId]?.name;
            if (username) {
                
                lives[username] = (lives[username] || 1) - 1; // Deduct a life if the player runs out of time
                log(`Timer ran out for ${username}`, 'startPlayerTimer'); // Log when the timer runs out for the player
                log(`${username} now has ${lives[username]} lives left`, 'startPlayerTimer'); // Log lives remaining
                log(`Current Letters: ${currentLetters}`, 'startPlayerTimer'); // Log the same current letters
                updateAllPlayers(); // Update all players with the new game state

                if (lives[username] <= 0) {// Check if the player has run out of lives
                    io.to(socketId).emit('gameOver'); // Notify the player they are out of lives
                    log(`${username} is out of lives!`, 'startPlayerTimer'); // Log when a player is out of lives
                    //checkAndProceedToNextTurn(); // Check if there is only one player left
                }
                
                // Move to the next player's turn, even if the current player is out of lives
                checkAndProceedToNextTurn();
            }
            io.emit('timerUpdate', null); // Clear the timer display on the client side
        }
    }, 1000); // Run the timer every second
}


function clearPlayerTimer(socketId) { // Clears the timer for a player's turn
    clearInterval(playerTimer[socketId]);
    io.emit('timerUpdate', null);
    io.emit('typingCleared');
}

function handleFreeSkip(socket) {
    try {
        if (socket.id !== currentPlayerTurn) {
            socket.emit('actionBlocked', 'You can only skip on your turn.');
            return;
        }

        if (hasPlayerLives(socket)) {
            log(`${socket.username} used their free skip.`, 'handleFreeSkip');
            currentLetters = generateRandomLetters(); // Change the letters for the game
            log(`New Letters: ${currentLetters}`, 'handleFreeSkip'); // Log the new letters
            updateAllPlayers(); // Update all players with the new letters and state
            checkAndProceedToNextTurn(); // Move to the next player's turn
        }
    } catch (error) {
        handleError(socket, error, 'handleFreeSkip');
    }
}


// Socket Connection Handling
io.on('connection', socket => {
    try {
        log(`New player connected: ${socket.id}`, 'connection'); // Log the new player connection
        log(`Total connected sockets: ${io.engine.clientsCount}`, 'connection'); // Log the total connected players
        totalPlayers++;
        socket.on('setUsername', setUsernameHandler(socket));
        socket.on('guess', guessHandler(socket));
        socket.on('typing', typingHandler(socket));
        socket.on('resetGameRequest', () => {
            resetPlayerState(socket.id);
        });
        socket.on('clearTyping', () => socket.broadcast.emit('typingCleared'));
        socket.on('disconnect', () => handlePlayerDisconnect(socket));
        socket.on('playerReady', () => setPlayerReady(socket, true));
        socket.on('playerUnready', () => setPlayerReady(socket, false));
        socket.on('freeSkip', () => handleFreeSkip(socket));
    } catch (error) {
        console.error('Error during socket connection:', error);
    }
});

// Server Initialization
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    log(`Server is running on port ${PORT}`, 'server.listen');
});