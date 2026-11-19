// bot.js
const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
const { businessGenerator } = require('./twogis');

const BOT_TOKEN = '9132376702:AAGMnUtp3m3kRTFFenaXp55qJbhcm27w8p0';
const ADMIN_IDS = [8525849849, 5232358021];

const bot = new Telegraf(BOT_TOKEN);

// Глобальный генератор и текущая карточка
let generator = null;
let currentBiz = null;

function isAdmin(ctx) {
  return ctx.from && ADMIN_IDS.includes(ctx.from.id);
}

// Функция получения следующей карточки
async function nextCard(ctx) {
  if (!generator) {
    generator = businessGenerator();
  }

  try {
    const { value, done } = await generator.next();
    if (done) {
      currentBiz = null;
      return ctx.reply('🏁 Все бизнесы закончились. Пиши /start чтобы начать заново.', Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Начать заново', 'restart')]
      ]));
    }
    currentBiz = value;
    await sendBiz(ctx, currentBiz);
  } catch (e) {
    console.error('Ошибка генератора:', e);
    ctx.reply('⚠️ Ошибка при поиске. Пиши /start чтобы перезапустить.');
  }
}

async function sendBiz(ctx, biz) {
  const greeting = `Здравствуйте! Меня зовут [Твое Имя], я занимаюсь разработкой сайтов. Подскажите, вам интересно было бы сделать современный, красивый и удобный сайт для вашего заведения?`;
  const text = `🏢 *${biz.name}*\n\n📍 ${biz.address}\n🏙 ${biz.city}\n📞 ${biz.phone}\n\n💬 *Текст для звонка:*\n_${greeting}_`;
  
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('➕ Сохранить', `save:${biz.osm_id}`),
     Markup.button.callback('➖ Пропустить', 'next')]
  ]);
  
  try {
    await ctx.replyWithPhoto(biz.photo, { caption: text, parse_mode: 'Markdown', ...kb });
  } catch {
    await ctx.reply(text, { parse_mode: 'Markdown', ...kb });
  }
}

bot.start((ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply("Здравствуйте, добро пожаловать в PivoShop", Markup.inlineKeyboard([
    [Markup.button.callback('🔍 Искать', 'search')],
    [Markup.button.callback('📊 Статистика', 'stats')]
  ]));
});

// Запуск поиска
bot.action('search', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();
  await ctx.reply('⏳ Ищу первую карточку...');
  await nextCard(ctx);
});

// Обработка кнопки "Пропустить"
bot.action('next', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery('Ищу следующую...');
  await nextCard(ctx);
});

// Обработка кнопки "Сохранить"
bot.action(/^save:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  const id = ctx.match[1];
  
  if (currentBiz && String(currentBiz.osm_id) === String(id)) {
    db.addBusiness(currentBiz);
    await ctx.answerCbQuery('✅ Сохранено!');
    // Убираем кнопки у сохраненной карточки
    await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([])).catch(()=>{});
  } else {
    await ctx.answerCbQuery('Уже сохранено или устарело');
  }
  
  // Сразу выдаем следующую
  await nextCard(ctx);
});

// Перезапуск генератора
bot.action('restart', async (ctx) => {
  if (!isAdmin(ctx)) return;
  generator = businessGenerator();
  currentBiz = null;
  await ctx.answerCbQuery('Сброс...');
  await nextCard(ctx);
});

// Команда /search текстом
bot.command('search', async (ctx) => {
  if (!isAdmin(ctx)) return;
  generator = businessGenerator();
  currentBiz = null;
  await ctx.reply('⏳ Ищу первую карточку...');
  await nextCard(ctx);
});

// Статистика
bot.action('stats', (ctx) => {
  if (!isAdmin(ctx)) return;
  const list = db.getBusinesses();
  if (!list.length) return ctx.reply("Статистика пуста.", Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'back')]]));
  let text = `📊 *Сохранённые (${list.length}):*\n\n`;
  list.forEach((b, i) => { text += `${i + 1}. *${b.name}*\n📍 ${b.address}\n📞 ${b.phone}\n\n`; });
  ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'back')]]) });
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
