// twogis.js
const axios = require('axios');
const fs = require('fs');
const { CITIES } = require('./geo');

const TWOGIS_KEY = process.env.TWOGIS_KEY || 'd6f9862f-534d-4f81-b7ed-5af2abafb707';
const SEARCH_URL = 'https://catalog.api.2gis.com/3.0/items';
const OUT_FILE = 'found.jsonl';

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

async function twogisSearch(text, city, page = 1, retries = 3) {
  const params = {
    q: text,
    point: `${city.lon},${city.lat}`,
    radius: city.radius * 1000,
    page: page,
    page_size: 50,
    fields: 'items.point,items.address,items.contact_groups,items.external_content,items.rubrics',
    key: TWOGIS_KEY,
  };

  for (let i = 0; i < retries; i++) {
    try {
      const r = await axios.get(SEARCH_URL, { params, timeout: 15000 });
      return r.data.result?.items || [];
    } catch (e) {
      const code = e.response ? e.response.status : 'NET';
      const msg = e.response?.data?.meta?.error?.message || e.message;
      console.warn(`[2gis] ${text} @ ${city.name} → ${code} (${msg})`);
      if (code === 403) throw new Error('2ГИС 403: ключ неверный или лимит.');
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return [];
}

function normalize(item, city) {
  if (!item || !item.name) return null;

  let phone = null;
  if (item.contact_groups) {
    for (const g of item.contact_groups) {
      if (g.contacts) {
        for (const c of g.contacts) {
          if (c.type === 'phone' && c.value) {
            phone = c.value;
            break;
          }
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

async function searchCity(city) {
  const results = [];
  const seen = new Set();
  for (const q of QUERIES) {
    let page = 1;
    while (page <= 5) {
      const items = await twogisSearch(q, city, page);
      if (!items.length) break;
      for (const item of items) {
        const biz = normalize(item, city);
        if (biz && !seen.has(biz.osm_id)) {
          seen.add(biz.osm_id);
          results.push(biz);
        }
      }
      if (items.length < 50) break;
      page++;
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return results;
}

async function findAllCities(onBatch) {
  const moscow = CITIES.find(c => c.name === "Москва");
  if (moscow) {
    const batch = await searchCity(moscow);
    if (onBatch && batch.length) await onBatch(batch, true);
  }

  let total = 0;
  for (let i = 0; i < CITIES.length; i++) {
    const city = CITIES[i];
    if (city.name === "Москва") continue;
    console.log(`[city ${i + 1}/${CITIES.length}] ${city.name}`);
    const batch = await searchCity(city);
    total += batch.length;
    if (onBatch && batch.length) await onBatch(batch, false);
    await new Promise(r => setTimeout(r, 500));
  }
  return total;
}

module.exports = { findAllCities };
