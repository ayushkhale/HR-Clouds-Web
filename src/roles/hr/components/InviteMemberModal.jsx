// ─────────────────────────────────────────────────────────────────────────────
// InviteMemberModal.jsx — The invite form, lifted out of EmployeesPage so both
// that screen and the Invites screen can open the same one.
//
// It owns every field it collects: the page that opens it passes only
// `onClose` and `onInvited`. Locations, departments and the HR list load here
// too, because they exist solely to fill this form's pickers.
//
// Drafts: the form asks for documents people often have to go and find (PAN,
// UAN, addresses), so a half-filled form is saved as you type and offered back
// next time. It lives in localStorage rather than sessionStorage because the
// point is to come back later — a sessionStorage draft dies with the tab,
// which is exactly the case this is meant to survive. It is keyed per user, so
// two accounts on one machine never see each other's draft, and it is cleared
// the moment an invitation is sent.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { organizationAPI } from "../../../shared/api";
import { HiX, HiPaperAirplane, HiCheckCircle, HiChevronDown, HiUserGroup, HiTrash, HiClock } from "react-icons/hi";
import { PersonSelect, toPersonOption } from "../../../shared/components/PersonPicker";

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Others" },
];

/* ── Draft storage ────────────────────────────────────────────────────────── */
const DRAFT_PREFIX = "hrclouds.inviteDraft.";
const draftKey = (userId) => `${DRAFT_PREFIX}${userId || "anon"}`;

/** Every field the draft carries. Keeping this explicit means a new field is a
 *  deliberate decision about whether it is safe to persist, not an accident. */
const DRAFT_FIELDS = [
  "email", "role", "name", "empId", "contact", "bloodGroup", "dob", "gender",
  "joiningDate", "workLocation", "department", "designation", "reportingManager",
  "makeHod", "jobStatus", "employmentType", "workMode",
  "panNumber", "uanNumber", "maritalStatus", "personalEmail",
  "currentAddress", "permanentAddress", "isSameAddress", "city", "state", "pincode",
];

function readDraft(userId) {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.values) return null;
    return parsed;
  } catch {
    // Private mode, cleared storage, or a value from an older shape.
    return null;
  }
}

function writeDraft(userId, values) {
  try {
    localStorage.setItem(draftKey(userId), JSON.stringify({ savedAt: Date.now(), values }));
  } catch {
    // Quota or blocked storage: the form still works, it just won't be kept.
  }
}

function clearDraft(userId) {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    /* nothing to do */
  }
}

/** "just now" / "12 minutes ago" / "3 days ago" — enough to judge staleness. */
function savedAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * @param {object} props
 * @param {string} [props.userId]                  scopes the saved draft
 * @param {() => void} props.onClose
 * @param {(invite: object) => void} [props.onInvited]  the invitation that was just sent
 */
