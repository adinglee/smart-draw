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
import fixUnclosed from '@/lib/fixUnclosed';
import { getConfig } from '@/lib/config';
import { historyManager } from '@/lib/history-manager';
import { getBlob } from '@/lib/indexeddb';

// Dynamically import DrawioCanvas to avoid SSR issues
const DrawioCanvas = dynamic(() => import('@/components/DrawioCanvas'), {
  ssr: false,
});

export default function DrawioPage() {
  const [config, setConfig] = useState(null);
  const [isConfigManagerOpen, setIsConfigManagerOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isCombinedSettingsOpen, setIsCombinedSettingsOpen] = useState(false);
  const [diagramXml, setDiagramXml] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [messages, setMessages] = useState([]);
  // Conversation id to group continuous dialogue within the same chat
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

    // Load password access state
    const passwordEnabled = localStorage.getItem('smart-excalidraw-use-password') === 'true';
    setUsePassword(passwordEnabled);

    // Listen for storage changes to sync across tabs
    const handleStorageChange = (e) => {
      if (e.key === 'smart-excalidraw-active-config' || e.key === 'smart-excalidraw-configs') {
        const newConfig = getConfig();
        setConfig(newConfig);
      }
      if (e.key === 'smart-excalidraw-use-password') {
        const passwordEnabled = localStorage.getItem('smart-excalidraw-use-password') === 'true';
        setUsePassword(passwordEnabled);
      }
    };

    // Listen for custom event from AccessPasswordModal (same tab)
    const handlePasswordSettingsChanged = (e) => {
      setUsePassword(e.detail.usePassword);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('password-settings-changed', handlePasswordSettingsChanged);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('password-settings-changed', handlePasswordSettingsChanged);
    };
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

  // Post-process Draw.io XML code: robustly extract XML and clean artifacts
  const postProcessDrawioCode = (code) => {
    if (!code || typeof code !== 'string') return code;

    let processed = code;

    // Remove BOM and zero-width characters that can break XML parsing
    processed = processed.replace(/\ufeff/g, '').replace(/[\u200B-\u200D\u2060]/g, '');

    // 1) Prefer extracting first fenced block anywhere in the text
    // Try ```xml ... ``` first
    const fencedXmlMatch = processed.match(/```\s*xml\s*([\s\S]*?)```/i);
    if (fencedXmlMatch && fencedXmlMatch[1]) {
      processed = fencedXmlMatch[1];
    } else {
      // Fallback: any fenced block
      const fencedAnyMatch = processed.match(/```\s*([\s\S]*?)```/);
      if (fencedAnyMatch && fencedAnyMatch[1]) {
        processed = fencedAnyMatch[1];
      }
    }

    processed = processed.trim();

    // 2) If HTML-escaped XML is detected, decode minimal entities
    if (!/[<][a-z!?]/i.test(processed) && /&lt;\s*[a-z!?]/i.test(processed)) {
      processed = processed
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    }

    // 3) Extract the first plausible XML block
    const xmlStart = processed.search(/<(mxfile|mxGraphModel|diagram)([\s>])/i);
    const xmlEnd = processed.lastIndexOf('>');
    if (xmlStart !== -1 && xmlEnd !== -1 && xmlEnd > xmlStart) {
      processed = processed.slice(xmlStart, xmlEnd + 1);
    }

    // 4) Fix common unclosed tag issues
    processed = fixUnclosed(processed, { mode: 'xml' });

    return processed;
  };

  const showNotification = useCallback((opts) => {
    setNotification({ isOpen: true, title: opts.title || '', message: opts.message || '', type: opts.type || 'info' });
  }, []);

  const closeNotification = useCallback(() => {
    setNotification(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Generate drawio XML via SSE
  const generateDiagram = async ({ input, mode = 'create', contextXml = '' }) => {
    try {
      setIsGenerating(true);

      // Only include recent messages to constrain context size
      const HISTORY_LIMIT = 3;
      const recentHistory = messages.slice(-HISTORY_LIMIT).map(m => ({ role: m.role, content: m.content }));

      const activeConfig = getConfig();
      const useServerPassword = typeof window !== 'undefined' && localStorage.getItem('smart-excalidraw-use-password') === 'true';
      const accessPassword = typeof window !== 'undefined' ? localStorage.getItem('smart-excalidraw-access-password') : '';

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(useServerPassword ? { 'x-access-password': accessPassword || '' } : {})
        },
        body: JSON.stringify({
          config: activeConfig,
          userInput: { text: input, ...(contextXml ? { contextXml } : {}) },
          chartType: null,
          conversationId,
          history: recentHistory
        })
      });

      if (!response.ok && response.status !== 200) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || `请求失败: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      let accumulated = '';
      let collectedXml = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;

        const events = accumulated.split('\n\n');
        accumulated = events.pop(); // keep incomplete event for next read

        for (const evt of events) {
          if (!evt.startsWith('data: ')) continue;
          const jsonStr = evt.slice(6);
          if (jsonStr === '[DONE]') continue;
          try {
            const data = JSON.parse(jsonStr);
            if (data?.error) throw new Error(data.error);
            if (typeof data?.content === 'string') {
              collectedXml += data.content;
              setDiagramXml(postProcessDrawioCode(collectedXml));
            }
          } catch {}
        }
      }

      // Final update and history record
      const finalXml = postProcessDrawioCode(collectedXml);
      setDiagramXml(finalXml);

      historyManager.add({
        id: Date.now(),
        editor: 'drawio',
        userInput: input,
        generatedCode: finalXml,
        conversationId
      });
    } catch (error) {
      console.error(error);
      showNotification({ title: '生成失败', message: error.message || '生成失败', type: 'error' });
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle send message
  const handleSendMessage = async (input, mode = 'auto') => {
    const trimmed = (input || '').trim();
    if (!trimmed) return;

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);

    // Compute context xml depending on mode
    let contextXml = '';
    try {
      if (mode === 'modify' || mode === 'append' || mode === 'auto') {
        // Try to include current diagram as context
        const blob = await getBlob('current-export');
        if (blob) {
          const xmlText = await blob.text();
          if (xmlText && xmlText.trim()) {
            contextXml = xmlText;
          }
        }
      }
    } catch {}

    await generateDiagram({ input: trimmed, mode, contextXml });

    // Add assistant message (final xml)
    setMessages(prev => [...prev, { role: 'assistant', content: diagramXml, type: 'xml' }]);
  };

  // Handle save from DrawioCanvas
  const handleSaveDiagram = async (xmlOrData) => {
    try {
      // Store the raw xml (for context and downloads)
      const xml = typeof xmlOrData === 'string' ? xmlOrData : (xmlOrData?.data || '');
      if (!xml) return;
      setDiagramXml(fixUnclosed(xml, { mode: 'xml' }));
      showNotification({ title: '已保存', message: '图表已更新', type: 'success' });
    } catch (e) {
      showNotification({ title: '保存失败', message: e?.message || '保存失败', type: 'error' });
    }
  };

  // Handle config selection
  const handleConfigSelect = (selectedConfig) => {
    setConfig(selectedConfig);
  };

  // Start a new chat (clear context)
  const handleNewChat = () => {
    setMessages([]);
    setConversationId(newConversationId());
  };

  // Apply a history item
  const handleApplyHistory = async (history) => {
    if (!history) return;

    if (history.blobKey) {
      try {
        const blob = await getBlob(history.blobKey);
        if (blob) {
          const text = await blob.text();
          const fixed = fixUnclosed(text || '', { mode: 'xml' });
          setDiagramXml(fixed);
          setMessages([
            { role: 'user', content: history.userInput },
            { role: 'assistant', content: fixed, type: 'xml' }
          ]);
          return;
        }
      } catch {}
    }

    if (history.generatedCode) {
      try {
        const raw = history.userInput || '';
        const typed = raw.replace(/```[a-z]*[\s\S]*?```/g, '').trim();

        const nameMatches = [...raw.matchAll(/^#\s*(?:来自文件|From file)\s*:\s*(.+)$/gm)] || [];
        const files = nameMatches.map(m => ({ name: (m[1] || 'file').trim(), type: 'text/plain', size: 0 }));

        setDiagramXml(fixUnclosed(history.generatedCode || '', { mode: 'xml' }));
        setMessages([
          { role: 'user', content: typed, files },
          { role: 'assistant', content: fixUnclosed(history.generatedCode || '', { mode: 'xml' }), type: 'xml' }
        ]);
      } catch {
        setDiagramXml(fixUnclosed(history.generatedCode || '', { mode: 'xml' }));
        setMessages([
          { role: 'user', content: history.userInput },
          { role: 'assistant', content: fixUnclosed(history.generatedCode || '', { mode: 'xml' }), type: 'xml' }
        ]);
      }
    }
  };

  // Handle file upload
  const handleFileUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.txt';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        const text = await file.text();
        handleSendMessage(text, 'auto');
      }
    };
    input.click();
  };

  // Handle image upload
  const handleImageUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        // TODO: Implement image upload logic
        setNotification({
          isOpen: true,
          title: '功能开发中',
          message: '图片上传功能即将推出',
          type: 'info'
        });
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50" style={{ paddingRight: chatPanelWidth || 0 }}>
      {/* Header */}
      <AppHeader />

      {/* Main Content - Full Screen DrawioCanvas */}
      <div className="flex-1 overflow-hidden">
        <DrawioCanvas xml={diagramXml} onSave={handleSaveDiagram} />
      </div>

      {/* Floating Chat */}
      <FloatingChat
        onSendMessage={handleSendMessage}
        isGenerating={isGenerating}
        messages={messages}
        onFileUpload={handleFileUpload}
        onImageUpload={handleImageUpload}
        onNewChat={handleNewChat}
        onApplyXml={(xml) => setDiagramXml(fixUnclosed(xml || '', { mode: 'xml' }))}
        conversationId={conversationId}
        onOpenHistory={() => setIsHistoryModalOpen(true)}
        onOpenSettings={() => setIsCombinedSettingsOpen(true)}
      />

      {/* Config Manager Modal */}
      <ConfigManager
        isOpen={isConfigManagerOpen}
        onClose={() => setIsConfigManagerOpen(false)}
        onConfigSelect={handleConfigSelect}
      />

      {/* History Modal */}
      <HistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        onApply={handleApplyHistory}
        editorType="drawio"
      />

      {/* Combined Settings Modal */}
      <CombinedSettingsModal
        isOpen={isCombinedSettingsOpen}
        onClose={() => setIsCombinedSettingsOpen(false)}
        usePassword={usePassword}
        currentConfig={config}
        onOpenConfigManager={() => setIsConfigManagerOpen(true)}
      />

      {/* Contact Modal */}
      <ContactModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
      />

      {/* Notification */}
      <Notification
        isOpen={notification.isOpen}
        onClose={() => setNotification({ ...notification, isOpen: false })}
        title={notification.title}
        message={notification.message}
        type={notification.type}
      />
    </div>
  );
}
