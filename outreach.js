// ============================================================
//  DRAGON FARM CRM — OUTREACH & GETTING PAID
//
//  Everything that turns a lead into money, shared by the private pages:
//    · Send emails from booking@dragonfarm.net (netlify/functions/email.mjs),
//      or through the mail app when sending isn't set up yet
//    · Replies caught by email-inbound.mjs flag the lead "Replied"
//    · One tap drafts the next follow-up (or an answer to a reply)
//    · Tracked press kit links: see when a buyer opened it
//    · Invoices with optional Stripe card payment links, and deposit
//      reminders; online payments mark the deposit received
//    · Open dates around a booked show, to fill with nearby gigs
//
//  Activity (sent, replies, views, payments) lives on the server apart from
//  the lead, so it can't be lost when a page saves an older copy of a lead.
//  Usage: DFOut.init(onChange) once; onChange runs whenever activity loads.
// ============================================================

(function () {
  const ACTIVITY = '/.netlify/functions/activity';
  const SEND = '/.netlify/functions/email';
  const PAY = '/.netlify/functions/payment-link';
  const AI = '/.netlify/functions/ai-proxy';
  const LABEL = { name: 'Dragon Farm Records', place: 'Nashville, TN', email: 'booking@dragonfarm.net' };
  const KIT_LINE = 'Press kit (bio, music, live video): ';
  const GAP_DAYS = 3;

  let acts = {};
  let setupInfo = { email: false, replies: false, payments: false, from: '' };
  let onChange = () => {};

  // ---- helpers ----
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) { return '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function parse(date) { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d); }
  function niceDate(date) { return date ? parse(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''; }
  function shortStamp(isoTime) { return isoTime ? new Date(isoTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; }
  const firstName = name => String(name || '').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || 'there';
  const emailOf = lead => (lead && (lead.contactEmail || lead.email)) || '';
  const contactOf = lead => (lead && (lead.contactName || lead.contact)) || '';
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  async function call(url, init = {}) {
    const go = () => fetch(url, { ...init, headers: { 'Content-Type': 'application/json', 'x-df-passcode': DFStore.passcode(), ...(init.headers || {}) } });
    let res = await go();
    if (res.status === 401 && init.method === 'POST' && DFStore.askPasscode()) res = await go();
    return res;
  }

  // ---- activity ----
  async function load() {
    try {
      const res = await call(ACTIVITY);
      if (!res.ok) return;
      const data = await res.json();
      acts = data.leads || {};
      setupInfo = { ...setupInfo, ...(data.setup || {}) };
      onChange();
    } catch {}
  }

  function init(fn) {
    onChange = fn || onChange;
    load();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
  }

  const activity = lead => (lead && acts[lead.id]) || {};
  const latest = list => (list && list.length ? list[list.length - 1] : null);
  function lastReply(lead) { return latest(activity(lead).replies); }

  // A reply we haven't answered: newer than anything we sent and not marked handled.
  function needsReply(lead) {
    const r = lastReply(lead);
    if (!r || lead.replyHandled === r.at) return false;
    const sent = latest(activity(lead).sent);
    return !sent || sent.at < r.at;
  }

  // Call when the user deals with the lead (sends, or marks the follow-up done).
  function handled(lead) {
    const r = lastReply(lead);
    return r ? { ...lead, replyHandled: r.at } : lead;
  }

  // After an email goes out: count the touch, schedule the next one, clear the reply flag.
  function markSent(lead, contactedStatus) {
    return handled(DFFollow.logTouch(lead, contactedStatus));
  }

  // Online payments mark the deposit received. Returns the leads that changed.
  function reconcile(leads) {
    const changed = [];
    leads.forEach((l, i) => {
      const paidDeposit = (activity(l).payments || []).some(p => p.kind === 'deposit');
      if (paidDeposit && Number(l.deposit) && !l.depositPaid) {
        leads[i] = { ...l, depositPaid: true };
        changed.push(leads[i]);
      }
    });
    return changed;
  }

  function badges(lead) {
    const a = activity(lead);
    const out = [];
    if (lead.inquiry) out.push(`<span class="dfo-badge dfo-b-in" title="Came in through the website form">📥 Inquiry</span>`);
    const r = lastReply(lead);
    // An unanswered reply on an open lead already shows as the follow-up badge.
    if (r && !(needsReply(lead) && DFFollow.isOpen(lead))) {
      out.push(`<span class="dfo-badge ${needsReply(lead) ? 'dfo-b-reply' : ''}" title="${esc(r.subject)}${r.snippet ? ': ' + esc(r.snippet) : ''}">💬 Reply ${shortStamp(r.at)}</span>`);
    } else if (!r && a.sent && a.sent.length) {
      out.push(`<span class="dfo-badge" title="${esc(latest(a.sent).subject)}">📤 Sent ${shortStamp(latest(a.sent).at)}</span>`);
    }
    if (a.views && a.views.count) out.push(`<span class="dfo-badge dfo-b-view" title="First opened ${shortStamp(a.views.first)}">👀 Kit opened ${a.views.count}×</span>`);
    (a.payments || []).forEach(p => out.push(`<span class="dfo-badge dfo-b-paid">💳 ${money(p.amount)} paid online</span>`));
    return out.length ? `<div class="dfo-badges">${out.join('')}</div>` : '';
  }

  // ---- press kit links ----
  function artistKey(lead) {
    const a = `${lead?.artist || ''} ${lead?.track || ''}`;
    if (/Timothy|Iron Man/i.test(a)) return 'tcrc';
    if (/Poetic|Peace Pipe/i.test(a)) return 'pnc';
    return 'tcrc,pnc';
  }
  function kitUrl(lead) {
    const ref = lead && lead.id ? `&r=${encodeURIComponent(lead.id)}` : '';
    return `${location.origin}/epk.html?a=${artistKey(lead)}${ref}`;
  }

  // ---- send modal ----
  let modal = null;
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'dfo-overlay';
    modal.innerHTML = '<div class="dfo-modal" role="dialog" aria-modal="true"></div>';
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.body.appendChild(modal);
    return modal;
  }
  function close() { if (modal) modal.classList.remove('open'); }
  function show(html) {
    const m = ensureModal();
    m.querySelector('.dfo-modal').innerHTML = html;
    m.classList.add('open');
    return m.querySelector('.dfo-modal');
  }

  // opts: { to, subject, body, kind, lead, kit (offer the press kit link), onSent(sentInfo) }
  function send(opts) {
    const ready = setupInfo.email;
    const box = show(`
      <div class="dfo-head"><h3>${esc(opts.title || 'Review & send')}</h3><button class="dfo-x" data-a="close" aria-label="Close">×</button></div>
      <div class="dfo-body">
        <label class="dfo-field"><span>To</span><input type="email" data-k="to" value="${esc(opts.to || emailOf(opts.lead))}" placeholder="name@venue.com" /></label>
        <label class="dfo-field"><span>Subject</span><input type="text" data-k="subject" value="${esc(opts.subject)}" /></label>
        <label class="dfo-field"><span>Message</span><textarea data-k="body" rows="12">${esc(opts.body)}</textarea></label>
        ${opts.kit && opts.lead ? `<label class="dfo-check"><input type="checkbox" data-k="kit" /> Add a tracked press kit link (you'll see when they open it)</label>` : ''}
        <div class="dfo-note">${ready
          ? `Sends from <b>${esc(setupInfo.from)}</b>. Replies come back to your booking inbox${setupInfo.replies ? ' and flag this lead' : ''}.`
          : 'Sending from the tool isn’t set up yet, so this opens your mail app. After you send it there, tap “I sent it” to log it.'}</div>
        <div class="dfo-status" data-k="status"></div>
      </div>
      <div class="dfo-actions">
        ${ready ? '<button class="btn btn-gold" data-a="send">📤 Send now</button>' : '<button class="btn btn-gold" data-a="mail">📧 Open in mail app</button>'}
        ${ready ? '<button class="btn btn-ghost" data-a="mail">Mail app instead</button>' : (opts.lead ? '<button class="btn btn-ghost" data-a="manual">✓ I sent it</button>' : '')}
        <button class="btn btn-ghost" data-a="copy">📋 Copy</button>
      </div>`);
    const $ = k => box.querySelector(`[data-k="${k}"]`);
    const status = (msg, kind) => { $('status').className = 'dfo-status' + (kind ? ' dfo-' + kind : ''); $('status').textContent = msg; };
    const kitLine = () => KIT_LINE + kitUrl(opts.lead);
    if ($('kit')) {
      $('kit').checked = opts.kind === 'pitch' || opts.kind === 'followup';
      const sync = () => {
        const body = $('body').value.replace('\n\n' + kitLine(), '').replace(kitLine(), '');
        $('body').value = $('kit').checked ? body.replace(/\s+$/, '') + '\n\n' + kitLine() : body;
      };
      $('kit').addEventListener('change', sync);
      sync();
    }
    const msg = () => ({ to: $('to').value.trim(), subject: $('subject').value.trim(), text: $('body').value });
    const finish = sent => { close(); if (opts.onSent) opts.onSent(sent); };

    box.querySelector('[data-a="close"]').addEventListener('click', close);
    box.querySelector('[data-a="copy"]').addEventListener('click', () => {
      const m = msg();
      navigator.clipboard.writeText(`Subject: ${m.subject}\n\n${m.text}`).then(() => status('Copied ✓', 'ok')).catch(() => status('Copy failed. Select the text and copy it.', 'err'));
    });
    box.querySelector('[data-a="mail"]').addEventListener('click', () => {
      const m = msg();
      location.href = `mailto:${encodeURIComponent(m.to)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.text)}`;
      if (opts.lead && !ready) status('After you send it, tap “I sent it” to log the touch.', '');
    });
    box.querySelector('[data-a="manual"]')?.addEventListener('click', () => {
      const m = msg();
      finish({ at: new Date().toISOString(), to: m.to, subject: m.subject, kind: opts.kind, manual: true });
    });
    const sendBtn = box.querySelector('[data-a="send"]');
    if (sendBtn) {
      const sendId = newId();
      sendBtn.addEventListener('click', async () => {
        const m = msg();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.to)) return status('Add the email address to send to.', 'err');
        if (!m.subject || !m.text.trim()) return status('Add a subject and a message.', 'err');
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending…';
        let res, data = {};
        try {
          res = await call(SEND, { method: 'POST', body: JSON.stringify({ ...m, kind: opts.kind || 'other', leadId: opts.lead?.id || '', sendId }) });
          data = await res.json().catch(() => ({}));
        } catch { res = null; }
        if (!res || !res.ok) {
          sendBtn.disabled = false;
          sendBtn.textContent = '📤 Send now';
          return status(data.error || 'Couldn’t send. Check your connection and try again.', 'err');
        }
        if (opts.lead) {
          const a = acts[opts.lead.id] = { ...(acts[opts.lead.id] || {}) };
          a.sent = [...(a.sent || []), data.sent];
        }
        finish(data.sent);
      });
    }
  }

  // ---- AI drafts ----
  async function draft(system, prompt) {
    const res = await call(AI, { method: 'POST', body: JSON.stringify({ max_tokens: 1200, system, messages: [{ role: 'user', content: prompt }] }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || 'The writing assistant is unavailable.');
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : text);
    if (!parsed.subject || !parsed.body) throw new Error('The draft came back empty.');
    return parsed;
  }

  // Draft the next follow-up, or an answer when they replied, and open it for review.
  async function followUp(lead, kind, onSent, notify) {
    const a = activity(lead);
    const reply = needsReply(lead) ? lastReply(lead) : null;
    const sent = latest(a.sent);
    const sync = kind === 'sync';
    notify && notify(reply ? 'Drafting an answer…' : 'Drafting the follow-up…');
    const system = `You write short emails for Dragon Farm Records, an independent label in Nashville, TN (${LABEL.email}). Artists: Timothy Chance and Rasta Country (country-reggae, single "Mr. Iron Man (Live)") and Poetic Nocturnal Creatures (conscious hip-hop, single "Peace Pipe").
Rules: under 130 words, warm and direct, one clear ask. Use only the facts given; never invent dates, numbers, venues, past conversations or promises. Sign off as "Dragon Farm Records".
Reply with only JSON: {"subject": "...", "body": "..."}`;
    const facts = [
      `${sync ? 'Company' : 'Venue'}: ${lead.name}${lead.city ? ` (${lead.city})` : ''}`,
      contactOf(lead) && `Contact: ${contactOf(lead)}`,
      sync ? `Track: ${lead.track || 'both tracks'}${lead.project ? `; their project: ${lead.project}` : ''}` : `Artist: ${lead.artist || 'both artists'}`,
      lead.eventDate && `Date discussed: ${niceDate(lead.eventDate)}`,
      sent && `Our last email (${shortStamp(sent.at)}): "${sent.subject}"`,
      `Times we've reached out: ${lead.touches || (sent ? 1 : 0)}`,
      reply && `Their reply (${shortStamp(reply.at)}), subject "${reply.subject}": ${reply.snippet || '(text not available)'}`,
      lead.notes && `Our notes: ${String(lead.notes).slice(0, 600)}`
    ].filter(Boolean).join('\n');
    const ask = reply
      ? 'Write our answer to their reply. Respond to what they said and suggest the next concrete step.'
      : `Write follow-up number ${(lead.touches || 1) + 1} to our ${sync ? 'sync pitch' : 'booking pitch'}. Keep it short, add something useful, and make it easy to say yes or no.`;
    try {
      const d = await draft(system, `${facts}\n\n${ask}`);
      notify && notify('');
      send({ title: reply ? 'Answer their reply' : 'Follow-up', subject: d.subject, body: d.body, kind: 'followup', lead, kit: true, onSent });
    } catch (err) {
      notify && notify('');
      const subject = sent ? (/^re:/i.test(sent.subject) ? sent.subject : `Re: ${sent.subject}`) : `Following up: ${lead.name}`;
      send({ title: 'Follow-up', subject, body: `Hi ${firstName(contactOf(lead))},\n\nJust following up on my last note. `, kind: 'followup', lead, kit: true, onSent });
      alert(`Couldn’t draft it automatically (${err.message}). Write it in the box instead.`);
    }
  }

  // ---- invoices ----
  function balanceDue(l) {
    const g = Number(l.guarantee) || 0, dep = Number(l.deposit) || 0;
    return g > dep ? g - dep : 0;
  }
  function invoiceNo(l, kind) {
    return `DF-${(l.eventDate || iso(new Date())).replace(/-/g, '')}-${String(l.id).replace(/\W/g, '').slice(-4).toUpperCase()}${kind === 'deposit' ? 'D' : kind === 'balance' ? 'B' : ''}`;
  }
  function payLinkFor(l, kind) {
    const fromActivity = [...(activity(l).links || [])].reverse().find(x => x.kind === kind);
    const fromLead = [...(l.invoices || [])].reverse().find(x => x.kind === kind && x.link);
    return fromActivity?.url || fromLead?.link || '';
  }
  const showLabel = l => `${l.artist && l.artist !== 'Both' ? l.artist : 'Dragon Farm Records'} at ${l.name}${l.eventDate ? `, ${niceDate(l.eventDate)}` : ''}`;

  function invoiceHtml(l, inv) {
    const rows = [
      [`Performance: ${showLabel(l)}`, DFDeals.terms(l) || '', ''],
      inv.kind === 'balance' && Number(l.deposit) ? ['Guarantee', '', money(l.guarantee)] : null,
      inv.kind === 'balance' && Number(l.deposit) ? [`Less deposit${l.depositPaid ? ' (received)' : ''}`, '', '−' + money(l.deposit)] : null,
      [inv.kind === 'deposit' ? 'Deposit due' : inv.kind === 'balance' ? 'Balance due' : (inv.label || 'Amount due'), '', money(inv.amount)]
    ].filter(Boolean);
    return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(inv.no)}</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#1d2321;background:#fff;margin:0;padding:40px 24px}main{max-width:720px;margin:0 auto}
h1{font-size:28px;margin:0;letter-spacing:.02em}.top{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;border-bottom:2px solid #1d2321;padding-bottom:16px;margin-bottom:24px}
.muted{color:#5e6763}.grid{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:24px}table{width:100%;border-collapse:collapse}td,th{padding:10px 8px;border-bottom:1px solid #dde2df;text-align:left;vertical-align:top}
td:last-child,th:last-child{text-align:right;white-space:nowrap}tr.total td{font-weight:700;font-size:17px;border-bottom:2px solid #1d2321}.pay{margin-top:24px;padding:16px;border:1px solid #dde2df;border-radius:8px}
.pay a{color:#0a58ca;word-break:break-all}.btn{display:inline-block;margin-top:24px;padding:10px 18px;background:#1d2321;color:#fff;border:0;border-radius:6px;font-size:14px;cursor:pointer}@media print{.btn{display:none}body{padding:0}}</style></head>
<body><main>
<div class="top"><div><h1>INVOICE</h1><div class="muted">${esc(inv.no)}</div></div><div style="text-align:right"><b>${esc(LABEL.name)}</b><br>${esc(LABEL.place)}<br>${esc(LABEL.email)}</div></div>
<div class="grid"><div><div class="muted">Bill to</div><b>${esc(l.name)}</b>${contactOf(l) ? `<br>${esc(contactOf(l))}` : ''}${l.city ? `<br>${esc(l.city)}` : ''}${emailOf(l) ? `<br>${esc(emailOf(l))}` : ''}</div>
<div style="text-align:right"><div class="muted">Date</div>${esc(niceDate(iso(new Date())))}<div class="muted" style="margin-top:6px">Due</div><b>${esc(niceDate(inv.due) || 'On receipt')}</b></div></div>
<table><thead><tr><th>Description</th><th></th><th>Amount</th></tr></thead><tbody>
${rows.map((r, i) => `<tr class="${i === rows.length - 1 ? 'total' : ''}"><td>${esc(r[0])}</td><td class="muted">${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}
</tbody></table>
<div class="pay"><b>How to pay</b><br>${inv.link ? `Pay by card: <a href="${esc(inv.link)}">${esc(inv.link)}</a><br>` : ''}${esc(inv.instructions || `Questions or another payment method: ${LABEL.email}`)}</div>
${inv.notes ? `<p class="muted">${esc(inv.notes)}</p>` : ''}
<button class="btn" onclick="print()">Print or save as PDF</button>
</main></body></html>`;
  }

  function invoiceText(l, inv) {
    return `Hi ${firstName(contactOf(l))},\n\nHere's the invoice for ${showLabel(l)}.\n\nInvoice ${inv.no}\n${inv.kind === 'deposit' ? 'Deposit' : inv.kind === 'balance' ? 'Balance' : 'Amount'} due: ${money(inv.amount)}\nDue: ${niceDate(inv.due) || 'on receipt'}\n${inv.link ? `\nPay by card here: ${inv.link}\n` : ''}${inv.notes ? `\n${inv.notes}\n` : ''}\nThanks!\n${LABEL.name}\n${LABEL.email}`;
  }

  // onSave(updatedLead) stores the invoice on the lead.
  function invoice(lead, onSave) {
    let l = lead;
    const dep = Number(l.deposit) || 0, bal = balanceDue(l);
    const kind0 = dep && !l.depositPaid ? 'deposit' : bal ? 'balance' : 'other';
    const box = show(`
      <div class="dfo-head"><h3>Invoice · ${esc(l.name)}</h3><button class="dfo-x" data-a="close" aria-label="Close">×</button></div>
      <div class="dfo-body">
        <div class="dfo-row">
          <label class="dfo-field"><span>Bill for</span><select data-k="kind">
            <option value="deposit">Deposit${dep ? ` (${money(dep)})` : ''}</option>
            <option value="balance">Balance${bal ? ` (${money(bal)})` : ''}</option>
            <option value="other">Other amount</option></select></label>
          <label class="dfo-field"><span>Amount ($)</span><input type="number" min="1" step="any" inputmode="decimal" data-k="amount" /></label>
          <label class="dfo-field"><span>Due</span><input type="date" data-k="due" /></label>
        </div>
        <label class="dfo-field"><span>Note on the invoice (optional)</span><input type="text" data-k="notes" placeholder="e.g. Balance due at settlement on show night" /></label>
        <div class="dfo-paybox" data-k="paybox"></div>
        <div class="dfo-status" data-k="status"></div>
      </div>
      <div class="dfo-actions">
        <button class="btn btn-gold" data-a="email">✉ Email invoice</button>
        <button class="btn btn-ghost" data-a="print">🖨 Print / PDF</button>
      </div>`);
    const $ = k => box.querySelector(`[data-k="${k}"]`);
    const status = (msg, kind) => { $('status').className = 'dfo-status' + (kind ? ' dfo-' + kind : ''); $('status').textContent = msg; };
    const current = () => {
      const kind = $('kind').value;
      return { kind, no: invoiceNo(l, kind), amount: Number($('amount').value) || 0, due: $('due').value, notes: $('notes').value.trim(), link: payLinkFor(l, kind) };
    };
    function payBox() {
      const inv = current();
      $('paybox').innerHTML = inv.link
        ? `💳 Card payment link ready: <a href="${esc(inv.link)}" target="_blank" rel="noopener">${esc(inv.link)}</a>`
        : setupInfo.payments
          ? `<button class="btn btn-ghost" data-a="link">💳 Create a card payment link</button> <span class="dfo-muted">Stripe; one payment per link. When they pay, the deposit is marked received.</span>`
          : `<span class="dfo-muted">Add Stripe in Netlify (STRIPE_SECRET_KEY) to put a card payment link on invoices.</span>`;
      box.querySelector('[data-a="link"]')?.addEventListener('click', makeLink);
    }
    function fillKind() {
      const kind = $('kind').value;
      $('amount').value = kind === 'deposit' ? (dep || '') : kind === 'balance' ? (bal || '') : '';
      $('due').value = kind === 'deposit' ? (l.depositDue || '') : (l.eventDate || '');
      payBox();
    }
    function remember(inv) {
      const others = (l.invoices || []).filter(x => x.no !== inv.no);
      l = { ...l, invoices: [...others, { ...inv, at: new Date().toISOString() }] };
      onSave && onSave(l);
    }
    async function makeLink() {
      const inv = current();
      if (inv.amount < 1) return status('Enter the amount first.', 'err');
      const btn = box.querySelector('[data-a="link"]');
      btn.disabled = true; btn.textContent = 'Creating…';
      let res, data = {};
      try {
        res = await call(PAY, { method: 'POST', body: JSON.stringify({ leadId: l.id, kind: inv.kind, amount: inv.amount, invoice: inv.no, description: `${inv.kind === 'deposit' ? 'Deposit' : inv.kind === 'balance' ? 'Balance' : 'Payment'}: ${showLabel(l)}` }) });
        data = await res.json().catch(() => ({}));
      } catch { res = null; }
      if (!res || !res.ok) { btn.disabled = false; btn.textContent = '💳 Create a card payment link'; return status(data.error || 'Couldn’t create the link. Try again.', 'err'); }
      const a = acts[l.id] = { ...(acts[l.id] || {}) };
      a.links = [...(a.links || []), data.link];
      remember({ ...inv, link: data.link.url });
      status('Payment link created ✓', 'ok');
      payBox();
    }
    $('kind').value = kind0;
    fillKind();
    $('kind').addEventListener('change', fillKind);
    box.querySelector('[data-a="close"]').addEventListener('click', close);
    box.querySelector('[data-a="print"]').addEventListener('click', () => {
      const inv = current();
      if (inv.amount < 1) return status('Enter the amount first.', 'err');
      const w = window.open('', '_blank');
      if (!w) return status('Your browser blocked the invoice window. Allow pop-ups for this site.', 'err');
      w.document.write(invoiceHtml(l, inv));
      w.document.close();
      remember(inv);
    });
    box.querySelector('[data-a="email"]').addEventListener('click', () => {
      const inv = current();
      if (inv.amount < 1) return status('Enter the amount first.', 'err');
      remember(inv);
      send({ title: `Email invoice ${inv.no}`, subject: `Invoice ${inv.no}: ${showLabel(l)}`, body: invoiceText(l, inv), kind: 'invoice', lead: l, onSent: () => remember({ ...inv, sentAt: new Date().toISOString() }) });
    });
  }

  // A polite reminder for an overdue deposit, with the card link if there is one.
  function reminder(lead, onSent) {
    const link = payLinkFor(lead, 'deposit');
    const body = `Hi ${firstName(contactOf(lead))},\n\nHope all is well! A quick reminder that the ${money(lead.deposit)} deposit for ${showLabel(lead)} was due ${niceDate(lead.depositDue) || 'recently'}.${link ? `\n\nYou can pay by card here: ${link}` : ''}\n\nIf it's already on the way, thank you, and please ignore this note.\n\nThanks,\n${LABEL.name}\n${LABEL.email}`;
    send({ title: 'Deposit reminder', subject: `Deposit reminder: ${showLabel(lead)}`, body, kind: 'reminder', lead, onSent });
  }

  // ---- open dates around a booked show ----
  // Days within GAP_DAYS of the show that the same act has nothing on yet.
  function gaps(leads, lead) {
    if (!lead.eventDate) return { dates: [], text: '' };
    const players = DFCalendar.artistsOf(lead);
    const taken = new Set(leads
      .filter(o => o.id !== lead.id && o.eventDate && o.status !== 'passed' && DFCalendar.artistsOf(o).some(x => players.includes(x)))
      .map(o => o.eventDate));
    const base = parse(lead.eventDate);
    const dates = [];
    for (let off = -GAP_DAYS; off <= GAP_DAYS; off++) {
      if (!off) continue;
      const d = new Date(base); d.setDate(d.getDate() + off);
      const day = iso(d);
      if (!taken.has(day) && day >= iso(new Date())) dates.push(day);
    }
    const text = dates.length
      ? `${dates.map(niceDate).join(', ')} (around our ${niceDate(lead.eventDate)} show at ${lead.name}${lead.city ? ` in ${lead.city}` : ''})`
      : '';
    return { dates, text };
  }

  const style = document.createElement('style');
  style.textContent = `
    .dfo-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);display:none;align-items:center;justify-content:center;z-index:10000;padding:16px}
    .dfo-overlay.open{display:flex}
    .dfo-modal{background:var(--card,#131c1e);border:1px solid var(--border2,rgba(255,255,255,0.14));border-radius:var(--r2,10px);width:100%;max-width:640px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;color:var(--cream,#e8dfc8)}
    .dfo-head{display:flex;justify-content:space-between;align-items:center;padding:0.9rem 1.1rem;border-bottom:1px solid var(--border,rgba(255,255,255,0.08))}
    .dfo-head h3{margin:0;font-size:1rem}
    .dfo-x{background:none;border:0;color:var(--gray,#9aa39c);font-size:1.5rem;cursor:pointer;line-height:1}
    .dfo-body{padding:1rem 1.1rem;overflow:auto;display:flex;flex-direction:column;gap:0.75rem}
    .dfo-row{display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem}
    .dfo-field{display:flex;flex-direction:column;gap:4px;font-size:0.72rem;letter-spacing:0.06em;text-transform:uppercase;color:var(--gray,#9aa39c);min-width:0}
    .dfo-field input,.dfo-field select,.dfo-field textarea{background:var(--surface,#0e1517);border:1px solid var(--border2,rgba(255,255,255,0.14));border-radius:var(--r,8px);padding:0.55rem 0.7rem;color:var(--cream,#e8dfc8);font:inherit;font-size:0.88rem;text-transform:none;letter-spacing:0;width:100%;box-sizing:border-box}
    .dfo-field textarea{resize:vertical;line-height:1.5}
    .dfo-check{display:flex;gap:8px;align-items:center;font-size:0.82rem;color:var(--gray-light,#c9c2ae);cursor:pointer}
    .dfo-note,.dfo-muted{font-size:0.78rem;color:var(--gray,#9aa39c)}
    .dfo-note b{color:var(--cream,#e8dfc8);font-weight:500}
    .dfo-paybox{font-size:0.82rem;color:var(--gray-light,#c9c2ae);overflow-wrap:anywhere}
    .dfo-paybox a{color:var(--blue,#4a9eff)}
    .dfo-status{font-size:0.82rem;min-height:1em}
    .dfo-status.dfo-err{color:#ff8a80}
    .dfo-status.dfo-ok{color:#7ed6a0}
    .dfo-actions{display:flex;gap:8px;flex-wrap:wrap;padding:0.9rem 1.1rem;border-top:1px solid var(--border,rgba(255,255,255,0.08))}
    .dfo-badges{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}
    .dfo-badge{display:inline-block;font-size:0.68rem;line-height:1.4;padding:1px 7px;border-radius:999px;white-space:nowrap;color:var(--gray-light,#c9c2ae);border:1px solid rgba(255,255,255,0.12)}
    .dfo-b-reply{color:#7ed6a0;background:rgba(42,180,100,0.14);border-color:rgba(42,180,100,0.45)}
    .dfo-b-view{color:#9ec9ff;border-color:rgba(74,158,255,0.35)}
    .dfo-b-paid{color:#f0c060;border-color:rgba(200,146,42,0.45)}
    .dfo-b-in{color:#f0c060;border-color:rgba(200,146,42,0.35)}
    .dfo-show-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
    .dfo-show-actions .btn{padding:4px 10px;font-size:0.75rem}
    @media (max-width:768px){.dfo-row{grid-template-columns:1fr}.dfo-modal{max-height:calc(100vh - 16px)}}`;
  document.head.appendChild(style);

  window.DFOut = {
    init, setup: () => setupInfo, activity, lastReply, needsReply, handled, markSent, reconcile, badges,
    kitUrl, send, followUp, invoice, reminder, gaps, close
  };
})();
