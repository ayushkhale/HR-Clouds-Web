// ─────────────────────────────────────────────────────────────────────────────
// EmbeddedPageContext.jsx — True while a full page is rendered inside another
// page (e.g. Leave Requests inside the HR Inbox). The embedded page then skips
// its own top bar so the host keeps a single header.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext } from "react";

export const EmbeddedPageContext = createContext(false);

export const useEmbeddedPage = () => useContext(EmbeddedPageContext);
