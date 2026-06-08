const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const TOKEN = '8641508442:AAFagfWIQPaJETZYc5ARH-MS2cDeKOtTm8I';
const ADMIN_ID = 8281129727;

const bot = new TelegramBot(TOKEN, { polling: true });

/* ===== DATABASE ===== */
const users = {};
const orders = {};
const deposits = {};
let totalSales = 0;

/* ===== BANK DETAILS ===== */
const BANKS = {
  opay: { name: "Emmanuel Ugwu", number: "8060310630" },
  moniepoint: { name: "Emmanuel Ugwu", number: "8060310630" }
};

/* ===== STOCK FILE ===== */
const STOCK_FILE = './stock.txt';

function loadStock() {
  if (!fs.existsSync(STOCK_FILE)) fs.writeFileSync(STOCK_FILE, '');
  return fs.readFileSync(STOCK_FILE, 'utf8').split('\n').filter(Boolean);
}

function saveStock(data) {
  fs.writeFileSync(STOCK_FILE, data.join('\n'));
}

function takeStock(type) {
  let stock = loadStock();
  const index = stock.findIndex(i => i.startsWith(type + "|"));
  if (index === -1) return null;

  const item = stock[index];
  stock.splice(index, 1);
  saveStock(stock);

  return item.split("|")[1];
}

function getUser(id) {
  if (!users[id]) users[id] = { balance: 0 };
  return users[id];
}

/* ===== MENU ===== */
function menu(id) {
  const keyboard = [
    [{ text: "🛒 Shop", callback_data: "shop" }],
    [{ text: "💰 Wallet", callback_data: "wallet" }],
    [{ text: "➕ Deposit", callback_data: "deposit" }],
    [{ text: "📦 My Orders", callback_data: "orders" }],
    [{ text: "❓ FAQ", callback_data: "faq" }],
    [{ text: "📘 How to Buy", callback_data: "guide" }]
  ];

  if (id === ADMIN_ID) {
    keyboard.push([{ text: "🔐 Admin Panel", callback_data: "admin" }]);
  }

  return { reply_markup: { inline_keyboard: keyboard } };
}

/* ===== START ===== */
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "🍔 Berry Burger Store", menu(msg.chat.id));
});

/* ===== CALLBACK ===== */
bot.on("callback_query", (q) => {
  const id = q.message.chat.id;
  const data = q.data;
  const user = getUser(id);

  /* WALLET */
  if (data === "wallet") {
    return bot.sendMessage(id, `💰 Wallet\nBalance: ₦${user.balance}`);
  }

  /* SHOP */
  if (data === "shop") {
    return bot.sendMessage(id,
`🛒 SHOP

WhatsApp Account - ₦2500
Telegram Account - ₦2500`,
{
  reply_markup: {
    inline_keyboard: [
      [{ text: "Buy WhatsApp", callback_data: "buy_whatsapp" }],
      [{ text: "Buy Telegram", callback_data: "buy_telegram" }]
    ]
  }
});
  }

  /* BUY */
  if (data === "buy_whatsapp" || data === "buy_telegram") {
    const type = data.split("_")[1];
    const price = 2500;

    if (user.balance < price) return bot.sendMessage(id, "❌ Low balance");

    const item = takeStock(type);
    if (!item) return bot.sendMessage(id, "❌ Out of stock");

    user.balance -= price;
    totalSales += price;

    if (!orders[id]) orders[id] = [];
    orders[id].push(type + ": " + item);

    bot.sendMessage(id, "✅ Delivered:\n" + item);
  }

  /* ORDERS */
  if (data === "orders") {
    return bot.sendMessage(id, (orders[id] || []).join("\n") || "No orders yet");
  }

  /* DEPOSIT */
  if (data === "deposit") {
    return bot.sendMessage(id,
`💳 Deposit Options`,
{
  reply_markup: {
    inline_keyboard: [
      [{ text: "Opay", callback_data: "pay_opay" }],
      [{ text: "Moniepoint", callback_data: "pay_moniepoint" }]
    ]
  }
});
  }

  /* PAYMENT DETAILS */
  if (data === "pay_opay" || data === "pay_moniepoint") {
    const bank = data.split("_")[1];
    const b = BANKS[bank];

    deposits[id] = bank;

    return bot.sendMessage(id,
`💳 PAY NOW

Bank: ${bank.toUpperCase()}
Name: ${b.name}
Account: ${b.number}

Send proof after payment.`);
  }

  /* FAQ */
  if (data === "faq") {
    return bot.sendMessage(id,
`❓ FAQ

1. How do I buy?
→ Deposit money, then go to shop.

2. How fast is delivery?
→ Instant after payment.

3. No stock?
→ Wait for admin to restock.

4. Wrong payment?
→ Contact admin.`);
  }

  /* GUIDE */
  if (data === "guide") {
    return bot.sendMessage(id,
`📘 HOW TO USE

1. Click Deposit
2. Send money to Opay or Moniepoint
3. Send proof to bot
4. Admin approves
5. Your balance is updated
6. Go to Shop and buy WhatsApp/Telegram accounts`);
  }

  /* ADMIN PANEL */
  if (data === "admin" && id === ADMIN_ID) {
    return bot.sendMessage(id,
`🔐 ADMIN PANEL

Commands:
add whatsapp|item
add telegram|item
approve USER AMOUNT`);
  }

  bot.answerCallbackQuery(q.id);
});

/* ===== MESSAGE HANDLER ===== */
bot.on("message", (msg) => {
  const id = msg.chat.id;
  const text = msg.text;

  const user = getUser(id);

  if (id === ADMIN_ID && text.startsWith("approve")) {
    const [, uid, amount] = text.split(" ");
    getUser(uid).balance += Number(amount);

    return bot.sendMessage(id, "Approved");
  }

  /* FIXED STOCK SYSTEM (IMPORTANT FIX) */
  if (id === ADMIN_ID && text && text.includes("|")) {
    let stock = loadStock();
    stock.push(text);
    saveStock(stock);

    return bot.sendMessage(id, "Stock added successfully");
  }

  /* USER RECEIPTS */
  if (id !== ADMIN_ID && text) {
    bot.sendMessage(ADMIN_ID,
`📩 NEW PAYMENT PROOF

User: ${id}
Message: ${text}`);

    return bot.sendMessage(id, "Sent to admin");
  }
});

console.log("🍔 Berry Burger Store FULL SYSTEM RUNNING...");
