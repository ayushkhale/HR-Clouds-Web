// Target-CTC budgeting for the template "Manage Components" modal.
// The target is frontend-only (per template, per browser). Amounts come from
// the backend preview; the client estimate is used only when that fails and
// for the not-yet-saved "Add Component" line.

export const CTC_PRESETS = [300000, 600000, 1200000, 2400000];

export const formatINR = (n) =>
  `₹${(parseFloat(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// "₹20,000/mo · ₹2,40,000/yr" — the modal thinks monthly, CTC is annual.
export const moYr = (annual) => `${formatINR(annual / 12)}/mo · ${formatINR(annual)}/yr`;

// Plain-language note for when the backend couldn't evaluate the template.
export function friendlyPreviewNote(error) {
  if (!error) return "";
  return /reconcile|balanc|exceed|negative|mismatch/i.test(error)
    ? "Estimated amounts · this template doesn't add up to the target CTC yet. Exact figures show once it does."
    : "Estimated amounts · exact figures couldn't be loaded right now.";
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const TARGET_KEY = "hrclouds_tpl_target_ctc:";
const FLAT_UNIT_KEY = "hrclouds_payroll_flat_unit";

export function readTarget(templateId) {
  try { return localStorage.getItem(TARGET_KEY + templateId) || ""; } catch { return ""; }
}

export function writeTarget(templateId, value) {
  try {
    if (value) localStorage.setItem(TARGET_KEY + templateId, String(value));
    else localStorage.removeItem(TARGET_KEY + templateId);
  } catch { /* storage unavailable — target just won't persist */ }
}

export function readFlatUnit() {
  try {
    const v = localStorage.getItem(FLAT_UNIT_KEY);
    return v === "monthly" || v === "annual" ? v : null;
  } catch { return null; }
}

export function writeFlatUnit(unit) {
  try { localStorage.setItem(FLAT_UNIT_KEY, unit); } catch { /* ignore */ }
}

// Whether the backend treats a flat `value` as monthly or annual, read off a
// preview response. Null when the response has no flat line to compare.
export function flatUnitFrom(preview) {
  for (const l of preview?.lines || []) {
    const v = num(l.value);
    if (l.calculation_type !== "flat" || v <= 0) continue;
    const monthly = Math.abs(num(l.monthly_amount) - v) < 1;
    const annual = Math.abs(num(l.annual_amount) - v) < 1;
    if (annual && !monthly) return "annual";
    if (monthly && !annual) return "monthly";
  }
  return null;
}

// Normalised salary-component facts for a template component or preview line.
export function componentMeta(line, components = []) {
  const sc = line.salary_component || {};
  const id = line.component_id ?? line.salary_component_id ?? sc.id;
  const code = line.component_code ?? line.code ?? sc.code;
  const name = line.component_name ?? line.name ?? sc.name;
  const found =
    (id && components.find((c) => c.id === id)) ||
    (code && components.find((c) => c.code === code)) ||
    (name && components.find((c) => c.name === name)) ||
    {};
  const type = line.component_type ?? found.component_type ?? sc.component_type;
  const resolvedName = found.name ?? name;
  const resolvedCode = found.code ?? code;
  return {
    id: found.id ?? id,
    name: resolvedName,
    type,
    partOfCtc: line.is_part_of_ctc ?? found.is_part_of_ctc ?? sc.is_part_of_ctc ?? type !== "deduction",
    isBasic:
      line.is_basic ?? found.is_basic ?? sc.is_basic ??
      (resolvedCode === "BASIC" || /^basic\b/i.test(resolvedName || "")),
  };
}

// Balancing lines absorb whatever the target has left, so they are kept out of `used`.
function summarize(rows, target, extra) {
  let used = 0;
  let unresolved = 0;
  const balancingRows = [];
  rows.forEach((r) => {
    if (!r.meta.partOfCtc) return;
    if (r.calc === "balancing") { balancingRows.push(r); return; }
    if (r.annual == null) { unresolved += 1; return; }
    used += r.annual;
  });
  const remaining = target - used;
  if (extra.estimate && balancingRows[0]) balancingRows[0].annual = Math.max(remaining, 0);
  return { rows, target, used, remaining, balancing: balancingRows[0] || null, unresolved, ...extra };
}

export function budgetFromPreview(preview, components, target) {
  const rows = (preview?.lines || []).map((l) => ({
    meta: componentMeta(l, components),
    calc: l.calculation_type,
    annual: l.annual_amount != null ? num(l.annual_amount) : num(l.monthly_amount) * 12,
  }));
  const basic = rows.find((r) => r.meta.isBasic)?.annual ?? null;
  const gross = preview?.monthly_gross != null ? num(preview.monthly_gross) * 12 : null;
  return summarize(rows, target, {
    basic,
    gross,
    ctc: num(preview?.annual_ctc) || target,
    estimate: false,
  });
}

// Fallback when the backend can't evaluate the template yet (half-built, unbalanced).
// % of Gross depends on the balancing line, so it stays unresolved here.
export function estimateBudget(templateComponents, components, target, flatUnit) {
  const rows = (templateComponents || []).map((c) => ({
    meta: componentMeta(c, components),
    calc: c.calculation_type,
    value: num(c.value),
    annual: null,
  }));
  rows.forEach((r) => {
    if (r.calc === "flat") r.annual = flatUnit === "annual" ? r.value : r.value * 12;
    else if (r.calc === "percent_of_ctc") r.annual = (target * r.value) / 100;
  });
  const basic = rows.find((r) => r.meta.isBasic)?.annual ?? null;
  rows.forEach((r) => {
    if (r.calc === "percent_of_basic") r.annual = basic != null ? (basic * r.value) / 100 : null;
  });
  return summarize(rows, target, { basic, gross: null, ctc: target, estimate: true });
}

// Annual amount for one template component row, or null if unknown.
export function rowAnnual(budget, templateComponent, components) {
  if (!budget) return null;
  const meta = componentMeta(templateComponent, components);
  const row = budget.rows.find(
    (r) => (meta.id && r.meta.id === meta.id) || (meta.name && r.meta.name === meta.name)
  );
  return row?.annual ?? null;
}

const floor2 = (n) => Math.floor(n * 100) / 100;

// A flat value in the backend's unit, rounded to a tidy step.
function flatValueFor(annual, flatUnit, roundDown = false) {
  const perUnit = flatUnit === "annual" ? annual : annual / 12;
  const step = flatUnit === "annual" ? 1000 : 100;
  return (roundDown ? Math.floor : Math.round)(perUnit / step) * step;
}

// Up to 3 one-click fixes. They only prefill the form / inline edit; HR still saves.
//  - over target → trim the biggest adjustable line (Basic last, other lines hang off it)
//  - no Basic → Basic at 40% of CTC; Basic but no HRA → HRA at 50% of Basic
//  - money left and nothing absorbing it → a special/other allowance as balancing
export function buildSuggestions({ budget, templateComponents = [], components = [], isCtcDriven, flatUnit }) {
  if (!budget) return [];
  const out = [];
  const metaOf = (c) => componentMeta(c, components);
  const inTemplate = new Set(templateComponents.map((c) => metaOf(c).id).filter(Boolean));
  const unitLabel = flatUnit === "annual" ? "/yr" : "/mo";
  const over = -budget.remaining;

  if (over > 0.5) {
    const pick = budget.rows
      .filter((r) => r.meta.partOfCtc && r.annual >= over - 0.5 && ["flat", "percent_of_ctc", "percent_of_basic"].includes(r.calc))
      .sort((a, b) => Number(a.meta.isBasic) - Number(b.meta.isBasic) || b.annual - a.annual)[0];
    if (!pick) return out;
    const tc = templateComponents.find((c) => {
      const m = metaOf(c);
      return (m.id && m.id === pick.meta.id) || (m.name && m.name === pick.meta.name);
    });
    const target = pick.annual - over;
    if (tc && target < 1) {
      out.push({
        key: "trim", kind: "remove", tone: "red",
        title: `Remove ${pick.meta.name}`,
        detail: `saves ≈ ${formatINR(pick.annual / 12)}/mo`,
        templateComponentId: tc.id,
      });
      return out;
    }
    let value = null;
    let label = "";
    if (pick.calc === "flat") {
      value = flatValueFor(target, flatUnit, true);
      label = `${formatINR(value)}${unitLabel}`;
    } else if (pick.calc === "percent_of_ctc" && budget.ctc) {
      value = floor2((target / budget.ctc) * 100);
      label = `${value}% of CTC`;
    } else if (pick.calc === "percent_of_basic" && budget.basic) {
      value = floor2((target / budget.basic) * 100);
      label = `${value}% of Basic`;
    }
    if (tc && value > 0) {
      out.push({
        key: "trim", kind: "edit", tone: "red",
        title: `Reduce ${pick.meta.name} to ${label}`,
        detail: `saves ≈ ${formatINR(over / 12)}/mo`,
        templateComponentId: tc.id, calculation_type: pick.calc, value,
      });
    }
    return out; // adding anything while over the target wouldn't help
  }

  const available = components.filter(
    (c) => !inTemplate.has(c.id) && c.component_type !== "deduction" && c.is_part_of_ctc !== false
  );

  const hasBasic = templateComponents.some((c) => metaOf(c).isBasic);
  const basicComp = available.find((c) => c.is_basic || c.code === "BASIC" || /^basic\b/i.test(c.name || ""));
  if (!hasBasic && basicComp && budget.remaining > 0.5) {
    if (isCtcDriven) {
      out.push({
        key: "basic", kind: "add",
        title: `Add ${basicComp.name} · 40% of CTC`,
        detail: `≈ ${formatINR((budget.ctc * 0.4) / 12)}/mo`,
        component_id: basicComp.id, calculation_type: "percent_of_ctc", value: 40,
      });
    } else {
      const value = flatValueFor(budget.target * 0.4, flatUnit);
      out.push({
        key: "basic", kind: "add",
        title: `Add ${basicComp.name} · ${formatINR(value)}${unitLabel}`,
        detail: "40% of the target",
        component_id: basicComp.id, calculation_type: "flat", value,
      });
    }
  }

  const hraComp = available.find((c) => c.code === "HRA" || /\bhra\b|house rent/i.test(c.name || ""));
  if (budget.basic > 0 && hraComp && budget.basic * 0.5 <= budget.remaining) {
    out.push({
      key: "hra", kind: "add",
      title: `Add ${hraComp.name} · 50% of Basic`,
      detail: `≈ ${formatINR((budget.basic * 0.5) / 12)}/mo`,
      component_id: hraComp.id, calculation_type: "percent_of_basic", value: 50,
    });
  }

  if (budget.remaining > 0.5 && !budget.balancing) {
    const balComp = available.find(
      (c) => c.id !== hraComp?.id && c.id !== basicComp?.id && /special|balanc|flexi|other allowance/i.test(c.name || "")
    );
    if (balComp) {
      out.push({
        key: "balancing", kind: "add",
        title: `Add ${balComp.name} as balancing`,
        detail: `takes the remaining ≈ ${formatINR(budget.remaining / 12)}/mo`,
        component_id: balComp.id, calculation_type: "balancing", value: "",
      });
    }
  }

  return out.slice(0, 3);
}

// Annual amount an unsaved line would add, or null if its base isn't known yet.
export function estimateLine(calculationType, value, budget, flatUnit) {
  const v = num(value);
  switch (calculationType) {
    case "flat": return flatUnit === "annual" ? v : v * 12;
    case "percent_of_ctc": return (budget.ctc * v) / 100;
    case "percent_of_basic": return budget.basic != null ? (budget.basic * v) / 100 : null;
    case "percent_of_gross": return budget.gross != null ? (budget.gross * v) / 100 : null;
    default: return null;
  }
}
