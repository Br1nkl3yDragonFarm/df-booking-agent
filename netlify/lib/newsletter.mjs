// Builds the fan newsletter: responsive HTML (MJML) plus a plain-text copy,
// with a personal unsubscribe link and the label's mailing address, which
// US law (CAN-SPAM) requires in every marketing email.
import mjml2html from 'mjml';
import { unsubscribeUrl } from './unsubscribe.mjs';

export { unsubscribeUrl };

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BRAND = { green: '#173226', bone: '#f3ecdc', ink: '#1d2321', flame: '#f08a24', muted: '#6b6f68' };

export const mailingAddress = () => String(process.env.DF_MAILING_ADDRESS || '').trim();

const paragraphs = text => String(text || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
const niceDate = date => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); };

// msg: { subject, headline, body, ctaText, ctaUrl, shows: [{ eventDate, name, city }] }
export async function renderNewsletter(msg, { site, unsubscribe }) {
  const address = mailingAddress();
  const shows = (msg.shows || []).slice(0, 12);
  const mj = `<mjml>
  <mj-head>
    <mj-title>${esc(msg.subject)}</mj-title>
    <mj-preview>${esc(paragraphs(msg.body)[0] || msg.headline || '')}</mj-preview>
    <mj-attributes><mj-all font-family="Arial, Helvetica, sans-serif" /><mj-text color="${BRAND.ink}" font-size="16px" line-height="1.55" /></mj-attributes>
  </mj-head>
  <mj-body background-color="${BRAND.bone}">
    <mj-section background-color="${BRAND.green}" padding="20px 0">
      <mj-column>
        <mj-image src="${esc(site)}/logo-email.png" alt="Dragon Farm Records" width="68px" padding="0 0 8px" />
        <mj-text align="center" color="${BRAND.bone}" font-size="20px" font-weight="bold" padding="0 24px">Timothy Chance &amp; Rasta Country</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="24px 0 8px">
      <mj-column>
        ${msg.headline ? `<mj-text font-size="26px" font-weight="bold" line-height="1.25">${esc(msg.headline)}</mj-text>` : ''}
        ${paragraphs(msg.body).map(p => `<mj-text>${esc(p).replace(/\n/g, '<br />')}</mj-text>`).join('\n        ')}
        ${msg.ctaUrl ? `<mj-button href="${esc(msg.ctaUrl)}" background-color="${BRAND.flame}" color="${BRAND.ink}" font-weight="bold" font-size="16px" border-radius="6px" inner-padding="14px 26px" padding="16px 25px">${esc(msg.ctaText || 'Get tickets')}</mj-button>` : ''}
      </mj-column>
    </mj-section>
    ${shows.length ? `<mj-section background-color="#ffffff" padding="0 0 16px">
      <mj-column>
        <mj-text font-size="13px" font-weight="bold" color="${BRAND.muted}" padding-bottom="4px">UPCOMING SHOWS</mj-text>
        ${shows.map(s => `<mj-text padding-top="2px" padding-bottom="2px"><b>${esc(niceDate(s.eventDate))}</b> &nbsp;${esc(s.name)}${s.city ? `, ${esc(s.city)}` : ''}</mj-text>`).join('\n        ')}
      </mj-column>
    </mj-section>` : ''}
    <mj-section padding="16px 0 28px">
      <mj-column>
        <mj-text align="center" font-size="12px" color="${BRAND.muted}" line-height="1.5">You're getting this because you signed up at a Timothy Chance &amp; Rasta Country show.<br /><a href="${esc(unsubscribe)}" style="color:${BRAND.muted}">Unsubscribe</a> any time.<br />Dragon Farm Records · ${esc(address)}</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
  const { html, errors } = await mjml2html(mj, { validationLevel: 'soft' });
  const text = [
    msg.headline, '', ...paragraphs(msg.body).flatMap(p => [p, '']),
    msg.ctaUrl ? `${msg.ctaText || 'Get tickets'}: ${msg.ctaUrl}\n` : '',
    shows.length ? `UPCOMING SHOWS\n${shows.map(s => `${niceDate(s.eventDate)}  ${s.name}${s.city ? `, ${s.city}` : ''}`).join('\n')}\n` : '',
    `--\nYou're getting this because you signed up at a Timothy Chance & Rasta Country show.\nUnsubscribe: ${unsubscribe}\nDragon Farm Records · ${address}`
  ].filter(x => x !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { html, text, errors };
}
