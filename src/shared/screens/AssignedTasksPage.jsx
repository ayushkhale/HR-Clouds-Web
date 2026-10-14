// ─────────────────────────────────────────────────────────────────────────────
// AssignedTasksPage.jsx — "Tasks I Assigned" (#256), mounted in the manager and
// HR workspaces under each one's own prefix.
//
// The viewer comes from the workspace being rendered, never from the raw role
// (CLAUDE.md §2): `admin` is not a workspace, and defaulting a missing one to
// anything is how a role once walked another role's screens. No plane for this
// workspace → the page refuses rather than guessing.
// ─────────────────────────────────────────────────────────────────────────────

import { useCurrentWorkspace } from "../attendance/paths";
import { REVIEW_PLANE_FOR_WORKSPACE } from "../tasks/taskPlanes";
import TaskReviewScreen from "../tasks/TaskReviewScreen";
import NotFoundPage from "./NotFoundPage";

export default function AssignedTasksPage() {
  const viewer = REVIEW_PLANE_FOR_WORKSPACE[useCurrentWorkspace()];
  if (!viewer) return <NotFoundPage />;
  return <TaskReviewScreen viewer={viewer} scope="assigned" />;
}
