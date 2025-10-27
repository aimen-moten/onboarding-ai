import React from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

import useDrivePicker from 'react-google-drive-picker';

// Environment variables for Google OAuth
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_REDIRECT_URI = import.meta.env.VITE_GOOGLE_REDIRECT_URI;
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.readonly'; // Broader scope for listing all files
const DEVELOPER_KEY = import.meta.env.VITE_GOOGLE_DEVELOPER_KEY; // From Google Cloud Console

const Dashboard: React.FC = () => {
  const [user, loading, error] = useAuthState(auth);
  const navigate = useNavigate();

  const [openPicker, authResponse] = useDrivePicker();
  const [showNotionModal, setShowNotionModal] = React.useState(false);
  const [importStatus, setImportStatus] = React.useState('');
  const [importError, setImportError] = React.useState('');
  const [notionConnected, setNotionConnected] = React.useState(false);
  const [notionWorkspaceName, setNotionWorkspaceName] = React.useState('');


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
                disabled
                style={{
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '4px',
                  cursor: 'not-allowed',
                  fontSize: '0.9rem'
                }}
              >
                Coming Soon
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
    </div>
  );
};

export default Dashboard;