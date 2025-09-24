import express from 'express';
import { google } from 'googleapis';
import { db } from '../server';

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL;

// Ensure environment variables are loaded
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI || !FRONTEND_URL) {
  console.error('Missing Google API environment variables. Please check your .env file in the root directory.');
  // You might want to handle this more gracefully in a production app
}

// GET /api/drive/oauth2callback - Handles Google OAuth2 redirect
router.get('/oauth2callback', async (req, res) => {
  const code = req.query.code as string;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code not provided.' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Redirect back to frontend with access token
    res.redirect(`${FRONTEND_URL}/dashboard?driveAccessToken=${tokens.access_token}`);

  } catch (error: any) {
    console.error('Error exchanging code for tokens:', error);
    res.status(500).json({ error: 'Failed to authenticate with Google Drive.', details: error.message });
  }
});

// POST /api/drive - Import files from Google Drive
router.post('/', async (req, res) => { // Changed route from /drive to /
  try {
    const { accessToken, folderId, userId } = req.body;

    if (!accessToken || !userId) {
      return res.status(400).json({ 
        error: 'Missing required fields: accessToken, userId' 
      });
    }

    // Initialize Google Drive client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Build query for files
    let query = "mimeType='text/plain' or mimeType='application/pdf' or mimeType='text/markdown'";
    if (folderId) {
      query += ` and '${folderId}' in parents`;
    }

    // Fetch files from Google Drive
    const response = await drive.files.list({
      q: query,
      fields: 'files(id,name,mimeType,webViewLink,createdTime,modifiedTime,size)',
      orderBy: 'modifiedTime desc'
    });

    const importedContent = [];

    // Process each file
    for (const file of response.data.files || []) {
      try {
        let content = '';
        
        // Download file content based on type
        if (file.mimeType === 'text/plain' || file.mimeType === 'text/markdown') {
          const fileResponse = await drive.files.get({
            fileId: file.id!,
            alt: 'media'
          });
          content = fileResponse.data as string;
        } else if (file.mimeType === 'application/pdf') {
          // For PDFs, we'll just store metadata for now
          // In a real implementation, you'd use a PDF parser
          content = `[PDF File: ${file.name}]`;
        }

        const contentItem = {
          id: file.id!,
          title: file.name || 'Untitled',
          content: content,
          url: file.webViewLink,
          mimeType: file.mimeType,
          size: file.size,
          createdTime: file.createdTime,
          modifiedTime: file.modifiedTime,
          source: 'google_drive',
          userId: userId
        };

        importedContent.push(contentItem);

        // Save to Firestore (if available)
        if (db) {
          await db.collection('imported_content').doc(file.id!).set({
            ...contentItem,
            importedAt: new Date(),
            status: 'imported'
          });
        }

      } catch (fileError) {
        console.error(`Error processing file ${file.name}:`, fileError);
        // Continue with other files
      }
    }

    res.json({
      success: true,
      message: `Successfully imported ${importedContent.length} files from Google Drive`,
      data: {
        count: importedContent.length,
        items: importedContent
      }
    });

  } catch (error: any) {
    console.error('Google Drive import error:', error);
    res.status(500).json({
      error: 'Failed to import from Google Drive',
      details: error.message
    });
  }
});

// GET /api/import/drive/folders - Get available folders
router.get('/drive/folders', async (req, res) => {
  try {
    const { accessToken } = req.query;

    if (!accessToken) {
      return res.status(400).json({ 
        error: 'Missing required parameter: accessToken' 
      });
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken as string });
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Fetch folders
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder'",
      fields: 'files(id,name,webViewLink,createdTime,modifiedTime)',
      orderBy: 'modifiedTime desc'
    });

    const folders = response.data.files?.map((folder) => ({
      id: folder.id,
      name: folder.name,
      url: folder.webViewLink,
      createdTime: folder.createdTime,
      modifiedTime: folder.modifiedTime
    })) || [];

    res.json({
      success: true,
      data: folders
    });

  } catch (error: any) {
    console.error('Google Drive folders fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch Google Drive folders',
      details: error.message
    });
  }
});

export default router;
