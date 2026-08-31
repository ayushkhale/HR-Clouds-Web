import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { organizationAPI, tokenHelper } from "../api";
import DashboardSidebar from "../components/DashboardSidebar";
import DashboardTopBar from "../components/DashboardTopBar";

import {
  HiUser,
  HiPencil,
  HiCheck,
  HiX,
  HiMail,
  HiPhone,
  HiOfficeBuilding,
  HiLocationMarker,
  HiCalendar,
  HiIdentification,
  HiBriefcase,
  HiShieldCheck,
  HiLogout,
} from "react-icons/hi";

/* ────────────────────────────────────────────────────────────────────────────
   FIELD DEFINITIONS
   Fields the user can see vs edit.
   `locked: true` means the field is displayed but NOT editable by the user.
   ──────────────────────────────────────────────────────────────────────────── */
const PERSONAL_FIELDS = [
  { key: "name",           label: "Full Name",       icon: HiUser,           type: "text" },
  { key: "email",          label: "Email",           icon: HiMail,           type: "email", locked: true },
  { key: "contact",        label: "Phone",           icon: HiPhone,          type: "tel" },
  { key: "date_of_birth",  label: "Date of Birth",   icon: HiCalendar,       type: "date" },
  { key: "blood_group",    label: "Blood Group",     icon: HiShieldCheck,    type: "text" },
  { key: "personal_email", label: "Personal Email",  icon: HiMail,           type: "email" },
];

const ORG_FIELDS = [
  { key: "designation",    label: "Designation",     icon: HiBriefcase,      type: "text", locked: true },
  { key: "department",     label: "Department",      icon: HiOfficeBuilding, type: "text", locked: true },
  { key: "employee_code",  label: "Employee Code",   icon: HiIdentification, type: "text", locked: true },
  { key: "work_location",  label: "Work Location",   icon: HiLocationMarker, type: "text", locked: true },
  { key: "gender",         label: "Gender",          icon: HiUser,           type: "text", locked: true },
  { key: "marital_status", label: "Marital Status",  icon: HiUser,           type: "text", locked: true },
];

const ADDRESS_FIELDS = [
  { key: "current_address",   label: "Current Address",   icon: HiLocationMarker, type: "textarea" },
  { key: "permanent_address", label: "Permanent Address",  icon: HiLocationMarker, type: "textarea" },
  { key: "city",              label: "City",              icon: HiLocationMarker, type: "text" },
  { key: "state",             label: "State",             icon: HiLocationMarker, type: "text" },
  { key: "pincode",           label: "Pincode",           icon: HiLocationMarker, type: "text" },
];

/* ──────────────────────────────────────────────────────────────────────────── */

