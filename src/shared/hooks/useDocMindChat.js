import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = import.meta.env.DEV ? '/docmind-api' : 'https://rag.docmind.codewithrishi.fun/api/public';
const API_KEY = import.meta.env.VITE_DOCMIND_API_KEY;

export function useDocMindChat() {
  const [messages, setMessages] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  
  // Keep config in ref to avoid re-renders if not needed in UI
  const configRef = useRef({ limits: { maxHistoryTurns: 6, maxQueryLength: 1000 } });
  const sessionIdRef = useRef(crypto.randomUUID());

  // Initialization
  useEffect(() => {
    const initChat = async () => {
      try {
        const res = await fetch(`${API_URL}/config`, {
          headers: { 'X-Api-Key': API_KEY }
        });
        
        if (!res.ok) {
          throw new Error('Failed to load chat configuration');
        }
        
        const data = await res.json();
        configRef.current = data;
        setIsInitialized(true);
      } catch (err) {
        console.error('DocMind init error:', err);
        setError('Chat is currently unavailable.');
      }
    };

    if (API_KEY) {
      initChat();
    } else {
      setError('Missing API Key.');
    }
  }, []);

  const sendMessage = useCallback(async (query) => {
    if (!query.trim() || isLoading || isStreaming) return;

    const currentQuery = query.trim();
    
    // Check limits
    const maxLength = configRef.current?.limits?.maxQueryLength || 1000;
    if (currentQuery.length > maxLength) {
      setError(`Query exceeds maximum length of ${maxLength} characters.`);
      return;
    }

    // Prepare history payload based on limits
    const maxTurns = configRef.current?.limits?.maxHistoryTurns || 6;
    
    // We filter out any transient properties from state messages
    const validHistory = messages.map(m => ({ role: m.role, content: m.content }));
    // Slice to keep only the latest allowed turns
    const historyPayload = validHistory.slice(-maxTurns);

    // Optimistically add the user message and a placeholder for the assistant
    const userMessage = { id: crypto.randomUUID(), role: 'user', content: currentQuery };
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

      // Ensure the final state reflects streaming is done
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantMessageId) {
          return { ...msg, isStreaming: false };
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
    isLoading,
    isStreaming,
    error,
    isInitialized,
    config: configRef.current
  };
}
