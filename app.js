// ============================================================
//  DRAGON FARM RECORDS — BOOKING HUB
//  app.js
// ============================================================

// ---- NAV ----
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');

hamburger.addEventListener('click', () => {
  mobileMenu.classList.toggle('open');
});

mobileMenu.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => mobileMenu.classList.remove('open'));
});

// Scroll nav highlight
window.addEventListener('scroll', () => {
  const nav = document.getElementById('nav');
  if (window.scrollY > 60) {
    nav.style.background = 'rgba(8, 12, 9, 0.97)';
  } else {
    nav.style.background = 'rgba(8, 12, 9, 0.9)';
  }
});

// ---- ANTHROPIC API HELPER ----
async function askClaude(systemPrompt, userMessage) {
  const key = (typeof DRAGON_FARM_CONFIG !== 'undefined') ? DRAGON_FARM_CONFIG.ANTHROPIC_API_KEY : '';
  if (!key || key === 'YOUR_API_KEY_HERE') {
    return '⚠️ Please add your Anthropic API key to config.js to enable AI features.';
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return `API error: ${err.error?.message || response.statusText}`;
    }

    const data = await response.json();
    return data.content?.[0]?.text || 'No response received.';
  } catch (err) {
    return `Error connecting to AI: ${err.message}`;
  }
}

// ---- VENUE FINDER ----
const findVenuesBtn = document.getElementById('find-venues-btn');
const finderResults = document.getElementById('finder-results');

findVenuesBtn.addEventListener('click', async () => {
  const city = document.getElementById('vf-city').value.trim();
  const genre = document.getElementById('vf-genre').value;
  const type = document.getElementById('vf-type').value;

  if (!city) {
    showFinderMessage('Please enter a city or state to search.', 'warn');
    return;
  }

  finderResults.innerHTML = `
    <div class="finder-loading">
      <div class="spinner"></div>
      <span>Searching for ${type || 'venues'} in ${city}${genre ? ` · ${genre}` : ''}...</span>
    </div>`;

  const systemPrompt = `You are a music industry booking agent assistant for Dragon Farm Records, an independent multi-genre label based in Nashville, TN. 
The label has two artists:
1. Timothy Chance and Rasta Country — Country-Reggae fusion
2. Poetic Nocturnal Creatures — Conscious Hip-Hop

Your job is to provide venue suggestions, including realistic booking contacts and tips. 
Respond ONLY with a valid JSON array. No extra text, no markdown fences.
Each venue object must have these fields:
- name (string)
- type (string: bar, club, festival, dispensary, smoke shop, college, amphitheater, etc.)
- location (string: city, state)
- capacity (string: e.g. "200-300")
- contact_name (string or null)
- contact_email (string: realistic format based on venue name)
- contact_phone (string or null)
- booking_notes (string: 1-2 sentences of useful tips for booking this type of venue)
- good_for (array of strings: which Dragon Farm artist(s) this is best for)

Return 6-9 realistic venues. Base suggestions on real knowledge of the music scene in that city/region.`;

  const query = `Find ${type || 'music venues'} in ${city} suitable for ${genre || 'multi-genre independent label'} artists. Focus on venues that book independent/emerging artists. Include a mix of sizes and types.`;

  const raw = await askClaude(systemPrompt, query);

  // Try to parse JSON
  let venues = [];
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    venues = JSON.parse(clean);
  } catch (e) {
    finderResults.innerHTML = `<div class="finder-empty"><span class="finder-empty-icon">⚠️</span><p>${raw}</p></div>`;
    return;
  }

  if (!venues.length) {
    finderResults.innerHTML = `<div class="finder-empty"><span class="finder-empty-icon">🔍</span><p>No venues found. Try a different city or type.</p></div>`;
    return;
  }

  renderVenues(venues);
});

