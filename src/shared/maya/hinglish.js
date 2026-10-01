// ─────────────────────────────────────────────────────────────────────────────
// hinglish.js — turns Devanagari speech-to-text output into Hinglish: Hindi
// written in Roman letters, with English HR words spelled as English.
//
// Why this exists: browsers have no "Hinglish" voice language. Listening in
// Indian English mangles the Hindi words; listening in Hindi hears both, but
// writes everything — English words included — in Devanagari ("लीव बैलेंस").
// So Hinglish voice typing listens in Hindi and this rewrites the result:
//   1. known English loanwords go back to their English spelling (ENGLISH),
//      so "leave", "payslip", "PF" come out the way Maya's documents spell them;
//   2. a short list of everyday words gets its usual chat spelling (COMMON:
//      में → mein, not men);
//   3. everything else is transliterated as people type Hinglish in chat —
//      "kitna", not the scholarly "kitanā" — with the common schwa-deletion
//      rule (the silent inherent "a": कितना → kitna, not kitana).
// It is a readable approximation, not a standard (ITRANS/IAST would be exact
// but nobody types that way). Anything that isn't Devanagari passes through.
// ─────────────────────────────────────────────────────────────────────────────

/** English words that recognition writes in Devanagari → their English spelling. */
const ENGLISH = {
  "लीव": "leave", "लीव्स": "leaves", "सैलरी": "salary", "सेलरी": "salary", "सैलेरी": "salary",
  "पेस्लिप": "payslip", "पेसलिप": "payslip", "स्लिप": "slip", "बैलेंस": "balance", "बेलेंस": "balance",
  "अटेंडेंस": "attendance", "अटेंडेंट": "attendance", "ओवरटाइम": "overtime", "टैक्स": "tax",
  "पीएफ": "PF", "ईपीएफ": "EPF", "ईएसआई": "ESI", "टीडीएस": "TDS", "सीटीसी": "CTC", "एचआर": "HR",
  "पैन": "PAN", "यूएएन": "UAN", "आईएफएससी": "IFSC", "एचआरए": "HRA",
  "मैनेजर": "manager", "शिफ्ट": "shift", "हॉलिडे": "holiday", "हॉलीडे": "holiday", "बोनस": "bonus",
  "लोन": "loan", "एडवांस": "advance", "क्लेम": "claim", "रीइंबर्समेंट": "reimbursement", "रिइम्बर्समेंट": "reimbursement",
  "पॉलिसी": "policy", "डॉक्यूमेंट": "document", "डॉक्यूमेंट्स": "documents", "अप्रूव": "approve",
  "अप्रूवल": "approval", "अप्रूव्ड": "approved", "रिजेक्ट": "reject", "रिक्वेस्ट": "request",
  "फॉर्म": "form", "ऑफिस": "office", "ऑफ": "off", "कंपनी": "company", "डिडक्शन": "deduction",
  "ग्रॉस": "gross", "नेट": "net", "पे": "pay", "पेमेंट": "payment", "मंथ": "month", "मंथली": "monthly",
  "डेज": "days", "डेज़": "days", "डे": "day", "टाइम": "time", "लेट": "late", "ऐप": "app",
  "पासवर्ड": "password", "लॉगिन": "login", "प्रोफाइल": "profile", "बैंक": "bank", "अकाउंट": "account",
  "इन्वेस्टमेंट": "investment", "डिक्लेरेशन": "declaration", "प्रूफ": "proof", "रिजीम": "regime", "रेजीम": "regime",
  "सिक": "sick", "कैजुअल": "casual", "अर्न्ड": "earned", "कंप": "comp", "अपडेट": "update", "चेक": "check",
  "स्टेटस": "status", "नोटिस": "notice", "पीरियड": "period", "रिजाइन": "resign", "रिजाइन्ड": "resigned",
  "एग्जिट": "exit", "फाइनल": "final", "सेटलमेंट": "settlement", "इनक्रीमेंट": "increment", "अप्रेजल": "appraisal",
  "लॉक": "lock", "रन": "run", "पेरोल": "payroll", "पे रोल": "payroll", "प्रोबेशन": "probation",
  "कन्फर्मेशन": "confirmation", "जॉइनिंग": "joining", "डेट": "date", "रिपोर्ट": "report", "टीम": "team",
  "रिमोट": "remote", "वर्क": "work", "होम": "home", "फ्रॉम": "from", "क्लॉक": "clock", "इन": "in", "आउट": "out",
  "फॉर्म16": "Form 16", "अपलोड": "upload", "डाउनलोड": "download", "ईमेल": "email", "कोड": "code",
};

