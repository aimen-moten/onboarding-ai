console.log('FUNCTIONS_EMULATOR_HOST:', process.env.FUNCTIONS_EMULATOR_HOST);

import admin from 'firebase-admin';
import { initializeApp as clientInitializeApp } from 'firebase/app';
import { getFunctions as getClientFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';

// ---- ADMIN SDK (for Firestore access & service account auth) ----
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
  });
}
export const adminDb = admin.firestore();

// ---- CLIENT SDK (for calling callable functions from server) ----
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const clientApp = clientInitializeApp(firebaseConfig);
export const clientFunctions = getClientFunctions(clientApp);

// Connect to emulator if needed, synchronously if possible
if (process.env.FUNCTIONS_EMULATOR_HOST) {
  const [host, port] = process.env.FUNCTIONS_EMULATOR_HOST.split(':');
  connectFunctionsEmulator(clientFunctions, host, Number(port));
}

// Helper to call your Genkit function
export const runCourseGenerator = httpsCallable(clientFunctions, 'courseGenerator');