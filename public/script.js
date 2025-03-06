//script.js
import { getCurrentUser } from './auth.js';

// Expose socket globally so auth.js can access it
window.socket = io();
const socket = window.socket;

const elements = {
    usernameScreen: document.getElementById('usernameScreen'),
    usernameInput: document.getElementById('usernameInput'),
    joinGameButton: document.getElementById('joinGame'),
    changeUsernameButton: document.getElementById('changeUsername'),
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
    leaveLobbyBtn: document.getElementById('leaveLobby'),
    leaderboardList: document.getElementById('leaderboardList'),
    leaderboardSection: document.getElementById('leaderboardSection')
};

let myUsername = null;
let isGameOver = false;
let gameInProgress = false;
let hasUsedSkip = false;
let currentLobbyId = null;

// Expose game state to window object for auth.js to access
window.gameInProgress = gameInProgress;

// Add function to reset username state
function resetUsernameState() {
    myUsername = null;
    
    // Reset username input
    elements.usernameInput.disabled = false;
    elements.usernameInput.value = '';
    elements.joinGameButton.style.display = 'inline';
    elements.changeUsernameButton.style.display = 'none';
    
    // Hide all lobby-related elements
    elements.lobbyControls.style.display = 'none';
    elements.currentLobby.style.display = 'none';
    elements.readyButton.style.display = 'none';
    elements.unreadyButton.style.display = 'none';
    elements.lobbyPlayerList.innerHTML = '';
    elements.playerList.style.display = 'none';  // Hide the player list container
    elements.playerList.innerHTML = '';
    
    // Clear lobby code input
    elements.lobbyCodeInput.value = '';
    
    // Show username screen and hide game screen
    elements.usernameScreen.style.display = 'block';
    elements.gameScreen.style.display = 'none';
    
    // Reset lobby-related state
    currentLobbyId = null;
    updateLobbyControlsVisibility(false);
    
    // Reset game state
    isGameOver = false;
    gameInProgress = false;
    hasUsedSkip = false;
}

