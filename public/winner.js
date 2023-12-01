// winner.js
(function() {
    const params = new URLSearchParams(window.location.search);
    const winnerName = params.get('name'); // Assuming the winner's name is passed as a URL parameter

    if (winnerName) {
        document.getElementById('winnerName').textContent = `${winnerName} wins!`;
    } else {
        // Handle the case where there is no winner name provided
        document.getElementById('winnerName').textContent = "No winner detected!";
    }
})();
