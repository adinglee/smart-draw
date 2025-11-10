'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export default function DrawioCanvas({ xml, onSave, onError }) {
  const iframeRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Draw.io embed URL with configuration
  const drawioUrl = 'https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1&saveAndExit=0&noSaveBtn=0&noExitBtn=1';

  // Handle messages from Draw.io iframe
  const handleMessage = useCallback((event) => {
    // Security check: only accept messages from diagrams.net
    if (event.origin !== 'https://embed.diagrams.net') {
      return;
    }

    const data = event.data;

    // Handle string messages (legacy format)
    if (typeof data === 'string') {
      if (data === 'ready') {
        setIsReady(true);
        setIsLoading(false);
      }
      return;
    }

    // Handle JSON protocol messages
    if (typeof data === 'object') {
      switch (data.event) {
        case 'init':
          // Draw.io is initialized, send the diagram data
          setIsReady(true);
          setIsLoading(false);
          if (iframeRef.current && xml) {
            sendLoadMessage(xml);
          }
          break;

        case 'load':
          // Diagram has been loaded successfully
          console.log('Diagram loaded:', data);
          break;

        case 'save':
          // User clicked save button
          if (onSave && data.xml) {
            onSave(data.xml);
          }
          // If exit flag is set, handle exit
          if (data.exit) {
            console.log('Save and exit');
          }
          break;

        case 'exit':
          // User clicked exit button
          console.log('Exit:', data.modified);
          break;

        case 'autosave':
          // Auto-save event
          if (onSave && data.xml) {
            onSave(data.xml);
          }
          break;

        case 'export':
          // Export completed
          console.log('Export completed:', data.format);
          break;

        case 'error':
          // Error occurred
          const errorMsg = data.message || 'Unknown error occurred';
          setError(errorMsg);
          if (onError) {
            onError(errorMsg);
          }
          break;

        default:
          console.log('Unknown event from Draw.io:', data);
      }
    }
  }, [xml, onSave, onError]);

  // Send load message to Draw.io
  const sendLoadMessage = useCallback((xmlData) => {
    if (!iframeRef.current || !isReady) return;

    const message = {
      action: 'load',
      xml: xmlData || '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>',
      autosave: 1, // Enable autosave
    };

    iframeRef.current.contentWindow.postMessage(JSON.stringify(message), 'https://embed.diagrams.net');
  }, [isReady]);

  // Set up message listener
  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleMessage]);

  // Load diagram when ready and XML changes
  useEffect(() => {
    if (isReady && xml) {
      sendLoadMessage(xml);
    }
  }, [isReady, xml, sendLoadMessage]);

  // Export diagram as PNG (optional utility method)
  const exportDiagram = useCallback((format = 'png') => {
    if (!iframeRef.current || !isReady) return;

    const message = {
      action: 'export',
      format: format, // 'png', 'svg', 'xmlpng', 'xmlsvg'
    };

    iframeRef.current.contentWindow.postMessage(JSON.stringify(message), 'https://embed.diagrams.net');
  }, [isReady]);

  // Merge XML into current diagram (optional utility method)
  const mergeDiagram = useCallback((xmlData) => {
    if (!iframeRef.current || !isReady) return;

    const message = {
      action: 'merge',
      xml: xmlData,
    };

    iframeRef.current.contentWindow.postMessage(JSON.stringify(message), 'https://embed.diagrams.net');
  }, [isReady]);

  return (
    <div className="w-full h-full relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading Draw.io editor...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-20 max-w-md">
          <p className="font-bold">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={drawioUrl}
        className="w-full h-full border-0"
        title="Draw.io Editor"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
