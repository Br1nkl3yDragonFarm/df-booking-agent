// ============================================================
//  DRAGON FARM — CAPTIONS (helpers for captions.html)
//
//  Turns Whisper's timed segments into caption cues that fit on a phone
//  screen, and writes them out as SRT, WebVTT or plain text. Also picks
//  where to cut long audio (at the quietest moment, so a word isn't split).
//
//  Segment: { start, end, text }  (seconds)
//  Cue:     { start, end, text }  (text may hold a line break)
// ============================================================

(function () {
  const RATE = 16000;

  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  // Whisper writes sounds as [Music], (applause), ♪ … ♪.
  const dropTags = s => clean(String(s || '').replace(/\[[^\]]*\]|\([^)]*\)|[♪♫]+/g, ' '));

  // Whisper's chunks → segments: offset, missing ends filled, tags dropped if asked, empties gone.
  function segmentsFrom(chunks, offset, blockEnd, opts) {
    const out = [];
    for (const c of chunks || []) {
      const [a, b] = c.timestamp || [];
      const text = (opts && opts.dropTags) ? dropTags(c.text) : clean(c.text);
      if (!text) continue;
      const start = offset + (typeof a === 'number' ? a : 0);
      let end = typeof b === 'number' ? offset + b : blockEnd;
      if (!(end > start)) end = Math.min(blockEnd, start + Math.max(1, text.split(' ').length * 0.35));
      out.push({ start: round(start), end: round(Math.max(end, start + 0.2)), text });
    }
    return out;
  }
  const round = n => Math.round(n * 1000) / 1000;

  // Words → lines of up to maxLine characters (a longer word gets a line to itself).
  function fill(text, maxLine) {
    const out = [];
    let cur = '';
    for (const w of text.split(' ')) {
      if (cur && (cur + ' ' + w).length > maxLine) { out.push(cur); cur = w; }
      else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) out.push(cur);
    return out;
  }

  // Two lines kept about even when both still fit; otherwise as filled.
  function wrap(text, maxLine, lines) {
    const filled = fill(text, maxLine);
    if (lines < 2 || filled.length !== 2) return filled.join('\n');
    const words = text.split(' ');
    let best = filled, score = Math.max(filled[0].length, filled[1].length);
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      if (a.length <= maxLine && b.length <= maxLine && Math.max(a.length, b.length) < score) { best = [a, b]; score = Math.max(a.length, b.length); }
    }
    return best.join('\n');
  }

  // Segments → cues of up to `lines` lines of up to `maxLine` characters, timed by share of characters.
  function cues(segments, opts) {
    const maxLine = (opts && opts.maxLine) || 32, lines = (opts && opts.lines) || 2;
    const out = [];
    for (const seg of segments) {
      const text = clean(seg.text);
      if (!text) continue;
      const filled = fill(text, maxLine), parts = [];
      for (let i = 0; i < filled.length; i += lines) parts.push(filled.slice(i, i + lines).join(' '));
      const total = parts.reduce((n, p) => n + p.length, 0);
      const span = Math.max(seg.end - seg.start, 0.2);
      let done = 0;
      for (const p of parts) {
        const start = seg.start + span * done / total;
        done += p.length;
        out.push({ start: round(start), end: round(seg.start + span * done / total), text: wrap(p, maxLine, lines) });
      }
    }
    return out;
  }

  function stamp(sec, sep) {
    const ms = Math.max(0, Math.round(sec * 1000));
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
  }
  const toSRT = cs => cs.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`).join('\n');
  const toVTT = cs => 'WEBVTT\n\n' + cs.map(c => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n');
  const toTXT = segs => segs.map(s => clean(s.text)).filter(Boolean).join('\n') + '\n';

  // "1:02.5" → 62.5 (also "62.5", "0:01:02.5"); null if unreadable.
  function parseTime(s) {
    const parts = String(s || '').trim().split(':');
    if (!parts[0] || parts.length > 3 || parts.some(p => !/^\d+(\.\d+)?$/.test(p))) return null;
    return parts.reduce((t, p) => t * 60 + Number(p), 0);
  }
  function showTime(sec) {
    const m = Math.floor(sec / 60), s = sec - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  }

  // Where to cut audio into blocks of about `target` seconds: the quietest
  // moment in the last `window` seconds of each block (a tenth of a second
  // and its neighbours, so the cut lands inside a pause, not at its edge).
  function blocks(samples, target = 60, window = 10, rate = RATE) {
    const out = [];
    const frame = Math.round(rate / 10);
    let start = 0;
    while (samples.length - start > target * rate) {
      const from = start + (target - window) * rate, to = start + target * rate;
      const energy = [];
      for (let f = from; f + frame <= to; f += frame) {
        let e = 0;
        for (let i = f; i < f + frame; i++) e += samples[i] * samples[i];
        energy.push(e);
      }
      let best = to, quiet = Infinity;
      energy.forEach((e, k) => {
        const around = e + (energy[k - 1] ?? e) + (energy[k + 1] ?? e);
        if (around < quiet) { quiet = around; best = from + k * frame + Math.round(frame / 2); }
      });
      out.push([start, best]);
      start = best;
    }
    if (samples.length > start) out.push([start, samples.length]);
    return out;
  }

  window.DFCaptions = { RATE, cues, wrap, segmentsFrom, dropTags, toSRT, toVTT, toTXT, stamp, parseTime, showTime, blocks };
})();
