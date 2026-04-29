// ============================================================
//  DRAGON FARM RECORDS — CONFIG
//  dragonfarmgrowth.net
// ============================================================
//
//  ADD YOUR ANTHROPIC API KEY BELOW to power:
//    - AI Venue Finder
//    - Sync Deal Advisor Chat
//
//  FOR PRODUCTION: Move this key to a Netlify Function
//  (/.netlify/functions/ai-proxy) to keep it server-side.
//  Never commit a real API key to a public GitHub repo.
//
//  Get your key at: https://console.anthropic.com
// ============================================================

const DRAGON_FARM_CONFIG = {
  LABEL_NAME: "Dragon Farm Records",
  LABEL_CITY: "Nashville, TN",
  ARTISTS: [
    {
      name: "Timothy Chance and Rasta Country",
      genres: ["Country", "Reggae", "Country-Reggae fusion"],
      upc: "820200992949",
      single: "Mr. Iron Man (Live)"
    },
    {
      name: "Poetic Nocturnal Creatures",
      genres: ["Hip-Hop", "Conscious Hip-Hop"],
      upc: "820200962904",
      single: "Peace Pipe"
    }
  ]
};
