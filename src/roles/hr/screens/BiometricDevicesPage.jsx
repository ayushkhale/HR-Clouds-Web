import React, { useState, useEffect } from "react";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../shared/api";
import { useAuth } from "../../../shared/contexts/AuthContext";
import {
  HiDeviceMobile,
  HiPlus,
  HiX,
  HiOutlineLink,
  HiOutlineTrash,
  HiStatusOnline,
  HiStatusOffline
} from "react-icons/hi";

function BiometricDevicesPage() {
  const { user } = useAuth();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null); // For editing or mappings
  const [showMappingsModal, setShowMappingsModal] = useState(false);

  // Device Form State
  const [deviceName, setDeviceName] = useState("");
  const [deviceIp, setDeviceIp] = useState("");
  const [deviceLocation, setDeviceLocation] = useState("");

  // Mappings State
  const [mappings, setMappings] = useState([]);
  const [mappingsLoading, setMappingsLoading] = useState(false);
  const [newMappingEmpId, setNewMappingEmpId] = useState("");
  const [newMappingBioId, setNewMappingBioId] = useState("");

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const res = await attendanceAPI.getDevices();
      if (res.success) {
        const data = res.data?.data || res.data?.devices || res.data || [];
        setDevices(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
      window.alert("Failed to load devices");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDevice = async (e) => {
    e.preventDefault();
    const payload = {
      name: deviceName,
      ip_address: deviceIp,
      location: deviceLocation,
      status: "active"
    };

    try {
      if (selectedDevice) {
        await attendanceAPI.updateDevice(selectedDevice.id, payload);
        window.alert("Device updated successfully");
      } else {
        await attendanceAPI.createDevice(payload);
        window.alert("Device created successfully");
      }
      setShowDeviceModal(false);
      fetchDevices();
    } catch (err) {
      console.error(err);
      window.alert(selectedDevice ? "Failed to update device" : "Failed to create device");
    }
  };

  const handleDeleteDevice = async (id) => {
    if (!await window.confirm("Are you sure you want to delete this device? This will also remove all mappings.")) return;
    try {
      await attendanceAPI.deleteDevice(id);
      window.alert("Device deleted successfully");
      fetchDevices();
    } catch (err) {
      console.error(err);
      window.alert("Failed to delete device");
    }
  };

  const openMappings = async (device) => {
    setSelectedDevice(device);
    setShowMappingsModal(true);
    fetchMappings(device.id);
  };

  const fetchMappings = async (deviceId) => {
    setMappingsLoading(true);
    try {
      const res = await attendanceAPI.getDeviceMappings(deviceId);
      if (res.success) {
        const data = res.data?.data || res.data?.mappings || res.data || [];
        setMappings(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
      window.alert("Failed to load mappings");
    } finally {
      setMappingsLoading(false);
    }
  };

  const handleCreateMapping = async (e) => {
    e.preventDefault();
    if (!selectedDevice) return;
    try {
      await attendanceAPI.createDeviceMapping(selectedDevice.id, {
        employee_id: newMappingEmpId,
        biometric_id: newMappingBioId
      });
      window.alert("Employee mapped successfully");
      setNewMappingEmpId("");
      setNewMappingBioId("");
      fetchMappings(selectedDevice.id);
    } catch (err) {
      console.error(err);
      window.alert("Failed to map employee");
    }
  };

  const handleDeleteMapping = async (mappingId) => {
    if (!selectedDevice) return;
    if (!await window.confirm("Remove this mapping?")) return;
    try {
      await attendanceAPI.deleteDeviceMapping(selectedDevice.id, mappingId);
      window.alert("Mapping removed");
      fetchMappings(selectedDevice.id);
    } catch (err) {
      console.error(err);
      window.alert("Failed to remove mapping");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role={user?.role || "hr"} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <DashboardTopBar title="Biometric Devices" subtitle="Manage organizational hardware & mappings" />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-slate-800">Registered Devices</h2>
              <button
                onClick={() => {
                  setSelectedDevice(null);
                  setDeviceName("");
                  setDeviceIp("");
                  setDeviceLocation("");
                  setShowDeviceModal(true);
                }}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition-colors shadow-sm"
              >
                <HiPlus className="w-4 h-4" />
                Add Device
              </button>
            </div>

            {/* Devices Table */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-xs">
                    <tr>
                      <th className="px-6 py-4">Device Info</th>
                      <th className="px-6 py-4">IP Address</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-8 text-center text-slate-500">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                            Loading devices...
                          </div>
                        </td>
                      </tr>
                    ) : devices.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-12 text-center">
                          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-50 text-purple-600 mb-4">
                            <HiDeviceMobile className="w-8 h-8" />
                          </div>
                          <h3 className="text-sm font-bold text-slate-800 mb-1">No Devices Found</h3>
                          <p className="text-xs text-slate-500">Add a biometric device to get started.</p>
                        </td>
                      </tr>
                    ) : (
                      devices.map((device) => (
                        <tr key={device.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 border border-purple-100">
                                <HiDeviceMobile className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="font-bold text-slate-800">{device.name}</div>
                                <div className="text-xs text-slate-500 mt-0.5">{device.location || "Unspecified Location"}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-slate-600 text-xs">
                            {device.ip_address || "N/A"}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${device.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                              {device.status === 'active' ? <HiStatusOnline className="w-3.5 h-3.5" /> : <HiStatusOffline className="w-3.5 h-3.5" />}
                              {device.status === 'active' ? 'Online' : 'Offline'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openMappings(device)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 text-xs font-bold hover:bg-purple-100 transition-colors"
                              >
                                <HiOutlineLink className="w-4 h-4" /> Mappings
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedDevice(device);
                                  setDeviceName(device.name);
                                  setDeviceIp(device.ip_address || "");
                                  setDeviceLocation(device.location || "");
                                  setShowDeviceModal(true);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                                title="Edit"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteDevice(device.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="Delete"
                              >
                                <HiOutlineTrash className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Device Modal */}
      {showDeviceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                  <HiDeviceMobile className="w-4 h-4" />
                </div>
                {selectedDevice ? "Edit Device" : "Register Device"}
              </h3>
              <button
                onClick={() => setShowDeviceModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="deviceForm" onSubmit={handleSaveDevice} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Device Name <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    required
                    className="w-full h-11 bg-slate-50/70 border border-slate-200 rounded-xl px-4 text-sm text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all"
                    placeholder="e.g. Main Entrance Scanner"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">IP Address</label>
                  <input
                    type="text"
                    value={deviceIp}
                    onChange={(e) => setDeviceIp(e.target.value)}
                    className="w-full h-11 bg-slate-50/70 border border-slate-200 rounded-xl px-4 text-sm font-mono text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all"
                    placeholder="192.168.1.100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Location</label>
                  <input
                    type="text"
                    value={deviceLocation}
                    onChange={(e) => setDeviceLocation(e.target.value)}
                    className="w-full h-11 bg-slate-50/70 border border-slate-200 rounded-xl px-4 text-sm text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all"
                    placeholder="e.g. Lobby 1"
                  />
                </div>
              </form>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeviceModal(false)}
                className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-200/50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="deviceForm"
                className="px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition-colors shadow-sm"
              >
                {selectedDevice ? "Save Changes" : "Register Device"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mappings Modal */}
      {showMappingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Employee Mappings</h3>
                <p className="text-xs text-slate-500 mt-1">Manage users synced to {selectedDevice?.name}</p>
              </div>
              <button
                onClick={() => setShowMappingsModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              
              {/* Add New Mapping Form */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Link New Employee</h4>
                <form onSubmit={handleCreateMapping} className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={newMappingEmpId}
                      onChange={(e) => setNewMappingEmpId(e.target.value)}
                      required
                      placeholder="System Employee UUID"
                      className="w-full h-10 bg-white border border-slate-200 rounded-xl px-3 text-xs text-slate-800 outline-none focus:border-purple-500 transition-all"
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      value={newMappingBioId}
                      onChange={(e) => setNewMappingBioId(e.target.value)}
                      required
                      placeholder="Device Biometric ID (e.g. 101)"
                      className="w-full h-10 bg-white border border-slate-200 rounded-xl px-3 text-xs text-slate-800 outline-none focus:border-purple-500 transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    className="h-10 px-4 bg-purple-600 text-white rounded-xl font-bold text-xs hover:bg-purple-700 transition-colors shadow-sm whitespace-nowrap"
                  >
                    Link User
                  </button>
                </form>
              </div>

              {/* Mappings Table */}
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-4 py-3">Biometric ID</th>
                      <th className="px-4 py-3">Employee Name</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {mappingsLoading ? (
                      <tr>
                        <td colSpan="3" className="px-4 py-6 text-center text-slate-500">Loading mappings...</td>
                      </tr>
                    ) : mappings.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="px-4 py-6 text-center text-slate-500">No users mapped to this device yet.</td>
                      </tr>
                    ) : (
                      mappings.map((mapping) => (
                        <tr key={mapping.id || mapping.biometric_id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-mono font-bold text-purple-600">
                            {mapping.biometric_id}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {mapping.employee_name || mapping.employee_id}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleDeleteMapping(mapping.id)}
                              className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1.5 rounded-lg transition-colors"
                              title="Unlink"
                            >
                              <HiOutlineTrash className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default BiometricDevicesPage;
