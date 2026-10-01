// ─────────────────────────────────────────────────────────────────────────────
// csv.js — RFC 4180 CSV building + browser download.
// Quotes cells containing commas, quotes or line breaks, and neutralises
// spreadsheet formula injection (cells starting with = + @ or a non-numeric -).
// ─────────────────────────────────────────────────────────────────────────────

const UTF8_BOM = String.fromCharCode(0xfeff);

export function csvCell(value) {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+@\t\r]|^-(?![\d.])/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s) || s !== s.trim()) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {string[]} headers
 * @param {Array<Array<unknown>>} rows
 */
export function toCSV(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  rows.forEach((row) => lines.push(row.map(csvCell).join(",")));
  return lines.join("\r\n");
}

/** Trigger a CSV download (UTF-8 BOM so Excel opens non-ASCII names correctly). */
export function downloadCSV(filename, headers, rows) {
  const blob = new Blob([UTF8_BOM + toCSV(headers, rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/[\\/:*?"<>|]+/g, "-");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Safari can cancel the download if the object URL is revoked immediately.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
