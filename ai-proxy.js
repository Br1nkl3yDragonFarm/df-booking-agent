const https = require('https');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) }; }

  const payload = JSON.stringify({
    model: body.model || 'claude-sonnet-4-20250514',
    max_tokens: body.max_tokens || 1500,
    system: body.system || '',
    messages: body.messages || []
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          // Extract just the text content and return it directly
          const text = parsed.content?.[0]?.text || '';
          resolve({
            statusCode: 200,
            headers,
            body: JSON.stringify({ text })
          });
        } catch (e) {
          resolve({ statusCode: 500, headers, body: JSON.stringify({ error: 'Parse error', raw: data.slice(0, 200) }) });
        }
      });
    });

    req.on('error', (err) => resolve({ statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }));
    req.write(payload);
    req.end();
  });
};
