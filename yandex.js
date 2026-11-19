// yandex.js
const axios = require('axios');
const fs = require('fs');
const { CITIES } = require('./geo');

const YANDEX_KEY = process.env.YANDEX_KEY || '8b7cbc76-c9c6-42b2-b590-c69182179627';
const SEARCH_URL = 'https://search-maps.yandex.ru/v1/';
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

async function yandexSearch(text, city, retries = 3) {
  const spn = `${(city.radius / 111).toFixed(4)},${(city.radius / 111).toFixed(4)}`;
  const ll = `${city.lon},${city.lat}`;
  const params = {
    text, lang: 'ru_RU', type: 'biz', ll, spn, rspn: 1,
    results: 50, apikey: YANDEX_KEY,
  };

  for (let i = 0; i < retries; i++) {
    try {
      const r = await axios.get(SEARCH_URL, { params, timeout: 15000 });
      return r.data.features || [];
    } catch (e) {
      const code = e.response ? e.response.status : 'NET';
      console.warn(`[yandex] ${text} @ ${city.name} → ${code}`);
      if (code === 403) throw new Error('Яндекс 403: ключ не активирован для API Поиска.');
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return [];
}

function normalize(meta, city) {
  if (!meta.id || !meta.name) return null;
  const phone = (meta.Phones && meta.Phones[0] && meta.Phones[0].formatted) || null;
  if (!phone) return null;
  if (meta.url) return null; // Есть сайт — не наш клиент

  const lower = meta.name.toLowerCase();
  if (BLACKLIST.some(w => lower.includes(w))) return null;

  return {
    name: meta.name,
    address: meta.Address || 'Адрес не указан',
    phone,
    city: city.name,
    osm_id: meta.id,
    categories: (meta.Categories || []).map(c => c.name).join(', '),
    photo: `https://source.unsplash.com/400x300/?business,${encodeURIComponent(meta.name)}`,
  };
}

async function searchCity(city) {
  const results = [];
  for (const q of QUERIES) {
    const features = await yandexSearch(q, city);
    for (const f of features) {
      const biz = normalize(f.properties?.CompanyMetaData, city);
      if (biz) results.push(biz);
    }
  }
  return results;
}

async function findAllCities(onBatch) {
  // Сначала ищем по Москве и отдаем моментально
  const moscow = CITIES.find(c => c.name === "Москва");
  if (moscow) {
    const batch = await searchCity(moscow);
    if (onBatch && batch.length) await onBatch(batch, true); // true = первая пачка, моментально
  }

  // Потом ползем по остальным городам в фоне
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
