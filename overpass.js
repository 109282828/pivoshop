// overpass.js
const axios = require('axios');
const { CITIES } = require('./geo');

// Бесплатный Overpass API
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const BLACKLIST = [
  "пятерочка","магнит","перекресток","дикси","лента","ашан","вкусвилл",
  "fix price","фикс прайс","wildberries","ozon","тануки","kfc","ростикс",
  "burger king","вкусно и точка","самокат","яндекс лавка","верный","да!",
  "бристоль","красное и белое","винлаб","монетка","светофор"
];

// bbox вокруг города (юг, запад, север, восток)
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
  // Ищем все кафе, рестораны, магазины, спортзалы, салоны и т.д.
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

  try {
    const res = await axios.post(OVERPASS_URL, `data=${encodeURIComponent(query)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000
    });
    return res.data.elements || [];
  } catch (e) {
    console.error(`[overpass] Ошибка: ${e.message}`);
    return [];
  }
}

function normalize(el, city) {
  const tags = el.tags || {};
  const name = tags.name;
  if (!name) return null;

  const lower = name.toLowerCase();
  if (BLACKLIST.some(w => lower.includes(w))) return null;

  // Если есть сайт — пропускаем
  if (tags.website || tags['contact:website']) return null;

  // Телефон (если нет, ставим заглушку, но все равно показываем)
  const phone = tags.phone || tags['contact:phone'] || 'Телефон не указан';

  return {
    name: name,
    address: tags['addr:street'] ? `${tags['addr:street']}, ${tags['addr:housenumber'] || ''}` : 'Адрес не указан',
    phone: phone,
    city: city.name,
    osm_id: el.id,
    photo: `https://source.unsplash.com/400x300/?business,${encodeURIComponent(name)}`,
  };
}

async function* businessGenerator() {
  const seen = new Set();
  
  for (let ci = 0; ci < CITIES.length; ci++) {
    const city = CITIES[ci];
    console.log(`[generator] Город: ${city.name}`);
    
    const bbox = bboxFor(city);
    const elements = await fetchOverpass(bbox);
    
    // Перемешиваем, чтобы не шли подряд одни и те же улицы
    elements.sort(() => Math.random() - 0.5);

    let foundInCity = 0;
    for (const el of elements) {
      const biz = normalize(el, city);
      if (biz && !seen.has(biz.osm_id)) {
        seen.add(biz.osm_id);
        foundInCity++;
        // Отдаем 1 карточку и замираем
        yield biz; 
      }
    }
    console.log(`  [${city.name}] Найдено бизнесов: ${foundInCity}`);
    
    // Пауза 1 сек между городами, чтобы не забанил Overpass
    await new Promise(r => setTimeout(r, 1000));
  }
}

module.exports = { businessGenerator };
