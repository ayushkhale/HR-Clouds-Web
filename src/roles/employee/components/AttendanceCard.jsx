import React, { useState, useEffect } from "react";
import { attendanceAPI } from "../../../shared/api";
import { HiSparkles } from "react-icons/hi";

function AttendanceCard({ currentState, fetchStatus, shiftData }) {
  const [activeTimer, setActiveTimer] = useState("00:00:00");

  useEffect(() => {
    let interval = null;
    
    const updateTimer = () => {
      if (!currentState || !currentState.clock_in_time) {
        setActiveTimer("00:00:00");
        return;
      }
      
      if (currentState.clock_out_time) {
        const hrs = Math.floor(currentState.effective_hours || 0);
        const mins = Math.floor(((currentState.effective_hours || 0) * 60) % 60);
        setActiveTimer(`${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`);
        return;
      }

      const clockInMs = new Date(currentState.clock_in_time).getTime();
      const closedBreaksMs = (currentState.break_duration_minutes || 0) * 60000;
      
      let currentMs = Date.now();
      if (currentState.active_break && currentState.active_break.start_time) {
        currentMs = new Date(currentState.active_break.start_time).getTime();
      }

      let elapsedMs = currentMs - clockInMs - closedBreaksMs;
      if (elapsedMs < 0) elapsedMs = 0;

      const h = Math.floor(elapsedMs / 3600000);
      const m = Math.floor((elapsedMs % 3600000) / 60000);
      const s = Math.floor((elapsedMs % 60000) / 1000);

      setActiveTimer(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };

    updateTimer();
    interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [currentState]);

  const handlePunch = async (actionPath) => {
    try {
      let location = {};
      if (navigator.geolocation) {
        try {
          const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          location = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        } catch (e) {
          // ignore geolocation errors for mock
        }
      }

      const payload = { source: "web", ...location };
      let res;
      if (actionPath === 'clock-in') res = await attendanceAPI.clockIn(payload);
      else if (actionPath === 'clock-out') res = await attendanceAPI.clockOut(payload);
      else if (actionPath === 'break/start') res = await attendanceAPI.breakStart();
      else if (actionPath === 'break/end') res = await attendanceAPI.breakEnd();

      if (res && res.success) {
        fetchStatus();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getStatusBadge = () => {
    if (!currentState || !currentState.clock_in_time) {
      return { class: "bg-rose-500 text-white", text: "Absent / Not Clocked In" };
    } else if (currentState.clock_in_time && !currentState.clock_out_time) {
      if (currentState.active_break) {
        return { class: "bg-amber-500 text-white", text: "On Break" };
      }
      return { class: "bg-emerald-500 text-white", text: "Working" };
    } else {
      return { class: "bg-indigo-500 text-white", text: "Completed" };
    }
  };

  const badge = getStatusBadge();

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xs border border-slate-100 flex flex-col h-full">
      <div className="flex justify-between items-start mb-6">
        <h3 className="text-lg font-bold text-slate-800">Today</h3>
        <span className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase ${badge.class}`}>
          {badge.text}
        </span>
      </div>

      <div className="flex-1 flex flex-col sm:flex-row items-center justify-between gap-6 mb-8">
        
        <div className="flex-1">
          {(!currentState || !currentState.clock_in_time) ? (
            <div className="space-y-1">
              <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <p className="text-sm font-medium text-slate-500 max-w-[150px]">
                You have not marked yourself as present today!
              </p>
            </div>
          ) : (
            <div className="space-y-1">
               <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <p className="text-sm font-medium text-slate-500">
                You are currently clocked in. Keep up the good work!
              </p>
            </div>
          )}
        </div>

        <div className="relative w-32 h-32 flex-shrink-0 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Background Ring */}
            <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="8" fill="none" className="text-slate-100" />
            {/* Progress Ring (Purple) */}
            <circle 
              cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="8" fill="none" 
              strokeDasharray="251.2" 
              strokeDashoffset={(!currentState || !currentState.clock_in_time) ? "251.2" : "62.8"} 
              className="text-purple-600 transition-all duration-1000 ease-in-out" 
              strokeLinecap="round" 
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-lg font-extrabold text-slate-800 tracking-tight tabular-nums">
              {activeTimer !== "00:00:00" ? activeTimer.split(":").slice(0, 2).join(":") : "--:--"}
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              HRS
            </span>
          </div>
        </div>

      </div>

      <div className="w-full space-y-3 mt-auto">
        {(!currentState || !currentState.clock_in_time) && (
          <button 
            className="w-full bg-purple-600 hover:bg-purple-700 text-white shadow-sm hover:shadow-md transition-all py-3.5 rounded-xl font-bold text-sm"
            onClick={() => handlePunch('clock-in')}
          >
            Clock In
          </button>
        )}
        
        {(currentState && currentState.clock_in_time && !currentState.clock_out_time) && (
          <div className="grid grid-cols-2 gap-3">
            {currentState.active_break ? (
              <button 
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all py-3.5 rounded-xl font-bold text-sm"
                onClick={() => handlePunch('break/end')}
              >
                End Break
              </button>
            ) : (
              <button 
                className="w-full bg-white border-2 border-indigo-100 hover:border-indigo-200 text-indigo-700 shadow-sm transition-all py-3.5 rounded-xl font-bold text-sm"
                onClick={() => handlePunch('break/start')}
              >
                Start Break
              </button>
            )}
            
            {!currentState.active_break && (
              <button 
                className="w-full bg-rose-500 hover:bg-rose-600 text-white shadow-sm transition-all py-3.5 rounded-xl font-bold text-sm"
                onClick={() => handlePunch('clock-out')}
              >
                Clock Out
              </button>
            )}
          </div>
        )}
      </div>
      
    </div>
  );
}

export default AttendanceCard;
