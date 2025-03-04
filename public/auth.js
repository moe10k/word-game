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

// Wait for Firebase to be initialized
document.addEventListener('firebaseReady', () => {
  initializeAuthListeners();
});

// Initialize auth listeners after Firebase is ready
function initializeAuthListeners() {
  // Listen for auth state changes
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // User is signed in
      authOverlay.style.display = 'none';
      
      // Update profile UI
      profileName.textContent = user.displayName || 'Anonymous User';
      signOutBtn.style.display = 'block';
      
      // Pre-fill username input if available
      if (usernameInput && user.displayName) {
        usernameInput.value = user.displayName;
      }
    } else {
      // User is signed out
      authOverlay.style.display = 'flex';
      profileName.textContent = '';
      signOutBtn.style.display = 'none';
    }
  });

  // Google Sign In
  googleSignInBtn.addEventListener('click', () => {
    signInWithPopup(auth, provider)
      .then((result) => {
        // This gives you a Google Access Token
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const user = result.user;
        console.log('User signed in:', user.displayName);

        // Send user info to server for potential persistence
        if (window.socket) {
          window.socket.emit('userAuthenticated', {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL
          });
        }
      })
      .catch((error) => {
        console.error('Sign in error:', error.message);
      });
  });

  // Guest Sign In
  guestSignInBtn.addEventListener('click', () => {
    // Hide the auth overlay
    authOverlay.style.display = 'none';
    
    // Update profile UI for guest users
    profileName.textContent = 'Guest User';
    
    // Don't pre-fill username input for guests
    if (usernameInput) {
      usernameInput.value = '';
      usernameInput.focus();
    }
  });

  // Sign Out
  signOutBtn.addEventListener('click', () => {
    signOut(auth)
      .then(() => {
        console.log('User signed out');
        // Notify server about sign out if needed
        if (window.socket) {
          window.socket.emit('userSignedOut');
        }
      })
      .catch((error) => {
        console.error('Sign out error:', error);
      });
  });
}

// Export auth state for use in other modules
export const getCurrentUser = () => {
  return auth.currentUser;
}; 