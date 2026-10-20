// ============================================================
//  DRAGON FARM — WEBSITE INQUIRIES INTO THE PIPELINE
//
//  Netlify runs this automatically for every booking-inquiry form
//  submission that passes its spam filter (the function's name is what
//  ties it to that event). The inquiry becomes a lead with a follow-up
//  due today, so it shows up in "Follow-ups due" right away. Sync and
//  licensing inquiries go to the sync pipeline.
//
//  Fan sign-ups from shows (the fan-signup form on fans.html) go to the
//  private fan list instead.
// ============================================================

import { emit, leadSummary } from '../lib/events.mjs';
import { addFan } from '../lib/fans.mjs';
import { addLeadIfNew, clean, labelToday, readList } from '../lib/store.mjs';

// The label's one act for now.
const ACT = 'Timothy Chance and Rasta Country';

// The form's event types, mapped to the lead form's venue types.
const VENUE_TYPES = {
  'Bar / Club Night': 'Bar / Club',
  'Festival': 'Festival',
  'Dispensary Event': 'Dispensary',
  'College Show': 'College',
  'Private Event': 'Private Event',
  'Outdoor / Amphitheater': 'Outdoor / Amph.'
};

function inquiryNotes(d) {
  return [
    `Website inquiry${d.event_type ? ` (${clean(d.event_type, 60)})` : ''}.`,
    d.budget && `Budget: ${clean(d.budget, 60)}.`,
    clean(d.details, 2000)
  ].filter(Boolean).join(' ');
}

function inquiryLead(submission, today) {
  const d = submission.data || {};
  const base = {
    id: 'inq-' + clean(submission.id || Date.now(), 60).replace(/[^\w-]/g, ''),
    dateAdded: clean(submission.created_at, 40) || new Date().toISOString(),
    name: clean(d.organization, 120) || clean(d.name, 120) || 'Website inquiry',
    status: 'new',
    followUp: today,
    inquiry: true,
    source: 'Website inquiry form',
    notes: inquiryNotes(d)
  };
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(d.email, 120)) ? clean(d.email, 120) : '';
  if (d.event_type === 'Sync / Licensing') {
    return { list: 'sync', lead: { ...base, project: '', category: 'Other', track: 'Mr. Iron Man (Live)', contact: clean(d.name, 120), email } };
  }
  return {
    list: 'venue',
    lead: {
      ...base,
      city: clean(d.location, 120),
      type: VENUE_TYPES[d.event_type] || 'Other',
      artist: ACT,
      contactName: clean(d.name, 120),
      contactEmail: email,
      contactPhone: clean(d.phone, 40),
      eventDate: /^\d{4}-\d{2}-\d{2}$/.test(d.event_date || '') ? d.event_date : ''
    }
  };
}

export default async (req) => {
  let submission;
  try { submission = (await req.json()).payload || {}; }
  catch { return new Response('', { status: 400 }); }
  if (submission.form_name === 'fan-signup') {
    const d = submission.data || {};
    const added = await addFan({ email: d.email, name: d.name, city: d.city, show: d.show, at: submission.created_at });
    if (added?.isNew) await emit('fan.signed_up', { email: String(d.email || '').toLowerCase(), name: clean(d.name, 120), city: clean(d.city, 120), show: clean(d.show, 160), fans: added.fans.length });
    return new Response('');
  }
  if (submission.form_name !== 'booking-inquiry') return new Response('');

  const { list, lead } = inquiryLead(submission, labelToday());
  // Netlify can retry an event; the lead may have been edited by then.
  const existed = (await readList(list)).some(l => l.id === lead.id);
  await addLeadIfNew(list, lead);
  if (!existed) await emit('inquiry.received', { list, lead: leadSummary(lead), notes: lead.notes });
  return new Response('');
};
