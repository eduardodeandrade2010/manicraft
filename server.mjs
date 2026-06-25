// Optional AI biome backend for MINECRAFT.js.
// POST /api/biome { prompt } -> structured biome parameters, via a real LLM.
// Supports two providers (pick with PROVIDER=claude|deepseek in .env):
//   - Claude   (Anthropic SDK, model claude-opus-4-8, structured outputs)
//   - DeepSeek (OpenAI-compatible chat/completions, JSON mode)
// If no key/provider is configured, the frontend falls back to the in-browser
// keyword interpreter, so the game works with or without this server.
//
//   cp .env.example .env   # set a key + PROVIDER
//   npm run server

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT || 8788);
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const PROVIDER = process.env.PROVIDER || (ANTHROPIC_KEY ? 'claude' : DEEPSEEK_KEY ? 'deepseek' : null);

const SYSTEM = `You design worlds for a voxel game. Convert the player's description into JSON biome parameters.
Return ONLY JSON with these fields:
- terrainScale: number 40-200 (lower = bumpier)
- mountainAmplitude: number 2-28 (peak height)
- baseHeight: number 2-20
- waterLevel: number 0-16 (higher = more ocean)
- dominantBiome: one of "snow","desert","jungle","temperate","mixed"
- theme: one of "favela","cyberpunk","none" (favela = colorful brick shacks on hills; cyberpunk = neon towers)
- creatures: array, any of "sheep","pig","fox","cow","slime","bird","wolf" (wolf = hostile)
- title: short evocative title
- summary: one sentence (Portuguese ok)
Map mood faithfully: "favela do Rio" -> theme favela, temperate, steep hills, dogs (wolf,fox); "congelado" -> snow, tall mountains; "deserto" -> desert; "selva/floresta" -> jungle.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    terrainScale: { type: 'number' },
    mountainAmplitude: { type: 'number' },
    baseHeight: { type: 'number' },
    waterLevel: { type: 'number' },
    dominantBiome: { type: 'string', enum: ['snow', 'desert', 'jungle', 'temperate', 'mixed'] },
    theme: { type: 'string', enum: ['favela', 'cyberpunk', 'none'] },
    creatures: { type: 'array', items: { type: 'string', enum: ['sheep', 'pig', 'fox', 'cow', 'slime', 'bird', 'wolf'] } },
    title: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['terrainScale', 'mountainAmplitude', 'baseHeight', 'waterLevel', 'dominantBiome', 'theme', 'creatures', 'title', 'summary'],
};

async function viaClaude(prompt) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const res = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  });
  const text = res.content.find((b) => b.type === 'text');
  const data = JSON.parse(text.text);
  if (data.theme === 'none') data.theme = null;
  data.__provider = 'claude';
  return data;
}

async function viaDeepSeek(prompt) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM + '\nRespond with a single JSON object, no markdown.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 1.0,
    }),
  });
  if (!res.ok) throw new Error('deepseek ' + res.status);
  const json = await res.json();
  const data = JSON.parse(json.choices[0].message.content);
  if (data.theme === 'none') data.theme = null;
  data.__provider = 'deepseek';
  return data;
}

const server = createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  if (req.method === 'POST' && req.url === '/api/biome') {
    if (!PROVIDER) {
      res.writeHead(503, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'no AI provider configured (set ANTHROPIC_API_KEY or DEEPSEEK_API_KEY + PROVIDER)' }));
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { prompt } = JSON.parse(body || '{}');
        if (!prompt) throw new Error('missing prompt');
        const data = PROVIDER === 'deepseek' ? await viaDeepSeek(prompt) : await viaClaude(prompt);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(e?.message || e) }));
      }
    });
    return;
  }
  res.writeHead(404).end();
});

server.listen(PORT, () => {
  console.log(`MINECRAFT.js AI biome backend on :${PORT} (provider: ${PROVIDER || 'none'})`);
});
