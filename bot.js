const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
const axios = require('axios');

const BOT_TOKEN = '9132376702:AAGMnUtp3m3kRTFFenaXp55qJbhcm27w8p0';
const ADMIN_IDS = [8525849849, 5232358021];

const bot = new Telegraf(BOT_TOKEN);
let searchResults = [];
let currentIndex = 0;

// Стоп-слова (крупные сети, которые нам не нужны)
const BLACKLIST = ["пятерочка", "магнит", "перекресток", "дикси", "лента", "ашан", "вкусвилл", "fix price", "фикс прайс", "wildberries", "ozon"];

function isAdmin(ctx) {
    return ctx.from && ADMIN_IDS.includes(ctx.from.id);
}

async function findBusinesses(city) {
    try {
        const geoRes = await axios.get(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`, {
            headers: { 'User-Agent': 'PivoShopBot/1.0' }
        });
        
        if (!geoRes.data || geoRes.data.length === 0) return [];
        const lat = geoRes.data[0].lat;
        const lon = geoRes.data[0].lon;

        // Ищем ВСЁ, что может быть коммерческим бизнесом (кафе, спортзалы, стоматологии, магазины и т.д.)
        const query = `
            [out:json][timeout:30];
            (
              node["amenity"~"cafe|restaurant|fast_food|dentist|bar|pub"](around:5000,${lat},${lon});
              node["leisure"~"fitness_centre|sports_centre"](around:5000,${lat},${lon});
              node["shop"](around:5000,${lat},${lon});
            );
            out body;
        `;
        const overpassRes = await axios.post('https://overpass-api.de/api/interpreter', `data=${encodeURIComponent(query)}`, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const elements = overpassRes.data.elements;
        let businesses = [];

        for (let el of elements) {
            const tags = el.tags || {};
            const name = tags.name;
            const phone = tags.phone || tags['contact:phone'];
            const website = tags.website || tags['contact:website'];
            const street = tags['addr:street'];
            const house = tags['addr:housenumber'];

            if (!name || !phone || website) continue; // Нужен телефон, название и отсутствие сайта

            // Проверка на стоп-слова (крупные сети)
            const lowerName = name.toLowerCase();
            if (BLACKLIST.some(word => lowerName.includes(word))) continue;

            let isOpen = true;
            if (tags.opening_hours === "closed") isOpen = false;

            if (isOpen) {
                businesses.push({
                    name: name,
                    address: street ? `${street}, ${house || ''}` : "Адрес не указан",
                    phone: phone,
                    // Ставим разные картинки в зависимости от типа
                    photo: `https://source.unsplash.com/400x300/?business,${encodeURIComponent(name)}` 
                });
            }
        }
        
        businesses.sort(() => Math.random() - 0.5);
        return businesses;
    } catch (e) {
        console.error("Ошибка парсинга:", e.message);
        return [];
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

    if (searchResults.length === 0 || currentIndex >= searchResults.length) {
        ctx.answerCbQuery('Ищу заведения...');
        const msg = await ctx.reply('⏳ Пожалуйста, подождите. Ищу бизнесы без сайтов...');
        
        searchResults = await findBusinesses("Москва");
        currentIndex = 0;

        if (searchResults.length === 0) {
            return ctx.editMessageText("😔 Не найдено подходящих бизнесов. Попробуйте позже.");
        }
        ctx.deleteMessage(msg.message_id);
    }

    const biz = searchResults[currentIndex];
    currentIndex++;

    const greeting = `Здравствуйте! Меня зовут [Твое Имя], я занимаюсь разработкой сайтов. Подскажите, вам интересно было бы сделать современный, красивый и удобный сайт для вашего заведения?`;

    const text = `🏢 *${biz.name}*\n\n📍 Адрес: ${biz.address}\n📞 Телефон: ${biz.phone}\n\n💬 *Текст для звонка:*\n_${greeting}_`;

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

bot.action(/^save:(.+)$/, (ctx) => {
    if (!isAdmin(ctx)) return;
    const bizName = ctx.match[1];
    const biz = searchResults.find(b => b.name === bizName);
    
    if (biz) {
        db.addBusiness(biz);
        ctx.answerCbQuery('✅ Сохранено!');
    }
    
    bot.handleUpdate({ ...ctx.update, callback_query: { ...ctx.callbackQuery, data: 'search' } });
});

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

bot.action('back', (ctx) => {
    if (!isAdmin(ctx)) return;
    ctx.reply("Главное меню", Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Искать', 'search')],
        [Markup.button.callback('📊 Статистика', 'stats')]
    ]));
});

bot.launch();
console.log('PivoShop bot up');
