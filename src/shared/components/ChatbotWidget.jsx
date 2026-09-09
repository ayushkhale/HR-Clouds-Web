import React, { useState, useRef, useEffect } from 'react';
import { HiChatBubbleLeftRight, HiXMark, HiPaperAirplane } from 'react-icons/hi2';
import { useDocMindChat } from '../hooks/useDocMindChat';

const ChatbotWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);
  
  const { messages, sendMessage, isLoading, isStreaming, error } = useDocMindChat();

  const toggleChat = () => setIsOpen(!isOpen);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auto-scroll when messages update
  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isStreaming]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading || isStreaming) return;
    sendMessage(inputValue);
    setInputValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end font-sans">
      {/* Chat Window Container */}
      <div
        className={`transition-all duration-300 ease-in-out origin-bottom-right mb-4 rounded-2xl shadow-2xl border border-purple-100 bg-white flex flex-col
          ${isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4 pointer-events-none'}
        `}
        style={{ width: 'min(calc(100vw - 48px), 400px)', height: 'min(calc(100vh - 120px), 650px)' }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 to-purple-500 p-4 rounded-t-2xl flex justify-between items-center text-white shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-full backdrop-blur-sm">
              <HiChatBubbleLeftRight className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-[15px] leading-tight">HR Assistant</h3>
              <p className="text-purple-100 text-xs opacity-90">Ask me about company policies</p>
            </div>
          </div>
          <button 
            onClick={toggleChat}
            className="hover:bg-white/20 p-1.5 rounded-full transition-colors"
          >
            <HiXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
          {messages.length === 0 && !error ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 opacity-50">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4 text-purple-400">
                <HiChatBubbleLeftRight className="w-8 h-8" />
              </div>
              <p className="text-sm font-semibold text-slate-500">How can I help you today?</p>
              <p className="text-xs text-slate-400 mt-1">Try asking about leaves, holidays, or attendance policies.</p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div 
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm
                      ${msg.role === 'user' 
                        ? 'bg-purple-600 text-white rounded-br-sm' 
                        : msg.isError 
                          ? 'bg-rose-50 text-rose-700 border border-rose-100 rounded-bl-sm'
                          : 'bg-white text-slate-700 border border-slate-100 rounded-bl-sm'
                      }
                    `}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {msg.content || (msg.isStreaming ? <span className="animate-pulse">...</span> : '')}
                    </div>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <p className="text-xs font-bold text-slate-400 mb-1.5">Sources:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((src, i) => (
                            <span key={i} className="inline-block bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded-full font-medium">
                              {src.title || src.filename || `Source ${i+1}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {isLoading && !messages.some(m => m.isStreaming) && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex gap-1">
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                  </div>
                </div>
              )}

              {error && messages.length === 0 && (
                <div className="bg-rose-50 text-rose-600 p-3 rounded-xl text-sm border border-rose-100 text-center">
                  {error}
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-3 bg-white border-t border-slate-100 shrink-0 rounded-b-2xl">
          <form onSubmit={handleSubmit} className="relative flex items-end gap-2">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="w-full max-h-32 min-h-[44px] bg-slate-50 border border-slate-200 text-sm rounded-xl py-2.5 px-3.5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 resize-none overflow-y-auto text-slate-700 placeholder-slate-400 transition-all"
              rows={1}
              disabled={isLoading || isStreaming}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading || isStreaming}
              className={`p-3 rounded-xl flex items-center justify-center transition-all flex-shrink-0
                ${inputValue.trim() && !isLoading && !isStreaming 
                  ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-md' 
                  : 'bg-slate-100 text-slate-400'
                }
              `}
            >
              <HiPaperAirplane className="w-5 h-5 -rotate-45 ml-0.5" />
            </button>
          </form>
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={toggleChat}
        className={`
          w-14 h-14 rounded-full flex items-center justify-center shadow-xl
          transition-transform hover:scale-105 active:scale-95 text-white z-50
          ${isOpen ? 'bg-slate-800' : 'bg-gradient-to-r from-purple-600 to-purple-500 animate-float'}
        `}
      >
        {isOpen ? (
          <HiXMark className="w-6 h-6" />
        ) : (
          <HiChatBubbleLeftRight className="w-6 h-6" />
        )}
      </button>
    </div>
  );
};

export default ChatbotWidget;

