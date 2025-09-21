import React from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

const Dashboard: React.FC = () => {
  const [user, loading, error] = useAuthState(auth);
  const navigate = useNavigate();

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
    </div>
  );
};

export default Dashboard;
