import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Firebase Admin (for Firestore)
import { initializeApp as initializeAdminApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase Client SDK (for callable functions)
import { initializeApp as initializeClientApp } from 'firebase/app';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';

import notionRoutes from './routes/notion.js';
import driveRoutes from './routes/drive.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ----------------- Middleware -----------------
app.use(cors());
app.use(express.json());

// ----------------- Firebase Admin Setup -----------------
let db: any = null;

if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
  try {
    const serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/v1/certs',
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
    };

    initializeAdminApp({
      credential: cert(serviceAccount as any),
      projectId: process.env.FIREBASE_PROJECT_ID
    });

    db = getFirestore();
    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error);
    console.log('⚠️ Running without Firebase - some features will be limited');
  }
} else {
  console.log('⚠️ Firebase credentials not found - running without Firebase');
}

export { db };

// ----------------- Firebase Client SDK Setup -----------------
const firebaseClientConfig = {
  apiKey: 'fake-api-key', // dummy key for local Node usage
  authDomain: 'localhost',
  projectId: process.env.FIREBASE_PROJECT_ID
};

const clientApp = initializeClientApp(firebaseClientConfig);
const functions = getFunctions(clientApp);
connectFunctionsEmulator(functions, 'localhost', 5001); // Emulator port

// ----------------- Routes -----------------
app.use('/api/notion', notionRoutes);
app.use('/api/drive', driveRoutes);

app.post('/api/drive/import-metadata', async (req, res) => {
  const { userId, fileId, fileName, mimeType, accessToken, source } = req.body;
  if (!userId || !fileId || !accessToken) return res.status(400).json({ error: 'Missing required data for file import.' });

  try {
    if (!db) throw new Error('Firestore not initialized.');

    const docRef = db.collection('drive_imports').doc(fileId);
    await docRef.set({
      fileId,
      fileName,
      mimeType,
      source,
      userId,
      accessToken,
      status: 'READY_FOR_AI',
      timestamp: new Date(),
    });

    res.json({ success: true, message: `File metadata for ${fileName} saved.` });
  } catch (error: any) {
    console.error('Error saving metadata:', error);
    res.status(500).json({ error: 'Internal server error. Failed to save to DB.' });
  }
});

// ----------------- Course Generation Endpoint -----------------
app.post('/api/course/start-generation', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId to initiate course generation.' });

  try {
    console.log('Triggering Genkit flow via Firebase Emulator...');
    const runCourseGenerator = httpsCallable(getFunctions(), 'courseGenerator');
    const result = await runCourseGenerator({ userId }); // send input matching your Genkit schema

    res.json({
      success: true,
      message: '✅ AI Course generation pipeline started via emulator',
      output: result.data
    });
  } catch (err) {
    console.error('Error calling Genkit emulator function:', err);
    res.status(500).json({ error: 'Failed to call Genkit function' });
  }
});

// ----------------- Test & Health Check -----------------
app.get('/api/test', (req, res) => res.json({ message: 'Test route is working!' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Backend server is running',
    firebase: db ? 'connected' : 'not configured'
  });
});

// ----------------- Error Handling -----------------
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ----------------- Start Server -----------------
console.log('✅ Notion routes mounted at /api/notion');
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
