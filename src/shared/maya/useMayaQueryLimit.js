import { useSyncExternalStore } from "react";
import { MAYA_AVAILABILITY_EVENT, mayaQueryLimit } from "./mayaBridge";

// The longest question Maya can take right now — 0 when she can't take one at
// all (hidden from My Profile, no API key, not loaded yet). One number rather
// than a boolean so a change to her live limit re-renders the ⓘ too. Same
// window-event sync as useMayaVisibility, read through useSyncExternalStore so
// a change between render and subscribe can't be missed.
const subscribe = (onChange) => {
  window.addEventListener(MAYA_AVAILABILITY_EVENT, onChange);
  return () => window.removeEventListener(MAYA_AVAILABILITY_EVENT, onChange);
};

export function useMayaQueryLimit() {
  return useSyncExternalStore(subscribe, mayaQueryLimit, () => 0);
}
