//script.js
const socket = io();
const elements = {
    usernameScreen: document.getElementById('usernameScreen'),
    usernameInput: document.getElementById('usernameInput'),
    joinGameButton: document.getElementById('joinGame'),
    gameScreen: document.getElementById('game'),
    letterDisplay: document.getElementById('letterDisplay'),
    wordGuess: document.getElementById('wordGuess'),
    submitGuess: document.getElementById('submitGuess'),
    scoreBoard: document.getElementById('scoreBoard'),
    readyButton: document.getElementById('readyButton'),
    unreadyButton: document.getElementById('unreadyButton'),
    playerTypingStatus: document.getElementById('playerTypingStatus'),
    playerList: document.getElementById('playerList'),
    // Lobby elements
    lobbyControls: document.getElementById('lobbyControls'),
    createLobbyBtn: document.getElementById('createLobby'),
    joinLobbyBtn: document.getElementById('joinLobby'),
    lobbyCodeInput: document.getElementById('lobbyCodeInput'),
    currentLobby: document.getElementById('currentLobby'),
    lobbyCode: document.getElementById('lobbyCode'),
    lobbyPlayerList: document.getElementById('lobbyPlayerList'),
    leaveLobbyBtn: document.getElementById('leaveLobby')
};

let myUsername = null;
let isGameOver = false;
let gameInProgress = false;
let hasUsedSkip = false;
let currentLobbyId = null;

function initializeEventListeners() {
    elements.readyButton.addEventListener('click', handleReadyClick);
    elements.unreadyButton.addEventListener('click', handleUnreadyClick);
    elements.joinGameButton.addEventListener('click', handleJoinGameClick);
    elements.wordGuess.addEventListener('input', handleWordGuessInput);
    elements.wordGuess.addEventListener('keypress', handleWordGuessKeypress);
    elements.submitGuess.addEventListener('click', handleSubmitGuessClick);
    
    // Lobby event listeners
    elements.createLobbyBtn.addEventListener('click', () => {
        socket.emit('createLobby');
    });
    
    elements.joinLobbyBtn.addEventListener('click', () => {
        const lobbyId = elements.lobbyCodeInput.value.trim().toUpperCase();
        if (lobbyId) {
            socket.emit('joinLobby', lobbyId);
        } else {
            showMessage('Please enter a lobby code');
        }
    });
    
    elements.leaveLobbyBtn.addEventListener('click', () => {
        socket.emit('leaveLobby');
    });
}

function initializeSocketEventHandlers() {
    socket.on('playerTyping', handlePlayerTyping);
    socket.on('usernameError', handleUsernameError);
    socket.on('usernameSet', handleUsernameSet);
    socket.on('gameUpdate', handleGameUpdate);
    socket.on('gameOver', handleGameOver);
    socket.on('gameWin', handleGameWin);
    socket.on('invalidWord', showMessage);
    socket.on('notYourTurn', () => showMessage("It's not your turn!"));
    socket.on('actionBlocked', showMessage);
    socket.on('turnUpdate', handleTurnUpdate);
    socket.on('typingCleared', clearGlobalTypingDisplay);
    socket.on('timerUpdate', updateTimerDisplay);
    socket.on('gameReset', resetFrontendUI);
    socket.on('turnEnded', clearInputAndTypingStatus);
    
    // Add reconnection handling
    socket.on('disconnect', () => {
        showMessage('Connection lost. Attempting to reconnect...');
    });
    
    socket.on('connect', () => {
        if (myUsername) {
            showMessage('Reconnected! Attempting to rejoin game...');
            socket.emit('setUsername', myUsername);
        }
    });
    
    socket.on('error', (errorMsg) => {
        console.error('Socket error:', errorMsg);
        showMessage('An error occurred. Please refresh the page if issues persist.');
    });
    
    // Handle free skip button
    document.getElementById('freeSkip').addEventListener('click', function () {
        if (!hasUsedSkip) {
            socket.emit('freeSkip');
            hasUsedSkip = true;
            document.getElementById('freeSkip').disabled = true;
        }
    });
    
    // Lobby event handlers
    socket.on('lobbyCreated', (lobbyId) => {
        currentLobbyId = lobbyId;
        elements.lobbyCode.textContent = lobbyId;
        elements.lobbyControls.style.display = 'block';
        elements.currentLobby.style.display = 'block';
        elements.readyButton.style.display = 'inline';
        elements.unreadyButton.style.display = 'inline';
        updateLobbyControlsVisibility(true);
        showMessage(`Lobby created with code: ${lobbyId}`);
    });
    
    socket.on('lobbyJoined', (lobbyId) => {
        currentLobbyId = lobbyId;
        elements.lobbyCode.textContent = lobbyId;
        elements.lobbyControls.style.display = 'block';
        elements.currentLobby.style.display = 'block';
        elements.readyButton.style.display = 'inline';
        elements.unreadyButton.style.display = 'inline';
        updateLobbyControlsVisibility(true);
        showMessage(`Joined lobby: ${lobbyId}`);
    });
    
    socket.on('lobbyUpdate', (data) => {
        updateLobbyPlayers(data.players);
    });
    
    socket.on('lobbyError', (message) => {
        showMessage(message);
    });
    
    socket.on('lobbyLeft', () => {
        currentLobbyId = null;
        elements.currentLobby.style.display = 'none';
        elements.lobbyCode.textContent = '';
        elements.lobbyPlayerList.innerHTML = '';
        elements.readyButton.style.display = 'none';
        elements.unreadyButton.style.display = 'none';
        updateLobbyControlsVisibility(false);
        showMessage('Left the lobby');
    });
}

