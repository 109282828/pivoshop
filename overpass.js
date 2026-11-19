// overpass.js
const axios = require('axios');
const { CITIES } = require('./geo');

// Пять разных зеркал Overpass (если одно упало, пробуем другое)
const OVERPASS_URLS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.osm.ch/api/interpreter'
];

const BLACKLIST = [
  "пятерочка","магнит","перекресток","дикси","лента","ашан","вкусвилл",
  "fix price","фикс прайс","wildberries","ozon","тануки","kfc","ростикс",
  "burger king","вкусно и точка","самокат","яндекс лавка","верный","да!",
  "бристоль","красное и белое","винлаб","монетка","светофор"
];

const QUERIES = [
  "кафе", "ресторан", "стоматология", "фитнес", "салон красоты", 
  "барбершоп", "автосервис", "пекарня", "кофейня", "пиццерия", 
  "суши", "аптека", "ветклиника", "ремонт"
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
  // Ищем всё: кафе, магазины, ремонт, стоматологии и т.д.
  const query = `
    [out:json][timeout:20];
    (
      node["amenity"~"cafe|restaurant|fast_food|dentist|bar|pub|pharmacy|veterinary|car_repair"](${bbox});
      node["leisure"~"fitness_centre|sports_centre"](${bbox});
      node["shop"](${bbox});
      node["office"](${bbox});
    );
    out body 100;
  `;

  // Перебираем зеркала по очереди
  for (const url of OVERPASS_URLS) {
    try {
      const res = await axios.post(url, `data=${encodeURIComponent(query)}`, {
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'PivoShopBot/1.0',
          'Accept': 'application/json'
        },
        timeout: 10000 // Ждем 10 секунд, если нет ответа - идем к следующему
      });
      console.log(`[overpass] Успех через ${url}`);
      return res.data.elements || [];
    } catch (e) {
      console.warn(`[overpass] ${url} не ответил: ${e.message}`);
    }
  }
  return []; // Если все 5 упали
}

function normalize(el, city) {
  const tags = el.tags || {};
  const name = tags.name;
  if (!name) return null;

  const lower = name.toLowerCase();
  if (BLACKLIST.some(w => lower.includes(w))) return null;

  // Если есть сайт — пропускаем
  if (tags.website || tags['contact:website']) return null;

  // Берем телефон, если нет - ставим заглушку
  const phone = tags.phone || tags['contact:phone'] || 'Телефон не указан';

  return {
    name: name,
    address: tags['addr:street'] ? `${tags['addr:street']}, ${tags['addr:housenumber'] || ''}` : 'Адрес не указан',
    phone: phone,
    city: city.name,
    osm_id: el.id,
    // Рабочая картинка через picsum
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
    
    // Перемешиваем результаты
    elements.sort(() => Math.random() - 0.5);

    let foundInCity = 0;
    for (const el of elements) {
      const biz = normalize(el, city);
      if (biz && !seen.has(biz.osm_id)) {
        seen.add(biz.osm_id);
        foundInCity++;
        yield biz; // Отдаем ОДНУ карточку и замираем
      }
    }
    console.log(`  [${city.name}] Найдено: ${foundInCity}`);
    
    // Пауза 1 сек между городами
    await new Promise(r => setTimeout(r, 1000));
  }
}

module.exports = { businessGenerator };
