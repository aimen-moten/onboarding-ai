# Onboarding AI Backend

Backend API server for content import from Notion and Google Drive.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file with the following variables:
   ```
   FIREBASE_PROJECT_ID=onboardingai-47ab3
   FIREBASE_PRIVATE_KEY_ID=your-private-key-id
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
   FIREBASE_CLIENT_EMAIL=your-service-account@onboardingai-47ab3.iam.gserviceaccount.com
   FIREBASE_CLIENT_ID=your-client-id
   PORT=3001
   ```

3. **Run in development mode:**
   ```bash
   npm run dev
   ```

4. **Build and run in production:**
   ```bash
   npm run build
   npm start
   ```

## API Endpoints

### Health Check
- `GET /api/health` - Check if server is running

### Notion Import
- `POST /api/import/notion` - Import content from Notion database
- `GET /api/import/notion/databases` - Get available Notion databases

### Google Drive Import
- `POST /api/import/drive` - Import files from Google Drive
- `GET /api/import/drive/folders` - Get available Google Drive folders

## Request Examples

### Import from Notion
```json
POST /api/import/notion
{
  "notionApiKey": "your-notion-api-key",
  "databaseId": "database-id",
  "userId": "firebase-user-id"
}
```

### Import from Google Drive
```json
POST /api/import/drive
{
  "accessToken": "google-oauth-access-token",
  "folderId": "optional-folder-id",
  "userId": "firebase-user-id"
}
```

## Firebase Setup

To get Firebase service account credentials:

1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key"
3. Download the JSON file
4. Extract the required fields for your `.env` file
