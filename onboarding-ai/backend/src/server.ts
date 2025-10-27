import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables as early as possible
dotenv.config();

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import notionRoutes from './routes/notion.js';
import driveRoutes from './routes/drive';
import { courseGenerator } from '../genkit-app/src/genkit-flows/course-generator.js';


const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin (optional for development)
let db: any = null;

if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
  try {
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
    };

    initializeApp({
      credential: cert(serviceAccount as any),
      projectId: process.env.FIREBASE_PROJECT_ID
    });
    
    db = getFirestore();
    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error);
    console.log('⚠️  Running without Firebase - some features will be limited');
  }
} else {
  console.log('⚠️  Firebase credentials not found - running without Firebase');
}

export { db };

// Routes
app.use('/api/notion', notionRoutes);
app.use('/api/drive', driveRoutes);

app.post('/api/drive/import-metadata', async (req, res) => {
  const { userId, fileId, fileName, mimeType, accessToken, source } = req.body;

  if (!userId || !fileId || !accessToken) {
    return res.status(400).json({ error: 'Missing required data for file import.' });
  }
  
  try {
    if (!db) {
        throw new Error("Firestore not initialized.");
    }
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


app.post('/api/course/start-generation', async (req, res) => {
    const { userId } = req.body;
    console.log('HITS HERE!');
    if (!userId) {
        return res.status(400).json({ error: 'Missing userId to initiate course generation.' });
    }
    
    try {
        console.log(`Attempting to trigger Genkit flow`);
        
        const genkitResponse = await courseGenerator.run({
            data: {} // Empty object input matches your z.object({}) schema
        }); 

        res.json({
            success: true,
            message: '✅ AI Course generation pipeline started successfully. Check logs for progress.',
            output: genkitResponse, // Optionally return the output of the Genkit flow
        });

    } catch (error) {
        console.error('Error calling Genkit server:', error);
        res.status(500).json({ error: 'Internal server error. Could not connect to Genkit service.' });
    }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Test route is working!' });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Backend server is running',
    firebase: db ? 'connected' : 'not configured'
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

console.log("✅ Notion routes mounted at /api/notion");

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