function updatePlayerList(playerStatus) {
    const playerListElement = elements.playerList;
    playerListElement.innerHTML = '';
    playerStatus.forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.textContent = `${player.name} - ${player.ready ? 'Ready' : 'Not Ready'}`;
     
        if (player.ready) {
            playerElement.classList.add('player-ready');
        } else {
            playerElement.classList.add('player-not-ready');
        }
        playerListElement.appendChild(playerElement);
    });
}

function updateScoreBoard(scores, lives) {
    elements.scoreBoard.innerHTML = '';
    for (const [username, score] of Object.entries(scores)) {
        const playerScoreElement = document.createElement('div');
        playerScoreElement.classList.add('player-score');
        playerScoreElement.id = `score_${username}`;
        const heartsContainer = document.createElement('div');
        heartsContainer.classList.add('hearts-container');
        const playerLives = lives[username] || 0;
        for (let i = 0; i < playerLives; i++) {
            const fullHeart = document.createElement('span');
            fullHeart.classList.add('heart', 'full-heart');
            heartsContainer.appendChild(fullHeart);
        }
        for (let i = playerLives; i < 3; i++) {
            const emptyHeart = document.createElement('span');
            emptyHeart.classList.add('heart', 'empty-heart');
            heartsContainer.appendChild(emptyHeart);
        }
        playerScoreElement.appendChild(heartsContainer);
        const playerNameElement = document.createElement('span');
        playerNameElement.textContent = ` ${username}`;
        playerNameElement.classList.add('player-name');
        playerScoreElement.appendChild(playerNameElement);
        const playerScoreText = document.createElement('span');
        playerScoreText.textContent = `: ${score}`;
        playerScoreElement.appendChild(playerScoreText);
        const typingStatus = document.createElement('div');
        typingStatus.id = `typingDisplay_${username}`;
        typingStatus.classList.add('typing-status');
        playerScoreElement.appendChild(typingStatus);
        scoreBoard.appendChild(playerScoreElement);
    }
}

function handleReadyClick() {
    if (!elements.readyButton.disabled) {
        socket.emit('ready', true);
        elements.readyButton.disabled = true;
        elements.unreadyButton.disabled = false;
    }
}

function handleUnreadyClick() {
    if (!elements.unreadyButton.disabled) {
        socket.emit('ready', false);
        elements.unreadyButton.disabled = true;
        elements.readyButton.disabled = false;
    }
}

function handleJoinGameClick() {
    const username = elements.usernameInput.value.trim();
    if (!username || username.length < 3 || username.length > 20) {
        showMessage('Invalid username. Must be 3-20 characters long.');
        return;
    }
    socket.emit('setUsername', username);
}

let typingTimeout;
function handleWordGuessInput() {
    if (!isGameOver) {
        const text = elements.wordGuess.value.trim();
        socket.emit('typing', { username: myUsername, text });
        
        // Clear previous timeout
        clearTimeout(typingTimeout);
        
        // Set a new timeout to clear typing after inactivity
        typingTimeout = setTimeout(() => {
            socket.emit('clearTyping');
        }, 3000);
    }
}

function handleSubmitGuessClick() {
    socket.emit('guess', elements.wordGuess.value.trim());
    socket.emit('clearTyping');
    elements.wordGuess.value = '';
}

function handlePlayerTyping({ username, text }) {
    const typingDisplayElement = document.getElementById('globalTypingDisplay');
    if (text) {
        typingDisplayElement.textContent = `${username} is typing: ${text}`;
    } else {
        typingDisplayElement.textContent = '';
    }
}

function handleUsernameError(message) {
    showMessage(message);
    elements.usernameInput.disabled = false; 
    elements.joinGameButton.style.display = 'inline';
    elements.readyButton.style.display = 'none';
    elements.usernameInput.value = '';
}

function handleUsernameSet(username) {
    myUsername = username;
    elements.usernameInput.disabled = true;
    elements.joinGameButton.style.display = 'none';
    elements.lobbyControls.style.display = 'block';
    showMessage('Username set successfully. Create or join a lobby to play!');
}

