import React, { useState, useEffect } from "react";
import DashboardTopBar from "../components/DashboardTopBar";
import { organizationAPI } from "../api";
import { 
  HiOutlineSearch, 
  HiOutlineMail, 
  HiOutlineLocationMarker, 
  HiOutlineBriefcase, 
  HiOutlineOfficeBuilding,
  HiUsers
} from "react-icons/hi";

export default function DirectoryPage() {

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDirectory();
  }, []);

  async function fetchDirectory() {
    try {
      setLoading(true);
      const res = await organizationAPI.getDirectory();
      setEmployees(res.data || []);
    } catch (err) {
      setError(err.message || "Failed to load directory.");
    } finally {
      setLoading(false);
    }
  }

  const filteredEmployees = employees.filter(emp => 
    emp.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.designation?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.department?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
        <DashboardTopBar title="Organization Directory" />

        <main className="p-6 sm:p-8 max-w-7xl w-full mx-auto flex-1 space-y-6 lg:space-y-8">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <HiUsers className="text-purple-600" />
                Team Directory
              </h1>
              <p className="text-sm text-slate-500 mt-1">Get to know your colleagues across the organization.</p>
            </div>
            <div className="relative w-full sm:w-80">
              <HiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by name, role, department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all shadow-sm"
              />
            </div>
          </div>

          {/* Error State */}
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm border border-red-100">
              {error}
            </div>
          )}

          {/* Directory Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl h-64 border border-slate-100 animate-pulse"></div>
              ))}
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-sm">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <HiUsers className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">No members found</h3>
              <p className="text-slate-500 text-sm mt-1">We couldn't find anyone matching your search criteria.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredEmployees.map((emp) => (
                <div key={emp.id || emp._id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
                  <div className="h-20 bg-gradient-to-r from-purple-500 to-indigo-600 relative">
                    <div className="absolute -bottom-10 inset-x-0 flex justify-center">
                      {emp.avatar_url ? (
                        <img 
                          src={emp.avatar_url} 
                          alt={emp.name} 
                          className="w-20 h-20 rounded-full border-4 border-white object-cover bg-white"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-full border-4 border-white bg-slate-100 flex items-center justify-center text-xl font-bold text-slate-400 uppercase">
                          {emp.name?.charAt(0) || '?'}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="pt-14 pb-6 px-6 text-center">
                    <h3 className="font-bold text-slate-900 text-lg">{emp.name || 'Unknown'}</h3>
                    <p className="text-purple-600 text-sm font-semibold mt-0.5">{emp.designation || 'Team Member'}</p>
                    
                    <div className="mt-5 space-y-2.5 text-left bg-slate-50 rounded-xl p-4">
                      {emp.department && (
                        <div className="flex items-center gap-2.5 text-xs text-slate-600">
                          <HiOutlineOfficeBuilding className="text-slate-400 w-4 h-4 shrink-0" />
                          <span className="truncate" title={emp.department}>{emp.department}</span>
                        </div>
                      )}
                      
                      {emp.role && (
                        <div className="flex items-center gap-2.5 text-xs text-slate-600">
                          <HiOutlineBriefcase className="text-slate-400 w-4 h-4 shrink-0" />
                          <span className="capitalize">{emp.role}</span>
                        </div>
                      )}

                      {emp.work_location && (
                        <div className="flex items-center gap-2.5 text-xs text-slate-600">
                          <HiOutlineLocationMarker className="text-slate-400 w-4 h-4 shrink-0" />
                          <span className="truncate">{emp.work_location}</span>
                        </div>
                      )}

                      {emp.email && (
                        <div className="flex items-center gap-2.5 text-xs text-slate-600">
                          <HiOutlineMail className="text-slate-400 w-4 h-4 shrink-0" />
                          <a href={`mailto:${emp.email}`} className="truncate hover:text-purple-600 hover:underline">
                            {emp.email}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
    </>
  );
}
