const TelegramBot = require('node-telegram-bot-api');

// ================= CONFIG =================
const TOKEN = "PASTE_YOUR_BOT_TOKEN_HERE";
const ADMIN_ID = 8281129727;

const MONIEPOINT = {
  name: "Emmanuel Ugwu",
  number: "8060310630"
};

const OPAY = {
  name: "Emmanuel Ugwu",
  number: "8060310630"
};

// ================= STORAGE =================
const userState = {};
const balances = {};
const pendingDeposits = {};

// ================= BOT =================
const bot = new TelegramBot(TOKEN, { polling: true });

// ================= START =================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💰 Wallet", callback_data: "wallet" }]
      ]
    }
  };

  bot.sendMessage(chatId, "Welcome to your bot", options);
});

// ================= CALLBACK =================
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // WALLET MENU
  if (data === "wallet") {
    bot.editMessageText("Wallet Menu", {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ Top Up", callback_data: "topup" }],
          [{ text: "💰 Balance", callback_data: "balance" }]
        ]
      }
    });
  }

  // BALANCE
  if (data === "balance") {
    const bal = balances[chatId] || 0;
    bot.sendMessage(chatId, `💰 Balance: ${bal}`);
  }

  // TOPUP
  if (data === "topup") {
    userState[chatId] = "amount";
    bot.sendMessage(chatId, "💰 Send amount you want to deposit");
  }

  // PAYMENT METHOD
  if (data.startsWith("pay_")) {
    const parts = data.split("_");
    const method = parts[1];
    const amount = parts[2];

    const depositId = "DEP" + chatId + Date.now();

    pendingDeposits[depositId] = {
      userId: chatId,
      amount: Number(amount),
      method,
      status: "pending"
    };

    let text = "";

    if (method === "monie") {
      text =
`💳 MONIEPOINT
Name: ${MONIEPOINT.name}
Account: ${MONIEPOINT.number}
Amount: ${amount}
Deposit ID: ${depositId}`;
    } else {
      text =
`💳 OPAY
Name: ${OPAY.name}
Account: ${OPAY.number}
Amount: ${amount}
Deposit ID: ${depositId}`;
    }

    bot.sendMessage(chatId, text);

    // SEND TO ADMIN
    bot.sendMessage(ADMIN_ID,
`🆕 DEPOSIT REQUEST

User: ${chatId}
Amount: ${amount}
Method: ${method}
ID: ${depositId}`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Approve", callback_data: "approve_" + depositId },
            { text: "❌ Decline", callback_data: "decline_" + depositId }
          ]
        ]
      }
    });
  }

  // ADMIN ACTIONS
  if (data.startsWith("approve_") || data.startsWith("decline_")) {
    if (chatId !== ADMIN_ID) return;

    const id = data.split("_")[1];
    const deposit = pendingDeposits[id];

    if (!deposit) {
      return bot.sendMessage(chatId, "Already processed");
    }

    if (data.startsWith("approve_")) {
      deposit.status = "approved";

      balances[deposit.userId] =
        (balances[deposit.userId] || 0) + deposit.amount;

      bot.sendMessage(deposit.userId, `✅ Deposit approved: +${deposit.amount}`);
      bot.sendMessage(chatId, "Approved");
    } else {
      deposit.status = "declined";
      bot.sendMessage(deposit.userId, "❌ Deposit declined");
      bot.sendMessage(chatId, "Declined");
    }
  }
});

// ================= TEXT INPUT =================
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith("/")) return;

  if (userState[chatId] === "amount") {
    const amount = parseInt(text);

    if (isNaN(amount)) {
      return bot.sendMessage(chatId, "Invalid amount");
    }

    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Moniepoint", callback_data: `pay_monie_${amount}` }],
          [{ text: "Opay", callback_data: `pay_opay_${amount}` }]
        ]
      }
    };

    bot.sendMessage(chatId, "Choose payment method", options);

    userState[chatId] = null;
  }
});

console.log("Bot is running...");
