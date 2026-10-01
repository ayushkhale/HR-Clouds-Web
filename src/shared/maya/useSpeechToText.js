// ─────────────────────────────────────────────────────────────────────────────
// useSpeechToText.js — voice typing for Maya's input box, on the browser's own
// Web Speech API (SpeechRecognition). No library, no backend of ours.
//
// Why it's built this way (keep these):
// • Dictation only fills the input — it never sends. Maya never auto-sends
//   (CLAUDE.md §10); the person reads what was heard, fixes it, presses Send.
// • What was already typed is kept: speech is appended after it, so a person
//   can type half a question and say the rest.
// • Absent, not broken: Firefox has no SpeechRecognition, so `supported` is
//   false there and the mic button is left out rather than shown and failing.
// • The API is only exposed in a secure context (https or localhost).
// • Privacy: Chrome and Edge send the audio to Google/Microsoft to be turned
//   into text; Safari uses Apple. Nothing is recorded or stored by HR Clouds,
//   but the words do leave the browser — the same as Maya's typed questions.
// • Language is the caller's choice (VOICE_LANGS). The browser only
//   transcribes the language it is told to expect: set to Indian English,
//   spoken Hindi comes back as garbled English words. Browsers have no
//   Hinglish, so "Hinglish" listens in Hindi (which hears both languages) and
//   rewrites the Devanagari into Roman letters with English HR words spelled
//   in English (hinglish.js) — "mera leave balance kitna hai". Plain Hindi
//   (Devanagari) was offered and removed on 2026-10-01: English and Hinglish
//   only, which is also what Maya's English documents match best.
// • stop() vs cancel(): stop() lets the browser deliver the last words it
//   heard (tapping the mic off). cancel() discards them — used on Send, or the
//   late result would write the question back into the just-cleared input.
// • Errors map to plain sentences; a raw `not-allowed` code never reaches the
//   screen. `aborted` is our own stop() and is not an error.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { toHinglish } from "./hinglish";

const Recognition = typeof window !== "undefined"
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : undefined;

const MESSAGES = {
  "not-allowed": "Microphone access is blocked. Allow it for this site in your browser’s settings, then try again.",
  "service-not-allowed": "Microphone access is blocked. Allow it for this site in your browser’s settings, then try again.",
  "audio-capture": "No microphone was found. Plug one in or check your system settings.",
  "no-speech": "Didn’t catch anything. Tap the mic and try again.",
  network: "Voice typing needs an internet connection.",
  "language-not-supported": "This browser can’t do voice typing in this language. Try Chrome or Edge, or switch the voice language.",
};
const FALLBACK = "Voice typing stopped unexpectedly. Try again, or type your question.";

/**
 * The voice languages offered. `listen` is the recogniser's language;
 * `write` reshapes what it heard (Hinglish only). `label` is in its own script.
 */
export const VOICE_LANGS = [
  { value: "en-IN", label: "English", listen: "en-IN" },
  { value: "hinglish", label: "Hinglish", listen: "hi-IN", write: toHinglish },
];
const voiceLangOf = (value) => VOICE_LANGS.find((l) => l.value === value) || VOICE_LANGS[0];

/** Hinglish if the browser prefers Hindi, otherwise Indian English. */
export function defaultVoiceLang() {
  const prefs = typeof navigator !== "undefined" ? navigator.languages || [navigator.language || ""] : [];
  return prefs.some((l) => /^hi\b/i.test(l || "")) ? "hinglish" : "en-IN";
}

const join = (a, b) => (a && b ? `${a.replace(/\s+$/, "")} ${b.replace(/^\s+/, "")}` : a || b);

/**
 * @param {(text: string) => void} onText  receives the whole input text as it grows
 * @param {string} lang  one of VOICE_LANGS' values
 * @returns {{ supported: boolean, listening: boolean, error: string, start: (base?: string) => void, stop: () => void, cancel: () => void, clearError: () => void }}
 */
export function useSpeechToText(onText, lang = "en-IN") {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const recRef = useRef(null);
  const onTextRef = useRef(onText);

  useEffect(() => { onTextRef.current = onText; }, [onText]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (rec) rec.stop();
  }, []);

  // Ends listening and drops anything still on its way.
  const cancel = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    rec.discarded = true;
    rec.abort();
  }, []);

  const start = useCallback((base = "") => {
    if (!Recognition || recRef.current) return;
    setError("");
    const rec = new Recognition();
    const { listen, write = (t) => t } = voiceLangOf(lang);
    rec.lang = listen;
    rec.continuous = true; // keep listening through pauses until tapped again
    rec.interimResults = true; // show words while they're being spoken
    let finalText = "";

    rec.onresult = (event) => {
      if (rec.discarded) return;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = write(event.results[i][0]?.transcript || "");
        if (event.results[i].isFinal) finalText = join(finalText, piece.trim());
        else interim = join(interim, piece.trim());
      }
      onTextRef.current?.(join(base, join(finalText, interim)));
    };
    rec.onerror = (event) => {
      if (event.error === "aborted") return;
      setError(MESSAGES[event.error] || FALLBACK);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };

    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      setError(FALLBACK);
    }
  }, [lang]);

  // Never leave the microphone open behind an unmounted widget.
  useEffect(() => () => recRef.current?.abort(), []);

  return { supported: !!Recognition, listening, error, start, stop, cancel, clearError: () => setError("") };
}
