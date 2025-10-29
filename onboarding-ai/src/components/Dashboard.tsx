import React from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase'; // Assuming db is no longer directly used here
import { signOut } from 'firebase/auth';
// Removed collection, getDocs import since they are not used in this file
import { useNavigate } from 'react-router-dom';

import useDrivePicker from 'react-google-drive-picker';

// Environment variables for Google OAuth
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
// Removed unused GOOGLE_REDIRECT_URI and GOOGLE_SCOPES
const DEVELOPER_KEY = import.meta.env.VITE_GOOGLE_DEVELOPER_KEY;

// --- TYPE DEFINITIONS FOR CLARITY ---
interface QuizChoice {
  text: string;
  isCorrect: boolean;
}

interface QuizQuestion {
  id: string; // Document ID of the quiz
  courseId: string;
  question: string;
  choices: QuizChoice[]; // This is the structured list of choices
  correct_answer: string; // This is the plain text of the correct answer
}

interface Course {
  id: string;
  title: string;
}
// -----------------------------------


const Dashboard: React.FC = () => {
  const [user, loading, error] = useAuthState(auth);
  const navigate = useNavigate();

  const [openPicker, authResponse] = useDrivePicker();
  const [showNotionModal, setShowNotionModal] = React.useState(false);
  const [importStatus, setImportStatus] = React.useState('');
  const [importError, setImportError] = React.useState('');
  const [notionConnected, setNotionConnected] = React.useState(false);
  const [notionWorkspaceName, setNotionWorkspaceName] = React.useState('');
  
  const [showCourseSelectionModal, setShowCourseSelectionModal] = React.useState(false);
  const [courses, setCourses] = React.useState<Course[]>([]);

  // --- NEW STATES FOR QUIZ FEATURE ---
  const [showQuizModal, setShowQuizModal] = React.useState(false);
  const [selectedCourseId, setSelectedCourseId] = React.useState<string | null>(null);
  const [quizzes, setQuizzes] = React.useState<QuizQuestion[]>([]);
  // State to track user's answers and display status (key is quiz ID, value is index of selected choice)
  const [userAnswers, setUserAnswers] = React.useState<Record<string, number | null>>({});
  // -----------------------------------


  React.useEffect(() => {
    const checkNotionConnection = async () => {
      try {
        // Corrected URL to match your server.ts mounting point
        const response = await fetch(`http://localhost:3001/api/notion/status`);
        const data = await response.json();
        if (data.connected) {
          setNotionConnected(true);
          setNotionWorkspaceName(data.workspaceName);
        } else {
          setNotionConnected(false);
          setNotionWorkspaceName('');
        }
      } catch (err) {
        console.error('Error checking Notion connection status:', err);
        setNotionConnected(false);
        setNotionWorkspaceName('');
      }
    };
    
    // Call the function only when a user is authenticated
    if (user) {
      checkNotionConnection();
    }

  }, [user]); // The effect depends on the 'user' object to re-run on authentication state change

  const handleDrivePicker = () => {
    const accessToken = localStorage.getItem("googleAccessToken");

    if (!accessToken) {
      console.error("❌ Google Drive access token not available.");
      alert("Please sign in with Google again to import files.");
      setImportError("Google Drive access token not available. Please sign in with Google again.");
      return;
    }

    console.log('Using token:', accessToken); // Debug log for token before opening picker

    openPicker({
      clientId: CLIENT_ID,
      developerKey: DEVELOPER_KEY,
      viewId: 'DOCS', // Show documents/files view
      token: accessToken,
      multiselect: true,
      customScopes: ['https://www.googleapis.com/auth/drive.readonly'],
      appId: '808599523111', // Google Cloud Project Number
      
      // CRITICAL FIX: Ensure the token is captured in the callback
      callbackFunction: (data) => {
        if (data.action === 'picked') {
          console.log('✅ File picked:', data.docs); // Debug log for picked files
          // The token should now be consistently available from localStorage or authResponse.
          // We'll still check data.auth?.access_token as a fallback, though it should be less necessary.
          const currentAccessToken = (data as any).auth?.access_token || accessToken;
          
          console.log("Access Token in callback:", currentAccessToken ? "✅ Present" : "❌ Missing"); // Added for troubleshooting
          
          if (!currentAccessToken) {
            // If neither source has the token, log a clear error and STOP.
            console.error("ERROR: Access token could not be retrieved after file selection.");
            setImportError("Google Drive access token not available.");
            return;
          }

          // 3. Proceed only with a valid token
          handleProcessFiles(data.docs, currentAccessToken);
        } else {
          console.log('⚪ Picker closed'); // Debug log for picker closed
        }
      },
    });
  };

  const handleProcessFiles = async (files: any[], accessToken: string) => {
    setImportStatus(`Processing ${files.length} selected files...`);

    for (const file of files) {
      const fileId = file.id;
      const fileName = file.name;
      const mimeType = file.mimeType;
      
      try {
        const response = await fetch('http://localhost:3001/api/drive/import-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user?.uid,
            fileId: fileId,
            fileName: fileName,
            mimeType: mimeType,
            accessToken: accessToken,
            source: 'drive',
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to save metadata for ${fileName}.`);
        }
        
        setImportStatus(`Successfully saved metadata for ${fileName}.`);

      } catch (err: any) {
        setImportError(`Error saving metadata for ${fileName}: ${err.message}`);
        break;
      }
    }
    setImportStatus('All selected files have been submitted for metadata import.');
  };

  const handleGenerateCourse = async () => {
    setImportStatus('Starting AI Course generation...');
    setImportError('');
    
    try {
        const response = await fetch('http://localhost:3001/api/course/start-generation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user?.uid,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.details || data.error || 'Unknown error starting AI flow.');
        }

        setImportStatus(data.message);
        
    } catch (err: any) {
        setImportError(`Error starting AI flow: ${err.message}`);
        setImportStatus('');
    }
};

  const handleTakeQuiz = async () => {
    // Reset previous quiz state
    setQuizzes([]);
    setSelectedCourseId(null);
    setUserAnswers({});
    setShowQuizModal(false);
    
    setShowCourseSelectionModal(true);
    setImportStatus('Loading courses...');
    setImportError('');
    try {
      // Endpoint to fetch courses from firestore (you must implement this in server.ts)
      const response = await fetch('http://localhost:3001/api/courses'); 
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch courses.');
      }

      setCourses(data.courses);
      setImportStatus('');
    } catch (err: any) {
      setImportError(`Error fetching courses: ${err.message}`);
      setImportStatus('');
      setShowCourseSelectionModal(false); // Close if fetching fails
    }
  };
 
  // --- HANDLER: FETCH QUIZZES FOR A SELECTED COURSE ---
  const handleTakeCourse = async (courseId: string) => {
    setSelectedCourseId(courseId);
    setShowCourseSelectionModal(false); // Close course selection modal
    setShowQuizModal(true); // Open quiz modal
    setImportStatus('Loading quizzes...');
    setImportError('');
    
    try {
      // Endpoint to fetch quizzes for a specific courseId (you must implement this in server.ts)
      const response = await fetch(`http://localhost:3001/api/quizzes?courseId=${courseId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch quizzes.');
      }
      
      // 💡 FIX: Map the simple array of choice strings (data.choices) to the required structure
      // by comparing each choice text against the correct_answer string.
      const fetchedQuizzes: QuizQuestion[] = data.quizzes.map((quiz: any) => ({
        id: quiz.id,
        courseId: quiz.courseId,
        question: quiz.question,
        correct_answer: quiz.correct_answer, // Keep the correct answer string
        choices: quiz.choices.map((choice: string) => ({
          text: choice,
          isCorrect: choice === quiz.correct_answer, // Determine correctness here
        })),
      }));

      setQuizzes(fetchedQuizzes);
      setImportStatus('Quizzes loaded successfully. Start testing!');
      setImportError('');
    } catch (err: any) {
      setImportError(`Error fetching quizzes: ${err.message}`);
      setImportStatus('');
      setQuizzes([]);
    }
  };

  // --- HANDLER: INTERACTIVE QUIZ LOGIC ---
  const handleAnswerSelection = (quizId: string, choiceIndex: number) => {
    // Only allow selecting an answer once per question
    if (userAnswers[quizId] === undefined || userAnswers[quizId] === null) {
      setUserAnswers(prev => ({
        ...prev,
        [quizId]: choiceIndex,
      }));
    }
  };


   const handleNotionImport = async () => {
    setImportStatus('Importing from Notion...');
    setImportError('');
    try {
      // Corrected URL to match your server.ts mounting point
      const response = await fetch('http://localhost:3001/api/notion/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.uid,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setImportStatus(`Successfully imported ${data.data.count} items from Notion.`);
      } else {
        setImportError(data.details || data.error || 'Failed to import from Notion.');
        setImportStatus('');
      }
    } catch (err: any) {
      setImportError(err.message || 'An unexpected error occurred during Notion import.');
      setImportStatus('');
    } finally {
      setShowNotionModal(false);
    }
  };


  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontSize: '1.2rem'
      }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        color: 'red',
        fontSize: '1.2rem'
      }}>
        Error: {error.message}
      </div>
    );
  }

  if (!user) {
    navigate('/');
    return null;
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      {/* Header */}
      <header style={{
        backgroundColor: 'white',
        padding: '1.5rem 2rem',
        boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <h1 style={{
          color: '#2d3748',
          margin: 0,
          fontSize: '1.75rem',
          fontWeight: '700',
          background: 'linear-gradient(135deg, #667eea, #764ba2)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          Onboarding AI Dashboard
        </h1>
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <span style={{
            color: '#718096',
            fontSize: '0.95rem',
            fontWeight: '500'
          }}>
            Welcome, {user.displayName || user.email}
          </span>
          
          <button
            onClick={handleSignOut}
            style={{
              backgroundColor: '#e53e3e',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.25rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '600',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(229, 62, 62, 0.2)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#c53030';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#e53e3e';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{
        padding: '2rem',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '3rem',
          borderRadius: '16px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
          marginBottom: '2rem',
          border: '1px solid #e2e8f0'
        }}>
          <h2 style={{
            color: '#2d3748',
            marginBottom: '1rem',
            fontSize: '1.75rem',
            fontWeight: '700'
          }}>
            Welcome to Onboarding AI
          </h2>
          
          <p style={{
            color: '#718096',
            lineHeight: '1.6',
            marginBottom: '2rem',
            fontSize: '1.1rem'
          }}>
            Transform your static company documents into interactive training experiences.
            Import content from Notion or Google Drive and let AI generate quizzes and flashcards.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1.5rem',
            marginTop: '2rem'
          }}>
            {/* Import Content Card */}
            <div style={{
              border: '2px dashed #ddd',
              borderRadius: '8px',
              padding: '2rem',
              textAlign: 'center',
              backgroundColor: '#fafafa'
            }}>
              <h3 style={{
                color: '#333',
                marginBottom: '1rem',
                fontSize: '1.1rem'
              }}>
                Import Content
              </h3>
              <p style={{
                color: '#666',
                marginBottom: '1.5rem',
                fontSize: '0.9rem'
              }}>
                Import documents from Notion or Google Drive
              </p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button
                  onClick={() => setShowNotionModal(true)}
                  style={{
                    backgroundColor: '#667eea',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 4px rgba(102, 126, 234, 0.2)'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#5a67d8';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#667eea';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  Import from Notion
                </button>
                <button
                  onClick={handleDrivePicker}
                  style={{
                    backgroundColor: '#4299e1',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 4px rgba(66, 153, 225, 0.2)'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#3182ce';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#4299e1';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  Import from Google Drive
                </button>
              </div>
            </div>

            {/* Generate Course Card */}
            <div style={{
              border: '2px dashed #ddd',
              borderRadius: '8px',
              padding: '2rem',
              textAlign: 'center',
              backgroundColor: '#fafafa'
            }}>
              <h3 style={{
                color: '#333',
                marginBottom: '1rem',
                fontSize: '1.1rem'
              }}>
                Generate Course
              </h3>
              <p style={{
                color: '#666',
                marginBottom: '1.5rem',
                fontSize: '0.9rem'
              }}>
                Let AI create quizzes and flashcards from your content
              </p>
              <button
                  onClick={handleGenerateCourse}
                  style={{
                      backgroundColor: '#48bb78',
                      color: 'white',
                      border: 'none',
                      padding: '0.75rem 1.5rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: '600',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 4px rgba(72, 187, 120, 0.2)'
                  }}
                  onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#38a169';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = '#48bb78';
                      e.currentTarget.style.transform = 'translateY(0)';
                  }}
              >
                  Generate Course
              </button>
            </div>

            {/* Take Quiz Card */}
            <div style={{
              border: '2px dashed #ddd',
              borderRadius: '8px',
              padding: '2rem',
              textAlign: 'center',
              backgroundColor: '#fafafa'
            }}>
              <h3 style={{
                color: '#333',
                marginBottom: '1rem',
                fontSize: '1.1rem'
              }}>
                Take Quiz
              </h3>
              <p style={{
                color: '#666',
                marginBottom: '1.5rem',
                fontSize: '0.9rem'
              }}>
                Test your knowledge with interactive quizzes
              </p>
              <button
                onClick={handleTakeQuiz}
                style={{
                  backgroundColor: '#f6ad55',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 4px rgba(246, 173, 85, 0.2)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#ed8936';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#f6ad55';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Take Quiz
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Notion Import Modal */}
      {showNotionModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '8px',
            boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
            width: '90%',
            maxWidth: '500px'
          }}>
            <h3 style={{ marginBottom: '1.5rem', color: '#2d3748' }}>Import from Notion</h3>
            {notionConnected ? (
              <p style={{ color: '#4a5568', marginBottom: '1.5rem' }}>
                Connected to Notion workspace: <strong>{notionWorkspaceName}</strong>.
                You can now import all accessible pages.
              </p>
            ) : (
              <p style={{ color: '#4a5568', marginBottom: '1.5rem' }}>
                Connect your Notion workspace to import content.
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button
                onClick={() => setShowNotionModal(false)}
                style={{
                  backgroundColor: '#e2e8f0',
                  color: '#2d3748',
                  border: 'none',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
              >
                Cancel
              </button>
              {notionConnected ? (
                <button
                  onClick={handleNotionImport}
                  style={{
                    backgroundColor: '#667eea',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.25rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Start Import
                </button>
              ) : (
                <button
                  onClick={handleNotionImport} // Directly trigger import for internal integration
                  style={{
                    backgroundColor: '#667eea',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.25rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Import Notion Content
                </button>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Import Status/Error Display */}
      {(importStatus || importError) && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          backgroundColor: importError ? '#fee2e2' : '#d1fae5',
          color: importError ? '#ef4444' : '#065f46',
          padding: '1rem 1.5rem',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 1000,
          fontSize: '0.95rem',
          fontWeight: '500'
        }}>
          {importStatus || `Error: ${importError}`}
        </div>
      )}

      {/* 🟢 Course Selection Modal (Matches the provided image) */}
      {showCourseSelectionModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem 3rem',
            borderRadius: '16px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            width: '90%',
            maxWidth: '600px',
            maxHeight: '80%',
            overflowY: 'auto'
          }}>
            <h2 style={{
              fontSize: '2.5rem',
              color: '#2d3748',
              fontWeight: '400',
              textAlign: 'center',
              marginBottom: '2rem',
              fontFamily: 'Georgia, serif' // Mimics the font in the image
            }}>
              Courses
            </h2>
            
            {courses.length === 0 && !importStatus && !importError ? (
                <p style={{ textAlign: 'center', color: '#718096' }}>No courses available yet. Generate one!</p>
            ) : (
                courses.map((course) => (
                    <div
                        key={course.id}
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '1rem 0',
                            borderBottom: '1px solid #e2e8f0',
                            // The container from your image
                            backgroundColor: '#f7f7f7ff',
                            margin: '10px 0',
                            paddingLeft: '15px',
                            paddingRight: '15px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        }}
                    >
                        <span style={{ fontSize: '1.2rem', color: '#2d3748' }}>
                            {course.title || 'Sample Course Title'}
                        </span>
                        <button
                            onClick={() => handleTakeCourse(course.id)}
                            style={{
                                backgroundColor: '#4299e1', // Blue color from the image
                                color: 'white',
                                border: 'none',
                                padding: '0.75rem 1.25rem',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                fontWeight: '600',
                                transition: 'background-color 0.2s ease',
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#3182ce'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#4299e1'}
                        >
                            Take Course
                        </button>
                    </div>
                ))
            )}
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <button
                onClick={() => setShowCourseSelectionModal(false)}
                style={{
                  backgroundColor: '#e2e8f0',
                  color: '#2d3748',
                  border: 'none',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 🧠 Quiz Modal (Displays interactive Quizzes) */}
      {showQuizModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          overflowY: 'auto', // Allows scrolling for many quizzes
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '16px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            width: '90%',
            maxWidth: '800px',
            maxHeight: '90%',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2 style={{
                textAlign: 'center',
                color: '#2d3748',
                fontSize: '2rem',
                flexGrow: 1, // Allows the title to take up available space
                margin: 0 // Reset margin to prevent misalignment
              }}>
                Quiz for Course: {courses.find(c => c.id === selectedCourseId)?.title || 'Loading...'}
              </h2>
              <button
                onClick={() => setShowQuizModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#718096',
                  padding: '0.5rem',
                  transition: 'color 0.2s ease',
                }}
                onMouseOver={(e) => e.currentTarget.style.color = '#2d3748'}
                onMouseOut={(e) => e.currentTarget.style.color = '#718096'}
              >
                &times; {/* HTML entity for 'x' mark */}
              </button>
            </div>

            {quizzes.length === 0 && !importStatus && !importError ? (
                <p style={{ textAlign: 'center', color: '#718096' }}>No quizzes found for this course.</p>
            ) : (
                quizzes.map((quiz, quizIndex) => (
                    <div key={quiz.id} style={{ marginBottom: '2rem', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.5rem', backgroundColor: '#fafafa' }}>
                        <p style={{ fontWeight: '600', color: '#4a5568', fontSize: '1.1rem', marginBottom: '1rem' }}>
                            {quizIndex + 1}. {quiz.question}
                        </p>
                        
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            {quiz.choices.map((choice, choiceIndex) => {
                                const isAnswered = userAnswers[quiz.id] !== null && userAnswers[quiz.id] !== undefined;
                                const isUserSelection = userAnswers[quiz.id] === choiceIndex;
                                
                                // Conditional Styling based on state
                                let buttonStyle: React.CSSProperties = {
                                    backgroundColor: '#fff',
                                    color: '#2d3748',
                                    border: '1px solid #e2e8f0',
                                    padding: '0.75rem 1rem',
                                    borderRadius: '6px',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    whiteSpace: 'normal',
                                    wordWrap: 'break-word',
                                };
                                
                                if (isAnswered) {
                                    if (choice.isCorrect) {
                                        // Correct answer: always green when answered
                                        buttonStyle.backgroundColor = '#d1fae5'; // Light green
                                        buttonStyle.border = '1px solid #10b981';
                                        buttonStyle.color = '#065f46';
                                    } else if (isUserSelection && !choice.isCorrect) {
                                        // Wrong selection: red
                                        buttonStyle.backgroundColor = '#fee2e2'; // Light red
                                        buttonStyle.border = '1px solid #ef4444';
                                        buttonStyle.color = '#991b1b';
                                    }
                                } else {
                                    // Not answered: standard hover effect
                                    buttonStyle = {
                                        ...buttonStyle,
                                        cursor: 'pointer',
                                    };
                                }

                                return (
                                    <button
                                        key={choiceIndex}
                                        onClick={() => handleAnswerSelection(quiz.id, choiceIndex)}
                                        disabled={isAnswered} // Disable after an answer is chosen
                                        style={buttonStyle}
                                        onMouseOver={(e) => {
                                          if (!isAnswered) e.currentTarget.style.backgroundColor = '#f7fafc';
                                        }}
                                        onMouseOut={(e) => {
                                          if (!isAnswered) e.currentTarget.style.backgroundColor = '#fff';
                                        }}
                                    >
                                        {String.fromCharCode(65 + choiceIndex)}. {choice.text}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))
            )}

            {/* The "Close Quiz" button is now redundant as the 'x' button handles closing */}
          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;