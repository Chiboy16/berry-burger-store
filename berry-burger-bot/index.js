require("dotenv").config();
const fs = require("fs");
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_ID = Number(process.env.ADMIN_ID);
let adminState = {};

const app = express();
app.use(express.json());

console.log("🍓 Berry Burger Store LIVE");

// =====================
// DB
// =====================
function loadDB() {
    return JSON.parse(fs.readFileSync("./db.json"));
}

function saveDB(db) {
    fs.writeFileSync("./db.json", JSON.stringify(db, null, 2));
}

// =====================
// INIT DB
// =====================
function initDB() {
    let db;
    try {
        db = loadDB();
    } catch (e) {
        db = {
            users: {},
            stock: { whatsapp: [], telegram: [] },
            payments: {},
            referrals: {},
            usedRefs: {}
        };
    }

    if (!db.users) db.users = {};
    if (!db.stock) db.stock = { whatsapp: [], telegram: [] };
    if (!db.payments) db.payments = {};
    if (!db.referrals) db.referrals = {};
    if (!db.usedRefs) db.usedRefs = {};

    saveDB(db);
}
initDB();

// =====================
// SORT STOCK (AUTO)
// =====================
function sortStock(db) {
    db.stock.whatsapp.sort((a, b) => a.price - b.price);
    db.stock.telegram.sort((a, b) => a.price - b.price);
}

// =====================
// MENU (DYNAMIC BASED ON ROLE)
// =====================
function menu(chatId, balance = 0) {
    const keyboard = [
        ["💰 Top Up Wallet"],
        ["🛒 Buy Numbers"],
        ["💳 Balance"],
        ["📞 FAQ"],
        ["📞 Support"]
    ];

    // Only inject the Admin Panel button if the user is actually the admin
    if (chatId === ADMIN_ID) {
        keyboard.splice(4, 0, ["📊 Admin Panel"]); 
    }

    bot.sendMessage(chatId,
`🍓 Berry Burger Store

Balance: ₦${balance}

Choose option 👇`,
{
        reply_markup: {
            keyboard: keyboard,
            resize_keyboard: true
        }
    });
}

// =====================
// START
// =====================
bot.onText(/\/start/, (msg) => {

    const db = loadDB();
    const chatId = msg.chat.id;

    if (!db.users[chatId]) {
        db.users[chatId] = { balance: 0, ref: null };
        saveDB(db);
    }

    menu(chatId, db.users[chatId].balance);
});

