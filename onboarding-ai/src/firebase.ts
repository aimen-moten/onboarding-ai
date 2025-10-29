import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// Firebase configuration
// Note: Replace these with your actual Firebase config values or use environment variables
const firebaseConfig = {
  apiKey: "AIzaSyDp9mYhX1rDwMbt4IX9Xllfd1n8qmxZrO4",
  authDomain: "onboardingai-47ab3.firebaseapp.com",
  projectId: "onboardingai-47ab3",
  storageBucket: "onboardingai-47ab3.appspot.com",
  messagingSenderId: "808599523111",
  appId: "1:808599523111:web:8fba86da6bf8326fcbe302"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');
googleProvider.addScope("https://www.googleapis.com/auth/drive.readonly");
googleProvider.addScope("https://www.googleapis.com/auth/drive.file");
// Set custom parameters for popup authentication
googleProvider.setCustomParameters({
  prompt: 'consent', // Ensure consent screen is shown to get refresh token
  access_type: 'offline', // CRITICAL: Request a refresh token
  select_account: 'true', // Ensure user can select account
});

export default app;