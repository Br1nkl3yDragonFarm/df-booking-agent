const { timingSafeEqual } = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');

// Same passcode as the CRM, so only the label's own tools can spend the API key.
function passcodeMatches(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const MODEL = 'claude-opus-5-5';
// Thinking is always on and counts toward max_tokens, so leave room for it
// on top of the reply. Low effort keeps these short drafting and advice
// calls quick enough for a regular (non-background) function.
const MAX_TOKENS = 16000;
const EFFORT = 'low';

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
    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: EFFORT },
      system: body.system || '',
      messages: body.messages
    });
    if (response.stop_reason === 'refusal') {
      return fail(422, 'The AI declined this request. Try rewording it.');
    }
    // The pages read content[0].text, so hand back only the text blocks
    // (the reply now starts with a thinking block).
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...response, content: response.content.filter(b => b.type === 'text') })
    };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return fail(err.status || 502, err.error?.error?.message || err.message);
    }
    return fail(500, err.message);
  }
};
