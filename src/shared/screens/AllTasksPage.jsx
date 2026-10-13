// ─────────────────────────────────────────────────────────────────────────────
// AllTasksPage.jsx — "All Tasks": every task within the viewer's reach. The
// manager read (#257) is their reporting line; the HR read (#266) is the whole
// organisation and adds a department filter.
//
// Same label, same layout, same columns in both workspaces — only the scope of
// the data differs, which is the rule (CLAUDE.md §2). The viewer comes from the
// workspace, never the raw role.
// ─────────────────────────────────────────────────────────────────────────────

import { useCurrentWorkspace } from "../attendance/paths";
import { REVIEW_PLANE_FOR_WORKSPACE } from "../tasks/taskPlanes";
import TaskReviewScreen from "../tasks/TaskReviewScreen";
import NotFoundPage from "./NotFoundPage";

export default function AllTasksPage() {
  const viewer = REVIEW_PLANE_FOR_WORKSPACE[useCurrentWorkspace()];
  if (!viewer) return <NotFoundPage />;
  return <TaskReviewScreen viewer={viewer} scope="all" />;
}
