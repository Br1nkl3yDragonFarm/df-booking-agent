// ============================================================
//  DRAGON FARM CRM — OFFERS & CONTRACTS
//
//  Deal fields on a venue lead:
//    dealType        'guarantee' | 'door' | 'vs' | 'ticketbuy' | ''
//    guarantee       dollars promised (flat, or the floor in a "vs" deal)
//    doorPct         our share of the door, in percent
//    expensesListed  true once the venue's expenses are itemized in writing
//    deposit, depositDue (YYYY-MM-DD), depositPaid
//    contract        '' (none yet) | 'reviewing' (received, not signed) | 'signed'
//
//  The warnings follow the venue-booking playbook: "after expenses" with
//  no expense list, ticket buys, and verbal-only deals are red flags.
// ============================================================

(function () {
  const TYPES = {
    guarantee: 'Flat guarantee',
    door: 'Door deal',
    vs: 'Guarantee vs. %',
    ticketbuy: 'Ticket buy / pay-to-play'
  };
  const CONTRACTS = { '': 'No contract yet', reviewing: 'Contract received, reviewing', signed: 'Contract signed' };

  function money(n) {
    const v = Number(n) || 0;
    return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function shortDate(date) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function hasDeal(l) { return !!(l.dealType || l.guarantee || l.deposit || l.contract); }

  // One line, e.g. "$500 guarantee vs. 70% of the door".
  function terms(l) {
    const g = Number(l.guarantee) || 0, pct = Number(l.doorPct) || 0;
    switch (l.dealType) {
      case 'guarantee': return g ? `${money(g)} flat guarantee` : 'Flat guarantee, amount not set';
      case 'door': return pct ? `${pct}% of the door` : 'Door deal, split not set';
      case 'vs': return `${g ? money(g) : '$?'} guarantee vs. ${pct ? pct + '%' : '?%'} of the door, whichever is more`;
      case 'ticketbuy': return 'Ticket buy (we pre-buy tickets)';
      default: return g ? `${money(g)} guarantee` : '';
    }
  }

  function depositLine(l) {
    if (!Number(l.deposit)) return '';
    if (l.depositPaid) return `Deposit ${money(l.deposit)} received`;
    return `Deposit ${money(l.deposit)}${l.depositDue ? ` due ${shortDate(l.depositDue)}` : ''}`;
  }

  // [{ level: 'red' | 'amber', text }]
  function issues(l) {
    const out = [];
    const booked = l.status === 'booked';
    if (l.dealType === 'ticketbuy') out.push({ level: 'red', text: 'Ticket buy: we carry the risk. Needs a real reason and sign-off.' });
    if ((l.dealType === 'door' || l.dealType === 'vs') && !l.expensesListed) out.push({ level: 'red', text: '"After expenses" with no expense list in writing' });
    if (booked && l.contract !== 'signed') out.push({ level: 'red', text: l.contract === 'reviewing' ? 'Booked, but the contract isn’t signed yet' : 'Booked with no contract: get it in writing' });
    if (booked && !l.dealType && !Number(l.guarantee)) out.push({ level: 'amber', text: 'Booked with no deal terms recorded' });
    if ((l.dealType === 'guarantee' || l.dealType === 'vs') && !Number(l.guarantee)) out.push({ level: 'amber', text: 'Guarantee amount missing' });
    if ((l.dealType === 'door' || l.dealType === 'vs') && !Number(l.doorPct)) out.push({ level: 'amber', text: 'Door split missing' });
    if (Number(l.deposit) && !l.depositPaid && l.depositDue && l.depositDue < today()) out.push({ level: 'red', text: `Deposit overdue since ${shortDate(l.depositDue)}` });
    return out;
  }

  function issuesHtml(l) {
    return issues(l).map(i => `<div class="deal-flag deal-flag-${i.level}">${i.level === 'red' ? '🚩' : '⚠'} ${esc(i.text)}</div>`).join('');
  }

  // Compact block for a show card.
  function card(l) {
    if (!hasDeal(l) && l.status !== 'booked') return '';
    const parts = [terms(l), depositLine(l), CONTRACTS[l.contract || '']].filter(Boolean);
    return `<div class="deal-line">${parts.map(esc).join(' · ')}</div>${issuesHtml(l)}`;
  }

  // Totals across booked shows still to come.
  function totals(leads) {
    const t = today();
    const shows = leads.filter(l => l.status === 'booked' && (!l.eventDate || l.eventDate >= t));
    return {
      shows: shows.length,
      guaranteed: shows.reduce((s, l) => s + (l.dealType === 'door' || l.dealType === 'ticketbuy' ? 0 : Number(l.guarantee) || 0), 0),
      depositsOwed: shows.reduce((s, l) => s + (Number(l.deposit) && !l.depositPaid ? Number(l.deposit) : 0), 0),
      unsigned: shows.filter(l => l.contract !== 'signed').length
    };
  }

  // ---- form helpers: ids are prefix + '-deal-type' etc. ----
  const FIELDS = { dealType: 'deal-type', guarantee: 'deal-guarantee', doorPct: 'deal-door', deposit: 'deal-deposit', depositDue: 'deal-deposit-due', contract: 'deal-contract' };
  const CHECKS = { expensesListed: 'deal-expenses', depositPaid: 'deal-deposit-paid' };

  function fill(prefix, l) {
    Object.entries(FIELDS).forEach(([k, id]) => { document.getElementById(`${prefix}-${id}`).value = l[k] ?? ''; });
    Object.entries(CHECKS).forEach(([k, id]) => { document.getElementById(`${prefix}-${id}`).checked = !!l[k]; });
    document.getElementById(`${prefix}-deal`).open = hasDeal(l) || ['interested', 'booked'].includes(l.status);
    sync(prefix);
  }

  function read(prefix) {
    const v = id => document.getElementById(`${prefix}-${id}`).value;
    const num = id => { const n = parseFloat(v(id)); return Number.isFinite(n) ? n : ''; };
    return {
      dealType: v(FIELDS.dealType),
      guarantee: num(FIELDS.guarantee),
      doorPct: num(FIELDS.doorPct),
      deposit: num(FIELDS.deposit),
      depositDue: v(FIELDS.depositDue),
      contract: v(FIELDS.contract),
      expensesListed: document.getElementById(`${prefix}-${CHECKS.expensesListed}`).checked,
      depositPaid: document.getElementById(`${prefix}-${CHECKS.depositPaid}`).checked
    };
  }

  // Show only the inputs that apply to the chosen deal type, and live warnings.
  function sync(prefix) {
    const type = document.getElementById(`${prefix}-${FIELDS.dealType}`).value;
    const show = (id, on) => { document.getElementById(`${prefix}-${id}`).closest('.field').style.display = on ? '' : 'none'; };
    show(FIELDS.guarantee, type === 'guarantee' || type === 'vs' || type === '');
    show(FIELDS.doorPct, type === 'door' || type === 'vs');
    document.getElementById(`${prefix}-${CHECKS.expensesListed}`).closest('.deal-check').style.display = (type === 'door' || type === 'vs') ? '' : 'none';
    const status = document.getElementById(`${prefix}-status`);
    if (status && status.value === 'booked') document.getElementById(`${prefix}-deal`).open = true;
    const preview = { ...read(prefix), status: status ? status.value : '' };
    document.getElementById(`${prefix}-deal-flags`).innerHTML = issuesHtml(preview);
  }

  function wire(prefix) {
    const ids = [...Object.values(FIELDS), ...Object.values(CHECKS)].map(id => `${prefix}-${id}`).concat(`${prefix}-status`);
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) ['input', 'change'].forEach(ev => el.addEventListener(ev, () => sync(prefix)));
    });
  }

  const style = document.createElement('style');
  style.textContent = `
    .deal-box{border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:var(--r,8px);padding:0.25rem 0.9rem}
    .deal-box[open]{padding-bottom:0.9rem}
    .deal-box summary{cursor:pointer;padding:0.6rem 0;font-family:var(--font-m,monospace);font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--gold-light,#f0c060)}
    .deal-box .deal-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.75rem 1rem}
    .deal-check{display:flex;align-items:center;gap:8px;font-size:0.82rem;color:var(--gray-light,#c9c2ae);cursor:pointer}
    .deal-check input{width:16px;height:16px;accent-color:var(--green,#2ab464)}
    .deal-line{font-size:0.78rem;color:var(--gray-light,#c9c2ae);margin-top:4px}
    .deal-flag{font-size:0.74rem;margin-top:3px}
    .deal-flag-red{color:#ff8a80}
    .deal-flag-amber{color:#f0c060}
    #lead-deal-flags:not(:empty){margin-top:0.75rem}
    .deal-totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.75rem;margin-bottom:1rem}
    .deal-total{background:var(--card,#131c1e);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:var(--r2,10px);padding:0.75rem 1rem}
    .deal-total b{display:block;font-size:1.3rem;color:var(--cream,#e8dfc8);font-weight:500}
    .deal-total span{font-size:0.72rem;color:var(--gray,#9aa39c)}
    @media (max-width:768px){.deal-box .deal-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);

  window.DFDeals = { TYPES, CONTRACTS, money, terms, issues, card, totals, fill, read, sync, wire };
})();
