// Exhibit 03 — a booking and follow-up system, simulated in the browser.
// Nothing is sent anywhere: the "customer's phone" is drawn on the page.

const BUSINESSES = {
  contractor: {
    request: 'Can someone look at a leaking shower this week?',
    service: 'Leak inspection',
    slots: ['Tue 8:00', 'Tue 1:00', 'Wed 10:00', 'Thu 8:00', 'Thu 3:00', 'Fri 9:00'],
    taken: [0, 3], pick: 2,
    remind: 'Reminder: your leak inspection is tomorrow at 10:00. Reply C to confirm or R to reschedule.',
    review: 'Thanks for having us out, Jordan! If we did right by you, would you leave a quick review?',
  },
  salon: {
    request: 'Do you have anything Saturday morning for a cut and color?',
    service: 'Cut & color',
    slots: ['Sat 9:00', 'Sat 9:30', 'Sat 10:30', 'Sat 11:00', 'Sat 1:00', 'Sat 2:30'],
    taken: [0, 1, 3], pick: 2,
    remind: 'See you tomorrow at 10:30 for your cut & color! Reply C to confirm.',
    review: 'Loved having you in the chair, Jordan. Would you share a quick review?',
  },
  studio: {
    request: 'Looking to book two hours of studio time next week.',
    service: '2-hour studio session',
    slots: ['Mon 6:00p', 'Tue 7:00p', 'Wed 6:00p', 'Thu 6:00p', 'Thu 8:00p', 'Fri 5:00p'],
    taken: [1, 2], pick: 3,
    remind: 'Your studio session is tomorrow at 6:00 pm. Bring your stems on a drive!',
    review: 'Great session, Jordan. Got a minute to leave us a review?',
  },
  restaurant: {
    request: 'Can we get a table for 8 on Friday night?',
    service: 'Table for 8',
    slots: ['Fri 5:30', 'Fri 6:00', 'Fri 6:30', 'Fri 7:00', 'Fri 7:30', 'Fri 8:00'],
    taken: [1, 2, 4], pick: 3,
    remind: 'Looking forward to seeing your party of 8 tomorrow at 7:00!',
    review: 'Thanks for dining with us, Jordan! How did we do?',
  },
  realestate: {
    request: 'Can I see the 3-bedroom listing this weekend?',
    service: 'Private showing',
    slots: ['Sat 10:00', 'Sat 11:00', 'Sat 1:00', 'Sun 12:00', 'Sun 2:00', 'Sun 3:00'],
    taken: [0, 3], pick: 4,
    remind: 'Reminder: your showing is tomorrow at 2:00. Reply C to confirm.',
    review: 'Thanks for touring with us, Jordan. Any questions about the home?',
  },
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function init(stage, { reduceMotion }) {
  const section = stage.closest('.exhibit');
  const consoleEl = section.querySelector('[data-demo="booking-console"]');
  const runBtn = section.querySelector('[data-lab-run]');
  const runLabel = runBtn?.querySelector('span');
  const requestEl = section.querySelector('[data-lab-request]');
  const nodes = Object.fromEntries([...stage.querySelectorAll('.flow__node')].map((n) => [n.dataset.step, n]));
  const screen = stage.querySelector('[data-phone-screen]');
  const log = stage.querySelector('[data-lab-log]');
  let biz = BUSINESSES.contractor;
  let runId = 0;

  const reset = () => {
    runId++;
    Object.values(nodes).forEach((n) => n.classList.remove('is-active', 'is-done'));
    screen.replaceChildren(el('p', 'phone__idle', 'Your customer&rsquo;s phone'));
    log.replaceChildren();
    runBtn.disabled = false;
    if (runLabel) runLabel.textContent = 'Send a test inquiry';
  };

  consoleEl?.addEventListener('change', (e) => {
    if (e.target.name !== 'lab-biz') return;
    biz = BUSINESSES[e.target.value] || BUSINESSES.contractor;
    requestEl.textContent = `“${biz.request}”`;
    reset();
  });

  const pace = () => (reduceMotion.matches ? 350 : 1050);
  const write = (when, text) => {
    const li = el('li');
    li.append(el('time', null, esc(when)), el('span', null, esc(text)));
    log.append(li);
    log.parentElement.scrollTop = log.parentElement.scrollHeight;
  };
  const show = (node) => { screen.querySelector('.phone__idle')?.remove(); screen.append(node); while (screen.children.length > 4) screen.firstElementChild.remove(); };

  const steps = [
    ['form', 'just now', () => `Inquiry received from Jordan: “${biz.request}”`, null],
    ['crm', '+1 sec', () => 'Jordan added to your customer list as a new lead', null],
    ['reply', '+5 sec', () => 'Instant reply sent with your booking link', () => el('div', 'msg msg--mail',
      `<b>From: Your business</b>Thanks, Jordan! We got your message about: ${esc(biz.service.toLowerCase())}. Pick a time that works for you:<br><span class="msg__btn">Choose a time</span>`)],
    ['pick', '+3 min', () => `Jordan picked ${biz.slots[biz.pick]}`, () => {
      const box = el('div', 'msg msg--mail', `<b>${esc(biz.service)} · open times</b>`);
      const grid = el('div', 'slots');
      biz.slots.forEach((s, i) => grid.append(el('span', biz.taken.includes(i) ? 'is-taken' : i === biz.pick ? 'is-picked' : '', esc(s))));
      box.append(grid);
      return box;
    }],
    ['book', '+3 min', () => `Booked on your calendar: ${biz.service}, ${biz.slots[biz.pick]}. Confirmation sent`, () => el('div', 'msg msg--cal',
      `<b>✓ Booked</b><br>${esc(biz.service)}<br>${esc(biz.slots[biz.pick])} · added to your calendar`)],
    ['remind', 'day before', () => 'Reminder text sent', () => el('div', 'msg msg--sms', `<b>Text message</b>${esc(biz.remind)}`)],
    ['review', 'after visit', () => 'Thank-you and review request sent. Lead marked “won”', () => el('div', 'msg msg--sms', `<b>Text message</b>${esc(biz.review)}<br><span class="stars" aria-hidden="true">★★★★★</span>`)],
  ];

  runBtn?.addEventListener('click', async () => {
    reset();
    const id = runId;
    runBtn.disabled = true;
    if (runLabel) runLabel.textContent = 'Running…';
    for (const [key, when, text, phone] of steps) {
      if (id !== runId) return;
      const node = nodes[key];
      node.classList.add('is-active');
      await wait(pace() * 0.55);
      if (id !== runId) return;
      if (phone) show(phone());
      write(when, text());
      await wait(pace() * 0.45);
      if (id !== runId) return;
      node.classList.remove('is-active');
      node.classList.add('is-done');
    }
    runBtn.disabled = false;
    if (runLabel) runLabel.textContent = 'Run it again';
  });

  /* follow-up time calculator: the visitor's own arithmetic */
  const calc = section.querySelector('[data-calc]');
  if (calc) {
    const n = calc.querySelector('[data-calc-n]');
    const m = calc.querySelector('[data-calc-m]');
    const out = calc.querySelector('[data-calc-out]');
    const update = () => {
      const perWeek = Math.max(0, Math.min(500, Number(n.value) || 0));
      const minutes = Math.max(0, Math.min(240, Number(m.value) || 0));
      const hours = (perWeek * minutes * 52) / 12 / 60;
      out.textContent = hours === 0 ? 'no time at all — nice'
        : hours < 1 ? `about ${Math.round(hours * 60)} minutes a month`
        : `about ${hours < 10 ? hours.toFixed(1).replace(/\.0$/, '') : Math.round(hours)} hours a month`;
    };
    calc.addEventListener('input', update);
    calc.addEventListener('submit', (e) => e.preventDefault());
    update();
  }
}
