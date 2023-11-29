// Connect to the server using Socket.IO
const socket = io();

// Retrieve HTML elements for game interaction
const usernameScreen = document.getElementById('usernameScreen');
const usernameInput = document.getElementById('usernameInput');
const joinGameButton = document.getElementById('joinGame');
const gameScreen = document.getElementById('game');

// Elements for displaying game data
const letterDisplay = document.getElementById('letterDisplay');
const wordGuess = document.getElementById('wordGuess');
const submitGuess = document.getElementById('submitGuess');
const scoreBoard = document.getElementById('scoreBoard'); // Add this element in your HTML
const readyButton = document.getElementById('readyButton'); // Add this element in your HTML

let myUsername = null; // Variable to store the player's username

// Handle "Ready" button click
readyButton.addEventListener('click', () => {
    socket.emit('playerReady'); // Notify server that player is ready
    readyButton.disabled = true; // Disable the button after clicking
});

// Handle "Join Game" button click
joinGameButton.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (username) {
        myUsername = username; // Store the username
        socket.emit('setUsername', username); // Send username to server
        joinGameButton.style.display = 'none'; // Hide the "Join Game" button
        readyButton.style.display = 'inline'; // Show the "Ready" button
    } else {
        alert('Please enter a username.'); // Alert if username is empty
    }
});

// Handle username error event from server
socket.on('usernameError', (message) => {
    alert(message); // Show error message to the user
    joinGameButton.style.display = 'inline'; // Show the "Join Game" button again
    readyButton.style.display = 'none'; // Hide the "Ready" button
    usernameInput.value = ''; // Optionally clear the username input
});

// Handle "Submit Guess" button click
submitGuess.addEventListener('click', () => {
    socket.emit('guess', wordGuess.value.trim()); // Send guess to server
    wordGuess.value = ''; // Clear input field
});

// Handle game updates from server
socket.on('gameUpdate', data => {
    if (data.gameStarted) {
        gameScreen.style.display = 'block'; // Display the game screen
        usernameScreen.style.display = 'none'; // Optionally, hide the username screen
    }
    letterDisplay.textContent = data.letters; // Display current letters for guessing
    updateScoreBoard(data.scores, data.lives); // Now also passing the lives data
    updateLivesDisplay(data.lives);
});

// Update the score board with current scores
function updateScoreBoard(scores, lives) {
    scoreBoard.innerHTML = ''; // Clear existing scores
    for (const [username, score] of Object.entries(scores)) {
        const scoreElement = document.createElement('div');
        const playerLives = lives[username] || 0; // Get the lives of the player, defaulting to 0 if not found
        scoreElement.textContent = `${username}: ${score} (Lives: ${playerLives})`; // Display username, score, and lives
        scoreBoard.appendChild(scoreElement); // Add to score board
    }
}

// Listen for player status update from server
socket.on('playerStatusUpdate', (playerStatus) => {
    updatePlayerList(playerStatus); // Update player list UI
});

function updateLivesDisplay(lives) {
    // Update the UI to show the remaining lives
    // This assumes you have an element to display lives
    const livesElement = document.getElementById('livesDisplay');
    livesElement.textContent = `Lives: ${lives[socket.id] || 0}`;
}



socket.on('gameOver', () => {
    alert('You have lost all your lives!');
    wordGuess.disabled = true;
    submitGuess.disabled = true;
    // Additional handling for game over state
});

socket.on('gameWin', (winnerUsername) => {
    if (myUsername === winnerUsername) {
        alert('You won!');
    } else {
        alert(`${winnerUsername} has won the game!`);
    }
    wordGuess.disabled = true;
    submitGuess.disabled = true;
});


// Update UI with player status
function updatePlayerList(playerStatus) {
    const playerListElement = document.getElementById('playerList');
    playerListElement.innerHTML = ''; // Clear existing list
    playerStatus.forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.textContent = `${player.name} - ${player.ready ? 'Ready' : 'Not Ready'}`;
        playerListElement.appendChild(playerElement); // Add each player to the list
    });
}
