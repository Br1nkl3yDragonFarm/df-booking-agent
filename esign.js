// ============================================================
//  DRAGON FARM CRM — SEND AGREEMENTS FOR SIGNATURE
//
//  Writes the agreement from the lead (performance agreement for shows,
//  partnership agreement for brands; the sync page passes its one-stop
//  license), lets you edit it, then makes a private signing link
//  (netlify/functions/sign.mjs). The other side signs on sign.html; the
//  lead then shows "✅ Signed" with the PDF, and the deal is marked signed.
//
//  Templates to start from, not legal advice: have an attorney look over
//  the first of each kind.
//  Needs outreach.js (DFOut) and, for shows, deals.js (DFDeals).
// ============================================================

(function () {
  const API = '/.netlify/functions/sign';
  const SIGNER_KEY = 'df_label_signer';
  const LABEL = 'Dragon Farm Records, Nashville, TN (booking@dragonfarm.net)';

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const money = n => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  function longDate(date) {
    if (!date) return '';
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  const blank = '______________';
  const or = (v, fallback = blank) => (v ? String(v) : fallback);

  function venueText(l) {
    const artist = l.artist && l.artist !== 'Both' ? l.artist : 'Timothy Chance and Rasta Country';
    const terms = window.DFDeals ? DFDeals.terms(l) : '';
    const dep = Number(l.deposit) || 0;
    return [
      `This agreement is between ${LABEL} for the artist ${artist} ("Artist") and ${or(l.name)}${l.contactName ? `, represented by ${l.contactName}` : ''} ("Venue").`,
      '',
      `1. Show. ${artist} performs at ${or(l.name)}${l.address ? `, ${l.address}` : l.city ? `, ${l.city}` : ''} on ${or(longDate(l.eventDate))}. Load-in ${or(l.loadIn)}; set time ${or(l.setTime)}; set length ${l.setLength ? `${l.setLength} minutes` : blank}.`,
      `2. Pay. ${or(terms)}.${l.expensesListed ? ' Any venue expenses taken before a door split are itemized in writing before the show.' : ''}`,
      dep ? `3. Deposit. ${money(dep)} is due by ${or(longDate(l.depositDue))}. The balance is paid in full at settlement on the night of the show.` : '3. Payment. Paid in full at settlement on the night of the show.',
      `4. Sound and backline. ${or(l.sound, 'Venue provides a working PA, monitors and a sound engineer')}.`,
      `5. Hospitality. ${or(l.hospitality, 'As agreed')}.`,
      '6. Cancellation. If Venue cancels within 14 days of the show, the deposit is kept and the full guarantee is owed. If Artist cancels, any deposit is returned in full. Neither side owes anything if the show can\'t happen because of severe weather, a natural disaster or a government order.',
      '7. Merchandise and recording. Artist sells merchandise and keeps 100% of merch sales. No one may record the performance for commercial use without both sides\' written permission.',
      '8. Radius. None, unless written here: ______________',
      `9. Day-of contact. ${or([l.dayContact, l.dayPhone].filter(Boolean).join(', '))}.`,
      '10. Each side is responsible for its own people and equipment. This is the whole agreement; changes must be in writing and accepted by both sides.'
    ].join('\n');
  }

  function brandText(l) {
    return [
      `This agreement is between ${LABEL} for the artist Timothy Chance and Rasta Country ("Artist") and ${or(l.name)}${l.contact ? `, represented by ${l.contact}` : ''} ("Brand").`,
      '',
      `1. What we'll do together. ${or(l.offer, blank)}. Details: ${blank}`,
      `2. Pay. ${l.payType === 'product' ? 'Product as described above' : l.payType === 'both' ? 'The fee and product described above' : 'The fee described above'}, paid within 30 days of the content going live or the event.`,
      `3. Term. ${or(l.term)}.`,
      `4. Exclusivity. ${l.exclusivity === 'none' || !l.exclusivity ? 'None.' : 'Artist won\'t partner with a direct competitor in the Brand\'s category during the term above, and not after it.'}`,
      '5. Use of name, image and music. Brand may use the Artist\'s name, approved photos and the content made under this agreement for this campaign, during the term only. Any other use of the Artist\'s name, likeness or music needs a new written agreement. Licensing a song for an ad is a separate sync license.',
      '6. Creative control. Artist creates the content in their own voice. Brand may review it for accuracy and legal claims before it goes live; Artist won\'t be asked to say anything untrue.',
      '7. Disclosure. Sponsored posts are labeled as paid partnerships as the law and the platforms require.',
      '8. Either side may end this agreement with written notice if the other breaks it. Fees for work already delivered are still owed. This is the whole agreement; changes must be in writing.'
    ].join('\n');
  }

  async function call(body) {
    const go = () => fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-df-passcode': DFStore.passcode() }, body: JSON.stringify(body) });
    let res = await go();
    if (res.status === 401 && DFStore.askPasscode()) res = await go();
    return res;
  }

  const emailOf = l => l.contactEmail || l.email || '';
  const contactOf = l => l.contactName || l.contact || '';
  const firstName = s => String(s || '').split(/[\s(]/)[0] || 'there';

  // opts: { lead, list: 'venue'|'sync'|'brand', title, text, onChange() }
  function open(opts) {
    const l = opts.lead;
    let signer = '';
    try { signer = localStorage.getItem(SIGNER_KEY) || ''; } catch {}
    const box = DFOut.show(`
      <div class="dfo-head"><h3>Send for signature · ${esc(l.name)}</h3><button class="dfo-x" data-a="close" aria-label="Close">×</button></div>
      <div class="dfo-body">
        <label class="dfo-field"><span>Title</span><input type="text" data-k="title" value="${esc(opts.title)}" /></label>
        <label class="dfo-field"><span>Agreement (edit anything before sending; fill the blanks)</span><textarea data-k="text" rows="14">${esc(opts.text)}</textarea></label>
        <div class="dfo-row">
          <label class="dfo-field"><span>Who signs for them</span><input type="text" data-k="signerName" value="${esc(contactOf(l))}" /></label>
          <label class="dfo-field"><span>Their email</span><input type="email" data-k="signerEmail" value="${esc(emailOf(l))}" /></label>
        </div>
        <label class="dfo-field"><span>Signing for Dragon Farm Records (your full name)</span><input type="text" data-k="labelSigner" value="${esc(signer)}" placeholder="Timothy Chance" /></label>
        <div class="dfo-note">They get a private link, read the agreement, draw their signature and sign. You both get the signed PDF by email${DFOut.setup().email ? '' : ' once sending is set up'}, and it stays on the lead. This is a template to start from, not legal advice; have an attorney look over the first of each kind.</div>
        <div class="dfo-status" data-k="status"></div>
      </div>
      <div class="dfo-actions"><button class="btn btn-gold" data-a="create">✍ Create signing link</button></div>`);
    const $ = k => box.querySelector(`[data-k="${k}"]`);
    const status = (m, k) => { $('status').className = 'dfo-status' + (k ? ' dfo-' + k : ''); $('status').textContent = m; };
    box.querySelector('[data-a="close"]').addEventListener('click', DFOut.close);
    box.querySelector('[data-a="create"]').addEventListener('click', async e => {
      const body = { action: 'create', list: opts.list, leadId: l.id, title: $('title').value.trim(), text: $('text').value, signerName: $('signerName').value.trim(), signerEmail: $('signerEmail').value.trim(), labelSigner: $('labelSigner').value.trim() };
      if (/_{6,}/.test(body.text) && !confirm('The agreement still has blanks (______). Send it anyway? They can be filled in by hand only if you print it.')) return;
      e.target.disabled = true; e.target.textContent = 'Creating…';
      let res, data = {};
      try { res = await call(body); data = await res.json().catch(() => ({})); } catch { res = null; }
      e.target.disabled = false; e.target.textContent = '✍ Create signing link';
      if (!res || !res.ok) return status(data.error || 'Couldn’t create the link. Try again.', 'err');
      try { localStorage.setItem(SIGNER_KEY, body.labelSigner); } catch {}
      DFOut.remember(l.id, a => ({ ...a, signs: [...(a.signs || []), data.entry] }));
      opts.onChange && opts.onChange();
      DFOut.send({
        to: body.signerEmail,
        subject: `Please sign: ${body.title}`,
        body: `Hi ${firstName(body.signerName)},\n\nHere's the agreement for ${body.title.replace(/^.*?:\s*/, '')}. You can read it and sign on your phone or computer here:\n\n${data.url}\n\nIt takes about a minute. You'll both get the signed copy by email.\n\nThanks!\nDragon Farm Records`,
        kind: 'other', lead: l
      });
    });
  }

  window.DFSign = { open, venueText, brandText };
})();
