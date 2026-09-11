import React, { useState, useRef, useEffect } from 'react';
import {
  HiXMark, HiPaperAirplane,
  HiArrowPath, HiChevronRight, HiStop,
  HiArrowsPointingOut, HiArrowsPointingIn
} from 'react-icons/hi2';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDocMindChat } from '../hooks/useDocMindChat';

/* ─── helpers ─── */
const ts = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/* ─── Markdown renderer for Maya's replies ─── */
const drop = (p) => { const q = { ...p }; delete q.node; return q; };
const md = (Tag, className) => function MdEl(props) { return <Tag className={className} {...drop(props)} />; };

const MD_COMPONENTS = {
  p:  md('p',  'my-1.5 first:mt-0 last:mb-0 leading-relaxed'),
  ul: md('ul', 'my-1.5 pl-5 list-disc space-y-1 marker:text-purple-400'),
  ol: md('ol', 'my-1.5 pl-5 list-decimal space-y-1 marker:text-slate-400'),
  li: md('li', 'leading-relaxed'),
  h1: md('h1', 'mt-3 mb-1.5 first:mt-0 text-[15px] font-bold text-slate-800'),
  h2: md('h2', 'mt-3 mb-1.5 first:mt-0 text-sm font-bold text-slate-800'),
  h3: md('h3', 'mt-2.5 mb-1 first:mt-0 text-sm font-semibold text-slate-800'),
  strong: md('strong', 'font-semibold text-slate-900'),
  em: md('em', 'italic'),
  blockquote: md('blockquote', 'my-2 border-l-2 border-purple-300 pl-3 text-slate-500 italic'),
  hr: () => <hr className="my-3 border-slate-200" />,
  a: (props) => <a className="text-purple-600 font-medium underline underline-offset-2 hover:text-purple-800 break-words" target="_blank" rel="noreferrer" {...drop(props)} />,
  code: (props) => {
    const { className, children, ...rest } = drop(props);
    const isBlock = /language-/.test(className || '') || /\n/.test(String(children));
    return isBlock
      ? <code className="block my-2 p-3 rounded-lg bg-slate-900 text-slate-100 text-[12px] font-mono overflow-x-auto whitespace-pre" {...rest}>{children}</code>
      : <code className="px-1 py-0.5 rounded bg-purple-50 text-purple-700 text-[12px] font-mono break-words" {...rest}>{children}</code>;
  },
  pre: (props) => <>{props.children}</>,
  table: (props) => <div className="my-2 overflow-x-auto"><table className="w-full text-[12px] border-collapse" {...drop(props)} /></div>,
  thead: md('thead', 'bg-slate-100'),
  th: md('th', 'border border-slate-200 px-2 py-1 text-left font-semibold text-slate-700'),
  td: md('td', 'border border-slate-200 px-2 py-1 align-top'),
};

const MayaMarkdown = ({ children }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS} skipHtml>
    {children}
  </ReactMarkdown>
);

const TypingDots = () => (
  <span className="flex gap-1 items-center h-4 px-1">
    {[0, 150, 300].map((d, i) => (
      <span key={i} className="w-2 h-2 rounded-full bg-purple-400 animate-bounce"
        style={{ animationDelay: `${d}ms` }} />
    ))}
  </span>
);

const StreamCursor = () => (
  <span className="inline-block w-0.5 h-3.5 bg-purple-500 ml-0.5 align-middle animate-pulse"
    style={{ animationDuration: '0.8s' }} />
);

/* Maya's avatar */
const MayaAvatar = ({ size = 'md' }) => {
  const cls = size === 'sm'
    ? 'w-7 h-7'
    : size === 'lg'
      ? 'w-10 h-10'
      : 'w-8 h-8';
  return (
    <div className={`${cls} rounded-full overflow-hidden shrink-0 shadow-sm ring-2 ring-purple-200`}>
      <img src="/maya_avatar.jpg" alt="Maya" className="w-full h-full object-cover object-top" />
    </div>
  );
};

