// ============================================================
//  DRAGON FARM — SIGN AGREEMENTS ONLINE
//
//  The label sends a link; the other side reads the agreement on sign.html,
//  draws a signature and signs. We make a PDF of the agreement with both
//  signatures and an audit line (who, when, from which IP), store it, mark
//  the deal signed on the lead and email the PDF to both sides.
//
//  POST {action:'create', list, leadId, title, text, signerName, signerEmail, labelSigner}
//                                       passcode: make a signing link
//  POST {action:'cancel', token}        passcode: withdraw an unsigned link
//  GET  ?t=<token>                      public: the agreement to sign
//  POST ?t=<token> {name, role, agree, signature}   public: sign it
//  GET  ?t=<token>&pdf=1                public: the signed PDF
//
//  A drawn signature is a visual e-signature, not a cryptographic one.
// ============================================================

import { randomBytes } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { replyTo, sendMail } from '../lib/mail.mjs';
import { passcodeMatches } from '../lib/passcode.mjs';
import { LISTS, clean, crmStore, json, pushCapped, recordActivity, updateJSON } from '../lib/store.mjs';

const store = () => getStore({ name: 'df-sign', consistency: 'strong' });
const TOKEN = /^[A-Za-z0-9_-]{32}$/;
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const MAX_SIGNATURE = 300000; // characters of the PNG data URL

// The standard PDF fonts only cover Latin-1, so smart quotes, dashes and
// anything else outside it are swapped for plain characters.
function latin1(s) {
  return String(s ?? '')
    .replace(/[‘’‛]/g, "'").replace(/[“”‟]/g, '"')
    .replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/[•·]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?');
}

