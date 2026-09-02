export const formatDecimalHours = (val) => {
  if (val == null || isNaN(val) || val === 0) return '0h';
  const hrs = Math.floor(val);
  const mins = Math.round((val - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
};
