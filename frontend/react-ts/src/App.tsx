import React, { useState } from 'react';
import { Upload, BookOpen, Music, Play, FileText } from 'lucide-react';
import PDFReader from './components/PDFReader';
import './App.css';
import './index.css';

function App() {
  const [file, setFile] = useState<File | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  return (
    <div className="app-container">
      <header className="navbar">
        <div className="logo-container">
          <BookOpen className="logo-icon" size={32} />
          <h1>MangaAI Reader</h1>
        </div>
      </header>

      <main className="main-content">
        {!file ? (
          <div className="upload-section">
            <div className="upload-card">
              <Upload size={56} className="upload-icon" />
              <h2>Upload your Manga</h2>
              <p>Upload a PDF to start reading with AI-generated voice acting and dynamic mood audio.</p>
              
              <label className="upload-btn">
                <span>Select PDF File</span>
                <input type="file" accept=".pdf" onChange={handleFileUpload} />
              </label>
            </div>
            
            <div className="features-grid">
              <div className="feature-card">
                <FileText size={28} className="feature-icon" />
                <h3>Smart Extraction</h3>
                <p>AI automatically detects speech bubbles and text from the raw manga panels.</p>
              </div>
              <div className="feature-card">
                <Music size={28} className="feature-icon" />
                <h3>Dynamic Audio</h3>
                <p>Background music and sound effects automatically adapt to the scene's emotional mood.</p>
              </div>
              <div className="feature-card">
                <Play size={28} className="feature-icon" />
                <h3>Voice Acting</h3>
                <p>Listen to your manga with high-quality text-to-speech for an immersive experience.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="reader-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2>Reading: {file.name}</h2>
              <button 
                className="upload-btn" 
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', marginTop: 0 }}
                onClick={() => setFile(null)}
              >
                Close Reader
              </button>
            </div>
            <PDFReader file={file} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
