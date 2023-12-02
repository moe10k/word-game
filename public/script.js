// Connect to the server using Socket.IO
const socket = io();

// Retrieve HTML elements for game interaction
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
    //readinessFraction: document.getElementById('readinessFraction'),
    playerList: document.getElementById('playerList')
};

let myUsername = null; // Variable to store the player's username
let isGameOver = false; // Global variable to track the game over state
let gameInProgress = false;


function initializeEventListeners() {
    elements.readyButton.addEventListener('click', handleReadyClick);
    elements.joinGameButton.addEventListener('click', handleJoinGameClick);
    elements.wordGuess.addEventListener('input', handleWordGuessInput);
    elements.wordGuess.addEventListener('keypress', function(event) {// Add 'keypress' event listener to the wordGuess input field
        if (event.key === 'Enter') {  // Check if the pressed key is Enter
            handleSubmitGuessClick();  // Call the submit guess function
            event.preventDefault();    // Prevent default form submission behavior
        }
    });
    elements.submitGuess.addEventListener('click', handleSubmitGuessClick);
}


function initializeSocketEventHandlers() {
    socket.on('playerTyping', handlePlayerTyping);
    socket.on('usernameError', handleUsernameError);
    socket.on('gameUpdate', handleGameUpdate);
    socket.on('playerStatusUpdate', updatePlayerList);
    socket.on('gameOver', handleGameOver);
    socket.on('gameWin', handleGameWin);
    socket.on('invalidWord', (message) => alert(message));
    //socket.on('readinessUpdate', updateReadinessDisplay);
    socket.on('turnUpdate', (currentTurnUsername) => {
        const isMyTurn = myUsername === currentTurnUsername;
    
        // Enable or disable input and submit button based on the current turn
        elements.wordGuess.disabled = !isMyTurn;
        elements.submitGuess.disabled = !isMyTurn;
    
        // Update the turn display
        document.getElementById('currentTurn').textContent = currentTurnUsername;
    });
    socket.on('notYourTurn', () => {
        alert("It's not your turn!");
    });

    socket.on('typingCleared', () => {
        document.getElementById('globalTypingDisplay').textContent = '';
    });
    socket.on('gameInProgress', () => {
        alert('A game is currently in progress. Please wait for the next round.');
    });
    socket.on('actionBlocked', (message) => {
        alert(message);
    });
}



function updatePlayerList(playerStatus) {
    const playerListElement = elements.playerList;
    playerListElement.innerHTML = ''; // Clear existing list
    playerStatus.forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.textContent = `${player.name} - ${player.ready ? 'Ready' : 'Not Ready'}`;
        playerListElement.appendChild(playerElement); // Add each player to the list
    });
}


function updateScoreBoard(scores, lives) {
    scoreBoard.innerHTML = ''; // Clear existing scores

    for (const [username, score] of Object.entries(scores)) {
        const playerScoreElement = document.createElement('div');
        playerScoreElement.classList.add('player-score');
        playerScoreElement.id = `score_${username}`;

        // Create a container for the heart images (lives)
        const heartsContainer = document.createElement('div');
        heartsContainer.classList.add('hearts-container');
        const playerLives = lives[username] || 0; // Get the lives of the player

        // Add heart images for lives
        for (let i = 0; i < playerLives; i++) {
            const fullHeart = document.createElement('span');
            fullHeart.classList.add('heart', 'full-heart');
            heartsContainer.appendChild(fullHeart);
        }

        // Add empty hearts for the remaining lives
        for (let i = playerLives; i < 3; i++) {
            const emptyHeart = document.createElement('span');
            emptyHeart.classList.add('heart', 'empty-heart');
            heartsContainer.appendChild(emptyHeart);
        }

        // Append the hearts container (lives) first
        playerScoreElement.appendChild(heartsContainer);

        // Add the player's name
        const playerNameElement = document.createElement('span');
        playerNameElement.textContent = ` ${username}`;
        playerNameElement.classList.add('player-name');
        playerScoreElement.appendChild(playerNameElement);

        // Add the player's score
        const playerScoreText = document.createElement('span');
        playerScoreText.textContent = `: ${score}`;
        playerScoreElement.appendChild(playerScoreText);

        // Add a placeholder for typing status
        const typingStatus = document.createElement('div');
        typingStatus.id = `typingDisplay_${username}`;
        typingStatus.classList.add('typing-status');
        playerScoreElement.appendChild(typingStatus);

        // Add the player's score element to the scoreboard
        scoreBoard.appendChild(playerScoreElement);
    }
}

/*
function updateReadinessDisplay({ totalPlayers, readyPlayers }) {
    elements.readinessFraction.textContent = `${readyPlayers}/${totalPlayers}`;
}
*/

