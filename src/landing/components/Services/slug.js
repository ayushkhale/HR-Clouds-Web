/* The slug each solution's link points at ("/services#payroll" → "payroll").
   A card carries it as its DOM id so footer and in-page links actually land
   somewhere — before this, every /services#… link scrolled nowhere because no
   element on the page had an id at all.

   Kept in its own module so the card file exports only a component and fast
   refresh keeps working. */
export const slugFor = (solution) => (solution.link || "").split("#")[1] || "";
