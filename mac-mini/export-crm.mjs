#!/usr/bin/env node
// ============================================================
//  DRAGON FARM — EXPORT THE CRM TO THE MAC MINI
//
//  Pulls the booking, sync and brand pipelines (and, with --fans, the
//  fan list) from the live site into plain files the local tools read:
//    *.csv      BambooAI (data analysis), spreadsheets
//    *.json     anything else
//    summary.md WeKnora (knowledge base), slide-maker, Claude Code
//
//  Usage:  node export-crm.mjs [--fans] [--out ~/dragon-farm-data]
//  Needs:  DF_SITE (e.g. https://dragonfarmgrowth.net) and DF_CRM_PASSCODE,
//          from the environment or ~/.dragon-farm.env (KEY=value lines).
//  Node 22+, no packages.
// ============================================================

import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LISTS = { venue: 'booking', sync: 'sync', brand: 'brand' };
const args = process.argv.slice(2);
const withFans = args.includes('--fans');
const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : '';
const outRoot = outArg ? outArg.replace(/^~/, homedir()) : join(homedir(), 'dragon-farm-data');

async function loadEnvFile() {
  try {
    const text = await readFile(join(homedir(), '.dragon-farm.env'), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function get(path) {
  const res = await fetch(new URL(path, process.env.DF_SITE), {
    headers: { 'x-df-passcode': process.env.DF_CRM_PASSCODE },
    signal: AbortSignal.timeout(30000)
  });
  if (res.status === 401) fail('Wrong passcode (DF_CRM_PASSCODE).');
  if (!res.ok) fail(`${path} answered HTTP ${res.status}. Is DF_SITE right?`);
  return res.json();
}

// One row per record. Lists and objects go in as JSON text. Cells that a
// spreadsheet would run as a formula (=, +, -, @) get a leading quote,
// since lead names and notes come in from public forms.
function toCSV(rows) {
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const cell = v => {
    if (v == null) return '';
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n') + '\n';
}

// Adds counts from the activity log (emails sent, replies, kit views, payments).
function withActivity(lead, activity) {
  const a = activity[lead.id];
  if (!a || typeof a !== 'object') return lead;
  const counts = Object.fromEntries(Object.entries(a)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => [`activity_${k}`, v.length]));
  return { ...lead, ...counts };
}

function summary(data, today) {
  const lines = [`# Dragon Farm pipelines — exported ${today}`, ''];
  for (const [list, label] of Object.entries(LISTS)) {
    const items = data[list];
    const byStatus = {};
    for (const l of items) byStatus[l.status || 'none'] = (byStatus[l.status || 'none'] || 0) + 1;
    lines.push(`## ${label[0].toUpperCase() + label.slice(1)} pipeline (${items.length} leads)`, '');
    for (const [s, n] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) lines.push(`- ${s}: ${n}`);
    if (!items.length) lines.push('- none yet');
    lines.push('');
  }
  const shows = data.venue.filter(l => l.status === 'booked' && l.eventDate).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  lines.push('## Booked shows', '');
  for (const l of shows) lines.push(`- ${l.eventDate}: ${l.name}${l.city ? `, ${l.city}` : ''}${l.type ? ` (${l.type})` : ''}`);
  if (!shows.length) lines.push('- none yet');
  lines.push('', 'Contact details, money and notes are in the CSV files, not here.', '');
  return lines.join('\n');
}

await loadEnvFile();
if (!process.env.DF_SITE || !process.env.DF_CRM_PASSCODE) {
  fail('Set DF_SITE and DF_CRM_PASSCODE (in ~/.dragon-farm.env or the environment).');
}

const today = new Date().toISOString().slice(0, 10);
const dir = join(outRoot, today);
await mkdir(dir, { recursive: true, mode: 0o700 });

const { leads: activity = {} } = await get('/.netlify/functions/activity').catch(() => ({}));
const data = {};
for (const list of Object.keys(LISTS)) {
  const { items } = await get(`/.netlify/functions/crm?list=${list}`);
  data[list] = items.map(l => withActivity(l, activity));
  await writeFile(join(dir, `${LISTS[list]}.json`), JSON.stringify(data[list], null, 2), { mode: 0o600 });
  await writeFile(join(dir, `${LISTS[list]}.csv`), toCSV(data[list]), { mode: 0o600 });
  console.log(`${LISTS[list]}: ${data[list].length} leads`);
}

if (withFans) {
  const { fans } = await get('/.netlify/functions/fans');
  await writeFile(join(dir, 'fans.csv'), toCSV(fans), { mode: 0o600 });
  console.log(`fans: ${fans.length} (personal data: keep it on this Mac or a local model)`);
}

await writeFile(join(dir, 'summary.md'), summary(data, today), { mode: 0o600 });
const latest = join(outRoot, 'latest');
await rm(latest, { force: true });
await symlink(dir, latest);
console.log(`Saved to ${dir} (also ${latest})`);
