# Onboarding AI

A web application designed to help HR/Admins transform static company documents into interactive training experiences like quizzes and flashcards.

## Features

- 🔐 Firebase Authentication with Google Sign-On
- 📊 Dashboard for HR/Admins to manage content
- 🤖 AI-powered content processing (coming soon)
- 📚 Interactive quiz generation (coming soon)
- 📖 Flashcard-style learning (coming soon)

## Getting Started

### Prerequisites

- Node.js (v18.15.0 or higher)
- npm or yarn
- Firebase project with Authentication enabled

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd onboarding-ai
```

2. Install dependencies:
```bash
npm install
```

3. Set up Firebase:
   - Create a new Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Authentication and configure Google Sign-In
   - Get your Firebase configuration from Project Settings
   - Update `src/firebase.ts` with your Firebase config:

```typescript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};
```

4. Start the development server:
```bash
npm run dev
```

5. Open your browser and navigate to `http://localhost:5173`

## Project Structure

```
src/
├── components/
│   ├── Login.tsx          # Login component with Google Sign-In
│   └── Dashboard.tsx     # Main dashboard for authenticated users
├── firebase.ts           # Firebase configuration
├── App.tsx              # Main app component with routing
└── main.tsx             # Entry point
```

## Current Status

✅ **Checkpoint 1 Complete:**
- React project with Vite and TypeScript
- Firebase Authentication with Google Sign-On
- Login component with popup authentication
- Dashboard component with user management
- React Router setup with protected routes

🚧 **Next Steps:**
- Content import from Notion and Google Drive
- AI processing pipeline with Genkit
- Quiz generation and management
- Interactive quiz interface

## Technologies Used

- **Frontend:** React 18, TypeScript, Vite
- **Authentication:** Firebase Auth
- **Routing:** React Router DOM
- **Styling:** Inline styles (can be migrated to CSS modules or styled-components)
- **State Management:** React hooks with react-firebase-hooks

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Environment Variables

Create a `.env.local` file for environment-specific variables:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=your-app-id
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.