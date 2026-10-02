// ─────────────────────────────────────────────────────────────────────────────
// organization/orgChartMeta.js — What the Org Chart knows about the tree.
//
// GET /organizations/hierarchy returns `{ total_members, roots[] }`, a FOREST:
// several people can sit at the top (two HR admins nobody reports to), and a
// member whose manager has been deactivated also comes back as a root, still
// carrying that manager's `reporting_to_id`. This file turns that into an
// index the screens can ask questions of — who is above whom, how big a team
// is, which departments exist — without walking the tree again per render.
//
// Contract traps (`public/ref docs/md_updates/5_org_details_and_hierarchy_api.md` §2):
// • `reporting_to_id` is the PARENT FROM THE MAPPING, not always the node above
//   in this tree. A root with a non-null `reporting_to_id` reports to somebody
//   no longer active. `parentId` below is the tree parent; `formerManager`
//   flags the mismatch. Never print either id (CLAUDE.md §4).
// • The server promises each member appears once and cycles are broken, but a
//   `seen` set guards against both anyway: a duplicate would give React two
//   children with one key and the chart would drop a branch silently.
// • Avatar URLs are presigned for about five minutes. They must not be stored
//   anywhere that outlives the response — the page refetches instead.
// ─────────────────────────────────────────────────────────────────────────────

import { roleTitle } from "../config/dictionary";

/** How each role is drawn. Purple family only (CLAUDE.md §5): HR deep purple, managers indigo, employees violet. */
export const ROLE_META = {
  hr: {
    label: roleTitle("hr"),
    ring: "ring-purple-600",
    bar: "from-purple-700 to-violet-500",
    tag: "bg-purple-600 text-white",
    soft: "bg-purple-50 text-purple-700 border-purple-200",
    dot: "bg-purple-600",
  },
  manager: {
    label: roleTitle("manager"),
    ring: "ring-indigo-500",
    bar: "from-indigo-600 to-violet-500",
    tag: "bg-indigo-600 text-white",
    soft: "bg-indigo-50 text-indigo-700 border-indigo-200",
    dot: "bg-indigo-500",
  },
  employee: {
    label: roleTitle("employee"),
    ring: "ring-violet-300",
    bar: "from-violet-400 to-purple-300",
    tag: "bg-violet-100 text-violet-700",
    soft: "bg-violet-50 text-violet-700 border-violet-200",
    dot: "bg-violet-400",
  },
};

export const roleMetaOf = (role) => ROLE_META[String(role || "").toLowerCase()] || ROLE_META.employee;

