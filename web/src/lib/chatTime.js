export const dayKey = (iso) => new Date(iso).toDateString();
export const dayLabel = (iso) => {
  const d = new Date(iso);
  const t = new Date();
  if (d.toDateString() === t.toDateString()) return "Today";
  const y = new Date(t.getTime() - 86400e3);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === t.getFullYear() ? undefined : "numeric" });
};
export const clock = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
/** The "<iso>|<id>" cursor the API uses, for the last item of a list. */
export const cursorOfItem = (x) => (x ? `${x.created_date}|${x.id}` : null);
/** True on devices with a real keyboard (Enter sends, Shift+Enter newline); phones keep Enter as newline + the Send button. */
export const hasKeyboard = () => typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
