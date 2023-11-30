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
    if (!username || username.length < 3 || username.length > 20) {
        alert('Invalid username. Must be 3-20 characters long.');
        return;
    }

    if (username) {
        myUsername = username; // Store the username
        socket.emit('setUsername', username); // Send username to server
        joinGameButton.style.display = 'none'; // Hide the "Join Game" button
        readyButton.style.display = 'inline'; // Show the "Ready" button
    } else {
        alert('Please enter a username.'); // Alert if username is empty
    }
});


// When the player types in their guess
wordGuess.addEventListener('input', () => {
    const text = wordGuess.value.trim();
    // Emit the typing event with username and text
    socket.emit('typing', { username: myUsername, text });
});

// Handle incoming typing events
socket.on('playerTyping', ({ username, text }) => {
    let typingDisplayElement = document.getElementById(`typingDisplay_${username}`);
    if (!typingDisplayElement) {
        typingDisplayElement = document.createElement('div');
        typingDisplayElement.id = `typingDisplay_${username}`;
        document.getElementById('playerTypingStatus').appendChild(typingDisplayElement);
    }
    typingDisplayElement.textContent = `${username} is typing: ${text}`;
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
});


// Listen for player status update from server
socket.on('playerStatusUpdate', (playerStatus) => {
    updatePlayerList(playerStatus); // Update player list UI
});


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


socket.on('invalidWord', (message) => {
    alert(message); // Display the error message
});


socket.on('readinessUpdate', ({ totalPlayers, readyPlayers }) => {
    const readinessFraction = `${readyPlayers}/${totalPlayers}`;
    document.getElementById('readinessFraction').textContent = readinessFraction;
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



