// ============================================================
//  DRAGON FARM — EMAIL TYPO HINTS
//
//  When someone leaves an email field with a likely typo
//  ("jane@gmial.com", "x@yahoo.con"), a hint appears under it:
//  "Did you mean jane@gmail.com? Use it". It only suggests; nothing is
//  changed unless they tap it. Works on every email field on the page,
//  including ones in pop-up windows. Uses Mailcheck (vendor/mailcheck.js).
// ============================================================

(function () {
  const DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'live.com', 'msn.com',
    'me.com', 'mac.com', 'comcast.net', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'verizon.net', 'charter.net', 'cox.net',
    'protonmail.com', 'proton.me', 'ymail.com', 'rocketmail.com', 'gmx.com', 'mail.com', 'dragonfarm.net'];

  function hintFor(input) {
    let el = input.nextElementSibling;
    if (!el || !el.classList.contains('dfm-hint')) {
      el = document.createElement('div');
      el.className = 'dfm-hint';
      el.setAttribute('role', 'status');
      input.insertAdjacentElement('afterend', el);
    }
    return el;
  }

  function check(input) {
    const value = input.value.trim();
    const clear = () => { const h = input.nextElementSibling; if (h && h.classList.contains('dfm-hint')) h.remove(); };
    if (!value || !value.includes('@')) return clear();
    Mailcheck.run({
      email: value,
      domains: DOMAINS,
      suggested(s) {
        const el = hintFor(input);
        el.innerHTML = '';
        el.append('Did you mean ');
        const b = document.createElement('b'); b.textContent = s.full; el.append(b);
        el.append('? ');
        const use = document.createElement('button');
        use.type = 'button'; use.className = 'dfm-use'; use.textContent = 'Use it';
        use.addEventListener('mousedown', e => e.preventDefault());
        use.addEventListener('click', () => {
          input.value = s.full;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          clear();
          input.focus();
        });
        el.append(use);
      },
      empty: clear
    });
  }

  // Checked a moment after typing stops, and just after leaving the field, so
  // the hint never moves the page in the middle of a tap on the next control.
  const timers = new WeakMap();
  const later = (input, ms) => { clearTimeout(timers.get(input)); timers.set(input, setTimeout(() => check(input), ms)); };
  const isEmail = t => t instanceof HTMLInputElement && t.type === 'email';
  document.addEventListener('input', e => { if (isEmail(e.target)) later(e.target, 700); });
  document.addEventListener('focusout', e => { if (isEmail(e.target)) later(e.target, 300); });

  const style = document.createElement('style');
  style.textContent = `
    .dfm-hint{font-size:0.8rem;color:#f0c060;margin-top:4px}
    .dfm-hint b{font-weight:600}
    .dfm-use{background:none;border:0;padding:0;color:#4a9eff;text-decoration:underline;cursor:pointer;font:inherit}`;
  document.head.appendChild(style);

  window.DFMailcheck = { check };
})();
