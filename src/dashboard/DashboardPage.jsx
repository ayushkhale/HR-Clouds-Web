import React from "react";
import { Link } from "react-router-dom";
import { tokenHelper } from "../shared/api";

function DashboardPage() {
  function handleLogout() {
    tokenHelper.clear();
    window.location.href = "/";
  }

  return (
    <div className="min-h-screen bg-[#F4F4F5] flex flex-col items-center justify-center font-sans">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-12 py-14 text-center max-w-sm w-full">
        <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-sm text-gray-500 mb-8">
          You're logged in. The full dashboard is coming soon.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            to="/"
            className="block text-sm font-medium text-purple-600 hover:text-purple-700 transition-colors"
          >
            ← Back to Home
          </Link>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
