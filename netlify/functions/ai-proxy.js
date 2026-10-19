const { timingSafeEqual } = require('crypto');

// Same passcode as the CRM, so only the label's own tools can spend the API key.
function passcodeMatches(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4000;

const fail = (statusCode, message) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error: { message } })
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const passcode = process.env.DF_CRM_PASSCODE;
  if (!passcode) return fail(503, 'DF_CRM_PASSCODE is not set in Netlify');
  if (!passcodeMatches(event.headers['x-df-passcode'], passcode)) {
    return fail(401, 'Enter the Dragon Farm passcode to use AI tools');
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }
  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: Math.min(Number(body.max_tokens) || 1500, MAX_TOKENS),
        system: body.system || '',
        messages: body.messages
      })
    });
    const data = await response.json();
    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
