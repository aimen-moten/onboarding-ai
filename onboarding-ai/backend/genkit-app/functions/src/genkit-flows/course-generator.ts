import dotenv from 'dotenv';
dotenv.config({ path: '../../../.env' });
import { googleAI } from '@genkit-ai/google-genai';
import { z } from '@genkit-ai/core';
import { google } from 'googleapis';
import firebaseAdmin from 'firebase-admin';
import { pdf } from 'pdf-parse';
import { ai } from '../genkit-config';

// Environment variables for Google OAuth
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI; // Needed for OAuth2Client

// --- FIREBASE ADMIN INITIALIZATION ---
if (!firebaseAdmin.apps || firebaseAdmin.apps.length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
        // NOTE: This will crash the Genkit runtime if env vars are missing, which is correct.
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


// ----------------------------------------------------------------------
// 1. SCHEMAS: Define the structured outputs
// ----------------------------------------------------------------------

// Schema for a single MCQ question
const QuizSchema = z.object({
    question: z.string().describe("The multiple-choice question derived from the category content."),
    choices: z.array(z.string().max(100)).describe("List of 4 distinct possible answers."),
    correct_answer: z.string().describe("The exact text of the correct choice from the choices array."),
});

// Schema for a single content category, containing quizzes
const CategorySchema = z.object({
    category_title: z.string().describe("A concise title for the topic (e.g., 'Payroll & Expenses', 'Code Standards')."),
    quizzes: z.array(QuizSchema).describe("An array of 5 non-repetitive MCQ questions generated from the content in this category."),
});

// Schema for the final overall structured output
const CourseOutputSchema = z.object({
    course_title: z.string().describe("A title for the combined material, like 'General New Hire Onboarding'"),
    categories: z.array(CategorySchema).describe("An array of 3-4 primary categories derived from the documents."),
});

type CourseData = z.infer<typeof CourseOutputSchema>;

// ----------------------------------------------------------------------
// 2. HELPER FUNCTIONS (Internal Logic)
// ----------------------------------------------------------------------

/**
 * Helper function to refresh Google Drive access token.
 */
async function refreshGoogleDriveAccessToken(userId: string, currentRefreshToken: string): Promise<string | null> {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
        console.error('Missing Google OAuth environment variables for token refresh.');
        return null;
    }

    const oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
        refresh_token: currentRefreshToken,
    });

    try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        const newAccessToken = credentials.access_token;

        if (newAccessToken) {
            // Update the user_tokens collection with the new access token
            await db.collection('user_tokens').doc(userId).update({
                googleDriveAccessToken: newAccessToken,
                updatedAt: new Date(),
            });
            console.log(`✅ Refreshed access token for user ${userId}`);
            return newAccessToken;
        }
        return null;
    } catch (error: any) {
        console.error(`❌ Error refreshing access token for user ${userId}:`, error.message);
        return null;
    }
}

/**
 * Main Agent: Fetches all content from Drive imports and combines it into a single string.
 */
async function fetchAndCombineContent(): Promise<string> {
    const docsSnapshot = await db.collection('drive_imports')
        .where('status', 'in', ['PENDING_AI', 'READY_FOR_AI']) // Also consider READY_FOR_AI
        .get();

    if (docsSnapshot.empty) {
        return 'No pending documents found for processing.';
    }

    const allContent: string[] = [];

    for (const doc of docsSnapshot.docs) {
        const metadata = doc.data();
        let { fileId, fileName, mimeType, accessToken, userId } = metadata; // Get userId here

        let fileText = `[File: ${fileName} - ${mimeType}]`;

        try {
            // Attempt to refresh token if it's likely expired or if we have a refresh token
            const userTokensDoc = await db.collection('user_tokens').doc(userId).get();
            if (userTokensDoc.exists) {
                const userTokens = userTokensDoc.data();
                const refreshToken = userTokens?.googleDriveRefreshToken;

                if (refreshToken) {
                    const newAccessToken = await refreshGoogleDriveAccessToken(userId, refreshToken);
                    if (newAccessToken) {
                        accessToken = newAccessToken; // Use the new access token
                        // Update the drive_imports document with the new access token
                        await doc.ref.update({ accessToken: newAccessToken, status: 'READY_FOR_AI' });
                    } else {
                        // If refresh failed, mark the document with an error and skip
                        await doc.ref.update({ status: 'ERROR', error: 'Failed to refresh access token.' });
                        console.error(`Skipping file ${fileId} due to failed token refresh.`);
                        continue;
                    }
                }
            }

            // Initialize Google Drive Client using the (potentially new) accessToken
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

            // Update status in Firestore
            await doc.ref.update({ status: 'PROCESSING', processedAt: new Date() });

        } catch (e: any) {
            console.error(`Error processing file ${fileId}:`, e.message);
            await doc.ref.update({ status: 'ERROR', error: e.message });
            continue;
        }

        allContent.push(`--- FILE START: ${fileName} ---\n${fileText}\n--- FILE END ---\n`);
    }

    return allContent.join('\n\n');
}

/**
 * Final Persistence: Saves the structured course data to Firestore.
 */