/** Everyday Hindi words, in the spelling people actually type in Hinglish. */
const COMMON = {
  "में": "mein", "लिए": "liye", "नहीं": "nahi", "क्यों": "kyun", "यह": "yeh", "वह": "woh", "ये": "ye", "वो": "wo",
  "और": "aur", "नाम": "naam", "काम": "kaam", "आप": "aap", "आपका": "aapka", "आपकी": "aapki", "हाँ": "haan", "हां": "haan",
  "कैसे": "kaise", "कब": "kab", "कहाँ": "kahan", "कहां": "kahan", "क्या": "kya", "मैं": "main", "है": "hai", "हैं": "hain",
  "तो": "to", "भी": "bhi", "था": "tha", "थी": "thi", "थे": "the", "दिन": "din", "साल": "saal", "पैसे": "paise",
};

const CONSONANTS = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v",
  "श": "sh", "ष": "sh", "स": "s", "ह": "h",
  // Pre-composed nukta letters.
  "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "r", "ढ़": "rh", "फ़": "f", "य़": "y",
};
const NUKTA_OF = { "क": "q", "ख": "kh", "ग": "g", "ज": "z", "ड": "r", "ढ": "rh", "फ": "f" };
const VOWELS = { "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऑ": "o", "ऍ": "e" };
const MATRAS = { "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e" };
const VIRAMA = "्";
const NUKTA = "़";
const MARKS = { "ं": "n", "ँ": "n", "ः": "h", "।": ".", "॥": "." };
const DIGITS = "०१२३४५६७८९";

const isDevanagari = (s) => /[ऀ-ॿ]/.test(s);

/** One Devanagari word → Roman, with schwa deletion. */
function transliterateWord(word) {
  // Split into syllable units: { c: consonant roman | null, v: vowel roman | "" (virama) | null (inherent a) }
  const units = [];
  const chars = [...word];
  for (let i = 0; i < chars.length; i += 1) {
    let ch = chars[i];
    if (CONSONANTS[ch] !== undefined) {
      let c = CONSONANTS[ch];
      if (chars[i + 1] === NUKTA) { c = NUKTA_OF[ch] ?? c; i += 1; }
      const next = chars[i + 1];
      if (next === VIRAMA) { units.push({ c, v: "" }); i += 1; }
      else if (MATRAS[next] !== undefined) { units.push({ c, v: MATRAS[next] }); i += 1; }
      else units.push({ c, v: null });
    } else if (VOWELS[ch] !== undefined) {
      units.push({ c: null, v: VOWELS[ch] });
    } else if (MARKS[ch] !== undefined) {
      units.push({ mark: MARKS[ch] });
    } else if (DIGITS.includes(ch)) {
      units.push({ mark: String(DIGITS.indexOf(ch)) });
    } else {
      units.push({ mark: ch });
    }
  }

  // Schwa deletion: the inherent "a" is silent at the end of a word, and in the
  // middle when it sits between two sounded syllables (कितना → kit-na).
  const syl = units.map((u, i) => ({ ...u, i })).filter((u) => u.mark === undefined);
  syl.forEach((u, k) => {
    if (u.v !== null || u.c === null) return;
    const isLast = k === syl.length - 1;
    if (isLast) { if (syl.length > 1) u.drop = true; return; }
    const prev = syl[k - 1];
    const next = syl[k + 1];
    const prevSounded = prev && prev.v !== "" && !prev.drop;
    const nextSounded = next && next.c !== null && next.v !== "" && !(k + 1 === syl.length - 1 && next.v === null);
    if (k > 0 && prevSounded && nextSounded) u.drop = true;
  });
  const dropped = new Set(syl.filter((u) => u.drop).map((u) => u.i));

  return units.map((u, i) => {
    if (u.mark !== undefined) return u.mark;
    const vowel = u.v === null ? (dropped.has(i) ? "" : "a") : u.v;
    return (u.c || "") + vowel;
  }).join("");
}

/**
 * Devanagari speech output → Hinglish in Roman letters. Non-Devanagari text is
 * left as it is, so mixed output from the recogniser is safe to pass through.
 */
export function toHinglish(text) {
  if (!text || !isDevanagari(text)) return text;
  return text.split(/(\s+)/).map((part) => {
    if (!isDevanagari(part)) return part;
    const bare = part.replace(/[।॥,.?!]+$/u, "");
    const tail = part.slice(bare.length).replace(/[।॥]/gu, ".");
    return (ENGLISH[bare] ?? COMMON[bare] ?? transliterateWord(bare)) + tail;
  }).join("");
}
