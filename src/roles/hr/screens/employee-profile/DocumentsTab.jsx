// DocumentsTab.jsx — The employee's document file inside their HR profile.
// Mounted only when the tab is opened, so the org directory (used to name who
// uploaded, recommended and decided) loads on demand.
import SubjectDocumentsPanel from "../../../../shared/documents/SubjectDocumentsPanel";
import useEmployeeDirectory from "../../payroll/useEmployeeDirectory";

export default function DocumentsTab({ userId, employeeName }) {
  const { nameOf } = useEmployeeDirectory();
  return <SubjectDocumentsPanel planeKey="hr" userId={userId} subjectName={employeeName} nameOf={nameOf} />;
}
