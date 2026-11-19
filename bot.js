// bot.js
const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
const { findAllCities } = require('./yandex');

const BOT_TOKEN = '9132376702:AAGMnUtp3m3kRTFFenaXp55qJbhcm27w8p0';
const ADMIN_IDS = [8525849849, 5232358021];

const bot = new Telegraf(BOT_TOKEN);
let searchQueue = [];
let queueIdx = 0;
let isFilling = false;
let totalFound = 0;

function isAdmin(ctx) {
  return ctx.from && ADMIN_IDS.includes(ctx.from.id);
}

async function triggerSearch(ctx) {
  if (!isAdmin(ctx)) return;
  if (isFilling) return ctx.reply('⏳ Сбор уже идёт, секунду...');

  isFilling = true;
  await ctx.reply('⏳ Ищу бизнесы в Москве (моментально)...');

  findAllCities(async (batch, isFirst) => {
    searchQueue.push(...batch);
    totalFound += batch.length;
    
    // Если это первая пачка (Москва) — сразу показываем первую карточку
    if (isFirst) {
      await ctx.reply(`✅ Найдено ${batch.length} карточек по Москве. Остальные города собираются в фоне.`);
      const biz = searchQueue[queueIdx++];
      if (biz) await sendBiz(ctx, biz);
    }
  }).then((total) => {
    isFilling = false;
    ctx.reply(`✅ Сбор по РФ завершён. Добавлено: ${total}. Всего в очереди: ${searchQueue.length}.`);
  }).catch((e) => {
    isFilling = false;
    console.error('[FATAL]', e);
    ctx.reply(`⚠️ Ошибка: ${e.message}`);
  });
}

bot.start((ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply("Здравствуйте, добро пожаловать в PivoShop", Markup.inlineKeyboard([
    [Markup.button.callback('🔍 Искать', 'search')],
    [Markup.button.callback('📊 Статистика', 'stats')],
    [Markup.button.callback('ℹ️ Статус', 'status')]
  ]));
});

bot.action('search', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery().catch(()=>{});

  // Если очередь пуста и сбор не идёт — стартуем
  if (searchQueue.length === 0 && !isFilling) {
    return triggerSearch(ctx);
  }

  // Если сбор идёт, но первая карточка еще не пришла — ждём
  if (searchQueue.length === 0 && isFilling) {
    return ctx.answerCbQuery('Собираю данные, секунду...', { show_alert: true });
  }

  // Выдаём следующую
  const biz = searchQueue[queueIdx++];
  if (!biz) return ctx.answerCbQuery('Очередь пуста, пиши /search заново.');
  await sendBiz(ctx, biz);
});

bot.command('search', async (ctx) => {
  if (!isAdmin(ctx)) return;
  if (searchQueue.length === 0 || queueIdx >= searchQueue.length) {
    return triggerSearch(ctx);
  }
  const biz = searchQueue[queueIdx++];
  await sendBiz(ctx, biz);
});

bot.command('status', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    `📊 *Статус*\n\nИдёт сбор: ${isFilling ? 'да ⏳' : 'нет'}\nНайдено за сессию: ${totalFound}\nВ очереди: ${searchQueue.length}\nПросмотрено: ${queueIdx}\nСохранено: ${db.getBusinesses().length}`,
    { parse_mode: 'Markdown' }
  );
});

async function sendBiz(ctx, biz) {
  const greeting = `Здравствуйте! Меня зовут [Твое Имя], я занимаюсь разработкой сайтов. Подскажите, вам интересно было бы сделать современный, красивый и удобный сайт для вашего заведения?`;
  const text = `🏢 *${biz.name}*\n\n📍 ${biz.address}\n🏙 ${biz.city}\n📞 ${biz.phone}\n\n💬 *Текст для звонка:*\n_${greeting}_`;
  
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('➕ Сохранить', `save:${biz.osm_id}`),
     Markup.button.callback('➖ Пропустить', 'search')]
  ]);
  
  try {
    await ctx.replyWithPhoto(biz.photo, { caption: text, parse_mode: 'Markdown', ...kb });
  } catch {
    await ctx.reply(text, { parse_mode: 'Markdown', ...kb });
  }
}

bot.action(/^save:(.+)$/, (ctx) => {
  if (!isAdmin(ctx)) return;
  const id = ctx.match[1];
  const biz = searchQueue.find(b => String(b.osm_id) === String(id));
  if (biz) { 
    db.addBusiness(biz); 
    ctx.answerCbQuery('✅ Сохранено'); 
    // Автоматически выдаем следующую
    const next = searchQueue[queueIdx++];
    if (next) sendBiz(ctx, next);
  } else {
    ctx.answerCbQuery('Не найдено в очереди');
  }
});

bot.action('stats', (ctx) => {
  if (!isAdmin(ctx)) return;
  const list = db.getBusinesses();
  if (!list.length) return ctx.reply("Статистика пуста.", Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'back')]]));
  let text = `📊 *Сохранённые (${list.length}):*\n\n`;
  list.forEach((b, i) => { text += `${i + 1}. *${b.name}*\n📍 ${b.address}\n📞 ${b.phone}\n\n`; });
  ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'back')]]) });
});

bot.action('status', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(`Идёт сбор: ${isFilling ? 'да' : 'нет'}\nВ очереди: ${searchQueue.length}\nПросмотрено: ${queueIdx}`, Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'back')]]));
});

bot.action('back', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply("Главное меню", Markup.inlineKeyboard([
    [Markup.button.callback('🔍 Искать', 'search')],
    [Markup.button.callback('📊 Статистика', 'stats')]
  ]));
});

process.on('unhandledRejection', (reason) => { console.error('[unhandled]', reason); });

bot.launch();
console.log('PivoShop bot up');
