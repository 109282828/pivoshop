// yandex_html.js
const axios = require('axios');
const { CITIES } = require('./geo');

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

async function fetchYandexHtml(query, city) {
  // Ищем как обычный пользователь
  const url = `https://yandex.ru/maps/api/search?text=${encodeURIComponent(query + ' ' + city.name)}&type=biz&ll=${city.lon},${city.lat}&z=12`;
  
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://yandex.ru/maps/'
      },
      timeout: 15000
    });
    
    // Яндекс отдает массив организаций
    const items = res.data?.data?.items || [];
    return items;
  } catch (e) {
    console.error(`[yandex_html] Ошибка: ${e.message}`);
    return [];
  }
}

function normalize(item, city) {
  if (!item || !item.title) return null;
  const name = item.title;
  
  const lower = name.toLowerCase();
  if (BLACKLIST.some(w => lower.includes(w))) return null;

  // Отсеиваем тех, у кого есть сайт
  if (item.urls && item.urls.length > 0) return null;

  // Телефон
  const phone = item.phones?.[0]?.formatted || 'Телефон не указан';
  
  // Адрес
  const address = item.address || 'Адрес не указан';

  return {
    name: name,
    address: address,
    phone: phone,
    city: city.name,
    osm_id: item.id || Math.random().toString(36).slice(2),
    photo: `https://picsum.photos/seed/${item.id || name}/400/300`,
  };
}

async function* businessGenerator() {
  const seen = new Set();
  
  for (let ci = 0; ci < CITIES.length; ci++) {
    const city = CITIES[ci];
    console.log(`[generator] Город: ${city.name}`);
    
    for (const q of QUERIES) {
      const items = await fetchYandexHtml(q, city);
      
      let found = 0;
      for (const item of items) {
        const biz = normalize(item, city);
        if (biz && !seen.has(biz.osm_id)) {
          seen.add(biz.osm_id);
          found++;
          yield biz; // Отдаем моментально
        }
      }
      
      if (found > 0) {
        console.log(`  [${city.name}] ${q}: найдено ${found}`);
        break; // Если нашли кафе, переходим к следующему городу (чтобы не спамить)
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

module.exports = { businessGenerator };
