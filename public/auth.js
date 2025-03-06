// auth.js - Manages Firebase authentication

import { 
  auth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  provider 
} from './firebase-config.js';

// DOM Elements
const authOverlay = document.getElementById('authOverlay');
const googleSignInBtn = document.getElementById('googleSignIn');
const guestSignInBtn = document.getElementById('guestSignIn');
const signOutBtn = document.getElementById('signOutBtn');
const profileName = document.getElementById('profileName');
const usernameInput = document.getElementById('usernameInput');

// Track if user is a guest
let isGuestUser = false;
window.isGuestUser = false;  // Expose to window for script.js

// Track authentication state
let isAuthenticated = false;

// Function to check if user is authenticated
function isUserAuthenticated() {
    const currentUser = auth.currentUser;
    isAuthenticated = currentUser !== null && !isGuestUser;
    console.log('Auth check - Current user:', currentUser?.email, 'Guest:', isGuestUser, 'Is authenticated:', isAuthenticated);
    return isAuthenticated;
}

// Expose authentication check to window
window.isUserAuthenticated = isUserAuthenticated;

// Function to control auth UI visibility
function setAuthUIVisibility(show, isGameInProgress = false) {
    if (isGameInProgress) {
        // During game, hide all auth-related UI
        authOverlay.style.display = 'none';
        signOutBtn.style.display = 'none';
        if (googleSignInBtn) googleSignInBtn.style.display = 'none';
        if (guestSignInBtn) guestSignInBtn.style.display = 'none';
    } else {
        // Outside of game, show appropriate auth UI
        if (auth.currentUser) {
            // Logged in with Google
            authOverlay.style.display = 'none';
            signOutBtn.style.display = 'block';
            if (googleSignInBtn) googleSignInBtn.style.display = 'none';
            if (guestSignInBtn) guestSignInBtn.style.display = 'none';
        } else if (isGuestUser) {
            // Guest user
            authOverlay.style.display = 'none';
            signOutBtn.style.display = 'block';
            signOutBtn.textContent = 'Sign In';
            signOutBtn.classList.add('sign-in');
        } else {
            // Not logged in at all
            authOverlay.style.display = 'flex';
            signOutBtn.style.display = 'none';
            if (googleSignInBtn) googleSignInBtn.style.display = 'block';
            if (guestSignInBtn) guestSignInBtn.style.display = 'block';
        }
    }
}

// Expose the function to window object
window.setAuthUIVisibility = setAuthUIVisibility;

// Initialize Firebase auth state
function initializeFirebaseAuth() {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                isAuthenticated = true;
                isGuestUser = false;
                window.isGuestUser = false;
                console.log('Firebase Auth State: User is signed in', user.email);
            } else {
                isAuthenticated = false;
                console.log('Firebase Auth State: User is signed out');
            }
            unsubscribe();
            resolve(user);
        });
    });
}

// Wait for Firebase to be initialized
document.addEventListener('firebaseReady', async () => {
    // Initialize Firebase auth state first
    await initializeFirebaseAuth();
    console.log('Firebase Auth initialized, current auth state:', isAuthenticated);
    
    // Then initialize auth listeners
    initializeAuthListeners();
});