function initializeEventListeners() {
    elements.readyButton.addEventListener('click', handleReadyClick);
    elements.unreadyButton.addEventListener('click', handleUnreadyClick);
    elements.joinGameButton.addEventListener('click', handleJoinGameClick);
    elements.changeUsernameButton.addEventListener('click', handleChangeUsernameClick);
    elements.wordGuess.addEventListener('input', handleWordGuessInput);
    elements.wordGuess.addEventListener('keypress', handleWordGuessKeypress);
    elements.submitGuess.addEventListener('click', handleSubmitGuessClick);
    
    // Lobby event listeners
    elements.createLobbyBtn.addEventListener('click', () => {
        socket.emit('createLobby');
    });
    
    elements.joinLobbyBtn.addEventListener('click', () => {
        const joinLobbyInput = document.getElementById('joinLobbyInput');
        if (joinLobbyInput.style.display === 'none') {
            joinLobbyInput.style.display = 'block';
            elements.lobbyCodeInput.focus();
        } else {
            const lobbyId = elements.lobbyCodeInput.value.trim().toUpperCase();
            if (lobbyId) {
                socket.emit('joinLobby', lobbyId);
                joinLobbyInput.style.display = 'none';
            } else {
                showMessage('Please enter a lobby code');
            }
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
    socket.on('playerListUpdate', handlePlayerListUpdate);
    socket.on('gameOver', handleGameOver);
    socket.on('gameWin', handleGameWin);
    socket.on('invalidWord', showMessage);
    socket.on('notYourTurn', () => showMessage("It's not your turn!"));
    socket.on('actionBlocked', showMessage);
    socket.on('lobbyError', showMessage);
    socket.on('turnUpdate', handleTurnUpdate);
    socket.on('typingCleared', clearGlobalTypingDisplay);
    socket.on('timerUpdate', updateTimerDisplay);
    socket.on('gameReset', resetFrontendUI);
    socket.on('turnEnded', clearInputAndTypingStatus);
    
    // Add listener for sign out
    socket.on('userSignedOut', () => {
        // Reset all UI state
        resetUsernameState();
        
        // Clear any stored username
        try {
            localStorage.removeItem('letterGuessGameUsername');
        } catch (e) {
            console.warn('Could not clear username from localStorage', e);
        }
        
        // Reset username input
        elements.usernameInput.disabled = false;
        elements.usernameInput.value = '';
        elements.joinGameButton.style.display = 'inline';
        
        // Show username screen
        elements.usernameScreen.style.display = 'block';
        elements.gameScreen.style.display = 'none';
    });
    
    // Add handler for sign out completion
    socket.on('signOutComplete', () => {
        // Clear the message box if it's showing "Connection lost"
        const messageBox = document.getElementById('messageBox');
        if (messageBox) {
            messageBox.style.display = 'none';
        }
    });
    
    // Add reconnection handling
    socket.on('disconnect', () => {
        showMessage('Connection lost. Attempting to reconnect...');
    });
    
    socket.on('connect', () => {
        // Clear any existing state on connect/reconnect
        resetUsernameState();
        
        // Clear any stored username
        try {
            localStorage.removeItem('letterGuessGameUsername');
        } catch (e) {
            console.warn('Could not clear username from localStorage', e);
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
        // We're in a lobby, so clear the global player list
        elements.playerList.innerHTML = '';
        
        // Update the lobby player list
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
        
        // Request an updated player list since we're now out of the lobby
        socket.emit('requestPlayerList');
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
    if (username) {
        // Get Firebase user if available
        const firebaseUser = getCurrentUser();
        
        // Send both username and authentication information
        socket.emit('setUsername', { 
            username,
            authenticated: !!firebaseUser,
            uid: firebaseUser ? firebaseUser.uid : null
        });
    } else {
        handleUsernameError('Please enter a username');
    }
}

function handleChangeUsernameClick() {
    const newUsername = elements.usernameInput.value.trim();
    if (newUsername) {
        // Reset UI state first
        elements.usernameInput.disabled = false;
        elements.joinGameButton.style.display = 'inline';
        elements.changeUsernameButton.style.display = 'none';
        elements.lobbyControls.style.display = 'none';
        
        // If in a lobby, leave it first
        if (currentLobbyId) {
            socket.emit('leaveLobby');
        }
        
        // Get Firebase user if available
        const firebaseUser = getCurrentUser();
        
        // Send both username and authentication information
        socket.emit('setUsername', { 
            username: newUsername,
            authenticated: !!firebaseUser,
            uid: firebaseUser ? firebaseUser.uid : null
        });
    } else {
        handleUsernameError('Please enter a username');
    }
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

// Add this function to update the leaderboard display
async function updateLeaderboard() {
    if (!window.leaderboard || !elements.leaderboardList) return;
    
    try {
        // Clear the leaderboard
        elements.leaderboardList.innerHTML = '';

        // If user is not authenticated, show sign-in message
        if (!window.leaderboard.isUserAuthenticated()) {
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('leaderboard-message');
            messageDiv.innerHTML = `
                <p>Sign in with Google to:</p>
                <ul>
                    <li>Track your high scores</li>
                    <li>Compete on the leaderboard</li>
                    <li>Save your game statistics</li>
                </ul>
            `;
            elements.leaderboardList.appendChild(messageDiv);
            return;
        }

        // Get and display top players
        const topPlayers = await window.leaderboard.getTopPlayers(10);
        
        topPlayers.forEach((player, index) => {
            const entry = document.createElement('div');
            entry.classList.add('leaderboard-entry');
            
            const rank = document.createElement('span');
            rank.classList.add('rank');
            rank.textContent = `#${index + 1}`;
            
            const username = document.createElement('span');
            username.classList.add('username');
            username.textContent = player.username;
            
            const score = document.createElement('span');
            score.classList.add('score');
            score.textContent = `High Score: ${player.highScore}`;
            
            const stats = document.createElement('span');
            stats.classList.add('stats');
            stats.textContent = `Games: ${player.totalGames}`;
            
            entry.appendChild(rank);
            entry.appendChild(username);
            entry.appendChild(score);
            entry.appendChild(stats);
            
            elements.leaderboardList.appendChild(entry);
        });
    } catch (error) {
        console.error('Error updating leaderboard:', error);
    }
}

// Modify handleUsernameSet to update leaderboard when username is set
function handleUsernameSet(username) {
    myUsername = username;
    elements.usernameInput.value = username;
    elements.usernameInput.disabled = true;
    elements.joinGameButton.style.display = 'none';
    elements.changeUsernameButton.style.display = 'inline';
    elements.lobbyControls.style.display = 'block';
    
    // Update leaderboard when username is set
    if (window.leaderboard) {
        window.leaderboard.updateLeaderboardDisplay();
    }
    
    // Store username in localStorage
    try {
        localStorage.setItem('letterGuessGameUsername', username);
    } catch (e) {
        console.warn('Could not save username to localStorage', e);
    }
}

// When the page loads, attempt to restore the username
window.addEventListener('DOMContentLoaded', function() {
    try {
        const savedUsername = localStorage.getItem('letterGuessGameUsername');
        if (savedUsername && !myUsername) {
            myUsername = savedUsername;
            console.log('Restored username from localStorage:', myUsername);
            
            // Will attempt to reclaim via the socket.on('connect') handler we added
        }
    } catch (e) {
        console.warn('Could not restore username from localStorage', e);
    }
});

function handleGameUpdate(data) {
    try {
        // Update game state flag based on received data
        gameInProgress = data.gameStarted === true;
        window.gameInProgress = gameInProgress; // Update window object
        
        // Only update UI if game is actually started
        if (gameInProgress) {
            elements.gameScreen.style.display = 'block';
            elements.usernameScreen.style.display = 'none';
            elements.letterDisplay.textContent = data.letters || '';
            
            // Only update score/lives display if we're in a game
            if (data.scores && data.lives) {
                updateScoreBoard(data.scores, data.lives);
            }
            
            // Hide auth UI during game
            if (window.setAuthUIVisibility) {
                window.setAuthUIVisibility(true, true);
            }
        } else {
            // Show auth UI when game is not in progress, respecting guest state
            if (window.setAuthUIVisibility) {
                window.setAuthUIVisibility(true, false);
            }
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

// Modify handleGameWin to update leaderboard after game ends
function handleGameWin(winner) {
    isGameOver = true;
    gameInProgress = false;
    window.gameInProgress = false;
    
    console.log('Game won by:', winner);
    
    // Get the winner modal elements
    const modal = document.getElementById('winnerModal');
    const winnerName = document.getElementById('winnerName');
    
    // Update the modal content
    if (modal && winnerName) {
        winnerName.textContent = winner;
        modal.style.display = 'block';
    }
    
    // Update leaderboard for the winner
    const leaderboard = window.getLeaderboard();
    if (leaderboard) {
        // Only update the winner's win count
        console.log('Attempting to update win count for winner:', winner);
        leaderboard.updateScore(winner)
            .then((success) => {
                console.log('Win update success status:', success);
                if (success) {
                    console.log('Win recorded successfully for', winner);
                    // Update the leaderboard display
                    return leaderboard.updateLeaderboardDisplay();
                } else {
                    console.error('Failed to record win for', winner);
                }
            })
            .then(() => {
                console.log('Leaderboard display updated');
            })
            .catch(error => {
                console.error('Error in win recording process for', winner, ':', error);
            });
    } else {
        console.error('Leaderboard instance not found');
    }
    
    // Reset game UI elements
    elements.wordGuess.disabled = true;
    elements.submitGuess.disabled = true;
    
    // Show message
    showMessage(`Game Over! ${winner} wins!`);
    
    // Add event listener to close the modal
    const closeSpan = document.getElementsByClassName('close')[0];
    if (closeSpan) {
        closeSpan.onclick = function() {
            modal.style.display = 'none';
        }
    }
    
    // Add reset game functionality
    const resetButton = document.getElementById('resetGame');
    if (resetButton) {
        resetButton.onclick = function() {
            console.log('Reset game button clicked');
            socket.emit('resetGameRequest');
            modal.style.display = 'none';
            resetFrontendUI();
        };
    }
    
    // Close modal when clicking outside
    window.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
            socket.emit('resetGameRequest');
            resetFrontendUI();
        }
    }
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
    window.gameInProgress = false; // Update window object
    hasUsedSkip = false;
    
    // Reset lobby UI
    if (!currentLobbyId) {
        elements.currentLobby.style.display = 'none';
        elements.lobbyCode.textContent = '';
        elements.lobbyPlayerList.innerHTML = '';
        updateLobbyControlsVisibility(false);
        // Update leaderboard when returning to lobby
        updateLeaderboard();
    } else {
        updateLobbyControlsVisibility(true);
    }
    
    // Show auth UI when game is reset, respecting guest state
    if (window.setAuthUIVisibility) {
        window.setAuthUIVisibility(true, false);
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

// Add this new function to handle player list updates without showing game data
function handlePlayerListUpdate(playerList) {
    if (!gameInProgress) {
        // Clear any existing scoreboard
        elements.scoreBoard.innerHTML = '';
        
        // Clear the player list if we're not in a lobby
        elements.playerList.innerHTML = '';
        
        // Only show player list if we're in a lobby
        if (currentLobbyId) {
            if (Array.isArray(playerList)) {
                updatePlayerList(playerList);
            } else {
                console.error('Invalid player list format:', playerList);
            }
        }
    }
}

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    initializeSocketEventHandlers();
    checkStylesOnLoad();
});