async function saveCourseToFirestore(courseData: CourseData, pendingDocs: firebaseAdmin.firestore.QueryDocumentSnapshot[]) {
    if (pendingDocs.length === 0) {
        console.warn('No pending documents to associate with the course. Skipping Firestore save.');
        return;
    }
    const mainDoc = pendingDocs[0]; // Use the first document as the reference for the course ID
    const courseId = mainDoc!.id; // Use the document ID for stability

    // 1. Save the main Course metadata (update the existing document)
    await db.collection('courses').doc(courseId).set({
        title: courseData.course_title,
        source: 'Google Drive/Notion',
        status: 'READY',
        creatorId: mainDoc!.data().userId,
        createdAt: mainDoc!.data().timestamp,
        generatedAt: new Date(),
        category_ids: [],
    });

    // 2. Iterate through categories and save quizzes
    const categoryIds: string[] = [];
    
    for (const category of courseData.categories) {
        const categoryId = db.collection('categories').doc().id; // Auto-generate Category ID
        categoryIds.push(categoryId);

        // 2a. Save Category metadata
        await db.collection('categories').doc(categoryId).set({
            courseId: courseId,
            title: category.category_title,
            quiz_count: category.quizzes.length,
            createdAt: new Date(),
        });
        
        // 2b. Save Quizzes using a batch write for efficiency
        const batch = db.batch();
        const quizCollection = db.collection('quizzes'); 
        
        for (const quiz of category.quizzes) {
            const quizRef = quizCollection.doc();
            batch.set(quizRef, {
                ...quiz,
                categoryId: categoryId,
                courseId: courseId,
                createdAt: new Date(),
            });
        }
        
        await batch.commit();
    }
    
    // 3. Update the main course document with category references
    await db.collection('courses').doc(courseId).update({
        category_ids: categoryIds,
    });

    // 4. Clean up pending documents (set status to complete)
    const cleanupBatch = db.batch();
    pendingDocs.forEach(doc => {
        cleanupBatch.update(doc.ref, { status: 'COMPLETED', completedAt: new Date() });
    });
    await cleanupBatch.commit();
}


// ----------------------------------------------------------------------
// 3. AGENT DEFINITION (Categorizer and Quiz Generator)
// ----------------------------------------------------------------------

/**
 * AGENT 2: Categorizer and Quiz Agent
 * Takes raw text, determines 3-4 categories, and generates 5 MCQs per category.
 */
export const categorizeAndQuizTool = ai.defineTool(
    {
        name: 'categorizeAndQuizTool',
        description: 'Analyzes combined onboarding documents, segments content into 3 to 4 distinct categories, and generates 5 non-repetitive multiple-choice questions (MCQs) for each category.',
        inputSchema: z.any().describe('The full combined text content from onboarding documents.'),
        outputSchema: CourseOutputSchema,
    },
    async (fullText: string) => {
        const prompt = `
            You are an expert HR instructional designer. Analyze the following combined onboarding documents.
            Your goal is to segment the content into 3 to 4 distinct categories (like 'Payroll', 'Security', 'Collaboration').
            For each category, generate 5 non-repetitive, multiple-choice questions (MCQs) that test critical knowledge from the document text.

            **Target Categories (3-4 max):** Ensure the categories are relevant to the HR content (e.g., Financial Policies, Technical Setup, Workplace Conduct).

            Documents Content:
            ---
            ${fullText}
            ---
        `;

        const llmResponse = await ai.generate({
            model: googleAI.model('gemini-2.5-flash'),
            prompt: prompt,
            config: {
                temperature: 0.2,
                // maxOutputTokens: 8192, // Consider increasing if the output JSON is very large
            },
            output: {
                schema: CourseOutputSchema,
            },
        });

        return llmResponse.output as CourseData;
    }
);


// ----------------------------------------------------------------------
// 4. ORCHESTRATION FLOW (The Main Event)
// ----------------------------------------------------------------------

export const generateCourseFlow = ai.defineFlow(
    {
        name: 'generateCourse',
        inputSchema: z.object({}).describe('No input needed for this flow.'),
        outputSchema: z.string().describe("Completion status."),
    },
    async () => {
        // Get the pending documents snapshot before content fetching
        console.log('Retrieving pending documents for processing...');
        const pendingDocsSnapshot = await db.collection('drive_imports')
            .where('status', 'in', ['PENDING_AI', 'PROCESSING'])
            .get();

        if (pendingDocsSnapshot.empty) {
            return 'No pending documents found for processing.';
        }

        // --- STEP 1: Main Agent (Fetch and Combine Content) ---
        // This function now returns all the raw text from all pending documents
        console.log('Fetching and combining content from pending documents...');
        const rawContentText = await fetchAndCombineContent();

        if (rawContentText.includes('No pending documents')) {
            return rawContentText;
        }

        // --- STEP 2: Categorization and Quiz Generation ---
        console.log('Generating categories and quizzes from combined content...');
        const structuredCourseData = await categorizeAndQuizTool(rawContentText);

        if (!structuredCourseData || !structuredCourseData.course_title) {
            console.error('Categorize and Quiz Tool failed to generate structured course data or course_title is missing.');
            return '❌ Failed to generate course: Categorize and Quiz Tool output was null/undefined or missing course_title.';
        }

        // --- STEP 3: Final Database Write (Persistence) ---
        console.log('Saving generated course data to Firestore...');
        await saveCourseToFirestore(structuredCourseData, pendingDocsSnapshot.docs);

        return `✅ Successfully generated and saved course: ${structuredCourseData.course_title}`;
    },
);