'use client';

import { useState, useEffect, useCallback } from 'react';
import AppHeader from '@/components/AppHeader';
import dynamic from 'next/dynamic';
import FloatingChat from '@/components/FloatingChat';
import ConfigManager from '@/components/ConfigManager';
import ContactModal from '@/components/ContactModal';
import HistoryModal from '@/components/HistoryModal';
import CombinedSettingsModal from '@/components/CombinedSettingsModal';
import Notification from '@/components/Notification';
import { getConfig, isConfigValid } from '@/lib/config';
import { historyManager } from '@/lib/history-manager';
import { getBlob } from '@/lib/indexeddb';
import { optimizeExcalidrawCode } from '@/lib/optimizeArrows';
import { fixJSON } from '@/lib/fixUnclosed';

// Dynamically import ExcalidrawCanvas to avoid SSR issues
const ExcalidrawCanvas = dynamic(() => import('@/components/ExcalidrawCanvas'), {
  ssr: false,
});

export default function ExcalidrawPage() {
  const [config, setConfig] = useState(null);
  const [isConfigManagerOpen, setIsConfigManagerOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isCombinedSettingsOpen, setIsCombinedSettingsOpen] = useState(false);
  const [elements, setElements] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState([]);
  const newConversationId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const [conversationId, setConversationId] = useState(newConversationId());
  const [notification, setNotification] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });
  const [chatPanelWidth, setChatPanelWidth] = useState(0);

  // Load config on mount and listen for config changes
  useEffect(() => {
    const savedConfig = getConfig();
    if (savedConfig) {
      setConfig(savedConfig);
    }

    const handleStorageChange = (e) => {
      if (e.key === 'smart-excalidraw-active-config' || e.key === 'smart-excalidraw-configs' || e.key === 'smart-drawio-active-config' || e.key === 'smart-drawio-configs') {
        const newConfig = getConfig();
        setConfig(newConfig);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Listen for chat panel open/close and width to set right padding
  useEffect(() => {
    const onVisibility = (e) => {
      try {
        const open = !!e?.detail?.open;
        const width = Number(e?.detail?.width || 0);
        setChatPanelWidth(open ? width : 0);
      } catch {
        setChatPanelWidth(0);
      }
    };
    window.addEventListener('chatpanel-visibility-change', onVisibility);
    return () => window.removeEventListener('chatpanel-visibility-change', onVisibility);
  }, []);

  const showNotification = useCallback((opts) => {
    setNotification({ isOpen: true, title: opts.title || '', message: opts.message || '', type: opts.type || 'info' });
  }, []);

  const closeNotification = useCallback(() => {
    setNotification(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Robustly extract Excalidraw JSON from model output
  const postProcessExcalidrawCode = (code) => {
    if (!code || typeof code !== 'string') return '';
    let text = code.replace(/\ufeff/g, '').replace(/[\u200B-\u200D\u2060]/g, '').trim();
    // Prefer fenced json
    const fencedJson = text.match(/```\s*json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
    if (fencedJson && fencedJson[1]) text = fencedJson[1].trim();
    // Try to detect main JSON block
    const idxObjStart = text.indexOf('{');
    const idxObjEnd = text.lastIndexOf('}');
    const idxArrStart = text.indexOf('[');
    const idxArrEnd = text.lastIndexOf(']');
    if (idxArrStart !== -1 && idxArrEnd !== -1 && (idxObjStart === -1 || idxArrStart < idxObjStart)) {
      text = text.slice(idxArrStart, idxArrEnd + 1);
    } else if (idxObjStart !== -1 && idxObjEnd !== -1) {
      text = text.slice(idxObjStart, idxObjEnd + 1);
    }
    return text.trim();
  };

  const parseElements = (jsonText) => {
    try {
      const fixed = fixJSON(jsonText || '');
      // 优先在修复后再做箭头优化，避免优化器解析失败
      const optimized = optimizeExcalidrawCode ? optimizeExcalidrawCode(fixed) : fixed;
      const data = JSON.parse(optimized);
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.elements)) return data.elements;
      if (data && Array.isArray(data.items)) return data.items;
      return [];
    } catch (e) {
      console.error('Failed to parse Excalidraw JSON:', e);
      return [];
    }
  };

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setElements([]);
    setConversationId(newConversationId());
  }, []);

  // Attachment helpers (reuse patterns from drawio page)
  const fileToBase64 = (file) => new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || '';
        const base64 = typeof result === 'string' ? result.split(',')[1] : '';
        resolve(base64 || '');
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    } catch {
      resolve('');
    }
  });

  const handleImageUpload = useCallback(async (imageFiles = []) => {
    // Display thumbnails in chat immediately
    try {
      const display = await Promise.all((imageFiles || []).map(async ({ file, type, name }) => ({
        file,
        type: (file && file.type) || type || 'image/png',
        name: (file && file.name) || name || 'image',
        url: file ? URL.createObjectURL(file) : undefined,
      })));
      setMessages(prev => [...prev, { role: 'user', content: '', type: 'image', images: display }]);
    } catch {}
  }, []);

  const handleFileUpload = useCallback(async (files = []) => {
    // Show file names in chat
    try {
      const display = (files || []).map(({ file, type, name, size }) => ({
        file,
        type: (file && file.type) || type || 'text/plain',
        name: (file && file.name) || name || 'file',
        size: (file && file.size) || size || 0,
      }));
      setMessages(prev => [...prev, { role: 'user', content: '', type: 'file', files: display }]);
    } catch {}
  }, []);

  const handleSendMessage = useCallback(async (userMessage, chartType = 'auto', imageFiles = [], files = [], _typedText) => {
    if (!config || !isConfigValid(config)) {
      setIsCombinedSettingsOpen(true);
      showNotification({ title: '配置无效', message: '请先完善 LLM 配置', type: 'warning' });
      return;
    }

    setIsGenerating(true);
    let cleanupThumbs = [];
    try {
      // Prepare attachments for server
      let encodedImages = [];
      if (Array.isArray(imageFiles) && imageFiles.length > 0) {
        encodedImages = await Promise.all(
          imageFiles.map(async ({ file, type, name }) => ({
            data: await fileToBase64(file),
            mimeType: (file && file.type) || type || 'image/png',
            name: (file && file.name) || name || 'image'
          }))
        );
        // Note: we show thumbnails using data URLs below, so we don't need object URLs here.
        cleanupThumbs = [];
      }

      // Build payload
      let userPayload = userMessage;
      if (encodedImages.length > 0) {
        userPayload = { text: userMessage, images: encodedImages };
      }

      // Update chat immediately with user's input + attachments for display
      try {
        const filesForDisplay = Array.isArray(files)
          ? files.map(f => ({ name: f?.name || 'file', size: f?.size || 0, type: f?.type || 'text/plain' }))
          : [];
        const imagesForDisplay = encodedImages.map(({ data, mimeType, name }) => ({
          url: `data:${mimeType};base64,${data}`,
          name,
          type: mimeType,
        }));
        const contentForDisplay = (typeof _typedText === 'string')
          ? _typedText
          : (typeof userMessage === 'string' ? userMessage : '');
        setMessages(prev => ([
          ...prev,
          { role: 'user', content: contentForDisplay, files: filesForDisplay, images: imagesForDisplay },
        ]));
      } catch {}

      const headers = new Headers({ 'Content-Type': 'application/json' });
      try {
        const accessPassword = typeof window !== 'undefined' ? localStorage.getItem('smart-excalidraw-access-password') : '';
        const usePassword = typeof window !== 'undefined' ? localStorage.getItem('smart-excalidraw-use-password') === 'true' : false;
        if (usePassword && accessPassword) headers.set('x-access-password', accessPassword);
      } catch {}

      // Prepare conversation history for server (exclude heavy content)
      const historyForServer = (() => {
        try {
          return (messages || [])
            .map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '' }))
            .filter(m => m.content);
        } catch { return []; }
      })();

      const response = await fetch('/api/generate/excalidraw', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          config,
          userInput: userPayload,
          chartType,
          conversationId,
          history: historyForServer,
        }),
      });

      if (!response.ok) {
        let errorMessage = '生成代码失败';
        try {
          const errorData = await response.json();
          if (errorData.error) errorMessage = errorData.error;
        } catch {}
        throw new Error(errorMessage);
      }

      // Create streaming placeholder in chat
      setMessages(prev => ([...prev, { role: 'assistant', content: '', type: 'json', streaming: true }]));

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedCode = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.content) {
                accumulatedCode += data.content;
                // Live update last assistant bubble
                try {
                  setMessages(prev => {
                    const next = [...prev];
                    for (let i = next.length - 1; i >= 0; i--) {
                      if (next[i]?.role === 'assistant' && next[i]?.streaming) {
                        next[i] = { ...next[i], content: accumulatedCode };
                        break;
                      }
                    }
                    return next;
                  });
                } catch {}
              }
              else if (data.error) throw new Error(data.error);
            } catch (e) {
              console.error('SSE parse error:', e);
            }
          }
        }
      }

      const processed = postProcessExcalidrawCode(accumulatedCode);
      const parsedElements = parseElements(processed);

      if (parsedElements && parsedElements.length > 0) {
        setElements(parsedElements);

        // Save history
        try {
          await historyManager.addHistory({
            conversationId,
            chartType,
            userInput: typeof userMessage === 'string' ? userMessage : '',
            generatedCode: processed,
            config,
            // Try to persist attachments (blobs)
            images: (imageFiles || []).map(f => ({ file: f.file || null, name: f.name, type: f.type })),
            files: (files || []).map(f => ({ file: f.file || null, name: f.name, type: f.type, size: f.size })),
            editor: 'excalidraw',
          });
        } catch (e) {
          console.warn('Failed to write history:', e);
        }

        // Update messages list
        setMessages(prev => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i]?.role === 'assistant' && next[i]?.streaming) {
              next[i] = { role: 'assistant', content: processed, type: 'json' };
              return next;
            }
          }
          return [...next, { role: 'assistant', content: processed, type: 'json' }];
        });
      } else {
        // Keep code content for inspection even if parse failed
        setMessages(prev => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i]?.role === 'assistant' && next[i]?.streaming) {
              next[i] = { role: 'assistant', content: processed, type: 'json' };
              return next;
            }
          }
          return [...next, { role: 'assistant', content: processed, type: 'json' }];
        });
      }
    } catch (e) {
      // Keep any streamed code; do not clear bubble on error
      setMessages(prev => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i]?.role === 'assistant' && next[i]?.streaming) {
            const content = next[i].content || '';
            next[i] = { role: 'assistant', content: content || `错误: ${e.message || '生成失败'}`, type: 'json' };
            return next;
          }
        }
        return [...next, { role: 'assistant', content: `错误: ${e.message || '生成失败'}` }];
      });
      showNotification({ title: '出错了', message: e.message || '生成失败', type: 'danger' });
    } finally {
      setIsGenerating(false);
      // Cleanup blob URLs
      try { cleanupThumbs.forEach(url => url && URL.revokeObjectURL(url)); } catch {}
    }
  }, [config, conversationId, messages, showNotification]);

  const handleApplyHistory = useCallback(async (history) => {
    try {
      setConversationId(history.id);
      // Load messages for chat context
      const msgs = await historyManager.getConversationMessages(history.id);
      // Rehydrate attachments for display
      const normalized = await Promise.all((msgs || []).map(async (m) => {
        const base = { role: m.role, content: m.content, type: m.type };
        if (m.role === 'user' && Array.isArray(m.attachments) && m.attachments.length > 0) {
          const results = [];
          for (const att of m.attachments) {
            try {
              const rec = att?.blobId ? await getBlob(att.blobId) : null;
              const name = att?.name || rec?.name || 'file';
              const type = att?.type || rec?.type || 'application/octet-stream';
              const size = att?.size || rec?.size || 0;
              if (type.startsWith('image/') || att?.kind === 'image') {
                const blob = rec?.blob || null;
                const url = blob ? URL.createObjectURL(blob) : undefined;
                results.push({ kind: 'image', file: blob, type, name, url });
              } else {
                const blob = rec?.blob || null;
                results.push({ kind: 'file', file: blob, type, name, size });
              }
            } catch {}
          }
          if (results.some(x => x.kind === 'image')) return { ...base, images: results.filter(x => x.kind === 'image') };
          if (results.some(x => x.kind === 'file')) return { ...base, files: results.filter(x => x.kind === 'file') };
        }
        return base;
      }));
      setMessages(normalized);

      const els = parseElements(history.generatedCode || '');
      setElements(els);
    } catch (e) {
      showNotification({ title: '载入失败', message: e.message || '无法载入历史记录', type: 'danger' });
    }
  }, [showNotification]);

  return (
    <div className="flex flex-col h-screen bg-gray-50" style={{ paddingRight: chatPanelWidth || 0 }}>
      {/* Header */}
      <AppHeader />

      <main className="flex-1 relative">
        <ExcalidrawCanvas elements={elements} />

        <FloatingChat
          onSendMessage={handleSendMessage}
          isGenerating={isGenerating}
          messages={messages}
          onImageUpload={handleImageUpload}
          onFileUpload={handleFileUpload}
          onNewChat={handleNewChat}
          onApplyXml={(code) => {
            try {
              const processed = postProcessExcalidrawCode(code || '');
              const els = parseElements(processed);
              if (els && els.length > 0) {
                setElements(els);
              } else {
                showNotification({ title: '无法应用', message: '未检测到有效的 Excalidraw 元素', type: 'warning' });
              }
            } catch (e) {
              showNotification({ title: '应用失败', message: e?.message || '无法解析生成内容', type: 'danger' });
            }
          }}
          conversationId={conversationId}
          onOpenHistory={() => setIsHistoryModalOpen(true)}
          onOpenSettings={() => setIsCombinedSettingsOpen(true)}
        />
      </main>

      {/* Modals and overlays */}
      <ConfigManager isOpen={isConfigManagerOpen} onClose={() => setIsConfigManagerOpen(false)} />
      <ContactModal isOpen={isContactModalOpen} onClose={() => setIsContactModalOpen(false)} />
      <CombinedSettingsModal isOpen={isCombinedSettingsOpen} onClose={() => setIsCombinedSettingsOpen(false)} />
      <HistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        onApply={handleApplyHistory}
        editorType="excalidraw"
      />
      <Notification
        isOpen={notification.isOpen}
        title={notification.title}
        message={notification.message}
        type={notification.type}
        onClose={closeNotification}
      />
    </div>
  );
}