function handleGameUpdate(data) {
    try {
        gameInProgress = data.gameStarted;
        if (data.gameStarted) {
            elements.gameScreen.style.display = 'block';
            elements.usernameScreen.style.display = 'none';
        }
        elements.letterDisplay.textContent = data.letters || '';
        if (data.scores && data.lives) {
            updateScoreBoard(data.scores, data.lives);
        }
    } catch (error) {
        console.error('Error handling game update:', error);
        showMessage('An error occurred updating the game state.');
    }
}

function handleGameOver() {
    showMessage('You have lost all your lives!');
    elements.wordGuess.disabled = true;
    elements.submitGuess.disabled = true;
    isGameOver = true;
}

function handleGameWin(winnerUsername) {
    console.log('Game win event received for winner:', winnerUsername);
    
    // Disable game controls
    elements.wordGuess.disabled = true;
    elements.submitGuess.disabled = true;
    
    // Update modal content
    document.getElementById('winnerName').textContent = winnerUsername;
    
    // Show the modal
    const modal = document.getElementById('winnerModal');
    modal.style.display = "block";
    
    // Use proper event delegation instead of recreating the button
    document.getElementById('resetGame').onclick = function() {
        console.log('Reset game button clicked');
        socket.emit('resetGameRequest');
        modal.style.display = "none";
        resetFrontendUI();
    };
    
    // Also allow clicking outside the modal to close it
    window.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = "none";
            socket.emit('resetGameRequest');
            resetFrontendUI();
        }
    };
}

function handleTurnUpdate(currentTurnUsername) {
    const isMyTurn = myUsername === currentTurnUsername;
    elements.wordGuess.disabled = !isMyTurn;
    elements.submitGuess.disabled = !isMyTurn;
    document.getElementById('freeSkip').disabled = !isMyTurn || hasUsedSkip; // Enable free skip only if it's their turn and they haven't used it yet.
    document.getElementById('currentTurn').textContent = currentTurnUsername;
}

function clearGlobalTypingDisplay() {
    document.getElementById('globalTypingDisplay').textContent = '';
}

function handleWordGuessKeypress(event) {
    if (event.key === 'Enter') {
        handleSubmitGuessClick();
        event.preventDefault();
    }
}

function updateTimerDisplay(time) {
    const timerElement = document.getElementById('timerDisplay');
    if (time !== null) {
        timerElement.textContent = `Time left: ${time}s`;
    } else {
        timerElement.textContent = '';
    }
}

function clearInputAndTypingStatus() {
    elements.wordGuess.value = ''; 
    clearGlobalTypingDisplay(); 
    socket.emit('clearTyping'); 
}

function showMessage(message) {
    const messageBox = document.getElementById('messageBox');
    messageBox.innerText = message;
    messageBox.style.display = 'block';
    setTimeout(() => messageBox.style.display = 'none', 3000);
}

// Make sure the modal CSS is correct
function checkStylesOnLoad() {
    // Ensure the modal starts hidden
    const modal = document.getElementById('winnerModal');
    if (modal) {
        modal.style.display = "none";
        console.log('Initial modal display style set to:', modal.style.display);
    }
}

document.addEventListener('DOMContentLoaded', checkStylesOnLoad);

function resetFrontendUI() {
    elements.gameScreen.style.display = 'none';
    elements.usernameScreen.style.display = 'block';
    elements.wordGuess.disabled = false;
    elements.submitGuess.disabled = false;
    elements.readyButton.disabled = false;
    elements.unreadyButton.disabled = true;
    elements.wordGuess.value = '';
    document.getElementById('currentTurn').textContent = '';
    document.getElementById('letterDisplay').textContent = '';
    document.getElementById('scoreBoard').innerHTML = '';
    document.getElementById('playerList').innerHTML = '';
    document.getElementById('globalTypingDisplay').textContent = '';
    document.getElementById('timerDisplay').textContent = '';
    isGameOver = false;
    gameInProgress = false;
    hasUsedSkip = false;
    
    // Reset lobby UI
    if (!currentLobbyId) {
        elements.currentLobby.style.display = 'none';
        elements.lobbyCode.textContent = '';
        elements.lobbyPlayerList.innerHTML = '';
        updateLobbyControlsVisibility(false);
    } else {
        updateLobbyControlsVisibility(true);
    }
}

function updateLobbyPlayers(players) {
    elements.lobbyPlayerList.innerHTML = '';
    players.forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.textContent = `${player.name} - ${player.ready ? 'Ready' : 'Not Ready'}`;
        playerElement.classList.add(player.ready ? 'player-ready' : 'player-not-ready');
        elements.lobbyPlayerList.appendChild(playerElement);
    });
}

// Add this function to update lobby controls
function updateLobbyControlsVisibility(inLobby) {
    elements.createLobbyBtn.disabled = inLobby;
    elements.joinLobbyBtn.disabled = inLobby;
    elements.lobbyCodeInput.disabled = inLobby;
}

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    initializeSocketEventHandlers();
    checkStylesOnLoad();
});