function renderVenues(venues) {
  const html = `
    <p style="font-size:0.8rem; color:var(--gray); margin-bottom:1rem; font-family:var(--font-mono);">
      Found ${venues.length} venues · AI-generated suggestions — verify details before reaching out
    </p>
    <div class="venue-cards">
      ${venues.map(v => `
        <div class="venue-card">
          <div class="venue-card-header">
            <span class="venue-card-name">${escHtml(v.name)}</span>
            <span class="venue-card-type">${escHtml(v.type)}</span>
          </div>
          <div class="venue-card-location">📍 ${escHtml(v.location)} · Cap: ${escHtml(v.capacity || 'Unknown')}</div>
          ${v.contact_name ? `<div class="venue-card-contact">👤 ${escHtml(v.contact_name)}</div>` : ''}
          ${v.contact_email ? `<div class="venue-card-contact">✉️ <a href="mailto:${escHtml(v.contact_email)}" style="color:var(--gold-light)">${escHtml(v.contact_email)}</a></div>` : ''}
          ${v.contact_phone ? `<div class="venue-card-contact">📞 ${escHtml(v.contact_phone)}</div>` : ''}
          ${v.good_for?.length ? `<div style="margin-top:6px">${v.good_for.map(a => `<span class="tag" style="font-size:0.65rem">${escHtml(a)}</span>`).join(' ')}</div>` : ''}
          <div class="venue-card-note">${escHtml(v.booking_notes || '')}</div>
        </div>
      `).join('')}
    </div>`;
  finderResults.innerHTML = html;
}

function showFinderMessage(msg, type) {
  const icon = type === 'warn' ? '⚠️' : '🔍';
  finderResults.innerHTML = `<div class="finder-empty"><span class="finder-empty-icon">${icon}</span><p>${msg}</p></div>`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- SYNC AI CHAT ----
const syncInput = document.getElementById('sync-input');
const syncSendBtn = document.getElementById('sync-send-btn');
const syncChat = document.getElementById('sync-chat');

const syncSystemPrompt = `You are the sync licensing advisor for Dragon Farm Records, an independent Nashville label.
You help music supervisors, directors, and content creators understand how to license Dragon Farm music.

The catalog includes:
- "Mr. Iron Man (Live)" by Timothy Chance and Rasta Country (Country-Reggae fusion, ISRC: QM6N22632890)
- "Peace Pipe" by Poetic Nocturnal Creatures (Conscious Hip-Hop, ISRC: QM6N22632979)

When someone describes their project, suggest which track(s) might fit and what kind of license they'd need (sync + master, sync only, background vs feature, exclusive vs non-exclusive). Keep responses concise, warm, and professional — 2-4 sentences max. End with a call to action to fill out the booking form.`;

syncSendBtn.addEventListener('click', sendSyncMessage);
syncInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendSyncMessage();
});

async function sendSyncMessage() {
  const msg = syncInput.value.trim();
  if (!msg) return;

  appendChatMsg(msg, 'user');
  syncInput.value = '';
  syncSendBtn.disabled = true;
  syncSendBtn.textContent = '...';

  const reply = await askClaude(syncSystemPrompt, msg);
  appendChatMsg(reply, 'assistant');

  syncSendBtn.disabled = false;
  syncSendBtn.textContent = 'Ask →';
}

function appendChatMsg(text, role) {
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.textContent = text;
  syncChat.appendChild(div);
  syncChat.scrollTop = syncChat.scrollHeight;
}

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

  // Build mailto as fallback (for sites without a form backend)
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

  // Simulate sending (mailto fallback)
  const mailtoLink = `mailto:booking@dragonfarmrecords.com?subject=${subject}&body=${body}`;
  window.location.href = mailtoLink;

  // Show success after short delay
  setTimeout(() => {
    submitBtn.textContent = 'Send Booking Inquiry →';
    submitBtn.disabled = false;
    formSuccess.classList.add('show');
    bookingForm.reset();
    setTimeout(() => formSuccess.classList.remove('show'), 6000);
  }, 800);
});
