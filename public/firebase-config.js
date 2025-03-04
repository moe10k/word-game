// Firebase configuration - load from server
let firebaseConfig = {};

// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Initialize variables that will be populated after config is loaded
let app;
let auth;
let provider = new GoogleAuthProvider();

// Fetch the Firebase configuration from the server
async function initializeFirebase() {
  try {
    const response = await fetch('/api/firebase-config');
    firebaseConfig = await response.json();
    
    // Initialize Firebase with the fetched config
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    
    // Dispatch event to notify app that Firebase is ready
    document.dispatchEvent(new Event('firebaseReady'));
  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
}

// Start initialization
initializeFirebase();

// Export auth functionality
export {
  auth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  provider
}; 