// Show times typed by people ("9 PM", "9:30pm", "21:00", "21") -> [hours, minutes], or null.
export function parseTime(s) {
  const m = String(s || '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (m[3]?.startsWith('p') && h < 12) h += 12;
  if (m[3]?.startsWith('a') && h === 12) h = 0;
  return h < 24 && min < 60 ? [h, min] : null;
}
