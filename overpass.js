// overpass.js
const axios = require('axios');
const { CITIES } = require('./geo');

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

const BLACKLIST = [
  "пятерочка","магнит","перекресток","дикси","лента","ашан","вкусвилл",
  "fix price","фикс прайс","wildberries","ozon","тануки","kfc","ростикс",
  "burger king","вкусно и точка","самокат","яндекс лавка","верный","да!",
  "бристоль","красное и белое","винлаб","монетка","светофор"
];

function bboxFor(city) {
  const dLat = city.radius / 111.0;
  const dLon = city.radius / (111.0 * Math.cos(city.lat * Math.PI / 180));
  return [
    city.lat - dLat,
    city.lon - dLon,
    city.lat + dLat,
    city.lon + dLon
  ].map(v => v.toFixed(5)).join(",");
}

async function fetchOverpass(bbox) {
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"~"cafe|restaurant|fast_food|dentist|bar|pub|pharmacy|veterinary|car_repair"](${bbox});
      node["leisure"~"fitness_centre|sports_centre"](${bbox});
      node["shop"](${bbox});
      node["office"~"company|estate_agent|lawyer|insurance"](${bbox});
    );
    out body 100;
  `;

  for (const url of OVERPASS_URLS) {
    try {
      const res = await axios.post(url, `data=${encodeURIComponent(query)}`, {
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'PivoShopBot/1.0 (contact@example.com)',
          'Accept': 'application/json'
        },
        timeout: 15000
      });
      return res.data.elements || [];
    } catch (e) {
      console.warn(`[overpass] ${url} ответил: ${e.response ? e.response.status : e.message}`);
    }
  }
  return [];
}

function normalize(el, city) {
  const tags = el.tags || {};
  const name = tags.name;
  if (!name) return null;

  const lower = name.toLowerCase();
  if (BLACKLIST.some(w => lower.includes(w))) return null;

  if (tags.website || tags['contact:website']) return null;

  const phone = tags.phone || tags['contact:phone'] || 'Телефон не указан';

  return {
    name: name,
    address: tags['addr:street'] ? `${tags['addr:street']}, ${tags['addr:housenumber'] || ''}` : 'Адрес не указан',
    phone: phone,
    city: city.name,
    osm_id: el.id,
    // Используем picsum вместо мертвого unsplash
    photo: `https://picsum.photos/seed/${el.id}/400/300`,
  };
}

async function* businessGenerator() {
  const seen = new Set();
  
  for (let ci = 0; ci < CITIES.length; ci++) {
    const city = CITIES[ci];
    console.log(`[generator] Город: ${city.name}`);
    
    const bbox = bboxFor(city);
    const elements = await fetchOverpass(bbox);
    
    elements.sort(() => Math.random() - 0.5);

    let foundInCity = 0;
    for (const el of elements) {
      const biz = normalize(el, city);
      if (biz && !seen.has(biz.osm_id)) {
        seen.add(biz.osm_id);
        foundInCity++;
        // Отдаем моментально! Никаких пауз здесь.
        yield biz; 
      }
    }
    console.log(`  [${city.name}] Найдено бизнесов: ${foundInCity}`);
    
    // Пауза ТОЛЬКО после того, как закончился город, чтобы не банило Overpass
    await new Promise(r => setTimeout(r, 1000));
  }
}

module.exports = { businessGenerator };
