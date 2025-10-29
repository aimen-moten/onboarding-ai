import express from 'express';
import { Client } from '@notionhq/client';
import { adminDb } from '../firebaseServer';

const router = express.Router();

// Notion Internal Integration configuration
const NOTION_TOKEN = process.env.NOTION_TOKEN;

console.log("✅ Notion routes file loaded");
// Middleware to check for Notion token
router.use((req, res, next) => {
  if (!NOTION_TOKEN) {
    return res.status(500).json({ error: 'Notion integration token not configured.' });
  }
  next();
});

// POST 
router.post('/import', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'Missing required field: userId'
      });
    }

    // Initialize Notion client with internal integration token
    const notion = new Client({ auth: NOTION_TOKEN });

    // Search for all pages the integration has access to
    const response = await notion.search({
      query: '',
      filter: {
        property: 'object',
        value: 'page'
      },
      page_size: 100
    });

    const importedContent = [];

    for (const page of response.results) {
      if ('properties' in page && 'url' in page) {
        try {
          // Get page content (blocks)
          const blocksResponse = await notion.blocks.children.list({ block_id: page.id });

          let textContent = '';
          for (const block of blocksResponse.results) {
            if ('paragraph' in block && block.paragraph.rich_text) {
              textContent += block.paragraph.rich_text
                .map(text => text.plain_text)
                .join('') + '\n';
            } else if ('heading_1' in block && block.heading_1.rich_text) {
              textContent += block.heading_1.rich_text.map(text => text.plain_text).join('') + '\n';
            } else if ('heading_2' in block && block.heading_2.rich_text) {
              textContent += block.heading_2.rich_text.map(text => text.plain_text).join('') + '\n';
            } else if ('heading_3' in block && block.heading_3.rich_text) {
              textContent += block.heading_3.rich_text.map(text => text.plain_text).join('') + '\n';
            }
          }

          const contentItem = {
            id: page.id,
            title: (page as any).properties?.title?.title?.[0]?.plain_text || 'Untitled Page',
            content: textContent,
            url: (page as any).url,
            createdTime: (page as any).created_time,
            lastEditedTime: (page as any).last_edited_time,
            source: 'notion',
            userId: userId,
            workspaceId: 'internal_integration_workspace',
          };

          importedContent.push(contentItem);

          if (adminDb) {
            await adminDb.collection('notion_imports').doc(page.id).set({
              ...contentItem,
              importedAt: new Date(),
              status: 'imported'
            });
          }
        } catch (pageError) {
          console.error(`Error processing Notion page ${page.id}:`, pageError);
        }
      }
    }

    res.json({
      success: true,
      message: `Successfully imported ${importedContent.length} items from Notion`,
      data: {
        count: importedContent.length,
        items: importedContent
      }
    });

  } catch (error: any) {
    console.error('Notion import error:', error);
    res.status(500).json({
      error: 'Failed to import from Notion',
      details: error.message
    });
  }
});

// GET /status - Check Notion connection status
router.get('/status', (req, res) => {
  console.log("🔥 /api/notion/status hit");
  if (NOTION_TOKEN) {
    res.json({ connected: true, workspaceName: 'Internal Integration' });
  } else {
    res.json({ connected: false });
  }
});

export default router;