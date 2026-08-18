import React from "react";
import {
  HiUser, HiMail, HiPhone, HiLocationMarker,
  HiCalendar, HiBriefcase, HiUserGroup, HiOfficeBuilding
} from "react-icons/hi";

function InfoRow({ icon: Icon, label, value }) {
  const displayValue = value ? value : <span className="text-slate-400 italic text-[11px]">Not Available</span>;
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-slate-50 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-500 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{label}</p>
        <p className="text-xs font-bold text-slate-800 mt-0.5 truncate">{displayValue}</p>
      </div>
    </div>
  );
}

export default function ProfileTab({ employee }) {
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

  return (
    <div className="space-y-4">
      {/* Unified Single Card for Profile Info */}
      <div className="bg-white rounded-[20px] border border-slate-100 shadow-xs p-6 flex flex-col justify-between" style={{ minHeight: "440px" }}>
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-4">Profile Details</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 items-start">
            {/* Column 1: Personal Profile */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-bold text-purple-600 uppercase tracking-widest border-b border-purple-50 pb-1.5 mb-1.5">Personal Profile</h3>
              <InfoRow icon={HiCalendar} label="Date of Birth" value={formatDate(employee.date_of_birth || employee.dob)} />
              <InfoRow icon={HiUser} label="Gender" value={employee.gender} />
              <InfoRow icon={HiUserGroup} label="Marital Status" value={employee.marital_status} />
              <InfoRow icon={HiUser} label="Blood Group" value={employee.blood_group} />
              <InfoRow icon={HiUser} label="Father's Name" value={employee.father_name} />
              <InfoRow icon={HiUser} label="Spouse Name" value={employee.spouse_name} />
            </div>

            {/* Column 2: Work & Contact Profile */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-bold text-purple-600 uppercase tracking-widest border-b border-purple-50 pb-1.5 mb-1.5">Work & Contact Profile</h3>
              <InfoRow icon={HiCalendar} label="Date of Joining" value={formatDate(employee.date_of_joining || employee.joining_date)} />
              <InfoRow icon={HiBriefcase} label="Employment Type" value={employee.employment_type} />
              <InfoRow icon={HiBriefcase} label="Work Mode" value={employee.work_mode} />
              <InfoRow icon={HiOfficeBuilding} label="Work Office" value={employee.work_location || employee.location?.name} />
              <InfoRow icon={HiMail} label="Personal Email" value={employee.personal_email} />
              <InfoRow icon={HiPhone} label="Emergency Contact" value={employee.emergency_contact_name ? `${employee.emergency_contact_name} (${employee.emergency_contact_number || 'No Number'})` : null} />
            </div>
          </div>

          {/* Full-width Row: Address Details */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <InfoRow icon={HiLocationMarker} label="Address Details" value={getAddress(employee.current_address, employee.city, employee.state, employee.pincode)} />
          </div>
        </div>
      </div>
    </div>
  );
}