// Event Handling Functions
function handleReadyClick() {
    socket.emit('playerReady'); // Notify server that player is ready
    readyButton.disabled = true; // Disable the button after clicking
}

function handleJoinGameClick() {
    const username = elements.usernameInput.value.trim();
    if (gameInProgress) {
        alert('A game is currently in progress. Please wait for the next round.');
        return;
    }
    if (!username || username.length < 3 || username.length > 20) {
        alert('Invalid username. Must be 3-20 characters long.');
        return;
    }

    myUsername = username;
    socket.emit('setUsername', username);
    elements.joinGameButton.style.display = 'none';
    elements.readyButton.style.display = 'inline';
}

function handleWordGuessInput() {
    if (!isGameOver) { // Check if the game is not over
        const text = elements.wordGuess.value.trim();
        socket.emit('typing', { username: myUsername, text });
    }
}

function handleSubmitGuessClick() {
    socket.emit('guess', elements.wordGuess.value.trim());
    socket.emit('clearTyping'); // This line should be added
    elements.wordGuess.value = '';
}

function handlePlayerTyping({ username, text }) {
    const typingDisplayElement = document.getElementById('globalTypingDisplay');
    if (text) {
        typingDisplayElement.textContent = `${username} is typing: ${text}`;
    } else {
        typingDisplayElement.textContent = ''; // Clear the text if there's no typing
    }
}

function handleUsernameError(message) {
    alert(message); // Show error message to the user
    elements.joinGameButton.style.display = 'inline'; // Show the "Join Game" button again
    elements.readyButton.style.display = 'none'; // Hide the "Ready" button
    elements.usernameInput.value = ''; // Optionally clear the username input
}

function handleGameUpdate(data) {
    gameInProgress = data.gameStarted;
    if (data.gameStarted) {
        elements.gameScreen.style.display = 'block'; // Display the game screen
        elements.usernameScreen.style.display = 'none'; // Optionally, hide the username screen
    }
    elements.letterDisplay.textContent = data.letters; // Display current letters for guessing
    updateScoreBoard(data.scores, data.lives); // Update scoreboard with scores and lives
}

function handleGameOver() {
    alert('You have lost all your lives!');
    elements.wordGuess.disabled = true;
    elements.submitGuess.disabled = true;
    isGameOver = true; // Set the game over flag
}

function handleGameWin(winnerUsername) {
    elements.wordGuess.disabled = true;
    elements.submitGuess.disabled = true;
    // Set the winner's name in the modal
    document.getElementById('winnerName').textContent = winnerUsername;

    // Display the modal
    var modal = document.getElementById('winnerModal');
    modal.style.display = "block";

    
    /*
    // When the user clicks on <span> (x), close the modal
    document.getElementsByClassName("close")[0].onclick = function() {
        modal.style.display = "none";
    }
    
    // When the user clicks anywhere outside of the modal, close it
    window.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    }
    */

    //starts reset process when reset button clicked
    document.getElementById('resetGame').addEventListener('click', function() {
        socket.emit('resetGameRequest'); // Notify the server to reset the game
        resetFrontendUI(); // Reset the frontend UI
    });
}

function resetFrontendUI() {
    gameInProgress = false;
    elements.wordGuess.disabled = false;
    elements.submitGuess.disabled = false;

    // Hide the game screen and modal, show the username screen
    document.getElementById('game').style.display = 'none';
    document.getElementById('winnerModal').style.display = 'none';
    document.getElementById('usernameScreen').style.display = 'block';

    // Reset input fields
    document.getElementById('usernameInput').value = '';
    document.getElementById('wordGuess').value = '';

    // Reset buttons and other interactive elements
    document.getElementById('joinGame').style.display = 'inline';
    document.getElementById('readyButton').style.display = 'none';
    document.getElementById('readyButton').disabled = false;
    document.getElementById('submitGuess').disabled = false;

    // Clear dynamic content (e.g., player list, scores, typing status)
    document.getElementById('playerList').innerHTML = '';
    document.getElementById('scoreBoard').innerHTML = '';
    document.getElementById('playerTypingStatus').innerHTML = '';
    document.getElementById('livesDisplay').innerHTML = '';

    // Reset any other game-specific UI elements
    // For example, resetting the letter display or player statuses
    document.getElementById('letterDisplay').textContent = '';
    document.getElementById('player-statuses').innerHTML = '';
    document.getElementById('globalTypingDisplay').innerHTML = '';

    // Add any additional UI reset logic specific to your game
}


initializeEventListeners();
initializeSocketEventHandlers();