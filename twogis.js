// twogis.js
const axios = require('axios');
const { CITIES } = require('./geo');

const TWOGIS_KEY = process.env.TWOGIS_KEY || 'd6f9862f-534d-4f81-b7ed-5af2abafb707';
const SEARCH_URL = 'https://catalog.api.2gis.com/3.0/items';

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

async function fetchPage(text, city, page) {
  const params = {
    q: text,
    point: `${city.lon},${city.lat}`,
    radius: Math.min(city.radius * 1000, 40000),
    page: page,
    page_size: 50,
    fields: 'items.point,items.address,items.contact_groups,items.external_content,items.rubrics,items.name',
    key: TWOGIS_KEY,
  };
  try {
    const r = await axios.get(SEARCH_URL, { params, timeout: 15000 });
    return r.data.result?.items || [];
  } catch (e) {
    console.error(`[2gis] ошибка: ${e.message}`);
    return [];
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
    categories: (item.rubrics || []).map(r => r.name).join(', '),
    photo: `https://source.unsplash.com/400x300/?business,${encodeURIComponent(item.name)}`,
  };
}

// Асинхронный генератор: выдает по одной карточке
async function* businessGenerator() {
  const seen = new Set();
  
  // 1. Идем по городам
  for (let ci = 0; ci < CITIES.length; ci++) {
    const city = CITIES[ci];
    console.log(`[generator] Вход в город: ${city.name}`);
    
    // 2. Идем по запросам (кафе, ресторан...)
    for (const q of QUERIES) {
      let page = 1;
      // 3. Идем по страницам
      while (page <= 5) {
        const items = await fetchPage(q, city, page);
        if (!items.length) break;
        
        for (const item of items) {
          const biz = normalize(item, city);
          if (biz && !seen.has(biz.osm_id)) {
            seen.add(biz.osm_id);
            yield biz; // Отдаем ровно одну карточку
          }
        }
        
        if (items.length < 50) break;
        page++;
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }
}

module.exports = { businessGenerator };
