import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import './PDFReader.css';

// Use Vite's native Web Worker bundling to guarantee the worker loads
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?worker';
pdfjsLib.GlobalWorkerOptions.workerPort = new pdfWorker();

interface PDFReaderProps {
  file: File;
}

const PDFReader: React.FC<PDFReaderProps> = ({ file }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [extractedText, setExtractedText] = useState<string>('');
  const [currentMood, setCurrentMood] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  // Auto-Play State
  const [isAutoPlay, setIsAutoPlay] = useState<boolean>(false);
  const autoPlayRef = useRef<boolean>(false);
  const pageNumRef = useRef<number>(1);
  const numPagesRef = useRef<number | null>(null);

  useEffect(() => { pageNumRef.current = pageNumber; }, [pageNumber]);
  useEffect(() => { numPagesRef.current = numPages; }, [numPages]);
  
  const [pageCache, setPageCache] = useState<Record<number, { text: string, mood: string }>>({});
  const [bgmUrl, setBgmUrl] = useState<string>('');

  const [cropRect, setCropRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{x: number, y: number} | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{x: number, y: number} | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const bgmRef = useRef<HTMLAudioElement>(null);

  // Background Music Engine
  useEffect(() => {
    if (!currentMood || !bgmRef.current) return;
    const mood = currentMood.toLowerCase();
    
    const tracks: Record<string, string> = {
      action: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3',
      suspense: 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_24a1e944b0.mp3',
      sad: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8b8175782.mp3',
      happy: 'https://cdn.pixabay.com/download/audio/2021/11/24/audio_9bc2c97495.mp3',
    };
    
    let trackUrl = '';
    if (mood.includes('action') || mood.includes('angry')) trackUrl = tracks.action;
    else if (mood.includes('sad')) trackUrl = tracks.sad;
    else if (mood.includes('suspense')) trackUrl = tracks.suspense;
    else if (mood.includes('happy') || mood.includes('comedy')) trackUrl = tracks.happy;

    if (trackUrl && bgmUrl !== trackUrl) {
      setBgmUrl(trackUrl);
      bgmRef.current.src = trackUrl;
      bgmRef.current.volume = 0.15;
      bgmRef.current.play().catch((e) => console.warn('BGM Auto-play blocked', e));
    } else if (!trackUrl) {
      bgmRef.current.pause();
    }
  }, [currentMood]);

  const prefetchPage = async (pageNum: number) => {
    if (!pdfRef.current || pageCache[pageNum]) return; 
    
    try {
      const page = await pdfRef.current.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const offscreenCanvas = document.createElement('canvas');
      const context = offscreenCanvas.getContext('2d');
      offscreenCanvas.height = viewport.height;
      offscreenCanvas.width = viewport.width;
      
      await page.render({ canvasContext: context, viewport }).promise;
      const dataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.8);
      
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${BACKEND_URL}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
      });
      
      if (response.ok) {
        const data = await response.json();
        let rawText = data.result || '';
        let mood = 'Neutral';
        const moodMatch = rawText.match(/\[MOOD:\s*([^\]]+)\]/i);
        if (moodMatch) {
          mood = moodMatch[1];
          rawText = rawText.replace(/\[MOOD:.*?\]/gi, '').trim();
        }
        setPageCache(prev => ({ ...prev, [pageNum]: { text: rawText, mood } }));
      }
    } catch (err) {
      console.error(`Pre-fetch failed for page ${pageNum}`, err);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDragStart({ x, y });
    setDragCurrent({ x, y });
    setIsDragging(true);
    setCropRect(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !canvasRef.current || !dragStart) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    setDragCurrent({ x, y });
  };

  const handleMouseUp = () => {
    if (isDragging && dragStart && dragCurrent) {
      const x = Math.min(dragStart.x, dragCurrent.x);
      const y = Math.min(dragStart.y, dragCurrent.y);
      const w = Math.abs(dragCurrent.x - dragStart.x);
      const h = Math.abs(dragCurrent.y - dragStart.y);
      
      if (w > 15 && h > 15) setCropRect({ x, y, w, h });
    }
    setIsDragging(false);
    setDragStart(null);
    setDragCurrent(null);
  };

  const performOCR = async () => {
    if (!canvasRef.current) return;
    
    if (!cropRect && pageCache[pageNumber]) {
      setExtractedText(pageCache[pageNumber].text);
      setCurrentMood(pageCache[pageNumber].mood);
      if (numPages && pageNumber < numPages) prefetchPage(pageNumber + 1);
      return;
    }

    setIsExtracting(true);
    setExtractedText('');
    try {
      let dataUrl = '';
      if (cropRect) {
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = canvasRef.current.width / rect.width;
        const scaleY = canvasRef.current.height / rect.height;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = cropRect.w * scaleX;
        tempCanvas.height = cropRect.h * scaleY;
        
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.drawImage(
            canvasRef.current,
            cropRect.x * scaleX, cropRect.y * scaleY, cropRect.w * scaleX, cropRect.h * scaleY,
            0, 0, tempCanvas.width, tempCanvas.height
          );
          dataUrl = tempCanvas.toDataURL('image/jpeg', 0.9);
        }
      } else {
        dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.9);
      }

      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${BACKEND_URL}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
      });

      if (!response.ok) throw new Error(`Server error`);

      const data = await response.json();
      let rawText = data.result || 'No content found.';
      let mood = 'Neutral';
      const moodMatch = rawText.match(/\[MOOD:\s*([^\]]+)\]/i);
      
      if (moodMatch) {
        mood = moodMatch[1];
        rawText = rawText.replace(/\[MOOD:.*?\]/gi, '').trim();
      }
      
      setExtractedText(rawText);
      setCurrentMood(mood);
      
      if (!cropRect) {
        setPageCache(prev => ({ ...prev, [pageNumber]: { text: rawText, mood } }));
        if (numPages && pageNumber < numPages) prefetchPage(pageNumber + 1);
      }
      
    } catch (error) {
      console.error('Extraction Error:', error);
      setExtractedText('Extraction failed.');
    } finally {
      setIsExtracting(false);
    }
  };

  const speakText = () => {
    if (!extractedText) return;
    window.speechSynthesis.cancel(); 
    
    const utterance = new SpeechSynthesisUtterance(extractedText);
    const voices = window.speechSynthesis.getVoices();
    const narrators = voices.filter(v => v.lang.startsWith('en-'));
    const premiumVoice = narrators.find(v => 
      v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Google') || v.name.includes('Premium')
    ) || narrators[0];
    
    if (premiumVoice) utterance.voice = premiumVoice;
    
    const activeMood = currentMood.toLowerCase();
    
    if (activeMood.includes('action') || activeMood.includes('angry')) {
      utterance.pitch = 1.3;
      utterance.rate = 1.15;
    } else if (activeMood.includes('sad')) {
      utterance.pitch = 0.8;
      utterance.rate = 0.9;
    } else if (activeMood.includes('suspense')) {
      utterance.pitch = 0.6;
      utterance.rate = 0.9;
    } else if (activeMood.includes('happy')) {
      utterance.pitch = 1.2;
      utterance.rate = 1.1;
    } else {
      utterance.pitch = 1.0;
      utterance.rate = 1.0;
    }
    
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => {
      setIsPlaying(false);
      // Auto-advance to the next page if Auto-Play is active!
      if (autoPlayRef.current && numPagesRef.current && pageNumRef.current < numPagesRef.current) {
        setPageNumber(pageNumRef.current + 1);
      }
    };
    utterance.onerror = () => setIsPlaying(false);
    
    window.speechSynthesis.speak(utterance);
  };

  // Auto-Play Trigger Logic
  useEffect(() => {
    if (!isAutoPlay) return;
    
    // If we have text ready and are not playing or extracting, play it!
    if (extractedText && !isPlaying && !isExtracting) {
      speakText();
    } 
    // If we DON'T have text yet, and are not currently extracting, kick off the scan!
    else if (!extractedText && !isExtracting && !cropRect) {
      performOCR();
    }
  }, [isAutoPlay, extractedText, isPlaying, isExtracting, pageNumber]);

  useEffect(() => {
    let isMounted = true;
    setErrorMsg('');
    const objectUrl = URL.createObjectURL(file);
    
    const loadingTask = pdfjsLib.getDocument({ url: objectUrl });
    loadingTask.promise.then(pdf => {
      if (!isMounted) return;
      pdfRef.current = pdf;
      setNumPages(pdf.numPages);
      setPageNumber(1);
    }).catch(err => {
      if (!isMounted) return;
      console.error('Failed to load PDF:', err);
      setErrorMsg('Failed to load PDF.');
    });

    return () => {
      isMounted = false;
      URL.revokeObjectURL(objectUrl);
      if (pdfRef.current) {
        pdfRef.current.destroy();
        pdfRef.current = null;
      }
    };
  }, [file]);

  useEffect(() => {
    let isMounted = true;
    const renderPage = async () => {
      if (!pdfRef.current || !canvasRef.current) return;
      try {
        const page = await pdfRef.current.getPage(pageNumber);
        if (!isMounted) return;
        
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderContext = { canvasContext: context, viewport: viewport };
        
        if (renderTaskRef.current) await renderTaskRef.current.cancel();
        renderTaskRef.current = page.render(renderContext);
        await renderTaskRef.current.promise;
        
        setCropRect(null);
        
        if (pageCache[pageNumber]) {
          setExtractedText(pageCache[pageNumber].text);
          setCurrentMood(pageCache[pageNumber].mood);
          if (numPages && pageNumber < numPages) prefetchPage(pageNumber + 1);
        } else {
          setExtractedText('');
          setCurrentMood('');
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', err);
        }
      }
    };
    renderPage();
    return () => {
      isMounted = false;
      if (renderTaskRef.current) renderTaskRef.current.cancel();
    };
  }, [pageNumber, numPages]);

  let currentDragBox = null;
  if (isDragging && dragStart && dragCurrent) {
    currentDragBox = {
      x: Math.min(dragStart.x, dragCurrent.x),
      y: Math.min(dragStart.y, dragCurrent.y),
      w: Math.abs(dragCurrent.x - dragStart.x),
      h: Math.abs(dragCurrent.y - dragStart.y)
    };
  }

  const displayBox = currentDragBox || cropRect;

  return (
    <div className="pdf-reader">
      <audio ref={bgmRef} loop />
      
      {errorMsg && (
        <div style={{ color: '#ef4444', background: '#fef2f2', padding: '1rem', borderRadius: '4px', border: '1px solid #ef4444', marginBottom: '1rem' }}>
          {errorMsg}
        </div>
      )}
      
      <div className="reader-split-layout">
        <div className="reader-left-panel">
          <div className="pdf-controls">
            <button disabled={pageNumber <= 1} onClick={() => setPageNumber(p => p - 1)}>Previous</button>
            <span>{pageNumber} / {numPages || '--'}</span>
            <button disabled={numPages !== null && pageNumber >= numPages} onClick={() => setPageNumber(p => p + 1)}>Next</button>
            
            <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 0.5rem' }}></div>
            
            <button 
              onClick={() => {
                const nextState = !isAutoPlay;
                setIsAutoPlay(nextState);
                autoPlayRef.current = nextState;
              }}
              style={{
                background: isAutoPlay ? 'var(--text-primary)' : 'transparent',
                color: isAutoPlay ? 'var(--background)' : 'var(--text-primary)',
                border: isAutoPlay ? '1px solid var(--text-primary)' : '1px solid var(--border)'
              }}
            >
              {isAutoPlay ? 'Auto-Play: ON' : 'Auto-Play: OFF'}
            </button>
          </div>

          <div className="pdf-canvas-wrapper" style={{ position: 'relative' }}>
            <p className="helper-text">Select area to extract</p>
            
            <div 
              className="pdf-canvas-container"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <canvas ref={canvasRef}></canvas>
              
              {displayBox && (
                <div className="crop-box" style={{
                  left: displayBox.x,
                  top: displayBox.y,
                  width: displayBox.w,
                  height: displayBox.h,
                }}></div>
              )}
            </div>
          </div>
        </div>

        <div className="reader-right-panel">
          <div className="ai-panel">
            <h2>Extraction</h2>
            
            <button className="extract-btn" onClick={performOCR} disabled={isExtracting || !numPages}>
              {isExtracting ? 'Extracting...' : cropRect ? 'Extract Selection' : 'Extract Page'}
            </button>
            
            {extractedText && (
              <div className="extracted-text">
                <h3>
                  Dialogue 
                  {currentMood && <span className="mood-badge">{currentMood}</span>}
                </h3>
                <p>{extractedText}</p>
                <div style={{ marginTop: '1.5rem' }}>
                  <button className="play-btn" onClick={isPlaying ? () => { window.speechSynthesis.cancel(); setIsPlaying(false); } : speakText}>
                    {isPlaying ? 'Stop Audio' : 'Play Audio'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PDFReader;
