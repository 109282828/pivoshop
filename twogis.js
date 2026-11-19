// twogis.js
const axios = require('axios');
const { CITIES } = require('./geo');

const TWOGIS_KEY = process.env.TWOGIS_KEY || 'd6f9862f-534d-4f81-b7ed-5af2abafb707';
const SEARCH_URL = 'https://catalog.api.2gis.com/3.0/items';

const CITY_IDS = {
  "Москва": "4504222397630173",
  "Санкт-Петербург": "4504222397640161"
};

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

async function fetchOne(query, city) {
  const params = {
    q: query,
    page: 1,
    page_size: 1,
    fields: 'items.point,items.address,items.contact_groups,items.external_content,items.rubrics,items.name',
    key: TWOGIS_KEY,
  };

  if (CITY_IDS[city.name]) {
    params.city_id = CITY_IDS[city.name];
  } else {
    params.point = `${city.lon},${city.lat}`;
    params.radius = Math.min(city.radius * 1000, 40000);
    params.type = 'branch';
  }
  
  try {
    const r = await axios.get(SEARCH_URL, { 
      params, 
      timeout: 5000, // Ждем максимум 5 секунд
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json'
      }
    });
    
    // Проверяем, есть ли ошибка от API
    if (r.data.meta && r.data.meta.error) {
      console.error(`[2GIS КРИТИЧЕСКАЯ ОШИБКА] ${JSON.stringify(r.data.meta.error)}`);
      throw new Error(`2GIS: ${r.data.meta.error.message || 'Ошибка доступа'}`);
    }

    const items = r.data.result?.items || [];
    return items[0] || null;

  } catch (e) {
    if (e.code === 'ECONNABORTED') {
      console.error(`[2GIS ТАЙМАУТ] ${query} @ ${city.name} — сервер не ответил за 5 сек.`);
    } else {
      console.error(`[2GIS ОШИБКА] ${query} @ ${city.name} → ${e.message}`);
    }
    // Пробрасываем ошибку, чтобы генератор упал и бот написал в телегу
    if (e.message.includes('2GIS')) throw e;
    return null;
  }
}

function normalize(item, city) {
  if (!item || !item.name) return null;

  let phone = null;
  if (item.contact_groups) {
    for (const g of item.contact_groups) {
      if (g.contacts) {
        for (const c of g.contacts) {
          if (c.type === 'phone' && c.value) { phone = c.value; break; }
        }
      }
      if (phone) break;
    }
  }
  if (!phone) return null;

  let hasSite = false;
  if (item.external_content) {
    for (const ec of item.external_content) {
      if (ec.type === 'website') { hasSite = true; break; }
    }
  }
  if (hasSite) return null;

  const lower = item.name.toLowerCase();
  if (BLACKLIST.some(w => lower.includes(w))) return null;

  return {
    name: item.name,
    address: item.address_name || item.address?.name || 'Адрес не указан',
    phone,
    city: city.name,
    osm_id: item.id || item.org_id || Math.random().toString(36).slice(2),
    photo: `https://picsum.photos/seed/${item.id || encodeURIComponent(item.name)}/400/300`,
  };
}

async function* businessGenerator() {
  const seen = new Set();
  
  for (let ci = 0; ci < CITIES.length; ci++) {
    const city = CITIES[ci];
    console.log(`[generator] Город: ${city.name}`);
    
    for (const q of QUERIES) {
      const item = await fetchOne(q, city);
      
      if (item) {
        const biz = normalize(item, city);
        if (biz && !seen.has(biz.osm_id)) {
          seen.add(biz.osm_id);
          yield biz;
        }
      }
      
      await new Promise(r => setTimeout(r, 300));
    }
  }
}

module.exports = { businessGenerator };
