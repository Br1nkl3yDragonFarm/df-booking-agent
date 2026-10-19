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
      genre: 'Country · Reggae',
      tagline: 'Fiddles meet riddims, boots meet the dance floor.',
      hometown: '',
      bio: 'A genre-defying fusion of Country soul and Reggae roots. Timothy Chance and Rasta Country bring an unforgettable live experience that crosses every line — fiddles meet riddims, boots meet the dance floor.\n\nDebut single: "Mr. Iron Man (Live)" (UPC 820200992949).',
      photo: '', draw: '', shows: '', stage: '',
      contact: 'booking@dragonfarm.net',
      videos: [], music: [], socials: []
    },
    pnc: {
      name: 'Poetic Nocturnal Creatures',
      genre: 'Hip-Hop · Conscious',
      tagline: 'Spoken word artistry, hard beats, vivid storytelling.',
      hometown: '',
      bio: 'Conscious Hip-Hop with depth, intention, and cultural resonance. Poetic Nocturnal Creatures blend spoken word artistry with hard beats and vivid storytelling — built for listeners who think and move.\n\nDebut single: "Peace Pipe" (UPC 820200962904).',
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
