// ============================================================
//  DRAGON FARM — PHONE NUMBERS
//
//  Tidies phone numbers as they're typed ("6153213340" -> "(615) 321-3340";
//  international numbers keep their +country code), flags ones that can't
//  be a real number, and makes call and text links that work on any phone.
//  Uses libphonenumber-js (vendor/libphonenumber.js). US is the default
//  country when a number has no +code.
// ============================================================

(function () {
  const COUNTRY = 'US';
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function parse(raw) {
    const s = String(raw || '').trim();
    if (!s || !window.libphonenumber) return null;
    try { return libphonenumber.parsePhoneNumberFromString(s, COUNTRY) || null; } catch { return null; }
  }

  // How to show it: national format at home, international otherwise. Unparseable input is left alone.
  function format(raw) {
    const p = parse(raw);
    if (!p || !p.isPossible()) return String(raw || '').trim();
    return p.country === COUNTRY || (!p.country && p.countryCallingCode === '1') ? p.formatNational() : p.formatInternational();
  }

  // "tel:+16153213340" (or a best-effort digits-only link when it can't be parsed).
  function tel(raw) {
    const p = parse(raw);
    if (p && p.isPossible()) return p.getURI();
    const digits = String(raw || '').replace(/[^\d+]/g, '');
    return digits.length >= 7 ? `tel:${digits}` : '';
  }
  const sms = raw => { const t = tel(raw); return t ? t.replace(/^tel:/, 'sms:').replace(/;ext=.*$/, '') : ''; };

  // "📞 (615) 321-3340 · Text" links, or the raw text if it isn't a number.
  function links(raw) {
    if (!raw) return '';
    const t = tel(raw);
    if (!t) return esc(raw);
    return `<a href="${esc(t)}" onclick="event.stopPropagation()">📞 ${esc(format(raw))}</a> · <a href="${esc(sms(raw))}" onclick="event.stopPropagation()">Text</a>`;
  }

  function hint(input, text) {
    let el = input.nextElementSibling;
    const has = el && el.classList.contains('dfp-hint');
    if (!text) { if (has) el.remove(); return; }
    if (!has) { el = document.createElement('div'); el.className = 'dfp-hint'; el.setAttribute('role', 'status'); input.insertAdjacentElement('afterend', el); }
    el.textContent = text;
  }

  function tidy(input) {
    const v = input.value.trim();
    if (!v) return hint(input, '');
    const p = parse(v);
    if (!p || !p.isPossible()) return hint(input, 'Check this number: it looks too short or too long.');
    const f = format(v);
    if (f !== input.value) {
      input.value = f;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    hint(input, '');
  }

  // Shortly after leaving the field, so nothing moves in the middle of a tap.
  document.addEventListener('focusout', e => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type === 'tel') setTimeout(() => tidy(t), 300);
  });

  const style = document.createElement('style');
  style.textContent = '.dfp-hint{font-size:0.8rem;color:#f0c060;margin-top:4px}';
  document.head.appendChild(style);

  window.DFPhone = { format, tel, sms, links, tidy };
})();
