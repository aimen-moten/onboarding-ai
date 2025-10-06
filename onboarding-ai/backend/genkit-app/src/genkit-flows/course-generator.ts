import 'dotenv/config'; // Load environment variables from .env file
// src/genkit-flows/course-generator.ts
import { googleAI } from '@genkit-ai/google-genai';
import { defineFlow, z } from '@genkit-ai/core';
import { generate } from '@genkit-ai/ai';
import { google } from 'googleapis';
import firebaseAdmin from 'firebase-admin'; // Ensure Firebase Admin is imported/configured
import { pdf } from 'pdf-parse';
import { ai } from '../genkit-config';
// The Genkit 'ai' instance is initialized in src/index.ts

// Initialize Firebase Admin if not done globally (adjust path as needed)
if (!firebaseAdmin.apps || firebaseAdmin.apps.length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
        throw new Error('Missing Firebase service account environment variables.');
    }

    firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
        }),
    });
}
const db = firebaseAdmin.firestore();

// 1. Define the input schema for the flow (it takes no input, as it queries the DB)
const CourseGeneratorInputSchema = z.object({});
const CourseGeneratorOutputSchema = z.string().describe("A summary of all processed documents.");


export const generateCourseFlow = ai.defineFlow(
  {
    name: 'generateCourse',
    inputSchema: CourseGeneratorInputSchema,
    outputSchema: CourseGeneratorOutputSchema,
  },
  async () => {
    
    // --- STEP 1: Fetch Metadata from Firestore ---
    const docsSnapshot = await db.collection('drive_imports')
      .where('status', '==', 'PENDING_AI')
      .get();

    if (docsSnapshot.empty) {
      return 'No pending documents found for processing.';
    }

    const allContent = [];

    for (const doc of docsSnapshot.docs) {
      const metadata = doc.data();
      const { fileId, fileName, mimeType, accessToken } = metadata;

      // --- STEP 2: Main Agent (Content Fetching and Parsing) ---
      let fileText = `[File: ${fileName} - ${mimeType}]`;

      try {
        // Initialize Google Drive Client using the user's ephemeral accessToken
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: 'v3', auth });

        // CRITICAL: Download the content based on MIME type
        if (mimeType.includes('pdf') || mimeType.includes('openxmlformats')) {
          // Case 1: Binary Files (PDF, PPTX, DOCX) - Use alt='media'
          const response = await drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'arraybuffer' }
          );

          const buffer = Buffer.from(response.data as ArrayBuffer);

          if (mimeType.includes('pdf')) {
            // Parse PDF text
            const parsed = await pdf(buffer);
            fileText = parsed.text;
          } else {
            // For DOCX/PPTX, simpler buffer-to-string often works best for rough text extraction
            fileText = buffer.toString('utf8'); 
          }
        
        } else if (mimeType.includes('google-apps.presentation') || mimeType.includes('google-apps.document')) {
           // Case 2: Google Native Files (Docs, Slides) - Use files.export
           const response = await drive.files.export(
             { fileId: fileId, mimeType: 'text/plain' },
             { responseType: 'arraybuffer' }
           );
           fileText = Buffer.from(response.data as ArrayBuffer).toString('utf8');

        } else {
          // Catch-all for plain text, etc.
          fileText = `Could not process file type for ${fileName}.`;
        }

        // Store content for AI prompt
        allContent.push(`--- FILE START: ${fileName} ---\n${fileText}\n--- FILE END ---\n`);
        
        // Update status in Firestore
        await doc.ref.update({ status: 'PROCESSING', processedAt: new Date() });

      } catch (e: any) {
        console.error(`Error processing file ${fileId}:`, e.message);
        await doc.ref.update({ status: 'ERROR', error: e.message });
      }
    }
    
    // --- STEP 3: Simple AI Processing (One-Line Summary) ---
    const combinedPrompt = 
      `The following is a collection of documents imported for HR onboarding. 
      Please provide a single, one-line summary of the combined content:
      
      DOCUMENTS:
      ${allContent.join('\n\n')}`;

    const llmResponse = await ai.generate({
      model: googleAI.model('gemini-2.5-flash'),
      prompt: combinedPrompt,
      config: {
        temperature: 0.3,
      },
    });

    return llmResponse.text;
  },
);