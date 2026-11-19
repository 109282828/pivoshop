// yandex.js
const axios = require('axios');
const fs = require('fs');
const { CITIES } = require('./geo');

const YANDEX_KEY = process.env.YANDEX_KEY || '8b7cbc76-c9c6-42b2-b590-c69182179627';
const SEARCH_URL = 'https://search-maps.yandex.ru/v1/';
const OUT_FILE = 'found.jsonl';

// Стоп-слова: крупные сети, которые нам не нужны.
const BLACKLIST = [
  "пятерочка","магнит","перекресток","дикси","лента","ашан","вкусвилл",
  "fix price","фикс прайс","wildberries","ozon","тануки","kfc","ростикс",
  "burger king","вкусно и точка","самокат","яндекс лавка","верный","да!",
  "бристоль","красное и белое","винлаб","пятерочка","монетка","светофор"
];

// Категории, которые нас интересуют — локальные сервисы.
const QUERIES = [
  "кафе",
  "ресторан",
  "стоматология",
  "фитнес",
  "салон красоты",
  "барбершоп",
  "автосервис",
  "магазин",
  "пекарня",
  "кофейня",
  "пиццерия",
  "суши",
  "аптека",
  "ветклиника",
  "ремонт",
];

async function yandexSearch(text, city, page = 0, retries = 3) {
  // spn = размер окна в градусах (радиус / 111).
  const spn = `${(city.radius / 111).toFixed(4)},${(city.radius / 111).toFixed(4)}`;
  const ll = `${city.lon},${city.lat}`;
  const params = {
    text,
    lang: 'ru_RU',
    type: 'biz',
    ll,
    spn,
    rspn: 1,           // жёстко искать в окне
    results: 50,       // макс на страницу (Яндекс разрешает до 50)
    skip: page * 50,   // пагинация
    apikey: YANDEX_KEY,
  };

  for (let i = 0; i < retries; i++) {
    try {
      const r = await axios.get(SEARCH_URL, { params, timeout: 30000 });
      return r.data;
    } catch (e) {
      const code = e.response ? e.response.status : 'NET';
      console.warn(`[yandex] ${text} @ ${city.name} p${page} → ${code}`);
      if (code === 403) {
        console.error('[yandex] 403 — проверь ключ и включён ли API Поиска по организациям.');
        return null;
      }
      if (code === 429) {
        console.warn('[yandex] 429 — лимит запросов, жду 10 сек...');
        await new Promise(r => setTimeout(r, 10000));
      } else {
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      }
    }
  }
  return null;
}

function normalize(feature, city) {
  const p = feature.properties || {};
  const meta = p.CompanyMetaData || {};
  if (!meta.id || !meta.name) return null;

  const name = meta.name;
  const phone = (meta.Phones && meta.Phones[0] && meta.Phones[0].formatted) || null;

  // Только те, у кого есть телефон и НЕТ сайта
  if (!phone) return null;
  if (meta.url) return null;

  const lower = name.toLowerCase();
  if (BLACKLIST.some(w => lower.includes(w))) return null;

  return {
    name,
    address: (meta.Address && meta.Address) || 'Адрес не указан',
    phone,
    city: city.name,
    osm_id: meta.id,
    categories: (meta.Categories || []).map(c => c.name).join(', '),
    photo: `https://source.unsplash.com/400x300/?business,${encodeURIComponent(name)}`,
  };
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
  if (!YANDEX_KEY || YANDEX_KEY === 'ВСТАВЬ_СЮДА_СВОЙ_КЛЮЧ') {
    throw new Error('YANDEX_KEY не задан');
  }

  const seen = loadSeen();
  const stream = fs.createWriteStream(OUT_FILE, { flags: 'a' });
  let total = 0;

  for (let ci = 0; ci < CITIES.length; ci++) {
    const city = CITIES[ci];
    console.log(`[city ${ci + 1}/${CITIES.length}] ${city.name}`);

    for (const q of QUERIES) {
      let page = 0;
      while (page < 10) { // макс 500 результатов на запрос
        const data = await yandexSearch(q, city, page);
        if (!data || !data.features || data.features.length === 0) break;

        const fresh = data.features
          .map(f => normalize(f, city))
          .filter(b => b && !seen.has(b.osm_id));

        for (const b of fresh) {
          seen.add(b.osm_id);
          stream.write(JSON.stringify(b) + '\n');
        }
        total += fresh.length;
        if (fresh.length && onBatch) await onBatch(fresh);
        console.log(`  ${q} p${page}: +${fresh.length} (всего ${total})`);

        if (data.features.length < 50) break;
        page++;
        await new Promise(r => setTimeout(r, 500));
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  stream.end();
  return total;
}

module.exports = { findAllCities };
