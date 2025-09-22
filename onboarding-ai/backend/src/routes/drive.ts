import express from 'express';
import { google } from 'googleapis';
import { db } from '../server';

const router = express.Router();

// POST /api/import/drive
router.post('/drive', async (req, res) => {
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