// Initialize auth listeners after Firebase is ready
function initializeAuthListeners() {
    // Listen for auth state changes
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in
            isAuthenticated = true;
            isGuestUser = false;
            window.isGuestUser = false;
            
            profileName.textContent = user.displayName || 'Anonymous User';
            signOutBtn.textContent = 'Sign Out';
            signOutBtn.classList.remove('sign-in');
            
            // Pre-fill username input if available
            if (usernameInput && user.displayName) {
                usernameInput.value = user.displayName;
            }
            
            console.log('Auth state changed: User signed in', user.email);
            
            // Check if game is in progress before showing sign out button
            if (window.gameInProgress) {
                signOutBtn.style.display = 'none';
            }

            // Update leaderboard if available
            if (window.leaderboard) {
                window.leaderboard.updateLeaderboardDisplay();
            }
        } else {
            // User is signed out
            isAuthenticated = false;
            
            profileName.textContent = '';
            signOutBtn.textContent = 'Sign Out';
            signOutBtn.classList.remove('sign-in');
            
            console.log('Auth state changed: User signed out');
            
            // Clear any stored username
            try {
                localStorage.removeItem('letterGuessGameUsername');
            } catch (e) {
                console.warn('Could not clear username from localStorage', e);
            }

            // Update leaderboard if available
            if (window.leaderboard) {
                window.leaderboard.updateLeaderboardDisplay();
            }
        }
        
        // Update UI visibility based on game state
        setAuthUIVisibility(true);
    });

    // Google Sign In
    googleSignInBtn.addEventListener('click', () => {
        signInWithPopup(auth, provider)
            .then((result) => {
                // This gives you a Google Access Token
                const credential = GoogleAuthProvider.credentialFromResult(result);
                const user = result.user;
                console.log('User signed in:', user.displayName);
                isAuthenticated = true;
                isGuestUser = false;
                window.isGuestUser = false;

                // Update sign out button state
                signOutBtn.textContent = 'Sign Out';
                signOutBtn.classList.remove('sign-in');
                signOutBtn.style.display = 'block';

                // Send user info to server for potential persistence
                if (window.socket) {
                    window.socket.emit('userAuthenticated', {
                        uid: user.uid,
                        displayName: user.displayName,
                        email: user.email,
                        photoURL: user.photoURL
                    });
                }

                // Update leaderboard if available
                if (window.leaderboard) {
                    window.leaderboard.updateLeaderboardDisplay();
                }
            })
            .catch((error) => {
                console.error('Sign in error:', error.message);
                isAuthenticated = false;
            });
    });

    // Guest Sign In
    guestSignInBtn.addEventListener('click', () => {
        // Set guest state
        isGuestUser = true;
        window.isGuestUser = true;
        isAuthenticated = false;
        
        // Hide the auth overlay
        authOverlay.style.display = 'none';
        
        // Update profile UI for guest users
        profileName.textContent = 'Guest User';
        signOutBtn.textContent = 'Sign In';  // Change button text
        signOutBtn.style.display = 'block';  // Show sign in button
        signOutBtn.classList.add('sign-in');  // Add sign-in class for styling
        
        // Don't pre-fill username input for guests
        if (usernameInput) {
            usernameInput.value = '';
            usernameInput.focus();
        }

        // Update leaderboard if available
        if (window.leaderboard) {
            window.leaderboard.updateLeaderboardDisplay();
        }
    });

    // Sign Out/Sign In Button Handler
    signOutBtn.addEventListener('click', () => {
        // Check if user is guest (button text is "Sign In")
        if (signOutBtn.textContent === 'Sign In') {
            // Just show the auth overlay again
            authOverlay.style.display = 'flex';
            return;
        }

        // For Google users, sign out from Firebase
        if (auth.currentUser) {
            signOut(auth)
                .then(() => {
                    console.log('User signed out from Google');
                    isAuthenticated = false;
                    isGuestUser = false;
                    window.isGuestUser = false;
                })
                .catch((error) => {
                    console.error('Sign out error:', error);
                });
        }

        // Common sign out actions
        authOverlay.style.display = 'flex';
        profileName.textContent = '';
        signOutBtn.textContent = 'Sign Out';  // Reset button text
        signOutBtn.style.display = 'none';
        signOutBtn.classList.remove('sign-in');  // Remove sign-in class

        // Reset username input and related elements
        if (usernameInput) {
            usernameInput.value = '';
            usernameInput.disabled = false;
        }

        // Reset UI elements
        const usernameScreen = document.getElementById('usernameScreen');
        const gameScreen = document.getElementById('game');
        const lobbyControls = document.getElementById('lobbyControls');
        const joinGameButton = document.getElementById('joinGame');
        const changeUsernameButton = document.getElementById('changeUsername');
        const lobbyCodeInput = document.getElementById('lobbyCodeInput');

        if (usernameScreen) usernameScreen.style.display = 'block';
        if (gameScreen) gameScreen.style.display = 'none';
        if (lobbyControls) lobbyControls.style.display = 'none';
        if (joinGameButton) joinGameButton.style.display = 'inline';
        if (changeUsernameButton) changeUsernameButton.style.display = 'none';
        if (lobbyCodeInput) lobbyCodeInput.value = '';

        // Notify server about sign out
        if (window.socket) {
            window.socket.emit('userSignedOut');
        }

        // Update leaderboard if available
        if (window.leaderboard) {
            window.leaderboard.updateLeaderboardDisplay();
        }
    });
}

// Export auth state for use in other modules
export const getCurrentUser = () => {
    return auth.currentUser;
};

// Export authentication status
export const getIsAuthenticated = () => {
    return isAuthenticated && !isGuestUser;
}; 