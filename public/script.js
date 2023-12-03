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
    playerTypingStatus: document.getElementById('playerTypingStatus'),
    playerList: document.getElementById('playerList')
};

let myUsername = null;
let isGameOver = false;
let gameInProgress = false;

function initializeEventListeners() {
    elements.readyButton.addEventListener('click', handleReadyClick);
    elements.joinGameButton.addEventListener('click', handleJoinGameClick);
    elements.wordGuess.addEventListener('input', handleWordGuessInput);
    elements.wordGuess.addEventListener('keypress', handleWordGuessKeypress);
    elements.submitGuess.addEventListener('click', handleSubmitGuessClick);
}

function initializeSocketEventHandlers() {
    socket.on('playerTyping', handlePlayerTyping);
    socket.on('usernameError', handleUsernameError);
    socket.on('gameUpdate', handleGameUpdate);
    socket.on('playerStatusUpdate', updatePlayerList);
    socket.on('gameOver', handleGameOver);
    socket.on('gameWin', handleGameWin);
    socket.on('invalidWord', showMessage);
    socket.on('notYourTurn', () => showMessage("It's not your turn!"));
    socket.on('gameInProgress', () => showMessage('A game is currently in progress. Please wait for the next round.'));
    socket.on('actionBlocked', showMessage);
    socket.on('turnUpdate', handleTurnUpdate);
    socket.on('typingCleared', clearGlobalTypingDisplay);
}

function updatePlayerList(playerStatus) {
    const playerListElement = elements.playerList;
    playerListElement.innerHTML = '';
    playerStatus.forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.textContent = `${player.name} - ${player.ready ? 'Ready' : 'Not Ready'}`;
        playerListElement.appendChild(playerElement);
    });
}

function updateScoreBoard(scores, lives) {
    scoreBoard.innerHTML = '';
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
    socket.emit('playerReady');
    readyButton.disabled = true;
}

function handleJoinGameClick() {
    const username = elements.usernameInput.value.trim();
    if (gameInProgress) {
        showMessage('A game is currently in progress. Please wait for the next round.');
        return;
    }
    if (!username || username.length < 3 || username.length > 20) {
        showMessage('Invalid username. Must be 3-20 characters long.');
        return;
    }
    myUsername = username;
    socket.emit('setUsername', username);
    elements.joinGameButton.style.display = 'none';
    elements.readyButton.style.display = 'inline';
}

function handleWordGuessInput() {
    if (!isGameOver) {
        const text = elements.wordGuess.value.trim();
        socket.emit('typing', { username: myUsername, text });
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
    elements.joinGameButton.style.display = 'inline';
    elements.readyButton.style.display = 'none';
    elements.usernameInput.value = '';
}

function handleGameUpdate(data) {
    gameInProgress = data.gameStarted;
    if (data.gameStarted) {
        elements.gameScreen.style.display = 'block';
        elements.usernameScreen.style.display = 'none';
    }
    elements.letterDisplay.textContent = data.letters;
    updateScoreBoard(data.scores, data.lives);
}

function handleGameOver() {
    showMessage('You have lost all your lives!');
    elements.wordGuess.disabled = true;
    elements.submitGuess.disabled = true;
    isGameOver = true;
}

function handleGameWin(winnerUsername) {
    elements.wordGuess.disabled = true;
    elements.submitGuess.disabled = true;
    document.getElementById('winnerName').textContent = winnerUsername;
    var modal = document.getElementById('winnerModal');
    modal.style.display = "block";
    document.getElementById('resetGame').addEventListener('click', function() {
        socket.emit('resetGameRequest');
        resetFrontendUI();
    });
}

function handleTurnUpdate(currentTurnUsername) {
    const isMyTurn = myUsername === currentTurnUsername;
    elements.wordGuess.disabled = !isMyTurn;
    elements.submitGuess.disabled = !isMyTurn;
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

function showMessage(message) {
    const messageBox = document.getElementById('messageBox');
    messageBox.innerText = message;
    messageBox.style.display = 'block';
    setTimeout(() => messageBox.style.display = 'none', 3000);
}

function resetFrontendUI() {
    isGameOver = false;
    gameInProgress = false;
    elements.wordGuess.disabled = false;
    elements.submitGuess.disabled = false;
    document.getElementById('game').style.display = 'none';
    document.getElementById('winnerModal').style.display = 'none';
    document.getElementById('usernameScreen').style.display = 'block';
    document.getElementById('usernameInput').value = '';
    document.getElementById('wordGuess').value = '';
    document.getElementById('joinGame').style.display = 'inline';
    document.getElementById('readyButton').style.display = 'none';
    document.getElementById('readyButton').disabled = false;
    document.getElementById('submitGuess').disabled = false;
    document.getElementById('playerList').innerHTML = '';
    document.getElementById('scoreBoard').innerHTML = '';
    document.getElementById('playerTypingStatus').innerHTML = '';
    document.getElementById('livesDisplay').innerHTML = '';
    document.getElementById('letterDisplay').textContent = '';
    document.getElementById('player-statuses').innerHTML = '';
    document.getElementById('globalTypingDisplay').innerHTML = '';
}

initializeEventListeners();
initializeSocketEventHandlers();