// Department colours are decoration — the chip always carries the name — so
// they only need to tell neighbours apart. Purple family only; static class
// strings so Tailwind keeps them.
const DEPARTMENT_TONES = [
  { dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700 border-violet-200", active: "bg-violet-600 text-white border-violet-600" },
  { dot: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-700 border-indigo-200", active: "bg-indigo-600 text-white border-indigo-600" },
  { dot: "bg-purple-500", chip: "bg-purple-50 text-purple-700 border-purple-200", active: "bg-purple-600 text-white border-purple-600" },
  { dot: "bg-purple-300", chip: "bg-purple-50/60 text-purple-800 border-purple-100", active: "bg-purple-800 text-white border-purple-800" },
  { dot: "bg-violet-300", chip: "bg-violet-50/60 text-violet-800 border-violet-100", active: "bg-violet-800 text-white border-violet-800" },
  { dot: "bg-indigo-300", chip: "bg-indigo-50/60 text-indigo-800 border-indigo-100", active: "bg-indigo-800 text-white border-indigo-800" },
];
const NO_DEPARTMENT_TONE = { dot: "bg-slate-300", chip: "bg-slate-50 text-slate-600 border-slate-200", active: "bg-slate-700 text-white border-slate-700" };

/**
 * Stable tone per department (the same department is the same colour on every
 * screen). Hashed from the NAME on purpose, unlike the grouping key below: a
 * colour has to agree with the one the same department gets on screens that
 * only ever receive its name, and an id would make the two disagree.
 */
export function departmentTone(name) {
  if (!name) return NO_DEPARTMENT_TONE;
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DEPARTMENT_TONES[h % DEPARTMENT_TONES.length];
}

/** Key for the "no department" filter — never a real department id. */
export const NO_DEPARTMENT = "__none__";

/**
 * Which department a node is filtered under. `department_id`, NOT the name:
 * the hierarchy payload carries both and documents both as nullable, and the
 * name is a denormalized copy that the 2026-10-02 repair migration rewrites
 * where it can resolve the real department and nulls where it cannot. Keying
 * on the name split one department into two chips whenever two members
 * disagreed about its spelling, and merged two same-named departments into one.
 *
 * The name is still the fallback when a node carries no id — see the body for
 * why that is not the same as folding those nodes into "No department".
 */
export const departmentKeyOf = (node) => {
  if (node?.department_id) return String(node.department_id);
  // A name with no id is a member whose department could not be reconciled to
  // any department row. It still gets its own group rather than being folded
  // into "No department", for two reasons: before migration 00067 runs EVERY
  // node looks like this, and collapsing them all would silently delete the
  // filter strip on a server that simply hasn't migrated yet; and after it
  // runs, a ghost that survived is genuinely a separate group from "nobody
  // has a department here". The id wins whenever there is one, so a mixed
  // state degrades to two visible groups rather than one wrong one
  // (CLAUDE.md §7).
  return node?.department || NO_DEPARTMENT;
};

const clean = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The name to show. The server already falls back to first + last, then email. */
export function displayNameOf(raw) {
  const full = [clean(raw?.first_name), clean(raw?.last_name)].filter(Boolean).join(" ");
  return clean(raw?.name) || clean(full) || clean(raw?.email) || "A colleague";
}

/**
 * Build the chart index from a hierarchy response.
 * @returns {{
 *   roots: object[], byId: Map<string, object>, flat: object[], total: number,
 *   depth: number, departments: {key, name, count}[], roleCounts: {hr, manager, employee},
 *   biggestTeam: object|null, formerManagerCount: number
 * }}
 */
export function buildOrgIndex(data) {
  const byId = new Map();
  const flat = [];
  const seen = new Set();
  let depth = 0;
  let biggestTeam = null;
  let formerManagerCount = 0;
  const roleCounts = { hr: 0, manager: 0, employee: 0 };
  const deptCounts = new Map();

  const visit = (raw, parentId, level, fallbackKey) => {
    const id = clean(raw?.user_id) || fallbackKey;
    if (seen.has(id)) return null;
    seen.add(id);
    const role = ["hr", "manager", "employee"].includes(raw?.role) ? raw.role : "employee";
    const node = {
      id,
      name: displayNameOf(raw),
      email: clean(raw?.email),
      avatar_url: clean(raw?.avatar_url),
      role,
      employee_code: clean(raw?.employee_code),
      designation: clean(raw?.designation),
      department: clean(raw?.department),
      department_id: clean(raw?.department_id),
      work_location: clean(raw?.work_location),
      parentId,
      // A root that still names somebody above it: that person is no longer active.
      formerManager: !parentId && !!clean(raw?.reporting_to_id),
      level,
      children: [],
      teamSize: 0,
    };
    byId.set(id, node);
    flat.push(node);
    depth = Math.max(depth, level + 1);
    roleCounts[role] += 1;
    if (node.formerManager) formerManagerCount += 1;
    const kids = Array.isArray(raw?.children) ? raw.children : [];
    kids.forEach((child, i) => {
      const c = visit(child, id, level + 1, `${id}:${i}`);
      if (c) {
        node.children.push(c);
        node.teamSize += 1 + c.teamSize;
      }
    });
    if (node.children.length && (!biggestTeam || node.children.length > biggestTeam.children.length)) biggestTeam = node;
    return node;
  };

  const rawRoots = Array.isArray(data?.roots) ? data.roots : [];
  const roots = rawRoots.map((r, i) => visit(r, null, 0, `root:${i}`)).filter(Boolean);

  // The label is taken from the first node seen in each department, because the
  // key is usually an id and an id never reaches the screen (CLAUDE.md §4). A
  // department whose every member lost its name reads "No department name",
  // never a UUID and never an empty chip.
  const deptNames = new Map();
  for (const node of flat) {
    const key = departmentKeyOf(node);
    deptCounts.set(key, (deptCounts.get(key) || 0) + 1);
    if (key !== NO_DEPARTMENT && node.department && !deptNames.has(key)) deptNames.set(key, node.department);
  }

  const departments = [...deptCounts.entries()]
    .map(([key, count]) => ({
      key,
      name: key === NO_DEPARTMENT ? "No department" : deptNames.get(key) || "No department name",
      count,
    }))
    .sort((a, b) => (a.key === NO_DEPARTMENT) - (b.key === NO_DEPARTMENT) || b.count - a.count || a.name.localeCompare(b.name));

  return {
    roots,
    byId,
    flat,
    // The server's count can include members the builder dropped as duplicates; trust what we drew.
    total: flat.length,
    depth,
    departments,
    roleCounts,
    biggestTeam,
    formerManagerCount,
  };
}

/** The people above `id`, top first (not including `id`). */
export function ancestorsOf(index, id) {
  const chain = [];
  let cur = index?.byId.get(id);
  const guard = new Set();
  while (cur?.parentId && !guard.has(cur.parentId)) {
    guard.add(cur.parentId);
    cur = index.byId.get(cur.parentId);
    if (cur) chain.unshift(cur);
  }
  return chain;
}

/**
 * Which people start unfolded. Always the top of the chart; then each next
 * level while the chart would still fit about `budget` cards — a 12-person
 * start-up opens fully, a 900-person org opens to its leadership.
 */
export function defaultExpanded(index, budget = 36) {
  const open = new Set();
  let level = index.roots;
  let visible = level.length;
  let first = true;
  while (level.length) {
    const withKids = level.filter((n) => n.children.length);
    const next = withKids.flatMap((n) => n.children);
    if (!first && visible + next.length > budget) break;
    withKids.forEach((n) => open.add(n.id));
    visible += next.length;
    level = next;
    first = false;
  }
  return open;
}

/** Every person with reports — the "Expand all" set. */
export const allExpandable = (index) => new Set(index.flat.filter((n) => n.children.length).map((n) => n.id));

/**
 * People matching a search, best first: name starts-with, then word
 * starts-with, then anywhere in name, title, department or code.
 */
export function searchPeople(index, query, limit = 8) {
  const q = String(query || "").trim().toLowerCase();
  if (!q || !index) return [];
  const scored = [];
  for (const n of index.flat) {
    const name = n.name.toLowerCase();
    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 1;
    else if (name.includes(q)) score = 2;
    else if ([n.designation, n.department, n.employee_code, n.email].some((v) => v && v.toLowerCase().includes(q))) score = 3;
    if (score >= 0) scored.push([score, n]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, limit).map(([, n]) => n);
}

/**
 * A team drawn as a compact stacked panel instead of a row of cards: when
 * everybody in it is a leaf and there are enough of them that a row would
 * stretch the chart sideways (a support lead with 30 agents).
 */
export const STACK_AT = 5;
export const isStackedTeam = (node) => node.children.length >= STACK_AT && node.children.every((c) => c.children.length === 0);

/** The rows the List view shows: visible people in reading order. */
export function visibleRows(roots, expanded) {
  const rows = [];
  const walk = (nodes) => {
    for (const n of nodes) {
      rows.push(n);
      if (n.children.length && expanded.has(n.id)) walk(n.children);
    }
  };
  walk(roots);
  return rows;
}

/** "Level 1" is the top of the chart. */
export const levelLabel = (node) => `Level ${node.level + 1}`;
