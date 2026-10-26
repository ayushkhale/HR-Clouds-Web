// ─────────────────────────────────────────────────────────────────────────────
// ui/index.js — the barrel. Screens import from here:
//
//   import { Screen, Card, Row, StatusBadge, RecordSheet, SheetGrid } from '../../ui';
//
// If something you need isn't exported here, check 20-design/02-component-catalog.md
// before writing it. The catalog's last section lists what is deliberately
// ABSENT and why — a generic Modal, a Table, a Tooltip, an Accordion and a
// chart wrapper are all missing on purpose.
// ─────────────────────────────────────────────────────────────────────────────

export { Screen, ScreenTitle } from './Screen';
export { PageHeader, HeroChip } from './PageHeader';
export { Card, CardHeader } from './Card';
export { Divider, Spacer } from './Divider';

export { Button, IconButton, LinkButton, ButtonRow } from './Button';
export { Pill } from './Pill';
export { StatusBadge } from './StatusBadge';
export { InlineAlert, FieldError } from './InlineAlert';

export { Row, ListFooter } from './Row';
export { EmptyState } from './EmptyState';
export { ErrorState } from './ErrorState';
export { Skeleton, SkeletonBlock } from './Skeleton';

export { FilterTabs } from './FilterTabs';
export { TabStrip } from './TabStrip';
export { MonthStepper, PeriodStepper } from './MonthStepper';

export { RecordSheet } from './RecordSheet';
export {
  SheetStats, SheetSection, SheetGrid, SheetTable, SheetText, SheetFooterNote, SheetMoneySplit,
} from './SheetParts';

export { FormSheet, FormSection } from './FormSheet';
export { Field, ReadOnlyField, FormGrid } from './Field';
export { TextField, PickerBox } from './TextField';
export { Select, OptionSheet, Toggle } from './Select';
export { TimeField, DateField } from './TimeField';
export { PersonSelect, PersonSheet } from './PersonSelect';

export { Avatar } from './Avatar';
export { PersonRow } from './PersonRow';

export { ToastProvider, useToast } from './Toast';
export { ConfirmProvider, useConfirm } from './ConfirmProvider';
export { ReasonPrompt } from './ReasonPrompt';
export { AttachmentViewer } from './AttachmentViewer';

export { FieldHelp, HelpLabel } from './FieldHelp';
