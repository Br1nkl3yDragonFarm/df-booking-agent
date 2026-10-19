// ============================================================
//  DRAGON FARM RECORDS — BOOKING HUB
//  app.js
// ============================================================

// ---- NAV ----
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');

hamburger.addEventListener('click', () => {
  const open = mobileMenu.classList.toggle('open');
  hamburger.setAttribute('aria-expanded', String(open));
});
mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  mobileMenu.classList.remove('open');
  hamburger.setAttribute('aria-expanded', 'false');
}));

// ---- BOOKING FORM ----
const bookingForm = document.getElementById('booking-form');
const submitBtn = document.getElementById('submit-btn');
const formSuccess = document.getElementById('form-success');
const artistSelect = document.getElementById('bf-artist');
const typeSelect = document.getElementById('bf-type');

// "Book this act" and "Ask about licensing" links pre-fill the form.
document.querySelectorAll('a[data-artist], a[data-event-type]').forEach(link => {
  link.addEventListener('click', () => {
    if (link.dataset.artist) artistSelect.value = link.dataset.artist;
    if (link.dataset.eventType) typeSelect.value = link.dataset.eventType;
    updatePoster();
  });
});

// ---- LIVE POSTER ----
// The poster beside the form fills in with the venue, city and date.
const poster = document.getElementById('poster-live');
const posterPart = name => poster.querySelector(`[data-poster="${name}"]`);
function setSlot(name, value, blank) {
  const slot = posterPart(name);
  const text = slot.querySelector('span');
  const filled = Boolean(value);
  const next = filled ? value : blank;
  if (text.textContent === next) return;
  text.textContent = next;
  slot.classList.toggle('is-set', filled);
  if (filled) {
    slot.classList.remove('stamp');
    void slot.offsetWidth; // restart the stamp animation
    slot.classList.add('stamp');
  }
}

function formatDate(value) {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

function updatePoster() {
  setSlot('venue', document.getElementById('bf-org').value.trim(), 'Your venue');
  setSlot('city', document.getElementById('bf-location').value.trim(), 'Your city');
  setSlot('date', formatDate(document.getElementById('bf-date').value), 'Your date');
}

bookingForm.addEventListener('input', updatePoster);
bookingForm.addEventListener('change', updatePoster);

bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('bf-name').value;
  const org = document.getElementById('bf-org').value;
  const email = document.getElementById('bf-email').value;
  const artist = artistSelect.value;
  const type = typeSelect.value;
  const date = document.getElementById('bf-date').value;
  const budget = document.getElementById('bf-budget').value;
  const location = document.getElementById('bf-location').value;
  const details = document.getElementById('bf-details').value;

  submitBtn.textContent = 'Sending…';
  submitBtn.disabled = true;

  // Email version of the inquiry, used if the form service can't be reached
  const subject = encodeURIComponent(`Booking Inquiry — ${artist} · ${org}`);
  const body = encodeURIComponent(
    `BOOKING INQUIRY — Dragon Farm Records\n\n` +
    `From: ${name}\nOrganization: ${org}\nEmail: ${email}\n` +
    `Phone: ${document.getElementById('bf-phone').value || 'N/A'}\n\n` +
    `Artist Requested: ${artist}\nEvent Type: ${type}\n` +
    `Event Date: ${date || 'TBD'}\nBudget: ${budget || 'Not specified'}\n` +
    `Location: ${location || 'N/A'}\n\n` +
    `Details:\n${details}`
  );

  const mailtoLink = `mailto:booking@dragonfarm.net?subject=${subject}&body=${body}`;
  const successText = document.getElementById('form-success-text');

  // Send through Netlify Forms; if that fails, open the visitor's email app instead.
  let sent = false;
  try {
    const res = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(bookingForm)).toString()
    });
    sent = res.ok;
  } catch (err) {
    sent = false;
  }
  if (sent) {
    successText.textContent = "Inquiry sent. We'll reply within 48 hours.";
    bookingForm.reset();
    updatePoster();
  } else {
    successText.textContent = 'Your email app should open with the inquiry filled in. Press send there. If it doesn’t open, email booking@dragonfarm.net.';
    window.location.href = mailtoLink;
  }

  submitBtn.textContent = 'Send inquiry';
  submitBtn.disabled = false;
  formSuccess.classList.add('show');
  setTimeout(() => formSuccess.classList.remove('show'), 8000);
});
