import React, { useRef } from "react";

/**
 * OtpInput — 6 individual digit boxes with auto-focus, backspace navigation, and paste support
 * @param {{ value: string, onChange: (val: string) => void, disabled?: boolean }} props
 */
function OtpInput({ value = "", onChange, disabled = false }) {
  const inputsRef = useRef([]);
  const digits = value.padEnd(6, "").split("").slice(0, 6);

  function handleChange(e, index) {
    const char = e.target.value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    onChange(newDigits.join(""));
    if (char && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(e, index) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const newDigits = [...digits];
        newDigits[index] = "";
        onChange(newDigits.join(""));
      } else if (index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
    }
    if (e.key === "ArrowLeft" && index > 0) inputsRef.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < 5) inputsRef.current[index + 1]?.focus();
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(pasted.padEnd(6, "").slice(0, 6));
    const nextFocus = Math.min(pasted.length, 5);
    inputsRef.current[nextFocus]?.focus();
  }

  return (
    <div className="flex gap-3 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (inputsRef.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] || ""}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onPaste={handlePaste}
          disabled={disabled}
          className={`w-11 h-12 text-center text-lg font-bold rounded-xl border-2 outline-none transition-all duration-150
            ${digits[i] ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-200 bg-white text-gray-900"}
            focus:border-purple-500 focus:ring-2 focus:ring-purple-100
            disabled:opacity-50 disabled:cursor-not-allowed`}
        />
      ))}
    </div>
  );
}

export default OtpInput;
