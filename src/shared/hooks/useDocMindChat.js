import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = import.meta.env.DEV ? '/docmind-api' : 'https://api.codewithrishi.fun/api/public';
const API_KEY = import.meta.env.VITE_DOCMIND_API_KEY;

// The RAG backend emits this sentinel when no relevant context is found.
// We replace it with a friendly message that doesn't expose implementation details.
const NOT_IN_CONTEXT_SENTINEL = "I could not find any relevant information in the uploaded documents to answer your question.";
const NOT_IN_CONTEXT_REPLY = "I'm sorry, I don't have information about that right now. Please try rephrasing your question, or contact our support team for more help.";

// Default config used before the API responds
const DEFAULT_CONFIG = {
  workspace: { name: 'HR Clouds' },
  widget: {
    title: 'Maya',
    description: 'HR Assistant · Online',
    welcomeMessage: "Hi there! I'm Maya, your HR assistant. Ask me anything about HR Clouds — policies, payroll, leave, and more.",
    placeholder: 'Ask Maya anything…',
    suggestedQuestions: [
      'What are the leave policies at HR Clouds?',
      'How do I apply for payroll services?',
      'What features does HR Clouds offer?',
    ],
    primaryColor: '#7c3aed',
    theme: 'light',
    sourceMode: 'labels',
  },
  limits: { maxQueryLength: 1000, maxHistoryTurns: 6 },
  capabilities: { filterByDocument: false },
};

export function useDocMindChat() {
  const [messages, setMessages] = useState([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);

  // Keep limits in ref for use inside callbacks without stale closure issues
  const limitsRef = useRef(DEFAULT_CONFIG.limits);
  const sessionIdRef = useRef(crypto.randomUUID());

  // Initialization
  useEffect(() => {
    const initChat = async () => {
      try {
        const res = await fetch(`${API_URL}/config`, {
          headers: { 'X-Api-Key': API_KEY }
        });

        // Check content-type before parsing
        let data = null;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          data = await res.json();
        } else {
          const text = await res.text();
          console.warn('DocMind config returned non-JSON:', res.status, text.slice(0, 120));
        }

        if (!res.ok) {
          const msg = data?.error || 'Failed to load chat configuration';
          console.error('DocMind config error:', msg);
          // Still mark initialized — use defaults
          setIsInitialized(true);
          return;
        }

        if (data?.success) {
          // Deep merge with defaults so missing fields fallback gracefully
          setConfig(prev => ({
            ...prev,
            ...data,
            workspace: { ...prev.workspace, ...(data.workspace || {}) },
            widget: { ...prev.widget, ...(data.widget || {}) },
            limits: { ...prev.limits, ...(data.limits || {}) },
            capabilities: { ...prev.capabilities, ...(data.capabilities || {}) },
          }));
          if (data.limits) limitsRef.current = { ...DEFAULT_CONFIG.limits, ...data.limits };
        }

        setIsInitialized(true);
      } catch (err) {
        console.error('DocMind init error:', err);
        setIsInitialized(true); // Use defaults, don't block the widget
      }
    };

    if (API_KEY) {
      initChat();
    } else {
      setError('Missing API Key.');
      setIsInitialized(true);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    sessionIdRef.current = crypto.randomUUID(); // Fresh session
  }, []);

  const sendMessage = useCallback(async (query) => {
    if (!query.trim() || isLoading || isStreaming) return;

    const currentQuery = query.trim();

    // Check limits from ref (always up to date, no closure issues)
    const maxLength = limitsRef.current?.maxQueryLength || 1000;
    if (currentQuery.length > maxLength) {
      setError(`Query exceeds maximum length of ${maxLength} characters.`);
      return;
    }

    // Prepare history payload based on limits
    const maxTurns = limitsRef.current?.maxHistoryTurns || 6;

    // Filter out transient UI properties before sending
    const validHistory = messages.map(m => ({ role: m.role, content: m.content }));
    const historyPayload = validHistory.slice(-maxTurns);

    // Optimistically add the user message and a placeholder for the assistant
    const userMessage = { id: crypto.randomUUID(), role: 'user', content: currentQuery, sentAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    const assistantMessageId = crypto.randomUUID();

    setMessages(prev => [
      ...prev,
      userMessage,
      { id: assistantMessageId, role: 'assistant', content: '', isStreaming: true }
    ]);
    
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': API_KEY
        },
        body: JSON.stringify({
          query: currentQuery,
          stream: true,
          sessionId: sessionIdRef.current,
          history: historyPayload
        })
      });

      setIsLoading(false);

      if (!response.ok) {
        let errMessage = 'An error occurred while generating the answer.';
        if (response.status === 429) {
          errMessage = 'Sending too quickly or quota exceeded. Please wait a moment.';
        } else if (response.status === 401) {
          errMessage = 'Authentication error. Please refresh or try again later.';
        } else {
          try {
            const errData = await response.json();
            if (errData.error) errMessage = errData.error;
          } catch(e) {
             errMessage = response.statusText;
          }
        }
        throw new Error(errMessage);
      }

      setIsStreaming(true);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Split by SSE double newline boundary
        const chunks = buffer.split('\n\n');
        
        // The last chunk might be incomplete, so keep it in the buffer
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          if (!chunk.trim()) continue;

          // Parse event block
          const lines = chunk.split('\n');
          let eventType = 'chunk';
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              dataStr = line.slice(6);
            }
          }

          if (dataStr) {
            try {
              const data = JSON.parse(dataStr);
              
              if (eventType === 'chunk') {
                setMessages(prev => prev.map(msg => {
                  if (msg.id === assistantMessageId) {
                    return { ...msg, content: msg.content + data.content };
                  }
                  return msg;
                }));
              } else if (eventType === 'sources') {
                setMessages(prev => prev.map(msg => {
                  if (msg.id === assistantMessageId) {
                    return { ...msg, sources: data.sources };
                  }
                  return msg;
                }));
              } else if (eventType === 'error') {
                throw new Error(data.error);
              }
            } catch (e) {
              // If JSON parsing fails, we might just ignore or log
              // console.warn('Failed to parse SSE data:', e);
            }
          }
        }
      }

      // Mark streaming done, stamp time, and sanitise sentinel messages
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantMessageId) {
          const finalContent = msg.content.trim() === NOT_IN_CONTEXT_SENTINEL
            ? NOT_IN_CONTEXT_REPLY
            : msg.content;
          return { ...msg, isStreaming: false, content: finalContent, sentAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        }
        return msg;
      }));

    } catch (err) {
      console.error('Chat error:', err);
      // Remove the optimistically added placeholder if we didn't start streaming it properly
      // Or just append an error message
      setMessages(prev => {
        const filtered = prev.filter(msg => msg.id !== assistantMessageId);
        return [...filtered, { id: crypto.randomUUID(), role: 'assistant', content: `**Error:** ${err.message}`, isError: true }];
      });
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, [messages, isLoading, isStreaming]);

  return {
    messages,
    sendMessage,
    clearMessages,
    isLoading,
    isStreaming,
    error,
    isInitialized,
    config,
  };
}
