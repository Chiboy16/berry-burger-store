require("dotenv").config();
const fs = require("fs");
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_ID = Number(process.env.ADMIN_ID);
let adminState = {};

const app = express();
app.use(express.json());

console.log("🍓 Berry Burger Store - Verified Architecture Live");

const LOW_STOCK_THRESHOLD = 3;
const REFERRAL_BONUS_PERCENT = 10;

function loadDB() { return JSON.parse(fs.readFileSync("./db.json")); }
function saveDB(db) { fs.writeFileSync("./db.json", JSON.stringify(db, null, 2)); }

function initDB() {
    let db;
    try { db = loadDB(); } catch (e) {
        db = { users: {}, stock: { whatsapp: [], telegram: [] }, nextIds: { whatsapp: 100, telegram: 100 }, payments: {}, referrals: {}, usedRefs: {}, history: {}, orders: {}, banned: {} };
    }
    if (!db.users) db.users = {}; if (!db.stock) db.stock = { whatsapp: [], telegram: [] };
    if (!db.nextIds) db.nextIds = { whatsapp: 100, telegram: 100 }; if (!db.payments) db.payments = {};
    if (!db.referrals) db.referrals = {}; if (!db.usedRefs) db.usedRefs = {};
    if (!db.history) db.history = {}; if (!db.orders) db.orders = {}; if (!db.banned) db.banned = {};
    saveDB(db);
}
initDB();

function sortStock(db) {
    db.stock.whatsapp.sort((a, b) => a.price - b.price);
    db.stock.telegram.sort((a, b) => a.price - b.price);
}

function logTransaction(db, chatId, type, amount, description) {
    if (!db.history[chatId]) db.history[chatId] = [];
    db.history[chatId].push({ type, amount, description, time: new Date().toLocaleString() });
}

function checkLowStockAlert(db, type) {
    const count = db.stock[type].length;
    if (count <= LOW_STOCK_THRESHOLD) {
        bot.sendMessage(ADMIN_ID, `⚠️ **LOW STOCK ALERT** ⚠️\n\nThe ${type.toUpperCase()} inventory has fallen down to **${count}** items left!`);
    }
}
setInterval(() => {
    try {
        const db = loadDB(); let changed = false; const cutoff = Date.now() - 60 * 60 * 1000;
        Object.keys(db.payments).forEach(ref => {
            if (db.payments[ref].status === "pending") {
                const parts = ref.split("_"); const timestamp = Number(parts[1]);
                if (timestamp && timestamp < cutoff) { db.payments[ref].status = "failed"; changed = true; }
            }
        });
        if (changed) saveDB(db);
    } catch (e) {}
}, 10 * 60 * 1000);

function menu(chatId, balance = 0) {
    const keyboard = [["💰 Top Up Wallet", "🛒 Buy Numbers"], ["💳 Balance & History", "👥 Invite Program"], ["📞 FAQ", "📞 Support"]];
    if (chatId === ADMIN_ID) { keyboard.splice(2, 0, ["📊 Admin Panel"]); }
    bot.sendMessage(chatId, `🍓 **Berry Burger Store**\n\nBalance: **₦${balance}**\n\nSelect an action below 👇`, {
        parse_mode: "Markdown", reply_markup: { keyboard: keyboard, resize_keyboard: true }
    });
}

bot.onText(/\/start (.+)/, (msg, match) => {
    const db = loadDB(); const chatId = msg.chat.id; if (db.banned[chatId]) return;
    const referrerId = Number(match[1]);
    if (!db.users[chatId]) {
        db.users[chatId] = { balance: 0, ref: referrerId !== chatId ? referrerId : null };
        if (referrerId && referrerId !== chatId) {
            if (!db.referrals[referrerId]) db.referrals[referrerId] = [];
            if (!db.referrals[referrerId].includes(chatId)) db.referrals[referrerId].push(chatId);
        }
        saveDB(db);
    }
    menu(chatId, db.users[chatId].balance);
});

