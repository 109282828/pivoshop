// test.js
const axios = require('axios');

const KEY = 'd6f9862f-534d-4f81-b7ed-5af2abafb707';
const URL = 'https://catalog.api.2gis.com/3.0/items';

async function test() {
  console.log('Запрос к 2ГИС...');
  try {
    const res = await axios.get(URL, {
      params: {
        q: 'кафе',
        city_id: '4504222397630173', // Москва
        page_size: 1,
        key: KEY
      },
      timeout: 10000
    });
    console.log('Статус:', res.status);
    console.log('Ответ 2ГИС:', JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.log('ОШИБКА:', e.message);
    if (e.response) {
      console.log('Статус ошибки:', e.response.status);
      console.log('Тело ошибки:', JSON.stringify(e.response.data, null, 2));
    }
  }
}

test();
