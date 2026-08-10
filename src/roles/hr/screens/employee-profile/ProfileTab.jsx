import React from "react";
import {
  HiUser, HiMail, HiPhone, HiLocationMarker, HiIdentification,
  HiCalendar, HiBriefcase, HiUserGroup, HiShieldCheck, HiOfficeBuilding
} from "react-icons/hi";

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-500 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-slate-800 mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{title}</h3>
      {children}
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
    try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }); }
    catch { return d; }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-base font-bold text-slate-800">Profile Information</h2>

      <Section title="Personal Details">
        <InfoRow icon={HiUser} label="Full Name" value={employee.name || employee.full_name} />
        <InfoRow icon={HiMail} label="Email" value={employee.email} />
        <InfoRow icon={HiPhone} label="Phone Number" value={employee.contact || employee.phone_number} />
        <InfoRow icon={HiLocationMarker} label="City" value={employee.city} />
        <InfoRow icon={HiCalendar} label="Date of Birth" value={formatDate(employee.date_of_birth)} />
        <InfoRow icon={HiUser} label="Gender" value={employee.gender} />
        <InfoRow icon={HiIdentification} label="Aadhaar Number" value={employee.aadhaar_number} />
        <InfoRow icon={HiUser} label="Father's Name" value={employee.father_name} />
        <InfoRow icon={HiUser} label="Spouse Name" value={employee.spouse_name} />
      </Section>

      <Section title="Employment Details">
        <InfoRow icon={HiIdentification} label="Employee ID" value={employee.employee_code || employee.emp_id} />
        <InfoRow icon={HiBriefcase} label="Role" value={employee.role} />
        <InfoRow icon={HiBriefcase} label="Designation" value={employee.designation} />
        <InfoRow icon={HiOfficeBuilding} label="Department" value={employee.department} />
        <InfoRow icon={HiOfficeBuilding} label="Work Location" value={employee.work_location} />
        <InfoRow icon={HiCalendar} label="Date of Joining" value={formatDate(employee.date_of_joining)} />
        <InfoRow icon={HiShieldCheck} label="Employment Status" value={employee.status} />
        <InfoRow icon={HiCalendar} label="Probation Period" value={employee.probation_period_days ? `${employee.probation_period_days} days` : null} />
        <InfoRow icon={HiUserGroup} label="Reporting Manager" value={employee.reporting_person_name || employee.reporting_person || employee.reporting_manager_name || employee.reporting_manager} />
        <InfoRow icon={HiUser} label="Referred By" value={employee.referred_by} />
      </Section>

      {(employee.emergency_contact_name || employee.emergency_contact_number) && (
        <Section title="Emergency Contact">
          <InfoRow icon={HiUser} label="Name" value={employee.emergency_contact_name} />
          <InfoRow icon={HiPhone} label="Number" value={employee.emergency_contact_number} />
        </Section>
      )}
    </div>
  );
}
