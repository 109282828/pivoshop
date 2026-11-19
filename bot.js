// bot.js
const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
const { businessGenerator } = require('./yandex_html');

const BOT_TOKEN = '9001719911:AAEO1mAAJWb34jbgsc4KnIhqEe3rwac9__Y';
const ADMIN_IDS = [8525849849, 5232358021];

const bot = new Telegraf(BOT_TOKEN);

let generator = null;
let currentBiz = null;

function isAdmin(ctx) {
  return ctx.from && ADMIN_IDS.includes(ctx.from.id);
}

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
    generator = null;
    ctx.reply(`⚠️ Ошибка парсинга: ${e.message}`);
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

bot.action('search', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();
  await ctx.reply('⏳ Ищу первую карточку...');
  await nextCard(ctx);
});

bot.action('next', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery('Ищу следующую...');
  await nextCard(ctx);
});

bot.action(/^save:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  const id = ctx.match[1];
  
  if (currentBiz && String(currentBiz.osm_id) === String(id)) {
    db.addBusiness(currentBiz);
    await ctx.answerCbQuery('✅ Сохранено!');
    await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([])).catch(()=>{});
  } else {
    await ctx.answerCbQuery('Уже сохранено или устарело');
  }
  
  await nextCard(ctx);
});

bot.action('restart', async (ctx) => {
  if (!isAdmin(ctx)) return;
  generator = businessGenerator();
  currentBiz = null;
  await ctx.answerCbQuery('Сброс...');
  await nextCard(ctx);
});

bot.command('search', async (ctx) => {
  if (!isAdmin(ctx)) return;
  generator = businessGenerator();
  currentBiz = null;
  await ctx.reply('⏳ Ищу первую карточку...');
  await nextCard(ctx);
});

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
