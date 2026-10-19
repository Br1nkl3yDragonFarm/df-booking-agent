// Shared check for the team passcode (DF_CRM_PASSCODE) sent in the
// x-df-passcode header by the private pages.
import { timingSafeEqual } from 'node:crypto';

export function passcodeMatches(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(expected || ''));
  return b.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
