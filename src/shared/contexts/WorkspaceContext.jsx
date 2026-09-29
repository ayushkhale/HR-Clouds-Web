// ─────────────────────────────────────────────────────────────────────────────
// WorkspaceContext.jsx — which workspace (employee / manager / hr / guest) the
// current page is mounted in. Provided by DashboardLayout from the role its
// route group already resolved.
//
// Self-service screens mount under every workspace's prefix, so a component
// that must behave differently per workspace (e.g. FieldHelp's config gate)
// reads it here rather than parsing the URL (CLAUDE.md §1). Null outside a
// dashboard layout — callers treat that as "no workspace", not as a default.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext } from "react";

export const WorkspaceContext = createContext(null);

export const useWorkspace = () => useContext(WorkspaceContext);
