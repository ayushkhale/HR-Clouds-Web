// Indian financial-year helpers (Apr–Mar). FY is formatted "YYYY-YY", e.g. "2026-27".

export function currentFY(d = new Date()) {
  const y = d.getFullYear();
  const start = d.getMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function fyOptions(span = 5) {
  const base = parseInt(currentFY().split("-")[0]);
  return Array.from({ length: span }).map((_, i) => {
    const s = base - 2 + i;
    return `${s}-${String((s + 1) % 100).padStart(2, "0")}`;
  });
}
