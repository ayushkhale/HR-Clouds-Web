// Indian states and union territories with the two-letter codes used for
// Professional Tax slabs (e.g. "MH", as in the payroll phase-4 contract).
// `aliases` holds ISO 3166-2:IN variants so either spelling finds the state.

export const INDIAN_STATES = [
  { code: "AP", name: "Andhra Pradesh" },
  { code: "AR", name: "Arunachal Pradesh" },
  { code: "AS", name: "Assam" },
  { code: "BR", name: "Bihar" },
  { code: "CG", name: "Chhattisgarh", aliases: ["CT"] },
  { code: "GA", name: "Goa" },
  { code: "GJ", name: "Gujarat" },
  { code: "HR", name: "Haryana" },
  { code: "HP", name: "Himachal Pradesh" },
  { code: "JH", name: "Jharkhand" },
  { code: "KA", name: "Karnataka" },
  { code: "KL", name: "Kerala" },
  { code: "MP", name: "Madhya Pradesh" },
  { code: "MH", name: "Maharashtra" },
  { code: "MN", name: "Manipur" },
  { code: "ML", name: "Meghalaya" },
  { code: "MZ", name: "Mizoram" },
  { code: "NL", name: "Nagaland" },
  { code: "OD", name: "Odisha", aliases: ["OR"] },
  { code: "PB", name: "Punjab" },
  { code: "RJ", name: "Rajasthan" },
  { code: "SK", name: "Sikkim" },
  { code: "TN", name: "Tamil Nadu" },
  { code: "TS", name: "Telangana", aliases: ["TG"] },
  { code: "TR", name: "Tripura" },
  { code: "UP", name: "Uttar Pradesh" },
  { code: "UK", name: "Uttarakhand", aliases: ["UT"] },
  { code: "WB", name: "West Bengal" },
  { code: "AN", name: "Andaman and Nicobar Islands" },
  { code: "CH", name: "Chandigarh" },
  { code: "DH", name: "Dadra and Nagar Haveli and Daman and Diu", aliases: ["DN", "DD"] },
  { code: "DL", name: "Delhi" },
  { code: "JK", name: "Jammu and Kashmir" },
  { code: "LA", name: "Ladakh" },
  { code: "LD", name: "Lakshadweep" },
  { code: "PY", name: "Puducherry" },
];

/** States whose code, alias or name matches the query (codes first). */
export function searchIndianStates(query, limit = 8) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return INDIAN_STATES.slice(0, limit);
  const codeHits = [];
  const nameHits = [];
  for (const s of INDIAN_STATES) {
    const codes = [s.code, ...(s.aliases || [])].map((c) => c.toLowerCase());
    if (codes.some((c) => c.startsWith(q))) codeHits.push(s);
    else if (s.name.toLowerCase().includes(q)) nameHits.push(s);
  }
  return [...codeHits, ...nameHits].slice(0, limit);
}

/** Exact code/alias match → state, else null. */
export function findIndianState(code) {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return null;
  return INDIAN_STATES.find((s) => s.code === c || (s.aliases || []).includes(c)) || null;
}