bot.onText(/\/start$/, (msg) => {
    const db = loadDB(); const chatId = msg.chat.id; if (db.banned[chatId]) return;
    if (!db.users[chatId]) { db.users[chatId] = { balance: 0, ref: null }; saveDB(db); }
    menu(chatId, db.users[chatId].balance);
});
bot.on("message", (msg) => {
    const db = loadDB(); const chatId = msg.chat.id; const text = msg.text;
    if (db.banned[chatId] || !text || text.startsWith("/")) return;
    const user = db.users[chatId] || { balance: 0, ref: null };

    if (text === "⬅️ Back") { if (adminState[chatId]) delete adminState[chatId]; return menu(chatId, user.balance); }

    if (text === "💳 Balance & History") {
        const historyList = db.history[chatId] || [];
        let historyText = `💳 **YOUR ACCOUNT SUMMARY**\n\nBalance: **₦${user.balance}**\n\n📋 *Recent Wallet Ledger:*`;
        if (historyList.length === 0) { historyText += "\nNo transaction records found yet."; } else {
            historyList.slice(-5).reverse().forEach(h => {
                historyText += `\n\n${h.type === "deposit" ? "➕" : "➖"} **₦${h.amount}**\n📅 _${h.time}_\n📝 \`${h.description}\``;
            });
        }
        return bot.sendMessage(chatId, historyText, { parse_mode: "Markdown" });
    }

    if (text === "👥 Invite Program") {
        const referralsCount = db.referrals[chatId] ? db.referrals[chatId].length : 0;
        return bot.sendMessage(chatId, `👥 **REFERRAL PROGRAM**\n\nEarn **${REFERRAL_BONUS_PERCENT}%** on your friend's first top-up!\n\n📈 **Your Stats:**\n• Friends Invited: **${referralsCount}**\n• Total Bonus Earned: **₦${db.usedRefs[chatId] || 0}**\n\n🔗 **Your Link:**\n\`https://t.me/${bot.options.username || 'Bot'}_bot?start=${chatId}\``, { parse_mode: "Markdown" });
    }

    if (text === "📞 Support") return bot.sendMessage(chatId, "📞 For support, contact: @Shopwithberryburger");
    if (text === "📞 FAQ") return bot.sendMessage(chatId, `📌 **WATCH HOW TO LOG IN TO WHATSAPP**\n\n🔗 Tutorial: https://tinyurl.com/34jpuc23\n\n⚠️ Warranty: 10 hours only.`, { parse_mode: "Markdown" });

    if (text === "🛒 Buy Numbers") {
        return bot.sendMessage(chatId, "Select the platform category 👇", {
            reply_markup: { keyboard: [["📱 WhatsApp Stock", "✈️ Telegram Stock"], ["⬅️ Back"]], resize_keyboard: true }
        });
    }

    if (text === "📱 WhatsApp Stock" || text === "✈️ Telegram Stock") {
        const targetType = text === "📱 WhatsApp Stock" ? "whatsapp" : "telegram";
        const stockItems = db.stock[targetType];
        if (stockItems.length === 0) return bot.sendMessage(chatId, "❌ Out of stock.");
        let catalogText = `🛒 **AVAILABLE ${targetType.toUpperCase()} ITEMS:**`;
        const inlineButtons = [];
        stockItems.slice(0, 5).forEach((item) => {
            const displayId = `${targetType === "whatsapp" ? "WA" : "TG"}-${item.id}`;
            catalogText += `\n\n📦 **ID: ${displayId}** | Price: *₦${item.price}*`;
            inlineButtons.push([{ text: `Buy ${displayId} (₦${item.price})`, callback_data: `CONFIRM_BUY:${targetType}:${item.id}` }]);
        });
        return bot.sendMessage(chatId, catalogText, { parse_mode: "Markdown", reply_markup: { inline_keyboard: inlineButtons } });
    }
    if (text === "📊 Admin Panel" && chatId === ADMIN_ID) {
        return bot.sendMessage(chatId, `👑 **ADMIN PANEL**`, {
            reply_markup: { keyboard: [["➕ Add Stock", "📦 View Stock"], ["📝 Edit Stock Item", "❌ Delete Stock"], ["📊 Analytics", "📢 Broadcast Blast"], ["⬅️ Back"]], resize_keyboard: true }
        });
    }

    if (text === "📊 Analytics" && chatId === ADMIN_ID) {
        let totalRev = Object.values(db.payments).filter(p => p.status === "success").reduce((a, b) => a + b.amount, 0);
        return bot.sendMessage(chatId, `📊 **ANALYTICS**\n\n• All-Time Revenue: **₦${totalRev}**\n• WhatsApp Stock: ${db.stock.whatsapp.length}\n• Telegram Stock: ${db.stock.telegram.length}`, { parse_mode: "Markdown" });
    }

    if (text === "📢 Broadcast Blast" && chatId === ADMIN_ID) {
        adminState[chatId] = { step: "BROADCAST_TXT" };
        return bot.sendMessage(chatId, "📝 Enter the global message text:");
    }

    if (adminState[chatId] && adminState[chatId].step === "BROADCAST_TXT") {
        const msgTxt = text; delete adminState[chatId];
        Object.keys(db.users).forEach(uid => bot.sendMessage(uid, `📢 **STORE ANNOUNCEMENT**\n\n${msgTxt}`, { parse_mode: "Markdown" }).catch(()=>{}));
        return bot.sendMessage(chatId, `✅ Broadcast processing initiated.`);
    }

    if (text === "➕ Add Stock" && chatId === ADMIN_ID) {
        adminState[chatId] = { step: "TYPE" };
        return bot.sendMessage(chatId, `Select type:`, { reply_markup: { keyboard: [["📱 WhatsApp"], ["✈️ Telegram"], ["⬅️ Back"]], resize_keyboard: true } });
    }

    if (adminState[chatId] && adminState[chatId].step === "TYPE") {
        adminState[chatId].type = text.includes("WhatsApp") ? "whatsapp" : "telegram";
        adminState[chatId].step = "PRICE";
        return bot.sendMessage(chatId, "💰 Enter price:");
    }

    if (adminState[chatId] && adminState[chatId].step === "PRICE") {
        adminState[chatId].price = Number(text); adminState[chatId].step = "NUMBER";
        return bot.sendMessage(chatId, "📞 Enter phone number:");
    }

    if (adminState[chatId] && adminState[chatId].step === "NUMBER") {
        adminState[chatId].number = text; adminState[chatId].step = "LINK";
        return bot.sendMessage(chatId, "🔗 Enter login link (or 'None'):");
    }

    if (adminState[chatId] && adminState[chatId].step === "LINK") {
        adminState[chatId].link = text; adminState[chatId].step = "DETAILS";
        return bot.sendMessage(chatId, "📝 Enter extra notes (or 'None'):");
    }

    if (adminState[chatId] && adminState[chatId].step === "DETAILS") {
        const type = adminState[chatId].type; const nextId = db.nextIds[type];
        db.stock[type].push({ id: nextId, number: adminState[chatId].number, price: adminState[chatId].price, link: adminState[chatId].link, details: text });
        db.nextIds[type] += 1; sortStock(db); saveDB(db); delete adminState[chatId];
        return bot.sendMessage(chatId, `✅ Added as ID: **${type === "whatsapp" ? "WA" : "TG"}-${nextId}**`, { parse_mode: "Markdown" });
    }
    if (text === "📝 Edit Stock Item" && chatId === ADMIN_ID) {
        adminState[chatId] = { step: "EDIT_ID" };
        return bot.sendMessage(chatId, "📝 Enter ID to edit (e.g., `WA-100`):", { parse_mode: "Markdown" });
    }

    if (adminState[chatId] && adminState[chatId].step === "EDIT_ID") {
        const input = text.toUpperCase().trim();
        let type = input.startsWith("WA-") ? "whatsapp" : (input.startsWith("TG-") ? "telegram" : null);
        if (!type) return bot.sendMessage(chatId, "❌ Format error. Use `WA-100` or `TG-100`:");
        const idVal = Number(input.replace("WA-", "").replace("TG-", ""));
        const idx = db.stock[type].findIndex(x => x.id === idVal);
        if (idx === -1) return bot.sendMessage(chatId, "❌ Item not found.");
        adminState[chatId] = { step: "EDIT_FIELD", type, idx };
        return bot.sendMessage(chatId, `Found! Enter field name to edit (\`price\`, \`number\`, \`link\`, or \`details\`):`, { parse_mode: "Markdown" });
    }

    if (adminState[chatId] && adminState[chatId].step === "EDIT_FIELD") {
        adminState[chatId].field = text.toLowerCase().trim(); adminState[chatId].step = "EDIT_VAL";
        return bot.sendMessage(chatId, `Enter new value for ${text}:`);
    }

    if (adminState[chatId] && adminState[chatId].step === "EDIT_VAL") {
        const state = adminState[chatId];
        let val = state.field === "price" ? Number(text) : text;
        db.stock[state.type][state.idx][state.field] = val;
        if (state.field === "price") sortStock(db);
        saveDB(db); delete adminState[chatId];
        return bot.sendMessage(chatId, "✅ Updated successfully!");
    }

    if (text === "📦 View Stock" && chatId === ADMIN_ID) {
        let out = `📦 **RESERVES**\n`;
        db.stock.whatsapp.forEach(i => out += `• **WA-${i.id}** | ₦${i.price} | \`${i.number}\`\n`);
        db.stock.telegram.forEach(i => out += `• **TG-${i.id}** | ₦${i.price} | \`${i.number}\`\n`);
        return bot.sendMessage(chatId, out, { parse_mode: "Markdown" });
    }

    if (text === "❌ Delete Stock" && chatId === ADMIN_ID) {
        adminState[chatId] = { step: "DELETE" }; return bot.sendMessage(chatId, "Enter item ID to delete (e.g. `WA-100`):");
    }

    if (adminState[chatId] && adminState[chatId].step === "DELETE") {
        const input = text.toUpperCase().trim();
        let type = input.startsWith("WA-") ? "whatsapp" : "telegram";
        let targetId = Number(input.replace("WA-", "").replace("TG-", ""));
        db.stock[type] = db.stock[type].filter(x => x.id !== targetId);
        saveDB(db); delete adminState[chatId];
        return bot.sendMessage(chatId, "✅ Removed from active rows.");
    }
    if (text === "💰 Top Up Wallet") {
        adminState[chatId] = { step: "TOPUP_AMOUNT" };
        return bot.sendMessage(chatId, "💰 Enter the amount you want to deposit (Minimum ₦100):", {
            reply_markup: { keyboard: [["500", "1000", "2500"], ["⬅️ Back"]], resize_keyboard: true }
        });
    }

    if (adminState[chatId] && adminState[chatId].step === "TOPUP_AMOUNT") {
        const amt = Number(text);
        if (isNaN(amt) || amt < 100) {
            return bot.sendMessage(chatId, "❌ Invalid amount. Please enter a number greater than or equal to 100:");
        }
        delete adminState[chatId];
        
        bot.sendMessage(chatId, "⏳ Generating secure checkout link, please wait...");
        const ref = "BB_" + Date.now() + "_" + chatId;

        axios.post("https://api.korapay.com/merchant/api/v1/charges/initialize", {
            amount: amt,
            currency: "NGN",
            reference: ref,
            notification_url: "https://your-domain.com/api/payment-webhook",
            redirect_url: "https://t.me/" + (bot.options.username || "Bot") + "_bot",
            customer: {
                email: chatId + "@telegram.com",
                name: msg.from.first_name || "Telegram User"
            }
        }, {
            headers: {
                Authorization: "Bearer " + process.env.KORA_SECRET_KEY,
                "Content-Type": "application/json"
            }
        })
        .then(response => {
            if (response.data && response.data.data && response.data.data.checkout_url) {
                const checkoutUrl = response.data.data.checkout_url;
                db.payments[ref] = { userId: chatId, amount: amt, status: "pending" };
                saveDB(db);
                return bot.sendMessage(chatId, `💳 **INVOICE GENERATED**\n\nAmount: **₦${amt}**`, {
                    parse_mode: "Markdown",
                    reply_markup: { inline_keyboard: [[{ text: "Proceed Payment ✅", url: checkoutUrl }]] }
                });
            } else {
                return bot.sendMessage(chatId, "❌ API error. Check your KORA_SECRET_KEY.");
            }
        })
        .catch(err => {
            console.error("Kora Error Details:", err.response ? err.response.data : err.message);
            return bot.sendMessage(chatId, "❌ Server authentication failed. Try again later.");
        });
        return;
    }
});
bot.on("callback_query", (query) => {
    const data = query.data; const chatId = query.message.chat.id; const db = loadDB();
    const user = db.users[chatId] || { balance: 0, ref: null };

    if (data.startsWith("CONFIRM_BUY:")) {
        const [, type, idStr] = data.split(":"); const item = db.stock[type].find(x => x.id === Number(idStr));
        if (!item) return bot.sendMessage(chatId, "❌ No longer available.");
        return bot.sendMessage(chatId, `⚠️ **CONFIRM PURCHASE**\n\nID: **${type === "whatsapp" ? "WA" : "TG"}-${item.id}**\nPrice: **₦${item.price}**`, {
            reply_markup: { inline_keyboard: [[{ text: "Authorize ✅", callback_data: `COMMIT_BUY:${type}:${item.id}` }, { text: "Cancel ❌", callback_data: "CANCEL" }]] }
        });
    }

    if (data.startsWith("COMMIT_BUY:")) {
        const [, type, idStr] = data.split(":"); const idx = db.stock[type].findIndex(x => x.id === Number(idStr));
        if (idx === -1) return bot.sendMessage(chatId, "❌ Item sold out.");
        const item = db.stock[type][idx];
        if (user.balance < item.price) return bot.sendMessage(chatId, "❌ Insufficient balance.");

        user.balance -= item.price; db.users[chatId] = user; db.stock[type].splice(idx, 1);
        const orderId = "INV-" + Date.now().toString().substring(7);
        db.orders[orderId] = { buyer: chatId, type, number: item.number, price: item.price, time: new Date().toLocaleString() };
        logTransaction(db, chatId, "purchase", item.price, `Bought ${type === "whatsapp" ? "WA" : "TG"}-${item.id}`);
        sortStock(db); saveDB(db); bot.answerCallbackQuery(query.id);

        bot.sendMessage(chatId, `🎉 **PURCHASE COMPLETE**\n\nReceipt Key: \`${orderId}\`\n📞 Number: \`${item.number}\`\n🔗 Link: ${item.link || "None"}\n📝 Notes: \`${item.details || "None"}\`\n💰 Balance Left: **₦${user.balance}**`, { parse_mode: "Markdown" });
        return checkLowStockAlert(db, type);
    }
    if (data === "CANCEL") { bot.answerCallbackQuery(query.id); return bot.sendMessage(chatId, "❌ Cancelled."); }
});
app.post("/api/payment-webhook", (req, res) => {
    try {
        const db = loadDB(); const data = req.body;
        const ref = data?.data?.reference; const status = data?.data?.status;
        if (!db.payments[ref]) return res.sendStatus(404);
        if (db.payments[ref].status === "success") return res.sendStatus(200);

        if (status === "success") {
            const payment = db.payments[ref]; const uid = payment.userId;
            if (!db.users[uid]) db.users[uid] = { balance: 0, ref: null };
            const hasDep = (db.history[uid] || []).some(t => t.type === "deposit");

            db.users[uid].balance += payment.amount;
            logTransaction(db, uid, "deposit", payment.amount, `Top Up Ref: ${ref}`);
            db.payments[ref].status = "success";

            if (!hasDep && db.users[uid].ref && db.users[db.users[uid].ref]) {
                const up = db.users[uid].ref; const rwd = Math.floor((payment.amount * REFERRAL_BONUS_PERCENT) / 100);
                db.users[up].balance += rwd; db.usedRefs[up] = (db.usedRefs[up] || 0) + rwd;
                logTransaction(db, up, "deposit", rwd, `Referral bonus from ${uid}`);
                bot.sendMessage(up, `🎁 **Referral Bonus Credited!**\n\nReceived **₦${rwd}**!`);
            }
            saveDB(db); bot.sendMessage(uid, `💳 **Wallet Funded Successfully!** Added **₦${payment.amount}**.`);
        }
        res.sendStatus(200);
    } catch (e) { res.sendStatus(500); }
});

app.listen(3000, () => { console.log("Webhook running on port 3000"); });
