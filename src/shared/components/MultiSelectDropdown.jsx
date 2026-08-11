import React, { useState, useRef, useEffect } from "react";
import { HiCheck, HiSelector, HiX } from "react-icons/hi";
import Avatar, { genConfig } from "react-nice-avatar";

export default function MultiSelectDropdown({ 
  options = [], 
  value = [], // Array of selected values
  onChange, 
  placeholder = "Select options...",
  label = ""
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (val) => {
    if (value.includes(val)) {
      onChange(value.filter(v => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  const removeOption = (e, val) => {
    e.stopPropagation();
    onChange(value.filter(v => v !== val));
  };

  const selectedOptions = options.filter(opt => value.includes(opt.value));
  const filteredOptions = options.filter(opt => opt.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative" ref={containerRef}>
      {label && <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`min-h-[42px] w-full px-3 py-2 bg-white border rounded-xl cursor-pointer flex items-center justify-between shadow-xs transition ${isOpen ? "border-purple-500 ring-2 ring-purple-100" : "border-slate-200 hover:border-purple-300"}`}
      >
        <div className="flex flex-wrap gap-1.5 flex-1 pr-2">
          {selectedOptions.length === 0 && (
            <span className="text-sm text-slate-400 p-0.5">{placeholder}</span>
          )}
          {selectedOptions.map(opt => (
            <span key={opt.value} className="inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 bg-purple-50 text-purple-700 text-xs font-bold rounded-md border border-purple-100">
              {opt.label}
              <button 
                type="button"
                onClick={(e) => removeOption(e, opt.value)}
                className="w-4 h-4 rounded-full hover:bg-purple-200 flex items-center justify-center transition-colors"
              >
                <HiX className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <HiSelector className="w-4 h-4 text-slate-400 shrink-0" />
      </div>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-100 rounded-xl shadow-xl max-h-60 flex flex-col overflow-hidden">
          {options.length > 5 && (
            <div className="p-2 border-b border-slate-100 shrink-0">
              <input 
                type="text" 
                placeholder="Search..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:bg-white"
                onClick={e => e.stopPropagation()}
              />
            </div>
          )}
          <div className="overflow-y-auto flex-1">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-sm text-slate-400 text-center">No options found</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = value.includes(opt.value);
                return (
                  <div 
                    key={opt.value}
                    onClick={() => toggleOption(opt.value)}
                    className={`flex items-center px-4 py-2.5 cursor-pointer text-sm font-medium transition-colors border-b border-slate-50 last:border-b-0 ${
                      isSelected ? "bg-purple-50 text-purple-700" : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center mr-3 border shrink-0 ${
                      isSelected ? "bg-purple-600 border-purple-600 text-white" : "border-slate-300 bg-white"
                    }`}>
                      {isSelected && <HiCheck className="w-3 h-3" />}
                    </div>
                    
                    {opt.avatarIdentifier !== undefined && (
                      <div className="w-6 h-6 mr-2 rounded-full overflow-hidden shrink-0">
                        {opt.avatar ? (
                          <img src={opt.avatar} alt={opt.label} className="w-full h-full object-cover" />
                        ) : (
                          <Avatar className="w-full h-full" {...genConfig(opt.avatarIdentifier)} />
                        )}
                      </div>
                    )}
                    
                    <span className="truncate">{opt.label}</span>
                    {opt.subtitle && (
                      <span className="ml-2 text-[10px] text-slate-400 truncate hidden sm:inline-block">- {opt.subtitle}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
