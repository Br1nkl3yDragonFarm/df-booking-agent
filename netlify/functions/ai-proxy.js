const { timingSafeEqual } = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');

// Same passcode as the CRM, so only the label's own tools can spend the API key.
function passcodeMatches(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// The model is chosen here, not by the pages, so it can be updated in one place.
const MODEL = 'claude-opus-5-5';
// Thinking is always on with this model and counts toward max_tokens, so leave
// room for it on top of the email itself. Only what's used is billed.
const MAX_TOKENS = 16000;

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
  if (!process.env.ANTHROPIC_API_KEY) return fail(500, 'ANTHROPIC_API_KEY is not set in Netlify');
  let body;
  try { body = JSON.parse(event.body); }
  catch { return fail(400, 'Invalid JSON'); }
  if (!Array.isArray(body.messages) || !body.messages.length) return fail(400, 'No message to send');

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // If a safety check declines the request, the API retries it on a fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: body.system || '',
      messages: body.messages
    });
    if (response.stop_reason === 'refusal') {
      return fail(422, 'The writing assistant declined this one. Try rewording it.');
    }
    // The pages read content[0].text, so hand back just the text (no thinking blocks).
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: [{ type: 'text', text }], stop_reason: response.stop_reason })
    };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return fail(429, 'The writing assistant is busy. Try again in a minute.');
    if (err instanceof Anthropic.APIError) return fail(err.status || 502, `The writing assistant returned an error (${err.status}): ${err.message}`);
    return fail(502, 'Could not reach the writing assistant. Try again in a minute.');
  }
};
