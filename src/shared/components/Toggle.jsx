function Toggle({ handleToggle, toggleLabel }) {
  return (
    <label className="block relative bg-primary-500 rounded-xl w-20 h-10 hover:cursor-pointer">
      <input
        type="checkbox"
        className="absolute opacity-0 w-0 h-0 peer"
        onChange={handleToggle}
        aria-label={toggleLabel}
      />
      <span className="before:top-1 before:left-1 before:absolute before:bg-white before:rounded-[9px] before:w-[36px] before:h-8 before:transition-all peer-checked:before:translate-x-[36px] before:duration-300 abosolute" />
    </label>
  );
}

export default Toggle;