export default function InviteMemberModal({ userId, onClose, onInvited }) {
  // Required
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");

  // Optional profile
  const [name, setName] = useState("");
  const [empId, setEmpId] = useState("");
  const [contact, setContact] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");

  // Optional organization
  const [joiningDate, setJoiningDate] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [reportingManager, setReportingManager] = useState("");
  const [makeHod, setMakeHod] = useState(false);
  const [jobStatus, setJobStatus] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [workMode, setWorkMode] = useState("");

  // Optional compliance / address
  const [panNumber, setPanNumber] = useState("");
  const [uanNumber, setUanNumber] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [currentAddress, setCurrentAddress] = useState("");
  const [permanentAddress, setPermanentAddress] = useState("");
  const [isSameAddress, setIsSameAddress] = useState(false);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");

  const [roster, setRoster] = useState([]);
  const [managers, setManagers] = useState([]);
  const [hrList, setHrList] = useState([]);
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentLoading, setDepartmentLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState({ type: "", message: "" });

  const [collapsedSections, setCollapsedSections] = useState({
    section1: false, section2: true, section3: true, section4: true,
  });
  const toggleSection = (key) => setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // A draft found on open. Nothing is restored until it is accepted, so a
  // forgotten draft can never quietly become the invitation that gets sent.
  const [pendingDraft, setPendingDraft] = useState(() => readDraft(userId));
  const [draftNotice, setDraftNotice] = useState("");

  const SETTERS = {
    email: setEmail, role: setRole, name: setName, empId: setEmpId, contact: setContact,
    bloodGroup: setBloodGroup, dob: setDob, gender: setGender, joiningDate: setJoiningDate,
    workLocation: setWorkLocation, department: setDepartment, designation: setDesignation,
    reportingManager: setReportingManager, makeHod: setMakeHod, jobStatus: setJobStatus,
    employmentType: setEmploymentType, workMode: setWorkMode, panNumber: setPanNumber,
    uanNumber: setUanNumber, maritalStatus: setMaritalStatus, personalEmail: setPersonalEmail,
    currentAddress: setCurrentAddress, permanentAddress: setPermanentAddress,
    isSameAddress: setIsSameAddress, city: setCity, state: setState, pincode: setPincode,
  };

  const values = {
    email, role, name, empId, contact, bloodGroup, dob, gender, joiningDate,
    workLocation, department, designation, reportingManager, makeHod, jobStatus,
    employmentType, workMode, panNumber, uanNumber, maritalStatus, personalEmail,
    currentAddress, permanentAddress, isSameAddress, city, state, pincode,
  };

  const restoreDraft = () => {
    const saved = pendingDraft?.values || {};
    DRAFT_FIELDS.forEach((k) => {
      if (saved[k] !== undefined && SETTERS[k]) SETTERS[k](saved[k]);
    });
    // Open every section that holds restored data, so nothing is hidden behind
    // a collapsed header that the person then forgets to check.
    setCollapsedSections({
      section1: false,
      section2: !(saved.contact || saved.bloodGroup || saved.dob),
      section3: !(saved.department || saved.designation || saved.workLocation || saved.jobStatus),
      section4: !(saved.panNumber || saved.uanNumber || saved.currentAddress || saved.permanentAddress || saved.pincode),
    });
    setPendingDraft(null);
    setDraftNotice("Draft restored. Check every field before sending.");
  };

  const discardDraft = () => {
    clearDraft(userId);
    setPendingDraft(null);
    setDraftNotice("");
  };

  // Save as you type, once the form holds something worth keeping. Debounced so
  // a long address is one write, not one per keystroke.
  const touched = DRAFT_FIELDS.some((k) => {
    const v = values[k];
    return k === "role" ? v !== "employee" : typeof v === "boolean" ? v : String(v || "").trim() !== "";
  });
  const skipSave = useRef(true);
  useEffect(() => {
    // Never overwrite a draft that is still sitting unanswered on screen.
    if (pendingDraft) return undefined;
    if (skipSave.current) { skipSave.current = false; return undefined; }
    if (!touched) return undefined;
    const id = setTimeout(() => writeDraft(userId, values), 600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, pendingDraft, touched, ...DRAFT_FIELDS.map((k) => values[k])]);

  const closeWithDraft = useCallback(() => {
    if (!pendingDraft && touched) writeDraft(userId, values);
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDraft, touched, userId, onClose, ...DRAFT_FIELDS.map((k) => values[k])]);

  // Escape closes, keeping whatever has been typed.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !inviteLoading) closeWithDraft(); };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [inviteLoading, closeWithDraft]);

  // Pickers: the roster feeds the reporting-person list, plus locations and
  // departments. Loaded once, when the form opens.
  useEffect(() => {
    let alive = true;
    Promise.all([
      organizationAPI.getEmployees({ purpose: "shift_assignment" }).catch(() => ({ success: false, data: [] })),
      organizationAPI.getLocations().catch(() => ({ success: false, data: [] })),
      organizationAPI.getDepartments().catch(() => ({ success: false, data: [] })),
    ]).then(([res, locRes, depRes]) => {
      if (!alive) return;
      if (res.success && res.data) {
        setRoster(res.data);
        setManagers(res.data.filter((e) => e.role === "manager" || e.role === "hr"));
      }
      if (locRes.success && locRes.data) setLocations(locRes.data);
      if (depRes.success && depRes.data) setDepartments(depRes.data);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (hrList.length > 0) return;
    organizationAPI.getEmployees({ purpose: "all_hr_list" })
      .then((res) => { if (res.success && res.data) setHrList(res.data); })
      .catch(() => { /* the picker falls back to HR rows from the employee list */ });
  }, [hrList.length]);

  // Pincode → city and state.
  useEffect(() => {
    if (!pincode || pincode.length !== 6) return undefined;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
        const data = await res.json();
        if (data?.[0]?.Status === "Success") {
          const postOffice = data[0].PostOffice[0];
          setCity(postOffice.District);
          setState(postOffice.State);
        }
      } catch {
        // Leave city/state for the person to type.
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [pincode]);

  // Departments follow the chosen work location.
  useEffect(() => {
    let alive = true;
    setDepartmentLoading(true);
    organizationAPI.getDepartments(workLocation ? { location_id: workLocation } : {})
      .then((res) => {
        if (!alive || !res.success || !res.data) return;
        setDepartments(res.data);
        setDepartment((cur) => (cur && !res.data.some((d) => (d.id || d._id) === cur) ? "" : cur));
      })
      .catch(() => { /* keep the list we have */ })
      .finally(() => { if (alive) setDepartmentLoading(false); });
    return () => { alive = false; };
  }, [workLocation]);

  useEffect(() => {
    if (role === "employee" || !department) setMakeHod(false);
  }, [role, department]);

  // Pre-fill the reporting person with the department's head.
  useEffect(() => {
    if (!department || departments.length === 0) return;
    const selected = departments.find((d) => (d.id || d._id) === department);
    setReportingManager(selected?.head_of_department_id || "");
  }, [department, departments]);

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    setWorkLocation("");
    setDepartment("");
    setReportingManager("");
    setMakeHod(false);
  };

  async function handleInvite(e) {
    e.preventDefault();

    // Collapsed sections unmount their inputs, so the browser's `required`
    // check never sees them. Validate here and open the section that holds the
    // first missing field.
    const missing = [
      ["section1", "Full name", name],
      ["section1", "Email address", email],
      ["section1", "Gender", gender],
      ["section2", "Primary contact", contact],
      ["section3", "Department", department],
      ["section3", "Reporting person", reportingManager],
      ["section3", "Job status", jobStatus],
      ["section3", "Employment type", employmentType],
      ["section3", "Work mode", workMode],
      ["section4", "Permanent address", permanentAddress],
    ].filter(([, , value]) => !String(value ?? "").trim());
    if (missing.length > 0) {
      setCollapsedSections((prev) => ({ ...prev, [missing[0][0]]: false }));
      setInviteResult({ type: "error", message: `Please fill in: ${missing.map(([, label]) => label).join(", ")}.` });
      return;
    }

    setInviteLoading(true);
    setInviteResult({ type: "", message: "" });

    try {
      const payload = { email, role };
      if (makeHod && (role === "manager" || role === "hr") && department) payload.make_hod = true;
      if (name) payload.name = name;
      if (empId) payload.emp_id = empId;
      if (contact) payload.contact = contact;
      if (bloodGroup) payload.blood_group = bloodGroup;
      if (dob) payload.dob = dob;
      if (gender) payload.gender = gender;
      if (joiningDate) payload.joining_date = joiningDate;
      if (workLocation) payload.location_id = workLocation;
      if (department) payload.department_id = department;
      if (designation) payload.designation = designation;
      if (reportingManager) payload.reporting_person = reportingManager;
      if (jobStatus) payload.job_status = jobStatus;
      if (employmentType) payload.employment_type = employmentType;
      if (workMode) payload.work_mode = workMode;
      if (panNumber) payload.pan_number = panNumber;
      if (uanNumber) payload.uan_number = uanNumber;
      if (maritalStatus) payload.marital_status = maritalStatus;
      if (personalEmail) payload.personal_email = personalEmail;
      if (currentAddress) payload.current_address = currentAddress;
      if (permanentAddress) payload.permanent_address = permanentAddress;
      if (city) payload.city = city;
      if (state) payload.state = state;
      if (pincode) payload.pincode = pincode;

      const res = await organizationAPI.inviteUser(payload);

      // The draft did its job.
      clearDraft(userId);
      skipSave.current = true;

      setInviteResult({ type: "success", message: `Invitation sent to ${name || email}!` });
      onInvited?.({
        ...(res?.data || {}),
        email,
        role,
        name: name || null,
        department_id: department || null,
        invited_at: new Date().toISOString(),
      });

      setTimeout(() => { setInviteResult({ type: "", message: "" }); onClose(); }, 1200);
    } catch (err) {
      setInviteResult({ type: "error", message: err?.data?.message || err.message || "Failed to send invitation." });
    } finally {
      setInviteLoading(false);
    }
  }

  /* The draft prompt and the "saving" hint sit above the form, inside the same
     panel, so they scroll with it rather than covering the first field. */
  const draftBanner = pendingDraft ? (
    <div className="mx-6 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
      <HiClock className="w-4 h-4 text-purple-600 shrink-0" />
      <p className="text-xs font-semibold text-purple-900 flex-1 min-w-[12rem]">
        You have an unfinished invitation saved {savedAgo(pendingDraft.savedAt)}
        {pendingDraft.values?.name || pendingDraft.values?.email
          ? ` for ${pendingDraft.values.name || pendingDraft.values.email}`
          : ""}.
      </p>
      <button type="button" onClick={restoreDraft} className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 transition">
        Continue it
      </button>
      <button type="button" onClick={discardDraft} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-white transition">
        <HiTrash className="w-3.5 h-3.5" /> Start fresh
      </button>
    </div>
  ) : draftNotice ? (
    <p className="mx-6 mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold text-slate-600">{draftNotice}</p>
  ) : touched ? (
    <p className="mx-6 mt-4 text-[11px] font-semibold text-slate-400">
      Saved as you type — you can close this and finish it later.
    </p>
  ) : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 sm:p-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-6xl w-full flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <HiUserGroup className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Invite Team Member</h3>
              </div>
              <button type="button" onClick={() => onClose()} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                <HiX className="w-5 h-5" />
              </button>
            </div>
    
            <form onSubmit={handleInvite} className="flex flex-col flex-1 min-h-0">
              {draftBanner}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
              
              {/* Section 1: Required Fields */}
              <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleSection("section1")}
                  className="w-full px-5 py-3.5 flex items-center justify-between bg-slate-50/80 hover:bg-slate-100/80 transition-colors cursor-pointer text-left"
                >
                  <h4 className="text-sm font-bold text-slate-800">1. Required Information</h4>
                  <HiChevronDown className={`w-5 h-5 text-slate-400 group-hover:text-purple-600 transition-transform duration-200 ${!collapsedSections.section1 ? "rotate-180" : ""}`} />
                </button>
                {!collapsedSections.section1 && (
                  <div className="p-5 border-t border-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Employee ID</label>
                        <input type="text" value={empId} onChange={(e) => setEmpId(e.target.value)} placeholder="e.g. EMP001 (Optional)" className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Full Name <span className="text-rose-400">*</span></label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Email Address <span className="text-rose-400">*</span></label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Role <span className="text-rose-400">*</span></label>
                        <select value={role} onChange={(e) => handleRoleChange(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="employee">Employee</option>
                          <option value="manager">Manager</option>
                          <option value="hr">HR Admin</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Gender <span className="text-rose-400">*</span></label>
                        <select value={gender} onChange={(e) => setGender(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="">---Select---</option>
                          {GENDER_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
    
              {/* Section 2: Profile Fields */}
              <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleSection("section2")}
                  className="w-full px-5 py-3.5 flex items-center justify-between bg-slate-50/80 hover:bg-slate-100/80 transition-colors cursor-pointer text-left"
                >
                  <h4 className="text-sm font-bold text-slate-800">2. Profile Details</h4>
                  <HiChevronDown className={`w-5 h-5 text-slate-400 group-hover:text-purple-600 transition-transform duration-200 ${!collapsedSections.section2 ? "rotate-180" : ""}`} />
                </button>
                {!collapsedSections.section2 && (
                  <div className="p-5 border-t border-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Primary Contact <span className="text-rose-400">*</span></label>
                        <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Personal Email</label>
                        <input type="email" value={personalEmail} onChange={(e) => setPersonalEmail(e.target.value)} placeholder="personal@example.com" className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Marital Status</label>
                        <select value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="">---Select---</option>
                          <option value="single">Single</option>
                          <option value="married">Married</option>
                          <option value="divorced">Divorced</option>
                          <option value="widowed">Widowed</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Blood Group</label>
                        <select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="">---Select---</option>
                          <option value="A+">A+</option>
                          <option value="A-">A-</option>
                          <option value="B+">B+</option>
                          <option value="B-">B-</option>
                          <option value="AB+">AB+</option>
                          <option value="AB-">AB-</option>
                          <option value="O+">O+</option>
                          <option value="O-">O-</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Date of Birth</label>
                        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Designation</label>
                        <input type="text" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Software Engineer" className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
    
              {/* Section 3: Organization / Work */}
              <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleSection("section3")}
                  className="w-full px-5 py-3.5 flex items-center justify-between bg-slate-50/80 hover:bg-slate-100/80 transition-colors cursor-pointer text-left"
                >
                  <h4 className="text-sm font-bold text-slate-800">3. Organization & Work</h4>
                  <HiChevronDown className={`w-5 h-5 text-slate-400 group-hover:text-purple-600 transition-transform duration-200 ${!collapsedSections.section3 ? "rotate-180" : ""}`} />
                </button>
                {!collapsedSections.section3 && (
                  <div className="p-5 border-t border-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Location</label>
                        <select value={workLocation} onChange={(e) => setWorkLocation(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="">---Select Location---</option>
                          {locations.map(loc => <option key={loc.id || loc._id} value={loc.id || loc._id}>{loc.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                          Department <span className="text-rose-400">*</span>
                          {departmentLoading && <span className="ml-2 text-[10px] text-purple-600 font-normal">Loading...</span>}
                        </label>
                        <select value={department} onChange={(e) => setDepartment(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="">---Select Department---</option>
                          {departments.map(dep => <option key={dep.id || dep._id} value={dep.id || dep._id}>{dep.name}</option>)}
                        </select>
                      </div>
    
                      {/* Make Head Of Dept. input (To the right of Department) */}
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Make Head Of Dept.</label>
                        <select
                          value={makeHod ? "true" : "false"}
                          onChange={(e) => setMakeHod(e.target.value === "true")}
                          disabled={!department || (role !== "manager" && role !== "hr")}
                          className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="false">No</option>
                          <option value="true">Yes (Assign as HOD)</option>
                        </select>
                      </div>
    
                      {/* Reporting Person (Shifted to next grid position) */}
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                          Reporting Person <span className="text-rose-400">*</span>
                        </label>
                        <PersonSelect
                          people={((role === "manager" || role === "hr")
                            ? (hrList.length > 0 ? hrList : roster.filter((e) => e.role === "hr"))
                            : managers
                          ).map((m) => ({ ...toPersonOption(m), sub: [String(m.role || "").toUpperCase(), toPersonOption(m).sub].filter(Boolean).join(" · ") }))}
                          value={reportingManager}
                          onChange={(id) => setReportingManager(id)}
                          placeholder="Select a reporting person"
                          emptyText="No one can be picked as reporting person yet."
                        />
                        {role === "employee" ? (
                          <p className="text-[11px] text-slate-500 mt-1">Defaults to Department HOD if available.</p>
                        ) : (
                          <p className="text-[11px] text-purple-600 font-medium mt-1">Managers and HR Admins must report to an HR Admin.</p>
                        )}
                      </div>
    
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Job Status <span className="text-rose-400">*</span></label>
                        <select value={jobStatus} onChange={(e) => setJobStatus(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="">---Select---</option>
                          <option value="probation">Probation</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="notice_period">Notice Period</option>
                          <option value="terminated">Terminated</option>
                          <option value="trainee">Trainee</option>
                          <option value="contract">Contract</option>
                          <option value="temporary">Temporary</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Employment Type <span className="text-rose-400">*</span></label>
                        <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="">---Select---</option>
                          <option value="full_time">Full Time</option>
                          <option value="part_time">Part Time</option>
                          <option value="contract">Contract</option>
                          <option value="intern">Intern</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Work Mode <span className="text-rose-400">*</span></label>
                        <select value={workMode} onChange={(e) => setWorkMode(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="">---Select---</option>
                          <option value="on-site">On-Site</option>
                          <option value="remote">Remote</option>
                          <option value="hybrid">Hybrid</option>
                          <option value="field">Field</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Joining Date</label>
                        <input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
    
              {/* Section 4: Compliance & Address */}
              <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleSection("section4")}
                  className="w-full px-5 py-3.5 flex items-center justify-between bg-slate-50/80 hover:bg-slate-100/80 transition-colors cursor-pointer text-left"
                >
                  <h4 className="text-sm font-bold text-slate-800">4. Compliance & Address</h4>
                  <HiChevronDown className={`w-5 h-5 text-slate-400 group-hover:text-purple-600 transition-transform duration-200 ${!collapsedSections.section4 ? "rotate-180" : ""}`} />
                </button>
                {!collapsedSections.section4 && (
                  <div className="p-5 border-t border-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">PAN Number</label>
                        <input type="text" value={panNumber} onChange={(e) => setPanNumber(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all uppercase" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">UAN Number</label>
                        <input type="text" value={uanNumber} onChange={(e) => setUanNumber(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Pincode</label>
                        <input type="text" value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} placeholder="6-digit pincode" className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div className="hidden lg:block lg:col-span-1"></div>
                      
                      <div className="col-span-full">
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Current Address</label>
                        <input type="text" value={currentAddress} onChange={(e) => {
                          setCurrentAddress(e.target.value);
                          if (isSameAddress) setPermanentAddress(e.target.value);
                        }} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div className="col-span-full">
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Permanent Address <span className="text-rose-400">*</span></label>
                          <label className="flex items-center gap-1.5 cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={isSameAddress}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                              onChange={(e) => {
                                setIsSameAddress(e.target.checked);
                                if (e.target.checked) setPermanentAddress(currentAddress);
                              }}
                            />
                            <span className="text-xs font-semibold text-slate-500 group-hover:text-slate-700 transition-colors">Same as Current</span>
                          </label>
                        </div>
                        <input type="text" value={permanentAddress} onChange={(e) => {
                          setPermanentAddress(e.target.value);
                          setIsSameAddress(false);
                        }} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">City</label>
                        <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">State</label>
                        <input type="text" value={state} onChange={(e) => setState(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div className="hidden lg:block lg:col-span-2"></div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Close the scrollable body div */}
              </div>
    
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0 bg-slate-50/50 rounded-b-2xl">
                {inviteResult.message && (
                  <div className={`mr-auto px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${inviteResult.type === "success" ? "bg-violet-50 text-violet-700 border border-violet-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
                    {inviteResult.type === "success" && <HiCheckCircle className="w-4 h-4 text-violet-500 flex-shrink-0" />}
                    {inviteResult.message}
                  </div>
                )}
                <button type="button" onClick={() => onClose()} className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer">Cancel</button>
                <button type="submit" disabled={inviteLoading} className="px-6 py-2.5 bg-[#6D28D9] hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-2 disabled:opacity-60 cursor-pointer">
                  {inviteLoading ? "Sending..." : <><HiPaperAirplane className="w-3.5 h-3.5" />Send Invitation</>}
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
