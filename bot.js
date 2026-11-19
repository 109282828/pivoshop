const { Telegraf, Markup } = require('telegraf');
const db = require('./db');

const BOT_TOKEN = '9132376702:AAGMnUtp3m3kRTFFenaXp55qJbhcm27w8p0';
const ADMIN_IDS = [8525849849, 5232358021]; // Твой и второй админ

const bot = new Telegraf(BOT_TOKEN);

// Проверка на админа (если ID в списке, то пропускаем)
function isAdmin(ctx) {
    return ctx.from && ADMIN_IDS.includes(ctx.from.id);
}

const fakeBusinesses = [
    { name: "Кофейня 'Пенка'", address: "ул. Ленина, 15", phone: "+7 (999) 123-45-67", photo: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=500" },
    { name: "Бар 'Хмель'", address: "пр. Мира, 42", phone: "+7 (988) 765-43-21", photo: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=500" },
    { name: "Пекарня 'Хлеб'", address: "ул. Пушкина, 10", phone: "+7 (921) 111-22-33", photo: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500" },
    { name: "Суши-бар 'Токио'", address: "ул. Гагарина, 5", phone: "+7 (911) 222-33-44", photo: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=500" },
    { name: "Пиццерия 'Додо'", address: "ул. Советская, 8", phone: "+7 (800) 333-22-11", photo: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500" }
];

let currentIndex = 0;

// Главное меню
bot.start((ctx) => {
    if (!isAdmin(ctx)) return;
    ctx.reply("Здравствуйте, добро пожаловать в PivoShop", Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Искать', 'search')],
        [Markup.button.callback('📊 Статистика', 'stats')]
    ]));
});

// Поиск
bot.action('search', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    const biz = fakeBusinesses[currentIndex];
    currentIndex = (currentIndex + 1) % fakeBusinesses.length;

    const text = `🏢 *${biz.name}*\n\n📍 Адрес: ${biz.address}\n📞 Телефон: ${biz.phone}`;

    try {
        await ctx.replyWithPhoto(biz.photo, {
            caption: text,
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('➕ Сохранить', `save:${biz.name}`), Markup.button.callback('➖ Пропустить', 'search')]
            ])
        });
    } catch (e) {
        await ctx.reply(text, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('➕ Сохранить', `save:${biz.name}`), Markup.button.callback('➖ Пропустить', 'search')]
            ])
        });
    }
});

// Сохранение
bot.action(/^save:(.+)$/, (ctx) => {
    if (!isAdmin(ctx)) return;
    const bizName = ctx.match[1];
    const biz = fakeBusinesses.find(b => b.name === bizName);
    
    if (biz) {
        db.addBusiness(biz);
        ctx.answerCbQuery('✅ Сохранено!');
    }
    
    // Сразу ищем следующий
    bot.handleUpdate({ ...ctx.update, callback_query: { ...ctx.callbackQuery, data: 'search' } });
});

// Статистика
bot.action('stats', (ctx) => {
    if (!isAdmin(ctx)) return;
    const list = db.getBusinesses();
    
    if (!list.length) {
        return ctx.reply("Статистика пуста. Вы еще не сохранили ни одного бизнеса.", Markup.inlineKeyboard([
            [Markup.button.callback('« Назад', 'back')]
        ]));
    }

    let text = `📊 *Сохраненные бизнесы (${list.length}):*\n\n`;
    list.forEach((b, i) => {
        text += `${i + 1}. *${b.name}*\n📍 ${b.address}\n📞 ${b.phone}\n\n`;
    });

    ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'back')]]) });
});

// Назад в меню
bot.action('back', (ctx) => {
    if (!isAdmin(ctx)) return;
    ctx.reply("Главное меню", Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Искать', 'search')],
        [Markup.button.callback('📊 Статистика', 'stats')]
    ]));
});

bot.launch();
console.log('PivoShop bot up');