function wrap(text, font, size, width) {
  const lines = [];
  for (const para of latin1(text).split(/\r?\n/)) {
    if (!para.trim()) { lines.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
      if (line) lines.push(line);
      line = word;
      while (font.widthOfTextAtSize(line, size) > width) {
        let cut = line.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

async function buildPdf(doc, signed) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(latin1(doc.title));
  pdf.setAuthor('Dragon Farm Records');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 56, width = W - 2 * M;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const need = h => { if (y - h < M) { page = pdf.addPage([W, H]); y = H - M; } };
  const write = (text, f = font, size = 10.5, gap = 4, color = rgb(0.1, 0.12, 0.11)) => {
    for (const line of wrap(text, f, size, width)) {
      need(size + gap);
      page.drawText(line, { x: M, y: y - size, size, font: f, color });
      y -= size + gap;
    }
  };
  write(doc.title.toUpperCase(), bold, 15, 6);
  write(`Agreement ID ${doc.token.slice(0, 12)} · sent ${new Date(doc.createdAt).toUTCString()}`, font, 8.5, 10, rgb(0.4, 0.4, 0.4));
  write(doc.text);
  y -= 12;
  write('SIGNATURES', bold, 11, 8);
  write(`For Dragon Farm Records: ${doc.labelSigner} (signed when sent, ${new Date(doc.createdAt).toUTCString()})`);
  y -= 8;
  const png = await pdf.embedPng(Buffer.from(signed.signature.split(',')[1], 'base64'));
  const scale = Math.min(220 / png.width, 70 / png.height, 1);
  need(png.height * scale + 70);
  page.drawImage(png, { x: M, y: y - png.height * scale, width: png.width * scale, height: png.height * scale });
  y -= png.height * scale + 4;
  page.drawLine({ start: { x: M, y }, end: { x: M + 240, y }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
  y -= 4;
  write(`${signed.name}${signed.role ? `, ${signed.role}` : ''}`, bold, 10.5, 4);
  write(`Signed electronically ${new Date(signed.at).toUTCString()} from IP ${signed.ip || 'unknown'}. The signer ticked "I have read and agree to this agreement" before signing.`, font, 8.5, 4, rgb(0.4, 0.4, 0.4));
  return Buffer.from(await pdf.save());
}

// The deal on the lead now counts as signed.
async function markLead(list, leadId) {
  if (!LISTS.includes(list)) return;
  await updateJSON(crmStore(), list, saved => {
    const items = saved?.items || [];
    const i = items.findIndex(l => l.id === leadId);
    if (i === -1) return undefined;
    const l = items[i];
    const next = list === 'venue' ? { ...l, contract: 'signed' } : list === 'brand' ? { ...l, inWriting: true } : { ...l, licenseSigned: true };
    return { ...saved, items: items.map((x, j) => j === i ? next : x), updatedAt: new Date().toISOString() };
  });
}

const publicView = d => ({
  title: d.title, text: d.text, labelSigner: d.labelSigner, signerName: d.signerName, status: d.status,
  signed: d.signed ? { name: d.signed.name, role: d.signed.role, at: d.signed.at } : null
});

export default async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('t') || '';

  // ---- public: read, sign, download ----
  if (token) {
    if (!TOKEN.test(token)) return json(404, { error: 'This signing link isn’t valid.' });
    const doc = await store().get(`doc/${token}`, { type: 'json' });
    if (!doc || doc.status === 'cancelled') return json(404, { error: 'This signing link isn’t valid or was withdrawn.' });
    if (req.method === 'GET') {
      if (url.searchParams.get('pdf')) {
        if (doc.status !== 'signed') return json(404, { error: 'Not signed yet.' });
        const pdf = await store().get(`pdf/${token}`, { type: 'arrayBuffer' });
        return new Response(pdf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${latin1(doc.title).replace(/[^\w .-]/g, '')}.pdf"`, 'Cache-Control': 'private, no-store' } });
      }
      return json(200, publicView(doc));
    }
    if (req.method !== 'POST') return json(405, {});
    if (doc.status === 'signed') return json(409, { error: 'This agreement is already signed.', ...publicView(doc) });
    let body;
    try { body = await req.json(); } catch { return json(400, { error: 'Invalid request' }); }
    const name = clean(body.name, 120), role = clean(body.role, 120);
    const signature = String(body.signature || '');
    if (!name) return json(400, { error: 'Type your full name.' });
    if (body.agree !== true) return json(400, { error: 'Tick the box to agree.' });
    if (!signature.startsWith('data:image/png;base64,') || signature.length > MAX_SIGNATURE) return json(400, { error: 'Draw your signature in the box.' });
    const signed = { name, role, signature, at: new Date().toISOString(), ip: clean(req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || '', 60), agent: clean(req.headers.get('user-agent'), 200) };
    let pdf;
    try { pdf = await buildPdf(doc, signed); } catch { return json(400, { error: 'That signature couldn’t be read. Clear it and draw it again.' }); }
    let already = false;
    await updateJSON(store(), `doc/${token}`, d => {
      if (d.status === 'signed') { already = true; return undefined; }
      return { ...d, status: 'signed', signed };
    });
    if (already) return json(409, { error: 'This agreement is already signed.' });
    await store().set(`pdf/${token}`, pdf);
    await markLead(doc.list, doc.leadId);
    await recordActivity(doc.leadId, a => ({ ...a, signs: (a.signs || []).map(s => s.token === token ? { ...s, status: 'signed', signedAt: signed.at, signedBy: name } : s) }));
    if (process.env.RESEND_API_KEY) {
      const pdfUrl = `${url.origin}/.netlify/functions/sign?t=${token}&pdf=1`;
      const attachments = [{ filename: `${latin1(doc.title).replace(/[^\w .-]/g, '') || 'agreement'}.pdf`, content: pdf.toString('base64') }];
      const text = `${doc.title} has been signed by ${name}${role ? `, ${role}` : ''} and Dragon Farm Records.\n\nThe signed copy is attached and stays available here: ${pdfUrl}\n\nDragon Farm Records\n${replyTo()}`;
      const to = [replyTo(), EMAIL.test(doc.signerEmail || '') ? doc.signerEmail : ''].filter(Boolean);
      await sendMail({ to, subject: `Signed: ${doc.title}`, text, attachments }).catch(() => {});
    }
    return json(200, publicView({ ...doc, status: 'signed', signed }));
  }

  // ---- private: create and cancel ----
  if (!passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE)) return json(401, { error: 'Enter the Dragon Farm passcode' });
  if (req.method !== 'POST') return json(405, {});
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid request' }); }
  if (body.action === 'cancel') {
    const t = clean(body.token, 40);
    if (!TOKEN.test(t)) return json(400, { error: 'Unknown link' });
    let leadId = '';
    await updateJSON(store(), `doc/${t}`, d => { if (!d || d.status === 'signed') return undefined; leadId = d.leadId; return { ...d, status: 'cancelled' }; });
    if (leadId) await recordActivity(leadId, a => ({ ...a, signs: (a.signs || []).map(s => s.token === t ? { ...s, status: 'cancelled' } : s) }));
    return json(200, { ok: !!leadId });
  }
  if (body.action !== 'create') return json(400, { error: 'Unknown action' });
  const doc = {
    token: randomBytes(24).toString('base64url'),
    list: LISTS.includes(body.list) ? body.list : 'venue',
    leadId: clean(body.leadId, 100),
    title: clean(body.title, 140),
    text: String(body.text || '').slice(0, 20000),
    signerName: clean(body.signerName, 120),
    signerEmail: clean(body.signerEmail, 160),
    labelSigner: clean(body.labelSigner, 120),
    createdAt: new Date().toISOString(),
    status: 'sent'
  };
  if (!doc.leadId || !doc.title || !doc.text.trim()) return json(400, { error: 'The agreement needs a title and text.' });
  if (!doc.labelSigner) return json(400, { error: 'Type the name of who signs for Dragon Farm Records.' });
  await store().setJSON(`doc/${doc.token}`, doc);
  const entry = { token: doc.token, title: doc.title, at: doc.createdAt, status: 'sent' };
  await recordActivity(doc.leadId, a => ({ ...a, signs: pushCapped(a.signs, entry) }));
  return json(200, { token: doc.token, url: `${url.origin}/sign.html?t=${doc.token}`, entry });
};
