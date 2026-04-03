import { writeFileSync } from 'fs';

const API_KEY = process.env.MESHY_AI_API_KEY;
if (!API_KEY) { console.error('MESHY_AI_API_KEY not set'); process.exit(1); }

const BASE = 'https://api.meshy.ai/openapi/v2';

const TIERS = [
  { name: 'cloud_blue', prompt: 'Small puffy cumulus cloud, soft white cotton ball shape, gentle rounded form, smooth surface, realistic cloud, isolated on empty background, centered', negative: 'ground, terrain, trees, buildings, rain, lightning, text, human, cartoon, low poly' },
  { name: 'cloud_green', prompt: 'Medium cumulus congestus cloud, tall white billowing tower, flat gray base, vertical development, smooth cauliflower texture, realistic cloud, isolated on empty background, centered', negative: 'ground, terrain, trees, buildings, rain, lightning, text, human, cartoon, low poly' },
  { name: 'cloud_yellow', prompt: 'Towering cumulonimbus cloud, tall vertical column, dark gray flat base, bright white cauliflower top, beginning of anvil shape, realistic storm cloud, isolated on empty background, centered', negative: 'ground, terrain, trees, buildings, rain, lightning, text, human, cartoon, low poly' },
  { name: 'cloud_orange', prompt: 'Cumulonimbus storm cloud with flat wide anvil top spreading outward, dark threatening base, tall vertical core, realistic thunderstorm cloud, dramatic, isolated on empty background, centered', negative: 'ground, terrain, trees, buildings, rain, lightning, text, human, cartoon, low poly' },
  { name: 'cloud_red', prompt: 'Severe supercell thunderstorm, massive spreading anvil top, overshooting dome on top, very dark greenish-gray base, lowered rotating base structure, rotating mesocyclone structure, realistic, isolated on empty background, centered', negative: 'ground, terrain, trees, buildings, rain, lightning, text, human, cartoon, low poly' },
  { name: 'cloud_magenta', prompt: 'Extreme supercell thunderstorm, enormous flat anvil overshooting top, very dark base with lowered rotating updraft base, intense rotation visible, mammatus clouds hanging under anvil, most dangerous storm cloud, realistic, isolated on empty background, centered', negative: 'ground, terrain, trees, buildings, rain, lightning, text, human, cartoon, low poly' },
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
      target_polycount: 10000
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
  console.log('Starting Meshy AI cloud model generation (HD prompts, 10K polys)...');
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
