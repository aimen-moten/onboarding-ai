import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import notionRoutes from './routes/notion.js';
import driveRoutes from './routes/drive.js';
import { runCourseGenerator, adminDb } from './firebaseServer';

const app = express();
const PORT = process.env.PORT || 3001;

// ----------------- Middleware -----------------
app.use(cors());
app.use(express.json());

// ----------------- Routes -----------------
app.use('/api/notion', notionRoutes);
app.use('/api/drive', driveRoutes);

app.get('/api/courses', async (req, res) => {
  try {
    if (!adminDb) throw new Error('Firestore not initialized.');

    const coursesRef = adminDb.collection('courses');
    const snapshot = await coursesRef.get();
    
    const coursesPromises = snapshot.docs.map(async doc => {
      const courseData = doc.data();
      const categoryIds = courseData.category_ids || []; // Assuming category_ids is the field name
      
      const categoryTitlesPromises = categoryIds.map(async (categoryId: string) => {
        const categoryDoc = await adminDb.collection('categories').doc(categoryId).get();
        return categoryDoc.exists ? categoryDoc.data()?.title : null;
      });

      const categoryTitles = (await Promise.all(categoryTitlesPromises)).filter(Boolean); // Filter out nulls

      return {
        id: doc.id,
        title: courseData.title,
        categories: categoryTitles, // Return actual category titles
      };
    });

    const courses = await Promise.all(coursesPromises);
    res.json({ success: true, courses });
  } catch (error: any) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Internal server error. Failed to fetch courses.' });
  }
});

/**
 * 💡 FIX: Querying the top-level 'quizzes' collection and filtering by courseId.
 * It ensures 'question', 'choices', and 'correct_answer' are returned.
 */
app.get('/api/quizzes', async (req, res) => {
  try {
    if (!adminDb) throw new Error('Firestore not initialized.');

    const { courseId } = req.query;
    if (!courseId || typeof courseId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid courseId parameter.' });
    }

    // Correctly query the top-level 'quizzes' collection
    const quizzesRef = adminDb.collection('quizzes').where('courseId', '==', courseId);
    const snapshot = await quizzesRef.get();
    
    const quizzes = snapshot.docs.map(doc => {
      const data = doc.data();
      // Ensure all required fields are mapped
      return {
        id: doc.id,
        courseId: data.courseId,
        question: data.question,
        choices: data.choices, // Assumes choices is an array of strings
        correct_answer: data.correct_answer, // The string that matches the correct choice
      };
    });
    
    res.json({ success: true, quizzes });
  } catch (error: any) {
    console.error('Error fetching quizzes:', error);
    res.status(500).json({ error: 'Internal server error. Failed to fetch quizzes.' });
  }
});

app.post('/api/drive/import-metadata', async (req, res) => {
  const { userId, fileId, fileName, mimeType, accessToken, source } = req.body;
  if (!userId || !fileId || !accessToken) return res.status(400).json({ error: 'Missing required data for file import.' });

  try {
    if (!adminDb) throw new Error('Firestore not initialized.');

    const docRef = adminDb.collection('drive_imports').doc(fileId);
    await docRef.set({
      fileId,
      fileName,
      mimeType,
      source,
      userId,
      accessToken,
      status: 'PENDING_AI',
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
    const result = await runCourseGenerator({ userId }); // send input matching your Genkit schema

    console.log('comes back')
    console.log(result);

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
    firebase: adminDb ? 'connected' : 'not configured'
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