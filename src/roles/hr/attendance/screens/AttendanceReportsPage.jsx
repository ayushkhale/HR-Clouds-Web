import React, { useState, useEffect } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { attendanceAPI, organizationAPI } from "../../../../shared/api";
import { HiSparkles, HiDownload, HiCalendar, HiUserGroup, HiUser, HiSearch, HiCheckCircle } from "react-icons/hi";

const TABS = [
  { key: "daily", label: "Daily Report", icon: HiCalendar },
  { key: "monthly", label: "Monthly Report", icon: HiUserGroup },
  { key: "employee", label: "Employee Report", icon: HiUser },
];

function AttendanceReportsPage() {
  const [activeTab, setActiveTab] = useState("daily");

  // Daily state
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split("T")[0]);
  const [dailyData, setDailyData] = useState([]);

  // Monthly state
  const [monthlyMonth, setMonthlyMonth] = useState(new Date().toISOString().slice(0, 7));
  const [monthlyData, setMonthlyData] = useState(null);

  // Employee state
  const [employees, setEmployees] = useState([]);
  const [empSearch, setEmpSearch] = useState("");
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [empStartDate, setEmpStartDate] = useState(new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]);
  const [empEndDate, setEmpEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [empData, setEmpData] = useState(null);

  useEffect(() => {
    // Fetch employee list for the dropdown
    const fetchEmps = async () => {
      try {
        const res = await organizationAPI.getEmployees({ purpose: "emp_report" });
        if (res.success) setEmployees(res.data || []);
      } catch (err) { console.error(err); }
    };
    fetchEmps();
  }, []);

  // ── Daily Report ───────────────────────────────────────────────
  const fetchDaily = async () => {
    try {
      const res = await attendanceAPI.getDailyReport({ date: dailyDate });
      if (res.success) setDailyData(res.data || []);
    } catch (err) { console.error(err); setDailyData([]); }
  };

  // ── Monthly Report ─────────────────────────────────────────────
  const fetchMonthly = async () => {
    try {
      const res = await attendanceAPI.getMonthlyReport({ month: monthlyMonth });
      if (res.success) setMonthlyData(res.data || null);
    } catch (err) { console.error(err); setMonthlyData(null); }
  };

  // ── Employee Report ────────────────────────────────────────────
  const fetchEmployee = async () => {
    if (!selectedEmpId) return;
    try {
      const res = await attendanceAPI.getEmployeeReport(selectedEmpId, { start_date: empStartDate, end_date: empEndDate });
      if (res.success) setEmpData(res.data || null);
    } catch (err) { console.error(err); setEmpData(null); }
  };

  // ── CSV Export ─────────────────────────────────────────────────
  const exportCSV = (headers, rows, filename) => {
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDaily = () => {
    const headers = ["Employee", "Status", "Clock In", "Clock Out", "Late (min)", "Early Leave (min)", "Overtime (min)", "Anomaly"];
    const rows = dailyData.map(d => {
      let empName = "Unknown";
      if (d.user?.profile) empName = `${d.user.profile.first_name || ""} ${d.user.profile.last_name || ""}`.trim();
      else if (d.user?.identifier) empName = d.user.identifier;
      
      return [
        empName,
        d.status || "",
        d.clock_in_time || "",
        d.clock_out_time || "",
        d.late_minutes || 0,
        d.early_leave_minutes || 0,
        d.overtime_minutes || 0,
        d.is_anomaly ? "Yes" : "No",
      ];
    });
    exportCSV(headers, rows, `daily_report_${dailyDate}.csv`);
  };

  const exportMonthly = () => {
    if (!monthlyData) return;
    const headers = ["Employee", "Present", "Absent", "Late", "Overtime (min)"];
    const rows = monthlyData.map(e => [
      e.name?.trim() || e.identifier || "Unknown",
      e.total_present || 0,
      e.total_absent || 0,
      e.total_late_days || 0,
      e.total_overtime_minutes || 0,
    ]);
    exportCSV(headers, rows, `monthly_report_${monthlyMonth}.csv`);
  };

  const exportEmployee = () => {
    if (!empData?.records) return;
    const headers = ["Date", "Status", "Clock In", "Clock Out", "Late (min)", "Overtime (min)", "Anomaly"];
    const rows = empData.records.map(r => [
      r.date, r.status || "", r.clock_in_time || "", r.clock_out_time || "",
      r.late_minutes || 0, r.overtime_minutes || 0, r.is_anomaly ? "Yes" : "No",
    ]);
    exportCSV(headers, rows, `employee_report_${selectedEmpId}.csv`);
  };

  const getStatusBadge = (status) => {
    if (!status) return "bg-slate-100 text-slate-500";
    const s = status.toLowerCase();
    if (s === "present") return "bg-indigo-100 text-indigo-700";
    if (s === "absent") return "bg-slate-200 text-slate-600";
    if (s === "in_progress") return "bg-purple-100 text-purple-700";
    if (s.includes("half")) return "bg-purple-50 text-purple-600";
    return "bg-slate-100 text-slate-500";
  };

  const formatTime = (iso) => {
    if (!iso) return "--";
    return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  const filteredEmployees = employees.filter(e => {
    const nameStr = (e.name || "").toLowerCase();
    const codeStr = (e.employee_code || "").toLowerCase();
    const query = empSearch.toLowerCase();
    return nameStr.includes(query) || codeStr.includes(query);
  });

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Attendance Reports" />
        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* Hero */}
          <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-xs">
            <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
            <div className="relative z-10 max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white text-[11px] font-semibold tracking-wide border border-white/20 backdrop-blur-xs">
                <HiSparkles className="w-3.5 h-3.5 text-purple-200" /> ANALYTICS
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Attendance Reports</h1>
              <p className="text-xs sm:text-sm text-purple-100/90 font-normal">Generate daily, monthly, or employee-level attendance reports for payroll and compliance.</p>
            </div>
          </div>

          {/* Tab Bar */}
          <div className="flex gap-2 bg-white rounded-xl p-1.5 shadow-sm border border-slate-100 w-fit">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === tab.key ? "bg-purple-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}>
                  <Icon className="w-4 h-4" /> {tab.label}
                </button>
              );
            })}
          </div>

          {/* ────── DAILY TAB ────── */}
          {activeTab === "daily" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <div className="flex flex-col sm:flex-row items-end gap-4 mb-2">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
                    <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
                  </div>
                  <button onClick={fetchDaily} className="w-full sm:w-auto px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm rounded-lg transition-colors">
                    Generate
                  </button>
                  {dailyData.length > 0 && (
                    <button onClick={exportDaily} className="w-full sm:w-auto px-5 py-2 border border-slate-200 text-slate-600 font-bold text-sm rounded-lg flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors">
                      <HiDownload className="w-4 h-4" /> Export CSV
                    </button>
                  )}
                </div>
              </div>

              {dailyData.length > 0 && (
                <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100">
                  <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/50">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-xs">
                        <tr>
                          <th className="px-6 py-4">Employee</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4">Clock In</th>
                          <th className="px-6 py-4">Clock Out</th>
                          <th className="px-6 py-4">Late</th>
                          <th className="px-6 py-4">Overtime</th>
                          <th className="px-6 py-4">Anomaly</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {dailyData.map((d, i) => {
                          let empName = "Unknown";
                          if (d.user?.profile) empName = `${d.user.profile.first_name || ""} ${d.user.profile.last_name || ""}`.trim();
                          else if (d.user?.identifier) empName = d.user.identifier;

                          return (
                          <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-6 py-4 font-semibold text-primary-800">{empName}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide border border-black/5 ${getStatusBadge(d.status)}`}>
                                {d.status ? d.status.replace("_", " ") : "N/A"}
                              </span>
                            </td>
                            <td className="px-6 py-4">{formatTime(d.clock_in_time)}</td>
                            <td className="px-6 py-4">{formatTime(d.clock_out_time)}</td>
                            <td className="px-6 py-4">{d.late_minutes > 0 ? <span className="text-purple-600 font-bold">{d.late_minutes}m</span> : "--"}</td>
                            <td className="px-6 py-4">{d.overtime_minutes > 0 ? <span className="text-indigo-600 font-bold">+{d.overtime_minutes}m</span> : "--"}</td>
                            <td className="px-6 py-4">{d.is_anomaly ? <span className="text-purple-600 font-bold">⚠️ Yes</span> : <span className="text-slate-400">No</span>}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ────── MONTHLY TAB ────── */}
          {activeTab === "monthly" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <div className="flex flex-col sm:flex-row items-end gap-4 mb-2">
                  <div className="flex-1 w-full flex gap-3">
                    <div className="w-1/2">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Month</label>
                      <select value={monthlyMonth.split("-")[1]} onChange={e => setMonthlyMonth(`${monthlyMonth.split("-")[0]}-${e.target.value}`)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white">
                        <option value="01">January</option>
                        <option value="02">February</option>
                        <option value="03">March</option>
                        <option value="04">April</option>
                        <option value="05">May</option>
                        <option value="06">June</option>
                        <option value="07">July</option>
                        <option value="08">August</option>
                        <option value="09">September</option>
                        <option value="10">October</option>
                        <option value="11">November</option>
                        <option value="12">December</option>
                      </select>
                    </div>
                    <div className="w-1/2">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Year</label>
                      <select value={monthlyMonth.split("-")[0]} onChange={e => setMonthlyMonth(`${e.target.value}-${monthlyMonth.split("-")[1]}`)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white">
                        <option value="2025">2025</option>
                        <option value="2026">2026</option>
                        <option value="2027">2027</option>
                        <option value="2028">2028</option>
                        <option value="2029">2029</option>
                        <option value="2030">2030</option>
                      </select>
                    </div>
                  </div>
                  <button onClick={fetchMonthly} className="w-full sm:w-auto px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm rounded-lg transition-colors">
                    Generate
                  </button>
                  {monthlyData?.length > 0 && (
                    <button onClick={exportMonthly} className="w-full sm:w-auto px-5 py-2 border border-slate-200 text-slate-600 font-bold text-sm rounded-lg flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors">
                      <HiDownload className="w-4 h-4" /> Export CSV
                    </button>
                  )}
                </div>
              </div>

              {monthlyData?.length > 0 && (
                <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-center">
                      <div className="text-2xl font-extrabold text-slate-800">{monthlyData.length}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Employees</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-center">
                      <div className="text-2xl font-extrabold text-indigo-600">
                        {Math.round(monthlyData.reduce((a, e) => a + (e.total_present || 0), 0) / monthlyData.length)}d
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Avg Present</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-center">
                      <div className="text-2xl font-extrabold text-purple-600">
                        {monthlyData.reduce((a, e) => a + (e.total_late_days || 0), 0)}
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Total Late</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-center">
                      <div className="text-2xl font-extrabold text-purple-700">
                        {Math.round(monthlyData.reduce((a, e) => a + (e.total_overtime_minutes || 0), 0) / 60)}h
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Total OT</div>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/50">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-xs">
                        <tr>
                          <th className="px-6 py-4">Employee</th>
                          <th className="px-6 py-4">Present</th>
                          <th className="px-6 py-4">Absent</th>
                          <th className="px-6 py-4">Late</th>
                          <th className="px-6 py-4">Overtime</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {monthlyData.map((emp, i) => (
                          <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-6 py-4 font-semibold text-primary-800">{emp.name?.trim() || emp.identifier || "Unknown"}</td>
                            <td className="px-6 py-4 font-bold text-indigo-600">{emp.total_present || 0}d</td>
                            <td className="px-6 py-4 font-bold text-slate-500">{emp.total_absent || 0}d</td>
                            <td className="px-6 py-4">{emp.total_late_days > 0 ? <span className="text-purple-600 font-bold">{emp.total_late_days}</span> : "--"}</td>
                            <td className="px-6 py-4">{emp.total_overtime_minutes > 0 ? <span className="text-indigo-600 font-bold">+{emp.total_overtime_minutes}m</span> : "--"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ────── EMPLOYEE TAB ────── */}
          {activeTab === "employee" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Employee</label>
                    <div className="relative mb-2">
                      <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="text" value={empSearch} onChange={(e) => setEmpSearch(e.target.value)}
                        placeholder="Search employee…"
                        className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
                    </div>
                    <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-50 bg-white">
                      {filteredEmployees.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-slate-400">
                          {employees.length === 0 ? "No employees found." : "No results."}
                        </p>
                      ) : (
                        filteredEmployees.map((e) => {
                          const id = e.id || e.user_id;
                          const name = e.name || "Unknown";
                          const email = e.employee_code ? `Code: ${e.employee_code}` : (e.role ? e.role.toUpperCase() : "");
                          const isSelected = selectedEmpId === id;
                          return (
                            <button key={id} type="button" onClick={() => setSelectedEmpId(id)}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${isSelected ? "bg-purple-50" : "hover:bg-slate-50"}`}>
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isSelected ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                                {name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className={`text-xs font-semibold truncate ${isSelected ? "text-purple-700" : "text-slate-800"}`}>{name}</p>
                                {email && <p className="text-[10px] text-slate-400 truncate">{email}</p>}
                              </div>
                              {isSelected && <HiCheckCircle className="w-4 h-4 text-purple-500 ml-auto flex-shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Start</label>
                    <input type="date" value={empStartDate} onChange={e => setEmpStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">End</label>
                      <input type="date" value={empEndDate} onChange={e => setEmpEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
                    </div>
                    <button onClick={fetchEmployee} disabled={!selectedEmpId}
                      className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-sm rounded-lg transition-colors">
                      Generate
                    </button>
                  </div>
                </div>
              </div>

              {empData && (
                <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100">
                  {/* Summary Cards */}
                  {empData.summary && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-center">
                        <div className="text-2xl font-extrabold text-indigo-600">{empData.summary.total_present || 0}d</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Present</div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-center">
                        <div className="text-2xl font-extrabold text-slate-500">{empData.summary.total_absent || 0}d</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Absent</div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-center">
                        <div className="text-2xl font-extrabold text-purple-600">{empData.summary.total_late || 0}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Late</div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-center">
                        <div className="text-2xl font-extrabold text-purple-700">{Math.round((empData.summary.total_overtime_minutes || 0) / 60)}h</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Overtime</div>
                      </div>
                    </div>
                  )}

                  {/* Color Status Strip */}
                  {empData.records && empData.records.length > 0 && (
                    <div className="mb-6">
                      <label className="block text-xs font-semibold text-slate-500 mb-2">Attendance Heatmap</label>
                      <div className="flex gap-0.5 flex-wrap">
                        {empData.records.map((r, i) => {
                          let color = "bg-slate-200";
                          if (r.status === "present") color = "bg-indigo-400";
                          else if (r.status === "absent") color = "bg-slate-300";
                          else if (r.status === "in_progress") color = "bg-purple-400";
                          return (
                            <div key={i} className={`w-5 h-5 rounded-sm ${color} cursor-pointer`} title={`${r.date}: ${r.status || "N/A"}`} />
                          );
                        })}
                      </div>
                      <div className="flex gap-4 mt-2 text-[10px] text-slate-400 font-semibold">
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-indigo-400 inline-block" /> Present</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-purple-400 inline-block" /> In Progress</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-300 inline-block" /> Absent</span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-800">Day-by-Day Records</h3>
                    {empData.records?.length > 0 && (
                      <button onClick={exportEmployee} className="px-4 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-colors">
                        <HiDownload className="w-4 h-4" /> Export CSV
                      </button>
                    )}
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/50">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-xs">
                        <tr>
                          <th className="px-6 py-4">Date</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4">Clock In</th>
                          <th className="px-6 py-4">Clock Out</th>
                          <th className="px-6 py-4">Late</th>
                          <th className="px-6 py-4">Overtime</th>
                          <th className="px-6 py-4">Anomaly</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {empData.records?.length === 0 ? (
                          <tr><td colSpan="7" className="px-6 py-12 text-center text-slate-400">No records for this period.</td></tr>
                        ) : empData.records?.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-6 py-4 font-medium">{r.date}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide border border-black/5 ${getStatusBadge(r.status)}`}>
                                {r.status ? r.status.replace("_", " ") : "N/A"}
                              </span>
                            </td>
                            <td className="px-6 py-4">{formatTime(r.clock_in_time)}</td>
                            <td className="px-6 py-4">{formatTime(r.clock_out_time)}</td>
                            <td className="px-6 py-4">{r.late_minutes > 0 ? <span className="text-purple-600 font-bold">{r.late_minutes}m</span> : "--"}</td>
                            <td className="px-6 py-4">{r.overtime_minutes > 0 ? <span className="text-indigo-600 font-bold">+{r.overtime_minutes}m</span> : "--"}</td>
                            <td className="px-6 py-4">{r.is_anomaly ? <span className="text-purple-600 font-bold">⚠️</span> : <span className="text-slate-400">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default AttendanceReportsPage;
