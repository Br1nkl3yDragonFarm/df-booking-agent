// ============================================================
//  DRAGON FARM — PRESS KIT STARTING POINT
//
//  What each artist's press kit shows until it's edited on epk-edit.html.
//  Only facts already on the public site; the rest (photos, video, music
//  links, past shows, draw, stage plot) is filled in by the label.
//  Shared by epk.html (public) and epk-edit.html (editor).
// ============================================================

window.DFEpk = {
  ARTISTS: ['tcrc', 'pnc'],
  DEFAULTS: {
    tcrc: {
      name: 'Timothy Chance and Rasta Country',
      genre: 'Country reggae',
      tagline: 'Fiddles meet riddims and boots meet the dance floor.',
      hometown: '',
      bio: 'Country soul over reggae roots. Fiddles meet riddims and boots meet the dance floor, in a live show that crosses every line.\n\nPlays festivals, clubs, bars and private events.\nDebut single: "Mr. Iron Man (Live)" (UPC 820200992949).',
      photo: '', draw: '', shows: '', stage: '',
      contact: 'booking@dragonfarm.net',
      videos: [], music: [], socials: []
    },
    pnc: {
      name: 'Poetic Nocturnal Creatures',
      genre: 'Conscious hip-hop',
      tagline: 'Spoken word over hard beats.',
      hometown: '',
      bio: 'Spoken word over hard beats. Vivid storytelling with depth and intention, built for listeners who think and move.\n\nPlays colleges, dispensaries, smoke shops and festivals.\nDebut single: "Peace Pipe" (UPC 820200962904).',
      photo: '', draw: '', shows: '', stage: '',
      contact: 'booking@dragonfarm.net',
      videos: [], music: [], socials: []
    }
  },

  // A saved kit over the defaults: saved values win, empty ones fall back.
  merge(key, saved) {
    const base = this.DEFAULTS[key];
    if (!saved) return { ...base };
    const out = { ...base };
    Object.keys(base).forEach(k => {
      const v = saved[k];
      if (Array.isArray(base[k])) out[k] = Array.isArray(v) ? v : base[k];
      else if (v) out[k] = v;
    });
    return out;
  }
};