function MyProfilePage() {
  const { role: authRole, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Determine current role from route
  let currentRole = "employee";
  if (location.pathname.includes("/dashboard/hr") || authRole === "hr") currentRole = "hr";
  else if (location.pathname.includes("/dashboard/manager") || authRole === "manager") currentRole = "manager";

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [isSameAddress, setIsSameAddress] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  // Debounced pincode fetch for City and State
  useEffect(() => {
    if (isEditing && editData.pincode && editData.pincode.length === 6) {
      const timer = setTimeout(async () => {
        try {
          const res = await fetch(`https://api.postalpincode.in/pincode/${editData.pincode}`);
          const data = await res.json();
          if (data && data[0] && data[0].Status === "Success") {
            const postOffice = data[0].PostOffice[0];
            setEditData((prev) => ({
              ...prev,
              city: postOffice.District,
              state: postOffice.State
            }));
          }
        } catch (error) {
          console.error("Failed to fetch pincode details:", error);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [editData.pincode, isEditing]);

  async function fetchProfile() {
    try {
      setLoading(true);
      setError(null);
      const res = await organizationAPI.getMyProfile();
      const data = res?.data || res;
      setProfile(data);
      setEditData(data);
    } catch (err) {
      console.error("Failed to fetch profile:", err);
      setError(err?.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  function startEditing() {
    setEditData({ ...profile });
    setIsSameAddress(false);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setEditData({});
    setIsSameAddress(false);
  }

  function handleSameAddressToggle(e) {
    const checked = e.target.checked;
    setIsSameAddress(checked);
    if (checked) {
      setEditData((prev) => ({
        ...prev,
        permanent_address: prev.current_address || ""
      }));
    }
  }

  function handleChange(key, value) {
    if (key === 'pincode') {
      value = value.replace(/\D/g, '').slice(0, 6);
    }
    setEditData((prev) => {
      const updated = { ...prev, [key]: value };
      if (key === "current_address" && isSameAddress) {
        updated.permanent_address = value;
      }
      if (key === "permanent_address" && isSameAddress) {
        setIsSameAddress(false);
      }
      return updated;
    });
  }

  async function handleSave() {
    try {
      setSaving(true);
      // Build payload with only editable (non-locked) fields that changed
      const allFields = [...PERSONAL_FIELDS, ...ORG_FIELDS, ...ADDRESS_FIELDS];
      const editableKeys = allFields.filter((f) => !f.locked).map((f) => f.key);
      const payload = {};
      for (const key of editableKeys) {
        if (editData[key] !== profile[key]) {
          payload[key] = editData[key];
        }
      }
      if (Object.keys(payload).length === 0) {
        setIsEditing(false);
        return;
      }
      const res = await organizationAPI.updateMyProfile(payload);
      const updated = res?.data || res;
      setProfile((prev) => ({ ...prev, ...updated, ...payload }));
      setIsEditing(false);
      alert("Profile updated successfully!");
    } catch (err) {
      console.error("Failed to update profile:", err);
      alert(err?.message || "Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    tokenHelper.clear();
    logout();
    navigate("/");
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function renderFieldValue(field) {
    const value = isEditing ? editData[field.key] : profile?.[field.key];
    const isLocked = field.locked;
    const isEditMode = isEditing && !isLocked;

    if (isEditMode) {
      if (field.key === "blood_group") {
        return (
          <select
            value={value || ""}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-colors"
          >
            <option value="">Select Blood Group</option>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
              <option key={bg} value={bg}>{bg}</option>
            ))}
          </select>
        );
      }
      
      if (field.type === "textarea") {
        return (
          <textarea
            value={value || ""}
            onChange={(e) => handleChange(field.key, e.target.value)}
            rows={3}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 resize-none transition-colors"
          />
        );
      }
      return (
        <input
          type={field.type}
          value={value || ""}
          onChange={(e) => handleChange(field.key, e.target.value)}
          placeholder={field.key === "pincode" ? "6-digit pincode" : ""}
          maxLength={field.key === "pincode" ? 6 : undefined}
          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-colors"
        />
      );
    }

    return (
      <p className="text-[15px] font-medium text-slate-800 truncate">
        {value || <span className="text-slate-400/80 italic font-normal">Not set</span>}
      </p>
    );
  }

  function renderFieldGroup(title, fields) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
        <h3 className="text-base font-bold text-slate-800 mb-6">{title}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-7 gap-x-8">
          {fields.map((field) => {
            const Icon = field.icon;
            const isTextarea = field.type === "textarea";
            return (
              <div key={field.key} className={`space-y-2 ${isTextarea ? 'col-span-full' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-slate-400" />
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                      {field.label}
                    </label>
                  </div>
                  {isEditing && field.key === "permanent_address" && (
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={isSameAddress}
                        onChange={handleSameAddressToggle}
                        className="w-3.5 h-3.5 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                      />
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Same as Current</span>
                    </label>
                  )}
                </div>
                {renderFieldValue(field)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div id="my-profile-page" className="min-h-screen bg-slate-50 flex font-sans text-slate-800">
      <DashboardSidebar role={currentRole} />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="My Profile" />

        <main className="p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          
          {/* Loading State */}
          {loading && (
            <div className="py-20 flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
              <p className="text-sm text-slate-500 mt-4 font-medium">Loading profile...</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center max-w-xl mx-auto mt-10">
              <p className="text-sm font-semibold text-rose-700">{error}</p>
              <button
                onClick={fetchProfile}
                className="mt-3 text-xs font-bold text-rose-600 hover:text-rose-700 underline underline-offset-2"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Profile Content */}
          {!loading && !error && profile && (
            <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6 items-start">
              
              {/* ── LEFT: Employee Card ── */}
              <div className="xl:sticky xl:top-24 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-6 sm:p-8 flex flex-col items-center text-center">
                  <div className="mb-4">
                    <div className="w-24 h-24 rounded-full border-4 border-white shadow-md overflow-hidden bg-purple-50 shrink-0 flex items-center justify-center text-purple-700 font-bold text-3xl uppercase">
                      {(profile.name || profile.email || "U").charAt(0)}
                    </div>
                  </div>
                  <div className="w-full">
                    <h2 className="text-xl font-bold text-slate-900 truncate w-full max-w-[260px] mx-auto">
                      {profile.name || profile.email?.split("@")[0] || "User"}
                    </h2>
                    <p className="text-sm font-medium text-slate-500 mt-1">
                      #{profile.employee_code || "EMP000"}
                    </p>
                    {profile.role && (
                      <div className="mt-4 flex justify-center">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-100 capitalize">
                          <HiShieldCheck className="w-3.5 h-3.5" />
                          {profile.role}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-6 pb-8 space-y-6 flex-1 overflow-y-auto no-scrollbar">
                  {/* Organization */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 mb-3 px-2">Organization</h3>
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center text-sm px-2">
                        <span className="text-slate-500">Department</span>
                        <span className="font-medium text-slate-900 truncate max-w-[140px]" title={profile.department ? (typeof profile.department === "object" ? profile.department.name : profile.department) : "—"}>
                          {profile.department ? (typeof profile.department === "object" ? profile.department.name : profile.department) : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm px-2">
                        <span className="text-slate-500">Designation</span>
                        <span className="font-medium text-slate-900 text-right truncate max-w-[140px]" title={profile.designation || "—"}>
                          {profile.designation || "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100" />

                  {/* Contact */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 mb-3 px-2">Contact</h3>
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center text-sm px-2">
                        <span className="text-slate-500">Phone</span>
                        <span className="font-medium text-slate-900 truncate max-w-[150px]">{profile.contact || profile.phone_number || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm px-2">
                        <span className="text-slate-500">Email</span>
                        <span className="font-medium text-slate-900 text-right truncate max-w-[150px]" title={profile.email}>{profile.email || "—"}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border-t border-slate-100 pt-6">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-rose-600 hover:border-rose-300 transition-all shadow-sm"
                    >
                      <HiLogout className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                </div>
              </div>

              {/* ── RIGHT: Detailed Information ── */}
              <div className="min-w-0 flex flex-col gap-6">
                
                {/* Actions Header */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Profile Details</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Manage your personal and organizational information.</p>
                  </div>
                  <div className="shrink-0">
                    {isEditing ? (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          onClick={cancelEditing}
                          disabled={saving}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                        >
                          <HiX className="w-3.5 h-3.5" /> Cancel
                        </button>
                        <button
                          onClick={handleSave}
                          disabled={saving}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-[#111827] text-white hover:bg-[#374151] transition-all shadow-sm disabled:opacity-50"
                        >
                          <HiCheck className="w-3.5 h-3.5" />
                          {saving ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={startEditing}
                        className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                      >
                        <HiPencil className="w-3.5 h-3.5" /> Edit Details
                      </button>
                    )}
                  </div>
                </div>

                {/* Information Sections */}
                <div className="flex flex-col gap-6">
                  {renderFieldGroup("Personal Information", PERSONAL_FIELDS)}
                  {renderFieldGroup("Organization Details", ORG_FIELDS)}
                  {renderFieldGroup("Address", ADDRESS_FIELDS)}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default MyProfilePage;
