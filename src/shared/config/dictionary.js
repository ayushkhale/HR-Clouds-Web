import { HiCheckCircle, HiExclamationCircle, HiClock } from "react-icons/hi";

export const DICTIONARY = {
  NAV: {
    DIRECTORY: "Directory",
    EMPLOYEES: "Team",
    REPORTS: "Reports"
  },
  STATUS: {
    PRESENT: "Present",
    ABSENT: "Absent",
    LATE: "Late",
    HALF_DAY: "Half Day",
    ON_LEAVE: "On Leave",
    OFFICE: "Office",
    REMOTE: "Remote",
    HYBRID: "Hybrid",
    OVERTIME: "Overtime",
    NOT_MARKED: "Not Marked"
  },
  STATUS_CONFIG: {
    present: {
      label: "Present",
      icon: HiCheckCircle,
      className: "bg-violet-50 text-violet-700 border border-violet-200 shadow-xs"
    },
    absent: {
      label: "Absent",
      icon: HiExclamationCircle,
      className: "bg-rose-50 text-rose-700 border border-rose-200 shadow-xs"
    },
    late: {
      label: "Late",
      icon: HiClock,
      className: "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 shadow-xs"
    },
    half_day: {
      label: "Half Day",
      icon: HiClock,
      className: "bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-xs"
    },
    on_leave: {
      label: "On Leave",
      icon: HiExclamationCircle,
      className: "bg-purple-50 text-purple-700 border border-purple-200 shadow-xs"
    },
    in_progress: {
      label: "In Progress",
      icon: HiClock,
      className: "bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-xs"
    },
    weekly_off: {
      label: "Weekly Off",
      icon: HiExclamationCircle,
      className: "bg-slate-50 text-slate-500 border border-slate-200 shadow-xs"
    },
    holiday: {
      label: "Holiday",
      icon: HiExclamationCircle,
      className: "bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-xs"
    },
    overtime: {
      label: "Overtime",
      icon: HiClock,
      className: "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 shadow-xs"
    },
    not_marked: {
      label: "Not Marked",
      icon: HiExclamationCircle,
      className: "bg-slate-50 text-slate-500 border border-slate-200 shadow-xs"
    }
  },
  HEADERS: {
    ATTENDANCE_DIRECTORY: "Attendance Directory",
    TEAM_DIRECTORY: "Team Directory",
    TOP_DEFAULTERS: "Top Defaulters",
    WORK_MODE: "Work Mode",
    TEAM_PERFORMANCE: "Team Performance"
  },
  DESCRIPTIONS: {
    ATTENDANCE_DIRECTORY: "View and manage attendance records for the organization."
  },
  TERMS: {
    COMP_OFF: "Complimentary Off"
  }
};
