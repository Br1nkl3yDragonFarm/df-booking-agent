// Models available through Netlify AI Gateway; anything else falls back to DEFAULT_MODEL.
const SUPPORTED_MODELS = new Set([
  'claude-haiku-4-5', 'claude-haiku-5-5', 'claude-opus-4-8', 'claude-opus-5', 'claude-opus-5-5',
  'claude-sonnet-4-5', 'claude-sonnet-4-6', 'claude-sonnet-5', 'claude-sonnet-5-5'
]);
const DEFAULT_MODEL = 'claude-sonnet-5-5';

const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(500, { error: 'API key not configured' });
  }
  let body;
  try { body = await req.json(); }
  catch { return json(400, { error: 'Invalid JSON' }); }
  try {
    const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: SUPPORTED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL,
        max_tokens: body.max_tokens || 1500,
        system: body.system || '',
        messages: body.messages
      })
    });
    const data = await response.json();
    return json(response.status, data);
  } catch (err) {
    return json(500, { error: err.message });
  }
};
