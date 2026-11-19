// finder.js
const axios = require('axios');
const fs = require('fs');
const { CITIES, bboxFor } = require('./geo');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OUT_FILE = 'found.jsonl';

const BLACKLIST = ["пятерочка","магнит","перекресток","дикси","лента","ашан","вкусвилл","fix price","фикс прайс","wildberries","ozon","тануки","kfc","ростикс","burger king","вкусно и точка"];

function buildQuery(bbox) {
  return `[out:json][timeout:90];
(
  node["amenity"~"^(cafe|restaurant|fast_food|dentist|bar|pub)$"](${bbox});
  node["leisure"~"^(fitness_centre|sports_centre)$"](${bbox});
  node["shop"](${bbox});
);
out body 3000;`;
}

async function overpass(bbox, retries = 5) {
  const body = `data=${encodeURIComponent(buildQuery(bbox))}`;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await axios.post(OVERPASS_URL, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 120000
      });
      return r.data.elements || [];
    } catch (e) {
      const code = e.response ? e.response.status : 'NET';
      console.warn(`[overpass] bbox=${bbox} attempt ${i+1}/${retries} → ${code}`);
      const wait = (code === 429 || code === 504) ? 8000 * (i + 1) : 2000 * (i + 1);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  return null;
}

function extract(elements, cityName) {
  const out = [];
  for (const el of elements) {
    const t = el.tags || {};
    const name = t.name;
    const phone = t.phone || t['contact:phone'];
    if (!name || !phone) continue;
    if (t.website || t['contact:website']) continue;
    const lower = name.toLowerCase();
    if (BLACKLIST.some(w => lower.includes(w))) continue;
    if (t.opening_hours === 'closed') continue;

    out.push({
      name,
      address: t['addr:street'] ? `${t['addr:street']}, ${t['addr:housenumber'] || ''}`.trim() : 'Адрес не указан',
      phone,
      city: cityName,
      osm_id: el.id,
      photo: `https://source.unsplash.com/400x300/?business,${encodeURIComponent(name)}`
    });
  }
  return out;
}

function loadSeen() {
  const seen = new Set();
  if (!fs.existsSync(OUT_FILE)) return seen;
  for (const line of fs.readFileSync(OUT_FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { seen.add(JSON.parse(line).osm_id); } catch {}
  }
  return seen;
}

async function findAllCities(onBatch) {
  const seen = loadSeen();
  const stream = fs.createWriteStream(OUT_FILE, { flags: 'a' });
  let total = 0;
  let cityIdx = 0;

  for (const city of CITIES) {
    cityIdx++;
    const bbox = bboxFor(city);
    console.log(`[city ${cityIdx}/${CITIES.length}] ${city.name}`);
    const els = await overpass(bbox);
    if (!els) {
      console.warn(`[city] ${city.name} skipped (overpass unavailable)`);
      continue;
    }
    const fresh = extract(els, city.name).filter(b => !seen.has(b.osm_id));
    for (const b of fresh) {
      seen.add(b.osm_id);
      stream.write(JSON.stringify(b) + '\n');
    }
    total += fresh.length;
    console.log(`[city] ${city.name}: +${fresh.length} (total ${total})`);
    if (onBatch && fresh.length) await onBatch(fresh);
    await new Promise(r => setTimeout(r, 3000));
  }

  stream.end();
  return total;
}

module.exports = { findAllCities };