/* ─── Main widget ─── */
const ChatbotWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef    = useRef(null);

  const { messages, sendMessage, clearMessages, isLoading, isStreaming, error, config } = useDocMindChat();

  /* Config values */
  const w             = config?.widget || {};
  const welcomeMsg    = w.welcomeMessage || "Hi there! I'm Maya, your HR assistant. Ask me anything about HR Clouds — policies, payroll, leave, and more.";
  const placeholder   = w.placeholder   || 'Ask Maya anything…';
  const maxLen        = config?.limits?.maxQueryLength || 1000;
  const suggestedQs   = Array.isArray(w.suggestedQuestions) && w.suggestedQuestions.length > 0
    ? w.suggestedQuestions : [];

  const busy      = isLoading || isStreaming;
  const showEmpty = messages.length === 0;

  /* Auto-scroll */
  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen, isStreaming]);

  /* Auto-resize textarea */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 128) + 'px';
  }, [inputValue]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!inputValue.trim() || busy) return;
    sendMessage(inputValue.trim());
    setInputValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const charsLeft = maxLen - inputValue.length;
  const charWarn  = charsLeft < 100;


  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end font-sans select-none pointer-events-none">

      {/* ══ Chat Window ══ */}
      <div
        className={`transition-all duration-300 ease-in-out origin-bottom-right mb-3 rounded-2xl
          shadow-2xl bg-white flex flex-col overflow-hidden border border-purple-100
          ${isOpen ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
                   : 'opacity-0 scale-95 translate-y-4 pointer-events-none'}
        `}
        style={
          isExpanded
            ? { width: 'min(calc(100vw - 48px), 80vw)', height: 'min(calc(100vh - 96px), 90vh)' }
            : { width: 'min(calc(100vw - 48px), 400px)', height: 'min(calc(100vh - 130px), 600px)' }
        }
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 to-purple-500 px-4 py-3 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-2.5">
            <MayaAvatar size="lg" />
            <div>
              <p className="text-white font-bold text-sm leading-tight">Maya</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${busy ? 'bg-yellow-300 animate-pulse' : 'bg-emerald-300 animate-pulse'}`} />
                <span className="text-purple-100 text-[11px]">
                  {busy ? 'Thinking…' : 'HR Assistant · Online'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => { clearMessages(); setInputValue(''); }} title="Clear chat"
              className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-colors">
              <HiArrowPath className="w-4 h-4" />
            </button>
            <button onClick={() => setIsExpanded(p => !p)} title={isExpanded ? 'Shrink' : 'Enlarge'}
              className="hidden sm:block p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-colors">
              {isExpanded ? <HiArrowsPointingIn className="w-4 h-4" /> : <HiArrowsPointingOut className="w-4 h-4" />}
            </button>
            <button onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-colors">
              <HiXMark className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/60"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#d8b4fe transparent' }}>

          {showEmpty ? (
            <>
              {/* Maya welcome */}
              <div className="flex items-end gap-2 justify-start">
                <MayaAvatar size="sm" />
                <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-slate-700 max-w-[82%] shadow-sm">
                  {welcomeMsg}
                  <p className="text-[10px] text-slate-400 mt-1.5">Maya · {ts()}</p>
                </div>
              </div>

              {/* Suggested Qs */}
              {suggestedQs.length > 0 && !error && (
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-slate-400 mb-2 uppercase pl-9">
                    Suggested Questions
                  </p>
                  <div className="space-y-2 pl-9">
                    {suggestedQs.map((q, i) => (
                      <button key={i} onClick={() => !busy && sendMessage(q)} disabled={busy}
                        className="w-full text-left flex items-center justify-between px-4 py-3 rounded-xl text-sm bg-white border border-slate-200
                          text-slate-700 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700
                          transition-all shadow-sm group disabled:opacity-50 disabled:cursor-not-allowed">
                        <span>{q}</span>
                        <HiChevronRight className="w-4 h-4 shrink-0 ml-2 text-slate-400 group-hover:text-purple-500 transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="text-xs text-center py-2 px-3 rounded-lg bg-rose-50 text-rose-600 border border-rose-100 ml-9">
                  {error}
                </div>
              )}
            </>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-end`}>
                  {/* Avatar */}
                  {msg.role === 'assistant' && <MayaAvatar size="sm" />}
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xs font-bold shrink-0">
                      U
                    </div>
                  )}

                  <div className="flex flex-col gap-0.5" style={{ maxWidth: isExpanded ? 'min(88%, 760px)' : '78%' }}>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm select-text
                        ${msg.role === 'user'
                          ? 'bg-purple-600 text-white rounded-br-sm'
                          : msg.isError
                            ? 'bg-rose-50 text-rose-700 border border-rose-100 rounded-bl-sm'
                            : 'bg-white text-slate-700 border border-slate-100 rounded-bl-sm'
                        }
                      `}
                    >
                      {msg.isStreaming && !msg.content
                        ? <TypingDots />
                        : msg.role === 'assistant' && !msg.isError
                          ? <span className="block">
                              <MayaMarkdown>{msg.content}</MayaMarkdown>
                              {msg.isStreaming && <StreamCursor />}
                            </span>
                          : <span className="whitespace-pre-wrap">
                              {msg.content}
                              {msg.isStreaming && <StreamCursor />}
                            </span>
                      }
                    </div>
                    {msg.sentAt && (
                      <span className={`text-[10px] text-slate-400 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                        {msg.role === 'assistant' ? 'Maya' : 'You'} · {msg.sentAt}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Standalone thinking */}
              {isLoading && !messages.some(m => m.isStreaming) && (
                <div className="flex gap-2 items-end">
                  <MayaAvatar size="sm" />
                  <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                    <TypingDots />
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="bg-white border-t border-slate-100 shrink-0 px-3 pt-3 pb-2">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value.slice(0, maxLen))}
              onKeyDown={handleKeyDown}
              placeholder={busy ? 'Maya is responding…' : placeholder}
              rows={1}
              disabled={busy}
              className="w-full bg-slate-50 border border-slate-200 text-sm text-slate-700 placeholder-slate-400
                rounded-xl py-2.5 px-3.5 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40
                focus:border-purple-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ minHeight: '44px', maxHeight: '128px' }}
            />
            {busy ? (
              <button type="button" onClick={() => { clearMessages(); setInputValue(''); }}
                className="p-3 rounded-xl bg-rose-100 text-rose-600 hover:bg-rose-200 transition-all flex-shrink-0 shadow-sm"
                title="Stop">
                <HiStop className="w-5 h-5" />
              </button>
            ) : (
              <button type="submit" disabled={!inputValue.trim()}
                className={`p-3 rounded-xl flex items-center justify-center transition-all flex-shrink-0
                  ${inputValue.trim() ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}>
                <HiPaperAirplane className="w-5 h-5 -rotate-45 ml-0.5" />
              </button>
            )}
          </form>
          {inputValue.length > 0 && (
            <p className={`text-[10px] mt-1 text-right pr-14 ${charWarn ? 'text-amber-500' : 'text-slate-400'}`}>
              {charsLeft} remaining
            </p>
          )}
        </div>
      </div>

      {/* ══ FAB pill ══ */}
      <button
        onClick={() => setIsOpen(p => !p)}
        className={`flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full shadow-xl transition-all
          hover:scale-105 active:scale-95 z-50 relative pointer-events-auto
          ${isOpen ? 'bg-slate-700' : 'bg-gradient-to-r from-purple-700 to-purple-500'}
        `}
      >
        {isOpen
          ? <><div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><HiXMark className="w-5 h-5 text-white" /></div>
              <span className="text-white text-sm font-semibold">Close</span></>
          : <><MayaAvatar size="sm" />
              <span className="text-white text-sm font-semibold">Ask Maya</span>
              {messages.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
              )}
            </>
        }
      </button>
    </div>
  );
};

export default ChatbotWidget;
