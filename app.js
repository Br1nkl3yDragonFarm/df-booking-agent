// ============================================================
//  DRAGON FARM RECORDS — BOOKING HUB
//  app.js
// ============================================================

// ---- NAV ----
// The mobile menu is handled by the inline script in index.html.

// Scroll nav highlight
window.addEventListener('scroll', () => {
  const nav = document.getElementById('nav');
  if (window.scrollY > 60) {
    nav.style.background = 'rgba(8, 12, 9, 0.97)';
  } else {
    nav.style.background = 'rgba(8, 12, 9, 0.9)';
  }
});

// ---- BOOKING FORM ----
const bookingForm = document.getElementById('booking-form');
const submitBtn = document.getElementById('submit-btn');
const formSuccess = document.getElementById('form-success');

bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('bf-name').value;
  const org = document.getElementById('bf-org').value;
  const email = document.getElementById('bf-email').value;
  const artist = document.getElementById('bf-artist').value;
  const type = document.getElementById('bf-type').value;
  const date = document.getElementById('bf-date').value;
  const budget = document.getElementById('bf-budget').value;
  const location = document.getElementById('bf-location').value;
  const details = document.getElementById('bf-details').value;

  submitBtn.textContent = 'Sending...';
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
    successText.textContent = "✅ Your inquiry has been sent! We'll be in touch within 48 hours.";
    bookingForm.reset();
  } else {
    successText.textContent = '✉️ Your email app should open with the inquiry filled in. Just press send. If it doesn’t, email booking@dragonfarm.net.';
    window.location.href = mailtoLink;
  }

  submitBtn.textContent = 'Send Booking Inquiry →';
  submitBtn.disabled = false;
  formSuccess.classList.add('show');
  setTimeout(() => formSuccess.classList.remove('show'), 8000);
});
