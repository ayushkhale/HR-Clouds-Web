import {
  HiUser, HiMail, HiPhone, HiLocationMarker,
  HiCalendar, HiBriefcase, HiUserGroup, HiOfficeBuilding, HiPencil,
  HiBan, HiCheckCircle, HiTrash, HiExclamation
} from "react-icons/hi";

/**
 * `wrap` lets a long value run onto more lines instead of being clipped.
 *
 * Every row used to be `truncate`, which is right for a date or a gender but
 * cut a full postal address mid-word with no tooltip and no way to read the
 * rest (UI/UX review 2026-10-06, Issue 8). Truncation stays the default so the
 * short fields keep their tidy single line.
 */
function InfoRow({ icon: Icon, label, value, wrap = false }) {
  const displayValue = value ? value : <span className="text-slate-400 italic text-[11px]">Not Available</span>;
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-slate-50 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-500 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{label}</p>
        <p className={`text-xs font-bold text-slate-800 mt-0.5 ${wrap ? "whitespace-normal break-words leading-relaxed" : "truncate"}`}>{displayValue}</p>
      </div>
    </div>
  );
}

export default function ProfileTab({ employee, onEdit, danger = null }) {
  if (!employee) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 shadow-xs">
        <HiUser className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-semibold">No profile data available</p>
      </div>
    );
  }

  const formatDate = (d) => {
    if (!d) return null;
    try { 
      return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); 
    } catch { 
      return d; 
    }
  };

  const getAddress = (address, city, state, pincode) => {
    const parts = [address, city, state, pincode].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  };

  const formatLabel = (str) => {
    if (!str || typeof str !== 'string') return str;
    return str
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  return (
    <div className="space-y-4">
      {/* Unified Single Card for Profile Info */}
      <div className="bg-white rounded-[20px] border border-slate-100 shadow-xs p-6 flex flex-col justify-between" style={{ minHeight: "440px" }}>
        <div>
          <div className="flex items-start justify-between gap-4 mb-4">
            <h2 className="text-base font-bold text-slate-800">Profile Details</h2>
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 transition"
              >
                <HiPencil className="w-3.5 h-3.5" /> Edit details
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 items-start">
            {/* Column 1: Personal Profile */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-bold text-purple-600 uppercase tracking-widest border-b border-purple-50 pb-1.5 mb-1.5">Personal Profile</h3>
              <InfoRow icon={HiCalendar} label="Date of Birth" value={formatDate(employee.date_of_birth || employee.dob)} />
              <InfoRow icon={HiUser} label="Gender" value={formatLabel(employee.gender)} />
              <InfoRow icon={HiUserGroup} label="Marital Status" value={formatLabel(employee.marital_status)} />
              <InfoRow icon={HiUser} label="Blood Group" value={formatLabel(employee.blood_group)} />
              <InfoRow icon={HiUser} label="Father's Name" value={employee.father_name} />
              <InfoRow icon={HiUser} label="Spouse Name" value={employee.spouse_name} />
            </div>

            {/* Column 2: Work & Contact Profile */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-bold text-purple-600 uppercase tracking-widest border-b border-purple-50 pb-1.5 mb-1.5">Work & Contact Profile</h3>
              <InfoRow icon={HiCalendar} label="Date of Joining" value={formatDate(employee.date_of_joining || employee.joining_date)} />
              <InfoRow icon={HiBriefcase} label="Employment Type" value={formatLabel(employee.employment_type)} />
              <InfoRow icon={HiBriefcase} label="Work Mode" value={formatLabel(employee.work_mode)} />
              <InfoRow icon={HiOfficeBuilding} label="Work Office" value={employee.work_location || employee.location?.name} />
              <InfoRow icon={HiMail} label="Personal Email" value={employee.personal_email} />
              <InfoRow icon={HiPhone} label="Emergency Contact" value={employee.emergency_contact_name ? `${employee.emergency_contact_name} (${employee.emergency_contact_number || 'No Number'})` : null} />
            </div>
          </div>

          {/* Full-width Row: Address Details */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <InfoRow icon={HiLocationMarker} label="Address Details" value={getAddress(employee.current_address, employee.city, employee.state, employee.pincode)} wrap />
          </div>
        </div>
      </div>

      {/* The two actions that change or end someone's access. They used to sit
          in a ··· menu at the top of the page, where they were both hard to
          find and one slip away from each other. Here each one says what it
          does before it is pressed, and the destructive one is last. */}
      {danger && <DangerZone {...danger} isActive={employee.is_active !== false} />}
    </div>
  );
}

/** HR-only. Rose is reserved for destructive actions (CLAUDE.md §5). */
function DangerZone({ isActive, onToggleStatus, onDelete, busy = false }) {
  return (
    <section className="bg-white rounded-[20px] border border-rose-200 shadow-xs overflow-hidden">
      <div className="px-6 py-4 border-b border-rose-100 bg-rose-50/50 flex items-start gap-3">
        <span className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
          <HiExclamation className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-800">Danger zone</h2>
          <p className="text-[11px] font-semibold text-slate-500 mt-0.5">These change what this person can reach. Only HR can do them.</p>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-800">{isActive ? "Deactivate this employee" : "Activate this employee"}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {isActive
                ? "They can’t sign in and stop appearing in attendance and payroll. Their records are kept, and you can switch this back on."
                : "They can sign in again and return to attendance and payroll from today."}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleStatus}
            disabled={busy}
            className={`shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-50 ${
              isActive
                ? "text-fuchsia-700 bg-fuchsia-50 hover:bg-fuchsia-100 border border-fuchsia-200"
                : "text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200"
            }`}
          >
            {isActive ? <><HiBan className="w-4 h-4" /> Deactivate</> : <><HiCheckCircle className="w-4 h-4" /> Activate</>}
          </button>
        </div>

        <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-800">Delete this employee</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Removes the person and everything filed under them. This can’t be undone — deactivate instead if they may come back.
            </p>
          </div>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 transition disabled:opacity-50"
          >
            <HiTrash className="w-4 h-4" /> Delete
          </button>
        </div>
      </div>
    </section>
  );
}
