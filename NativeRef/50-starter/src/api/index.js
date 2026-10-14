// ─────────────────────────────────────────────────────────────────────────────
// api/index.js — the barrel every screen imports from.
//
//   import { attendanceAPI, payrollAPI, payrollFiles } from '@/api';
//
// Screens import from HERE, never from client.js (there is a lint rule for
// it). To add a domain, create a new *.api.js and re-export it below.
// ─────────────────────────────────────────────────────────────────────────────

export {
  request,
  requestWithToken,
  API_BASE_URL,
  decodeJWT,
  tokenExpiresAt,
  isTokenExpired,
  setToken,
  getToken,
  clearToken,
  onSessionExpired,
} from './client';

export { qs, seg } from './attendance.api';

export { authAPI } from './auth.api';
export { attendanceAPI } from './attendance.api';
export { leaveAPI } from './leave.api';
export { payrollAPI, payrollFiles } from './payroll.api';
export { documentsAPI } from './documents.api';
export { organizationAPI } from './organization.api';

export {
  downloadFile,
  shareFile,
  fetchFileToCache,
  uploadToPresignedUrl,
  clearDownloadCache,
  DOWNLOAD_DIR,
} from './files';
