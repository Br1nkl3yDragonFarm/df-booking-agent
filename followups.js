// ============================================================
//  DRAGON FARM CRM — FOLLOW-UPS
//
//  Every open lead carries a follow-up date (lead.followUp, YYYY-MM-DD),
//  how many times we've reached out (lead.touches) and when we last did
//  (lead.lastTouch).
//
//  Rhythm from the CRM playbook: pitch, follow up about a week later,
//  then about two weeks after that, then let the lead rest after the
//  third touch instead of becoming a pest. A reply we haven't answered
//  (outreach.js) makes a lead due right away, whatever its date.
// ============================================================

(function () {
  const CLOSED = ['booked', 'licensed', 'passed'];
  const GAPS = [7, 14];   // days to the next touch after touch 1 and touch 2
  const MAX_TOUCHES = 3;
  const SNOOZE_DAYS = 3;

  function iso(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function today() { return iso(new Date()); }
  function addDays(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return iso(d);
  }
  function daysUntil(date) {
    const [y, m, d] = date.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - start) / 86400000);
  }
  function shortDate(date) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function isOpen(lead) { return !CLOSED.includes(lead.status); }
  const replied = lead => !!(window.DFOut && DFOut.needsReply(lead));

  // Unanswered replies first, then by follow-up date.
  function due(leads) {
    const t = today();
    return leads
      .filter(l => isOpen(l) && ((l.followUp && l.followUp <= t) || replied(l)))
      .sort((a, b) => (replied(b) - replied(a)) || (a.followUp || t).localeCompare(b.followUp || t));
  }

  function nextUp(leads) {
    const t = today();
    return leads
      .filter(l => isOpen(l) && l.followUp && l.followUp > t)
      .sort((a, b) => a.followUp.localeCompare(b.followUp))[0];
  }

  // Record that we just reached out, and set the next date by the rhythm.
  function logTouch(lead, contactedStatus) {
    const touches = (lead.touches || 0) + 1;
    return {
      ...lead,
      touches,
      lastTouch: today(),
      status: lead.status === 'new' ? contactedStatus : lead.status,
      followUp: touches >= MAX_TOUCHES ? '' : addDays(GAPS[touches - 1])
    };
  }

  function snooze(lead) {
    return { ...lead, followUp: addDays(SNOOZE_DAYS) };
  }

  // A lead that just moved past "new" counts as the first touch and gets
  // its first follow-up a week out, unless a date was already chosen.
  function schedule(before, after) {
    const wasNew = !before || !before.status || before.status === 'new';
    if (!wasNew || after.status === 'new' || !isOpen(after)) return after;
    return {
      ...after,
      touches: Math.max(1, after.touches || 0),
      lastTouch: after.lastTouch || today(),
      followUp: after.followUp || addDays(GAPS[0])
    };
  }

  // Fill the form's date field when a status that needs a follow-up is picked.
  function suggest(statusEl, dateEl) {
    const status = statusEl.value;
    if (!dateEl.value && status !== 'new' && !CLOSED.includes(status)) dateEl.value = addDays(GAPS[0]);
  }

  function touchMessage(lead) {
    if (!lead.followUp) return `${lead.name}: ${MAX_TOUCHES} touches done, resting this lead`;
    return `${lead.name}: next follow-up ${shortDate(lead.followUp)}`;
  }

  function badge(lead) {
    if (isOpen(lead) && replied(lead)) return '<span class="df-fu df-fu-reply" title="They replied. Answer them.">💬 Replied</span>';
    if (!isOpen(lead) || !lead.followUp) return '';
    const days = daysUntil(lead.followUp);
    const [text, cls] = days < 0 ? [`${-days}d overdue`, 'late']
      : days === 0 ? ['Today', 'today']
      : days === 1 ? ['Tomorrow', 'soon']
      : [shortDate(lead.followUp), 'later'];
    return `<span class="df-fu df-fu-${cls}" title="Follow up on ${esc(lead.followUp)}">⏰ ${text}</span>`;
  }

  // Renders the "Follow-ups due" panel. Handler names are global functions
  // on the page that take a lead id.
  function renderDue(el, leads, opts) {
    const list = due(leads);
    const h = opts.handlers;
    const head = `<div class="df-due-head"><div><h2>${esc(opts.title || 'Follow-ups due')}</h2>
      <p>${list.length ? `${list.length} ${list.length === 1 ? 'lead needs' : 'leads need'} a nudge` : 'You’re caught up'}</p></div></div>`;
    if (!list.length) {
      const next = nextUp(leads);
      el.innerHTML = head + `<div class="df-due-box"><div class="df-due-empty">✅ Nothing due today.${next
        ? ` Next: <strong>${esc(next.name)}</strong> on ${shortDate(next.followUp)}.` : ''}</div></div>`;
      return;
    }
    el.innerHTML = head + '<div class="df-due-box">' + list.map(l => `
      <div class="df-due-row">
        <div class="df-due-main" onclick="${h.open}('${l.id}')">
          <div class="df-due-name">${esc(l.name)} ${badge(l)}</div>
          <div class="df-due-sub">${esc(opts.describe(l))}${l.touches ? ` · touch ${l.touches + 1} of ${MAX_TOUCHES}` : ''}${l.lastTouch ? ` · last ${shortDate(l.lastTouch)}` : ''}</div>
          ${replied(l) ? `<div class="df-due-sub df-due-quote">“${esc(DFOut.lastReply(l).snippet || DFOut.lastReply(l).subject)}”</div>` : ''}
        </div>
        <div class="df-due-actions">
          ${h.pitch ? `<button class="btn btn-ghost" title="${replied(l) ? 'Draft an answer' : 'Draft the follow-up'}" onclick="${h.pitch}('${l.id}')">✉ ${replied(l) ? 'Answer' : 'Draft'}</button>` : ''}
          <button class="btn btn-ghost" title="I followed up today" onclick="${h.done}('${l.id}')">✓ Done</button>
          <button class="btn btn-ghost" title="Remind me in ${SNOOZE_DAYS} days" onclick="${h.snooze}('${l.id}')">Snooze ${SNOOZE_DAYS}d</button>
        </div>
      </div>`).join('') + '</div>';
  }

  const style = document.createElement('style');
  style.textContent = `
    .df-fu{display:inline-block;font-size:0.68rem;line-height:1.4;padding:1px 7px;border-radius:999px;margin-top:3px;white-space:nowrap;border:1px solid transparent}
    .df-fu-late{color:#ff8a80;background:rgba(224,90,79,0.12);border-color:rgba(224,90,79,0.35)}
    .df-fu-today{color:#f0c060;background:rgba(200,146,42,0.14);border-color:rgba(200,146,42,0.4)}
    .df-fu-soon{color:#e8dfc8;background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.12)}
    .df-fu-later{color:#9aa39c;border-color:rgba(255,255,255,0.1)}
    .df-fu-reply{color:#7ed6a0;background:rgba(42,180,100,0.14);border-color:rgba(42,180,100,0.45)}
    .df-due-panel{margin-bottom:1.5rem}
    .df-due-head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:0.75rem}
    .df-due-head h2{margin:0}
    .df-due-head p{margin:2px 0 0;font-size:0.8rem;color:var(--gray,#9aa39c)}
    .df-due-box{background:var(--card,#131c1e);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:var(--r2,10px);overflow:hidden}
    .df-due-row{display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.7rem 1rem;border-bottom:1px solid var(--border,rgba(255,255,255,0.08));flex-wrap:wrap}
    .df-due-row:last-child{border-bottom:none}
    .df-due-main{cursor:pointer;min-width:0;flex:1 1 200px}
    .df-due-name{font-size:0.88rem;font-weight:500;color:var(--cream,#e8dfc8)}
    .df-due-sub{font-size:0.74rem;color:var(--gray,#9aa39c);margin-top:2px}
    .df-due-quote{color:var(--gray-light,#c9c2ae);font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:520px}
    .df-due-actions{display:flex;gap:4px;flex-shrink:0}
    .df-due-actions .btn{padding:4px 10px;font-size:0.75rem}
    .df-due-empty{padding:0.9rem 1rem;font-size:0.85rem;color:var(--gray,#9aa39c)}
    .df-due-empty strong{color:var(--cream,#e8dfc8);font-weight:500}`;
  document.head.appendChild(style);

  window.DFFollow = { today, addDays, isOpen, due, logTouch, snooze, schedule, suggest, touchMessage, badge, renderDue };
})();
