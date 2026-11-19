// bot.js
const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
const { findAllCities } = require('./finder');

const BOT_TOKEN = '9132376702:AAGMnUtp3m3kRTFFenaXp55qJbhcm27w8p0';
const ADMIN_IDS = [8525849849, 5232358021];

const bot = new Telegraf(BOT_TOKEN);
let searchQueue = [];
let queueIdx = 0;
let isFilling = false;

function isAdmin(ctx) {
  return ctx.from && ADMIN_IDS.includes(ctx.from.id);
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

  if (searchQueue.length === 0 && !isFilling) {
    isFilling = true;
    await ctx.answerCbQuery('Запускаю сбор по РФ...');
    const msg = await ctx.reply('⏳ Собираю бизнесы по всем городам РФ. Это займёт время — стримлю по мере готовности.');

    findAllCities(async (batch) => {
      searchQueue.push(...batch);
      for (const biz of batch.slice(0, 15)) {
        await sendBiz(ctx, biz);
      }
    }).then(total => {
      isFilling = false;
      ctx.reply(`✅ Сбор завершён. Всего найдено: ${total}. В очереди: ${searchQueue.length}.`);
    }).catch(e => {
      isFilling = false;
      console.error('finder error:', e);
      ctx.reply('⚠️ Сбор прерван. Найденное сохранено в found.jsonl. /search перезапустит с чекпойнта.');
    });

    ctx.deleteMessage(msg.message_id).catch(()=>{});
    return;
  }

  const biz = searchQueue[queueIdx++];
  if (!biz) return ctx.answerCbQuery('Очередь пуста. /search перезапустит сбор.');
  await sendBiz(ctx, biz);
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

bot.action(/^save:(\d+)$/, (ctx) => {
  if (!isAdmin(ctx)) return;
  const id = Number(ctx.match[1]);
  const biz = searchQueue.find(b => b.osm_id === id);
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

bot.action('back', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply("Главное меню", Markup.inlineKeyboard([
    [Markup.button.callback('🔍 Искать', 'search')],
    [Markup.button.callback('📊 Статистика', 'stats')]
  ]));
});

bot.launch();
console.log('PivoShop bot up');
