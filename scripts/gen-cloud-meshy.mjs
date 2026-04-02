import { writeFileSync } from 'fs';

const API_KEY = process.env.MESHY_AI_API_KEY;
if (!API_KEY) { console.error('MESHY_AI_API_KEY not set'); process.exit(1); }

const BASE = 'https://api.meshy.ai/openapi/v2';

const TIERS = [
  { name: 'cloud_blue', prompt: 'Small flat cumulus cloud, light airy, translucent cyan-blue glow, neon tint #00F8FF, low poly game asset, no background, centered', negative: 'ground, rain, lightning, text, human' },
  { name: 'cloud_green', prompt: 'Medium cumulus cloud with slight vertical development, translucent neon green glow #00FF39, low poly game asset, no background, centered', negative: 'ground, rain, lightning, text, human' },
  { name: 'cloud_yellow', prompt: 'Towering cumulus cloud, tall vertical development, translucent neon yellow glow #F5FF00, low poly game asset, no background, centered', negative: 'ground, rain, lightning, text, human' },
  { name: 'cloud_orange', prompt: 'Cumulonimbus storm cloud with flat anvil top, dark base, translucent neon orange glow #FFB200, dramatic, low poly game asset, no background, centered', negative: 'ground, text, human' },
  { name: 'cloud_red', prompt: 'Severe supercell storm cloud, massive anvil, rotating updraft, dark menacing base, translucent neon red glow #FF0200, low poly game asset, no background, centered', negative: 'ground, text, human' },
  { name: 'cloud_magenta', prompt: 'Extreme supercell thunderstorm cloud, enormous anvil overshooting top, very dark base with wall cloud, translucent neon magenta glow #FF00F5, low poly game asset, no background, centered', negative: 'ground, text, human' },
];

async function createTask(tier) {
  const res = await fetch(`${BASE}/text-to-3d`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'preview',
      prompt: tier.prompt,
      negative_prompt: tier.negative,
      art_style: 'realistic',
      should_remesh: true,
      topology: 'triangle',
      target_polycount: 5000
    })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Create failed for ${tier.name}: ${res.status} ${txt}`);
  }
  const data = await res.json();
  console.log(`Created task for ${tier.name}: ${data.result}`);
  return data.result;
}

async function pollTask(taskId, name) {
  const maxWait = 600000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 10000));
    const res = await fetch(`${BASE}/text-to-3d/${taskId}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    if (!res.ok) { console.log(`Poll ${name}: HTTP ${res.status}`); continue; }
    const data = await res.json();
    console.log(`Poll ${name}: ${data.status} (${Math.round((Date.now()-start)/1000)}s)`);
    if (data.status === 'SUCCEEDED') return data;
    if (data.status === 'FAILED' || data.status === 'EXPIRED') throw new Error(`Task ${name} failed: ${data.status}`);
  }
  throw new Error(`Timeout waiting for ${name}`);
}

async function downloadGlb(url, name) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed for ${name}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = `docs/models/${name}.glb`;
  writeFileSync(path, buf);
  console.log(`Saved ${path}: ${buf.length} bytes`);
}

async function main() {
  console.log('Starting Meshy AI cloud model generation...');
  console.log(`Processing ${TIERS.length} tiers sequentially to stay within rate limits.\n`);

  for (const tier of TIERS) {
    try {
      console.log(`\n--- ${tier.name} ---`);
      const taskId = await createTask(tier);
      const result = await pollTask(taskId, tier.name);
      const glbUrl = result.model_urls?.glb;
      if (!glbUrl) {
        console.log(`No GLB URL for ${tier.name}, skipping. Available:`, JSON.stringify(result.model_urls));
        continue;
      }
      await downloadGlb(glbUrl, tier.name);
    } catch (e) {
      console.error(`Error with ${tier.name}:`, e.message);
      console.log('Continuing with next tier...');
    }
  }
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