// =====================
// MESSAGE HANDLER
// =====================
bot.on("message", (msg) => {

    const db = loadDB();
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    const user = db.users[chatId] || { balance: 0 };

    // BACK
    if (text === "⬅️ Back") return menu(chatId, user.balance);

    // BALANCE
    if (text === "💳 Balance") {
        return bot.sendMessage(chatId, `Balance: ₦${user.balance}`);
    }

    // SUPPORT
    if (text === "📞 Support") {
        return bot.sendMessage(chatId, "@Shopwithberryburger");
    }

    // FAQ
    if (text === "📞 FAQ") {
        return bot.sendMessage(chatId,
`📌 WATCH HOW TO LOG IN TO WHATSAPP WITH SMS LINK

🔗 Tutorial: https://tinyurl.com/34jpuc23

⚠️ IMPORTANT NOTICE:
• All logs come with a 10-hour warranty only.
• Issues reported after the warranty period may not be attended to.
• Please wait a few hours before making any changes or edits.
• For better security, use a paid VPN (HMA or Surfshark recommended).
• Always secure your logs after purchase.

🙏 Thank you for choosing Berry Burger Store.

We appreciate your trust and support. Enjoy our services and trade with confidence.`);
    }

    // =====================
    // ADMIN PANEL
    // =====================
    if (text === "📊 Admin Panel") {

        if (chatId !== ADMIN_ID) {
            return bot.sendMessage(chatId, "❌ Access denied");
        }

        const totalUsers = Object.keys(db.users).length;
        const totalStock = db.stock.whatsapp.length + db.stock.telegram.length;
        const totalSales = Object.values(db.payments).filter(p => p.status === "success").length;

        return bot.sendMessage(chatId,
`👑 ADMIN PANEL

👥 Users: ${totalUsers}
📦 Stock: ${totalStock}
💰 Sales: ${totalSales}`,
{
            reply_markup: {
                keyboard: [
                    ["➕ Add Stock"],
                    ["📦 View Stock"],
                    ["❌ Delete Stock"],
                    ["📊 Analytics"],
                    ["⬅️ Back"]
                ],
                resize_keyboard: true
            }
        });
    }

    // =====================
    // ANALYTICS
    // =====================
    if (text === "📊 Analytics" && chatId === ADMIN_ID) {

        const totalUsers = Object.keys(db.users).length;
        const revenue = Object.values(db.payments)
            .filter(p => p.status === "success")
            .reduce((a, b) => a + b.amount, 0);

        return bot.sendMessage(chatId,
`📊 SALES ANALYTICS

👥 Users: ${totalUsers}
💰 Revenue: ₦${revenue}`);
    }

    // =====================
    // ADD STOCK (EXPANDED FLOW)
    // =====================
    if (text === "➕ Add Stock" && chatId === ADMIN_ID) {
        adminState[chatId] = { step: "TYPE" };
        return bot.sendMessage(chatId, `Select stock type`, {
            reply_markup: {
                keyboard: [["📱 WhatsApp"], ["✈️ Telegram"], ["⬅️ Back"]],
                resize_keyboard: true
            }
        });
    }

    if (adminState[chatId] && adminState[chatId].step === "TYPE" && (text === "📱 WhatsApp" || text === "✈️ Telegram")) {
        adminState[chatId].type = text === "📱 WhatsApp" ? "whatsapp" : "telegram";
        adminState[chatId].step = "PRICE";
        return bot.sendMessage(chatId, "💰 Send stock price (numbers only):");
    }

    if (adminState[chatId] && adminState[chatId].step === "PRICE") {
        if (isNaN(text)) return bot.sendMessage(chatId, "❌ Please send a valid number for price:");
        adminState[chatId].price = Number(text);
        adminState[chatId].step = "NUMBER";
        return bot.sendMessage(chatId, "📞 Send the phone number:");
    }

    if (adminState[chatId] && adminState[chatId].step === "NUMBER") {
        adminState[chatId].number = text;
        adminState[chatId].step = "LINK";
        return bot.sendMessage(chatId, "🔗 Send the Login Link / SMS Link (or type 'None' if not applicable):");
    }

    if (adminState[chatId] && adminState[chatId].step === "LINK") {
        adminState[chatId].link = text;
        adminState[chatId].step = "DETAILS";
        return bot.sendMessage(chatId, "📝 Send any extra account details/notes (or type 'None'):");
    }

    if (adminState[chatId] && adminState[chatId].step === "DETAILS") {
        const item = {
            id: Date.now(),
            number: adminState[chatId].number,
            price: adminState[chatId].price,
            link: adminState[chatId].link,
            details: text
        };

        db.stock[adminState[chatId].type].push(item);
        sortStock(db);
        saveDB(db);

        delete adminState[chatId];
        return bot.sendMessage(chatId, "✅ Stock Added Successfully with all details!");
    }

    // =====================
    // VIEW STOCK
    // =====================
    if (text === "📦 View Stock" && chatId === ADMIN_ID) {
        let stockText = `📦 CURRENT STOCK\n\nWhatsApp: ${db.stock.whatsapp.length}\nTelegram: ${db.stock.telegram.length}\n\n`;

        db.stock.whatsapp.forEach(item => {
            stockText += `WA ID: ${item.id}\n₦${item.price} | ${item.number}\nLink: ${item.link || 'None'}\nDetails: ${item.details || 'None'}\n\n`;
        });

        db.stock.telegram.forEach(item => {
            stockText += `TG ID: ${item.id}\n₦${item.price} | ${item.number}\nLink: ${item.link || 'None'}\nDetails: ${item.details || 'None'}\n\n`;
        });

        if (db.stock.whatsapp.length === 0 && db.stock.telegram.length === 0) {
            stockText += "No stock available";
        }
        return bot.sendMessage(chatId, stockText);
    }

    // =====================
    // DELETE STOCK
    // =====================
    if (text === "❌ Delete Stock" && chatId === ADMIN_ID) {
        adminState[chatId] = { step: "DELETE" };
        return bot.sendMessage(chatId, "Send Stock ID to delete:");
    }

    if (adminState[chatId] && adminState[chatId].step === "DELETE") {
        db.stock.whatsapp = db.stock.whatsapp.filter(x => x.id != text);
        db.stock.telegram = db.stock.telegram.filter(x => x.id != text);
        saveDB(db);
        delete adminState[chatId];
        return bot.sendMessage(chatId, "✅ Stock Deleted");
    }

    // =====================
    // TOPUP
    // =====================
    if (text === "💰 Top Up Wallet") {
        return bot.sendMessage(chatId,
`Select amount 👇`,
{
            reply_markup: {
                keyboard: [
                    ["500", "1000", "2500"],
                    ["5000", "7500", "10000"],
                    ["20000"],
                    ["⬅️ Back"]
                ],
                resize_keyboard: true
            }
        });
    }

    // =====================
    // PAYMENT CREATE
    // =====================
    const amounts = ["500", "1000", "2500", "5000", "7500", "10000", "20000"];

    if (amounts.includes(text)) {

        const amount = Number(text);
        const reference = "BB_" + Date.now() + "_" + chatId;

        db.payments[reference] = {
            userId: chatId,
            amount,
            status: "pending"
        };

        saveDB(db);

        const payLink = `${process.env.KORA_CHECKOUT}?reference=${reference}&amount=${amount}`;

        return bot.sendMessage(chatId,
`💳 Payment Ready

Tap below 👇`,
{
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Proceed Payment ✅", url: payLink }]
                ]
            }
        });
    }

    // =====================
    // BUY SYSTEM (DELIVERS COMPLETE DETAILS)
    // =====================
    if (text === "🛒 Buy Numbers") {
        // Prioritize WhatsApp then Telegram based on cheapest available item across fields
        const isWaAvailable = db.stock.whatsapp.length > 0;
        const isTgAvailable = db.stock.telegram.length > 0;

        let typeChosen = null;
        if (isWaAvailable && isTgAvailable) {
            typeChosen = db.stock.whatsapp[0].price <= db.stock.telegram[0].price ? "whatsapp" : "telegram";
        } else if (isWaAvailable) {
            typeChosen = "whatsapp";
        } else if (isTgAvailable) {
            typeChosen = "telegram";
        }

        if (!typeChosen) return bot.sendMessage(chatId, "Out of stock");

        const item = db.stock[typeChosen][0];

        if (user.balance < item.price) {
            return bot.sendMessage(chatId, "Insufficient balance");
        }

        user.balance -= item.price;
        db.users[chatId] = user;

        // Remove only the item that was bought
        db.stock[typeChosen].shift();

        sortStock(db);
        saveDB(db);

        return bot.sendMessage(chatId,
`🎉 PURCHASE SUCCESSFUL!

📞 Number: ${item.number}
💰 Price: ₦${item.price}
🔗 Login Link: ${item.link || "None"}
📝 Extra Details: ${item.details || "None"}

⚠️ Remember your 10-hour warranty starts now!`);
    }
});

// =====================
// WEBHOOK
// =====================
app.post("/api/payment-webhook", (req, res) => {
    try {
        const db = loadDB();
        const data = req.body;

        const reference = data?.data?.reference;
        const status = data?.data?.status;

        if (!db.payments[reference]) return res.sendStatus(404);

        if (db.payments[reference].status === "success") {
            return res.sendStatus(200);
        }

        if (status === "success") {
            const payment = db.payments[reference];
            const userId = payment.userId;

            if (!db.users[userId]) db.users[userId] = { balance: 0 };

            db.users[userId].balance += payment.amount;
            db.payments[reference].status = "success";

            saveDB(db);

            bot.sendMessage(userId, `Payment Successful\n\n₦${payment.amount} added to balance`);
        }
        res.sendStatus(200);
    } catch (e) {
        res.sendStatus(500);
    }
});

// =====================
// START SERVER
// =====================
app.listen(3000, () => {
    console.log("Webhook running on port 3000");
});
