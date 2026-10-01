import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  HiXMark, HiPaperAirplane,
  HiArrowPath, HiChevronRight, HiStop,
  HiArrowsPointingOut, HiArrowsPointingIn, HiMicrophone, HiLanguage
} from 'react-icons/hi2';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDocMindChat, DOCMIND_CONFIGURED } from '../hooks/useDocMindChat';
import { useMayaVisibility } from '../hooks/useMayaVisibility';
import { MAYA_ASK_EVENT, consumePendingQuestion, registerMaya } from '../maya/mayaBridge';
import { mayaLayerFor } from '../fieldHelp/fieldHelpLayer';
import { useSpeechToText, VOICE_LANGS, defaultVoiceLang } from '../maya/useSpeechToText';
import { mayaInstructions, INSTRUCTION_RESERVE } from '../maya/mayaInstructions';

// Maya's language: what the mic listens for AND what she answers in (the
// answer line is added silently on send — mayaInstructions.js). Per-viewer
// convenience only; a blocked or empty store falls back to the default.
const VOICE_LANG_KEY = 'hrc.maya.voiceLang';
const LISTENING_HINT = {
  'en-IN': 'Listening… speak your question',
  'hi-IN': 'सुन रही हूँ… अपना सवाल बोलिए',
  hinglish: 'Sun rahi hoon… apna sawaal boliye',
};
const readVoiceLang = () => {
  try {
    const saved = localStorage.getItem(VOICE_LANG_KEY);
    if (VOICE_LANGS.some((l) => l.value === saved)) return saved;
  } catch { /* storage unavailable */ }
  return defaultVoiceLang();
};

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
  // Opened by a field's "Ask Maya" (FieldHelp → mayaBridge): she then sits above
  // the form dialog that asked, instead of opening invisibly behind it. Holds
  // the z-index to use (0 = not raised) — just above the asking dialog.
  const [raised, setRaised] = useState(0);
  const [focusRequest, setFocusRequest] = useState(0);
  const messagesEndRef = useRef(null);
  const textareaRef    = useRef(null);
  const panelRef       = useRef(null);
  const fabRef         = useRef(null);
  // A pre-filled question waiting for the caret: null, "now", or "deferred"
  // (it arrived while she was answering — see the focus effect).
  const pendingFocusRef = useRef(null);

  const { messages, sendMessage, clearMessages, stopStreaming, isLoading, isStreaming, error, config } = useDocMindChat();
  const { hidden } = useMayaVisibility(); // toggled from My Profile

  /* Config values */
  const w             = config?.widget || {};
  const welcomeMsg    = w.welcomeMessage || "Hi there! I'm Maya, your HR assistant. Ask me anything about HR Clouds — policies, payroll, leave, and more.";
  const placeholder   = w.placeholder   || 'Ask Maya anything…';
  // What the person may type: Maya's live limit minus room for the silent
  // instructions, so a full-length question still fits once they are added.
  const maxLen        = Math.max(100, (config?.limits?.maxQueryLength || 1000) - INSTRUCTION_RESERVE);
  const suggestedQs   = Array.isArray(w.suggestedQuestions) && w.suggestedQuestions.length > 0
    ? w.suggestedQuestions : [];

  const busy      = isLoading || isStreaming;
  const showEmpty = messages.length === 0;

  // Voice typing: fills the input as the person speaks, never sends
  // (useSpeechToText.js). Left out entirely where the browser can't do it.
  // True while the box holds a question that came from an ⓘ "Ask Maya" link —
  // it adds "give an example" on send. Editing keeps it; emptying the box or
  // dictating a new question ends it (they are asking their own now).
  const fromHintRef = useRef(false);
  const onSpokenText = useCallback((text) => {
    fromHintRef.current = false;
    setInputValue(text.slice(0, maxLen));
  }, [maxLen]);
  const [voiceLang, setVoiceLang] = useState(readVoiceLang);
  const speech = useSpeechToText(onSpokenText, voiceLang);
  const { stop: stopListening, cancel: cancelListening } = speech;
  const voiceLangLabel = VOICE_LANGS.find((l) => l.value === voiceLang)?.label || 'English';
  // Switching mid-sentence would mix two recognisers' output, so it stops first.
  const pickVoiceLang = (value) => {
    stopListening();
    setVoiceLang(value);
    try { localStorage.setItem(VOICE_LANG_KEY, value); } catch { /* storage unavailable */ }
  };

  // Mounted once for the whole app, so an open panel would otherwise follow the
  // user to every page and sit over its content. Close it on navigation; the
  // conversation is kept and "Ask Maya" reopens it.
  const closeChat = useCallback(() => {
    setIsOpen(false);
    setRaised(0);
    pendingFocusRef.current = null;
  }, []);

  const { pathname } = useLocation();
  useEffect(() => {
    closeChat();
  }, [pathname, closeChat]);

  // Tell field help whether she can take a question right now. Hidden from My
  // Profile or no API key → the "Ask Maya" links are left out, not broken.
  // Her live query limit goes with it, so a stored question she'd reject is
  // never offered.
  useEffect(() => {
    registerMaya(!hidden && DOCMIND_CONFIGURED, maxLen);
    return () => registerMaya(false);
  }, [hidden, maxLen]);

  // A pre-written question from a form field. It is only placed in the input —
  // never sent: the user reads it and presses Send. The conversation so far is
  // kept, and the question replaces any half-typed text because the click was
  // explicit. Declared after the pathname effect so an ask waiting from before
  // she loaded isn't closed again by the first-mount close.
  useEffect(() => {
    if (hidden || !DOCMIND_CONFIGURED) return undefined;
    const take = () => {
      const ask = consumePendingQuestion();
      if (!ask) return;
      stopListening(); // or speech would overwrite the question just placed
      setInputValue(ask.question.slice(0, maxLen));
      fromHintRef.current = true;
      setIsOpen(true);
      setRaised(mayaLayerFor(ask.layer));
      pendingFocusRef.current = "now";
      setFocusRequest((n) => n + 1);
    };
    take();
    window.addEventListener(MAYA_ASK_EVENT, take);
    return () => window.removeEventListener(MAYA_ASK_EVENT, take);
  }, [hidden, maxLen, stopListening]);

  // Caret at the end so Enter sends it. While she's still answering, the input
  // is disabled and can't take focus — and the "Ask Maya" link that had it has
  // just unmounted, which used to drop keyboard focus to <body>. Focus then
  // holds on the panel (so Escape stays hers) and moves to the input when the
  // stream ends — unless the person has gone back to the page by then.
  useEffect(() => {
    if (!pendingFocusRef.current) return;
    const el = textareaRef.current;
    if (!el) return;
    if (el.disabled) {
      pendingFocusRef.current = "deferred";
      panelRef.current?.focus({ preventScroll: true });
      return;
    }
    const deferred = pendingFocusRef.current === "deferred";
    pendingFocusRef.current = null;
    // Only a *deferred* move checks where focus is now: the ask itself always
    // takes the caret (focus was still in the form field the person had been
    // typing in — that's expected), but after waiting out an answer, someone
    // who has gone back to the page keeps their place.
    const active = document.activeElement;
    if (deferred && active && active !== document.body && !panelRef.current?.contains(active)) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [focusRequest, busy]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const inPanel = () => !!panelRef.current?.contains(document.activeElement);
    // Capture phase: an Escape typed inside Maya closes Maya and stops there.
    // Several forms close on *any* Escape (the reimbursement claim editor, the
    // correction request…), and she can now sit on top of them.
    const onCapture = (e) => {
      if (e.key !== 'Escape' || !inPanel()) return;
      e.stopPropagation();
      closeChat();
      fabRef.current?.focus({ preventScroll: true });
    };
    // Anywhere else, as before: she closes and the page still gets the key.
    const onBubble = (e) => { if (e.key === 'Escape') closeChat(); };
    window.addEventListener('keydown', onCapture, true);
    window.addEventListener('keydown', onBubble);
    return () => {
      window.removeEventListener('keydown', onCapture, true);
      window.removeEventListener('keydown', onBubble);
    };
  }, [isOpen, closeChat]);

  // The microphone never stays open behind a closed panel, another page or an
  // answer being written.
  useEffect(() => {
    if (!isOpen || busy) stopListening();
  }, [isOpen, busy, stopListening]);

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
    cancelListening(); // a late result would otherwise refill the cleared box
    sendMessage(inputValue.trim(), {
      instructions: mayaInstructions({ fromHint: fromHintRef.current, lang: voiceLang }),
    });
    fromHintRef.current = false;
    setInputValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const charsLeft = maxLen - inputValue.length;
  const charWarn  = charsLeft < 100;

  // Hiding Maya from My Profile unmounts her entirely — the chat hook lives in
  // this component, so the conversation does not survive a hide/show. That is
  // intentional: a hidden assistant should hold nothing and cost nothing.
  if (hidden) return null;

  return (
    /* Layer order for the app, highest last:
         landing content        ≤ z-50
         landing header           z-[60]
         Maya (this)              z-[70]
         dialogs / modals         z-[100] – z-[150]
         field-help popover       z-[155]  or host dialog + 5
         Maya, raised             z-[160]  or host dialog + 10 — opened from a
                                           field's "Ask Maya" (fieldHelpLayer.js)
         claim review             z-[160]
         attachment viewer        z-[165]
         reason prompt, document
           recommend / request    z-[170]
         toasts                   z-[200]
         global alerts            z-[99999]
       Maya has to clear the header — enlarged she reaches the top of the
       viewport — but normally stays under dialogs, which should cover her.
       The exception is a question asked *from* a form: she then has to sit on
       top of that form, or she opens invisibly behind it and a click toward
       her lands on its backdrop and closes it. A form above z-150 (the claim
       review, the z-170 document dialogs) lifts her just above itself.
       Closing drops her back. */
    <div
      className={`fixed bottom-6 right-6 ${isOpen && raised ? '' : 'z-[70]'} flex flex-col items-end font-sans select-none pointer-events-none`}
      style={isOpen && raised ? { zIndex: raised } : undefined}
    >

      {/* ══ Chat Window ══ */}
      <div
        ref={panelRef}
        id="maya-chat-panel"
        tabIndex={-1}
        role="dialog"
        aria-label="Chat with Maya, the HR Clouds assistant"
        aria-hidden={!isOpen}
        {...(isOpen ? {} : { inert: "" })}
        className={`outline-none transition-all duration-300 ease-in-out origin-bottom-right mb-3 rounded-2xl
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
                <span className={`w-1.5 h-1.5 rounded-full ${busy ? 'bg-fuchsia-300 animate-pulse' : 'bg-violet-300 animate-pulse'}`} />
                <span className="text-purple-100 text-[11px]">
                  {busy ? 'Thinking…' : 'HR Assistant · Online'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => { cancelListening(); clearMessages(); setInputValue(''); }}
              aria-label="Clear chat" title="Clear chat"
              className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-colors">
              <HiArrowPath className="w-4 h-4" />
            </button>
            <button onClick={() => setIsExpanded(p => !p)}
              aria-label={isExpanded ? 'Shrink chat window' : 'Enlarge chat window'}
              title={isExpanded ? 'Shrink' : 'Enlarge'}
              className="hidden sm:block p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-colors">
              {isExpanded ? <HiArrowsPointingIn className="w-4 h-4" /> : <HiArrowsPointingOut className="w-4 h-4" />}
            </button>
            <button onClick={closeChat}
              aria-label="Close chat" title="Close chat"
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
                      <button key={i} onClick={() => !busy && sendMessage(q, { instructions: mayaInstructions({ lang: voiceLang }) })} disabled={busy}
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
              onChange={e => {
                const next = e.target.value.slice(0, maxLen);
                if (!next.trim()) fromHintRef.current = false; // emptied: their own question now
                setInputValue(next);
                if (speech.error) speech.clearError();
              }}
              onKeyDown={handleKeyDown}
              placeholder={busy ? 'Maya is responding…' : speech.listening ? LISTENING_HINT[voiceLang] || LISTENING_HINT['en-IN'] : placeholder}
              rows={1}
              disabled={busy}
              className="w-full bg-slate-50 border border-slate-200 text-sm text-slate-700 placeholder-slate-400
                rounded-xl py-2.5 px-3.5 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40
                focus:border-purple-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ minHeight: '44px', maxHeight: '128px' }}
            />
            {speech.supported && !busy && (
              <button type="button"
                onClick={() => (speech.listening ? speech.stop() : speech.start(inputValue))}
                aria-pressed={speech.listening}
                aria-label={speech.listening ? 'Stop voice typing' : `Speak your question in ${voiceLangLabel}`}
                title={speech.listening ? 'Stop voice typing' : `Speak your question in ${voiceLangLabel}`}
                className={`p-3 rounded-xl flex items-center justify-center transition-all flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40
                  ${speech.listening ? 'bg-purple-600 text-white shadow-md ring-4 ring-purple-100' : 'bg-slate-100 text-slate-500 hover:bg-purple-50 hover:text-purple-600'}`}>
                <HiMicrophone className="w-5 h-5" />
              </button>
            )}
            {busy ? (
              <button type="button" onClick={stopStreaming}
                className="p-3 rounded-xl bg-rose-100 text-rose-600 hover:bg-rose-200 transition-all flex-shrink-0 shadow-sm"
                aria-label="Stop generating"
                title="Stop generating">
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
          {speech.error && (
            <p role="alert" className="text-[11px] mt-1.5 px-1 text-rose-600">{speech.error}</p>
          )}
          {speech.listening && (
            <p className="sr-only" aria-live="polite">Listening. Speak your question, then tap the microphone to stop.</p>
          )}
          {/* Always shown: it sets the language Maya ANSWERS in, so a browser
              without voice typing (Firefox) still needs it. */}
            <div className="flex items-center justify-between gap-3 mt-2 min-h-[26px]">
              <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5" role="radiogroup" aria-label="Maya’s language">
                <HiLanguage className="w-3.5 h-3.5 mx-1.5 text-slate-400" aria-hidden="true" />
                {VOICE_LANGS.map((l) => (
                  <button key={l.value} type="button" role="radio" aria-checked={voiceLang === l.value}
                    onClick={() => pickVoiceLang(l.value)}
                    title={`Maya answers in ${l.value === 'en-IN' ? 'English' : l.value === 'hi-IN' ? 'Hindi' : 'Hinglish'}`}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40
                      ${voiceLang === l.value ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {l.label}
                  </button>
                ))}
              </div>
              {speech.listening ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-purple-700">
                  <span className="relative flex w-2 h-2" aria-hidden="true">
                    <span className="absolute inline-flex w-full h-full rounded-full bg-purple-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex w-2 h-2 rounded-full bg-purple-600" />
                  </span>
                  Listening
                </span>
              ) : inputValue.length > 0 && (
                <span className={`text-[11px] tabular-nums ${charWarn ? 'text-fuchsia-600' : 'text-slate-400'}`}>
                  {charsLeft} characters left
                </span>
              )}
            </div>
        </div>
      </div>

      {/* ══ FAB pill ══ */}
      <button
        ref={fabRef}
        onClick={() => (isOpen ? closeChat() : setIsOpen(true))}
        aria-expanded={isOpen}
        aria-controls="maya-chat-panel"
        aria-label={isOpen ? 'Close the Maya assistant' : 'Open the Maya assistant'}
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
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-violet-400 border-2 border-white" />
              )}
            </>
        }
      </button>
    </div>
  );
};

export default ChatbotWidget;
