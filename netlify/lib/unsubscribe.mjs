// Unsubscribe links for the fan newsletter, kept apart from the email
// template so the unsubscribe function stays small.
import { createHmac } from 'node:crypto';

// A signature only this site can make, so unsubscribe links can't be forged for other people.
export function unsubscribeToken(email) {
  return createHmac('sha256', `unsubscribe:${process.env.DF_CRM_PASSCODE || ''}`).update(String(email).toLowerCase()).digest('base64url').slice(0, 22);
}
export function unsubscribeUrl(site, email) {
  return `${site}/.netlify/functions/unsubscribe?e=${encodeURIComponent(email)}&s=${unsubscribeToken(email)}`;
}
