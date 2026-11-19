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
let lastError = null;
let totalFound = 0;

function isAdmin(ctx) {
  return ctx.from && ADMIN_IDS.includes(ctx.from.id);
}

async function triggerSearch(ctx) {
  if (!isAdmin(ctx)) return;

  if (isFilling) {
    return ctx.reply('⏳ Сбор уже идёт. Подожди, как найдёт — покажу.');
  }

  isFilling = true;
  lastError = null;
  await ctx.reply('⏳ Запускаю сбор по РФ через Яндекс. Первые результаты придут через 5-10 секунд. Напиши /status если хочешь глянуть прогресс.');

  findAllCities(async (batch) => {
    searchQueue.push(...batch);
    totalFound += batch.length;
    // Не спамим — шлём только если очередь пустая (первая пачка)
    if (searchQueue.length === batch.length) {
      await sendBiz(ctx, searchQueue[0]);
      queueIdx = 1;
    }
  }).then((total) => {
    isFilling = false;
    ctx.reply(`✅ Сбор завершён. Всего найдено: ${total}. В очереди: ${searchQueue.length}. Пиши /search чтобы листать.`);
  }).catch((e) => {
    isFilling = false;
    lastError = e.message;
    console.error('[FATAL] finder error:', e);
    ctx.reply(`⚠️ Сбор упал: ${e.message}\nПроверь консоль и ключ.`);
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

// Обработка кнопки "Искать"
bot.action('search', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery().catch(()=>{});

  // Если очередь пуста и не идёт сбор — стартуем сбор
  if (searchQueue.length === 0 && !isFilling) {
    return triggerSearch(ctx);
  }

  // Если очередь есть — выдаём следующую карточку
  const biz = searchQueue[queueIdx++];
  if (!biz) {
    return ctx.reply('Очередь кончилась. Пиши /search чтобы запустить новый сбор.');
  }
  await sendBiz(ctx, biz);
});

// Обработка текстовой команды /search
bot.command('search', async (ctx) => {
  if (!isAdmin(ctx)) return;
  if (searchQueue.length === 0 || queueIdx >= searchQueue.length) {
    return triggerSearch(ctx);
  }
  const biz = searchQueue[queueIdx++];
  await sendBiz(ctx, biz);
});

// Обработка текстовой команды /status
bot.command('status', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    `📊 *Статус*\n\n` +
    `Идёт сбор: ${isFilling ? 'да ⏳' : 'нет'}\n` +
    `Всего найдено за сессию: ${totalFound}\n` +
    `В очереди: ${searchQueue.length}\n` +
    `Просмотрено: ${queueIdx}\n` +
    `Сохранено в БД: ${db.getBusinesses().length}\n` +
    `Последняя ошибка: ${lastError || 'нет'}`,
    { parse_mode: 'Markdown' }
  );
});

async function sendBiz(ctx, biz) {
  const greeting = `Здравствуйте! Меня зовут [Твое Имя], я занимаюсь разработкой сайтов. Подскажите, вам интересно было бы сделать современный, красивый и удобный сайт для вашего заведения?`;
  const text = `🏢 *${biz.name}*\n📍 ${biz.address}\n🏙 ${biz.city}\n📞 ${biz.phone}\n\n💬 _${greeting}_`;
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
  if (biz) { db.addBusiness(biz); ctx.answerCbQuery('✅ Сохранено'); }
  else ctx.answerCbQuery('Не найдено в очереди');
});

bot.action('stats', (ctx) => {
  if (!isAdmin(ctx)) return;
  const list = db.getBusinesses();
  if (!list.length) {
    return ctx.reply("Статистика пуста.", Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'back')]]));
  }
  let text = `📊 *Сохранённые бизнесы (${list.length}):*\n\n`;
  list.forEach((b, i) => {
    text += `${i + 1}. *${b.name}*\n📍 ${b.address}\n🏙 ${b.city || ''}\n📞 ${b.phone}\n\n`;
  });
  ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'back')]]) });
});

bot.action('status', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply(
    `📊 *Статус*\n\nИдёт сбор: ${isFilling ? 'да ⏳' : 'нет'}\nВ очереди: ${searchQueue.length}\nПросмотрено: ${queueIdx}\nСохранено: ${db.getBusinesses().length}\nОшибка: ${lastError || 'нет'}`,
    { parse_mode: 'Markdown' }
  );
});

bot.action('back', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply("Главное меню", Markup.inlineKeyboard([
    [Markup.button.callback('🔍 Искать', 'search')],
    [Markup.button.callback('📊 Статистика', 'stats')]
  ]));
});

// Ловим ошибки глобально, чтобы бот не падал
process.on('unhandledRejection', (reason) => {
  console.error('[unhandled]', reason);
  lastError = String(reason);
});

bot.launch();
console.log('PivoShop bot up');
