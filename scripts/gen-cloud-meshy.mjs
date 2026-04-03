import { writeFileSync } from 'fs';

const API_KEY = process.env.MESHY_AI_API_KEY;
if (!API_KEY) { console.error('MESHY_AI_API_KEY not set'); process.exit(1); }

const BASE = 'https://api.meshy.ai/openapi/v2';

const TIERS = [
  { name: 'cloud_blue', prompt: 'Small puffy cartoon cumulus cloud, soft rounded cotton ball shape, smooth stylized surface, cute fluffy white cloud, isolated on empty background, centered', negative: 'ground, terrain, trees, buildings, rain, lightning, text, human, realistic, photorealistic, dark, scary' },
  { name: 'cloud_green', prompt: 'Medium puffy cartoon cumulus cloud, rounded billowing shape, soft stylized cauliflower bumps, fluffy white cloud with gentle volume, isolated on empty background, centered', negative: 'ground, terrain, trees, buildings, rain, lightning, text, human, realistic, photorealistic, dark, scary' },
  { name: 'cloud_yellow', prompt: 'Tall puffy cartoon storm cloud, rounded tower shape, stylized cumulonimbus with soft bumpy top, flat base, fluffy dramatic cloud, isolated on empty background, centered', negative: 'ground, terrain, trees, buildings, rain, lightning, text, human, realistic, photorealistic' },
  { name: 'cloud_orange', prompt: 'Large puffy cartoon thunderstorm cloud, wide anvil top spreading outward, rounded stylized shape, dramatic fluffy storm cloud with flat base, isolated on empty background, centered', negative: 'ground, terrain, trees, buildings, rain, lightning, text, human, realistic, photorealistic' },
  { name: 'cloud_red', prompt: 'Massive puffy cartoon supercell cloud, huge spreading anvil dome top, rounded stylized menacing shape, dark fluffy storm cloud, isolated on empty background, centered', negative: 'ground, terrain, trees, buildings, rain, lightning, text, human, realistic, photorealistic' },
  { name: 'cloud_magenta', prompt: 'Enormous puffy cartoon extreme storm cloud, gigantic flat anvil overshooting top, bulging rounded dramatic shape, most intense fluffy storm cloud, isolated on empty background, centered', negative: 'ground, terrain, trees, buildings, rain, lightning, text, human, realistic, photorealistic' },
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
      target_polycount: 2000
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
  console.log('Starting Meshy AI cloud model generation (cartoon puffy prompts, 2K polys)...');
  console.log(`Processing ${TIERS.length} tiers sequentially to stay within rate limits.\n`);

  const SKIP = process.argv.includes('--skip-blue') ? ['cloud_blue'] : [];
  for (const tier of TIERS) {
    if (SKIP.includes(tier.name)) { console.log(`Skipping ${tier.name} (already done)`); continue; }
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
