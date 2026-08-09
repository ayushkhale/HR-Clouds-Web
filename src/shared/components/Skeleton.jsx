import React from 'react';

const Skeleton = ({ type = 'text', rows = 5, className = '' }) => {
  const renderDashboard = () => (
    <div className={`space-y-6 ${className}`}>
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col gap-4 animate-pulse">
            <div className="flex justify-between items-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-200"></div>
              <div className="w-16 h-6 rounded-full bg-slate-200"></div>
            </div>
            <div>
              <div className="w-24 h-8 rounded-lg bg-slate-200 mb-2"></div>
              <div className="w-32 h-4 rounded-md bg-slate-100"></div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-3xl p-8 shadow-sm border border-slate-100 animate-pulse h-96 flex flex-col">
          <div className="w-48 h-6 bg-slate-200 rounded-md mb-8"></div>
          <div className="flex-1 w-full bg-slate-100 rounded-xl"></div>
        </div>
        <div className="lg:col-span-1 bg-white rounded-3xl p-8 shadow-sm border border-slate-100 animate-pulse h-96 flex flex-col">
          <div className="w-32 h-6 bg-slate-200 rounded-md mb-8"></div>
          <div className="flex-1 w-full rounded-full bg-slate-100 max-w-[200px] max-h-[200px] mx-auto"></div>
        </div>
      </div>
    </div>
  );

  const renderTable = () => (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50/50 border-b border-slate-200/60">
            <tr>
              {[...Array(5)].map((_, i) => (
                <th key={i} className="px-6 py-4">
                  <div className="h-4 bg-slate-200 rounded animate-pulse w-24"></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[...Array(rows)].map((_, i) => (
              <tr key={i}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-200 animate-pulse"></div>
                    <div className="space-y-2">
                      <div className="h-4 bg-slate-200 rounded animate-pulse w-32"></div>
                      <div className="h-3 bg-slate-100 rounded animate-pulse w-24"></div>
                    </div>
                  </div>
                </td>
                {[...Array(4)].map((_, j) => (
                  <td key={j} className="px-6 py-4">
                    <div className={`h-4 bg-slate-100 rounded animate-pulse ${j % 2 === 0 ? 'w-24' : 'w-16'}`}></div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderCard = () => (
    <div className={`bg-white rounded-3xl p-6 shadow-sm border border-slate-100 animate-pulse ${className}`}>
      <div className="w-1/3 h-6 bg-slate-200 rounded-md mb-4"></div>
      <div className="space-y-3">
        <div className="w-full h-4 bg-slate-100 rounded-md"></div>
        <div className="w-5/6 h-4 bg-slate-100 rounded-md"></div>
        <div className="w-4/6 h-4 bg-slate-100 rounded-md"></div>
      </div>
    </div>
  );

  const renderText = () => (
    <div className={`space-y-3 ${className}`}>
      {[...Array(rows)].map((_, i) => (
        <div key={i} className={`h-4 bg-slate-200 rounded animate-pulse ${i === rows - 1 ? 'w-4/6' : 'w-full'}`}></div>
      ))}
    </div>
  );

  const renderApp = () => (
    <div className={`min-h-screen bg-slate-50 flex items-center justify-center flex-col gap-4 ${className}`}>
      <div className="flex items-center gap-2 mb-4 animate-pulse">
        <div className="w-8 h-8 rounded-lg bg-purple-200"></div>
        <div className="w-24 h-6 rounded-md bg-slate-200"></div>
      </div>
      <div className="w-64 space-y-2">
        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-purple-400 w-1/2 animate-[pulse_1s_ease-in-out_infinite]"></div>
        </div>
        <p className="text-xs text-center text-slate-400 font-medium tracking-wide uppercase animate-pulse">Loading Workspace...</p>
      </div>
    </div>
  );

  switch (type) {
    case 'dashboard':
      return renderDashboard();
    case 'table':
      return renderTable();
    case 'card':
      return renderCard();
    case 'app':
      return renderApp();
    case 'text':
    default:
      return renderText();
  }
};

export default Skeleton;
