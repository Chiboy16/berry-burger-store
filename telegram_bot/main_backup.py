from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes

from database import init_db, add_user, create_deposit, get_balance

user_state = {}

# START
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    add_user(user_id)

    keyboard = [
        [InlineKeyboardButton("🛒 Shop", callback_data="menu_shop")],
        [InlineKeyboardButton("💰 Wallet", callback_data="menu_wallet")],
        [InlineKeyboardButton("📦 Orders", callback_data="menu_orders")],
        [InlineKeyboardButton("🆘 Support", callback_data="menu_support")],
        [InlineKeyboardButton("ℹ️ Help", callback_data="menu_help")]
    ]

    await update.message.reply_text(
        "Welcome to Store Bot 🛒",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


# MENU
async def menu_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    data = query.data
    user_id = query.from_user.id

    if data == "menu_wallet":
        keyboard = [
            [InlineKeyboardButton("➕ Top Up", callback_data="wallet_topup")],
            [InlineKeyboardButton("💰 Balance", callback_data="wallet_balance")]
        ]
        await query.edit_message_text("💰 Wallet Menu", reply_markup=InlineKeyboardMarkup(keyboard))

    elif data == "wallet_balance":
        bal = get_balance(user_id)
        await query.edit_message_text(f"💰 Balance: {bal}")

    elif data == "wallet_topup":
        user_state[user_id] = "amount"
        await query.edit_message_text("💰 Send amount to deposit:")

    elif data == "menu_shop":
        await query.edit_message_text("🛒 Shop coming soon")

    elif data == "menu_orders":
        await query.edit_message_text("📦 Orders coming soon")

    elif data == "menu_support":
        await query.edit_message_text("🆘 Support coming soon")

    elif data == "menu_help":
        await query.edit_message_text("ℹ️ Help coming soon")


# TEXT INPUT
async def text_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    text = update.message.text

    if user_state.get(user_id) == "amount":
        try:
            amount = int(text)

            keyboard = [
                [InlineKeyboardButton("Moniepoint", callback_data=f"pay_monie_{amount}")],
                [InlineKeyboardButton("Opay", callback_data=f"pay_opay_{amount}")]
            ]

            await update.message.reply_text(
                "💳 Choose payment method:",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )

            user_state[user_id] = None

        except:
            await update.message.reply_text("❌ Send a valid number")


# PAYMENT
    query = update.callback_query
    await query.answer()

    data = query.data
    user_id = query.from_user.id

    if data.startswith("pay_"):
        parts = data.split("_")
        method = parts[1]
        amount = int(parts[2])

        create_deposit(user_id, amount, method)

        await query.edit_message_text(
            f"✅ Deposit created!\nAmount: {amount}\nMethod: {method}\nSend receipt for approval."
        )


# MAIN
def main():
    init_db()

    app = Application.builder().token("8641508442:AAFagfWIQPaJETZYc5ARH-MS2cDeKOtTm8I").build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(menu_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_handler))

    print("Bot running...")
    app.run_polling()

if __name__ == "__main__":
    main()

# ================= ADMIN SYSTEM =================

from telegram import InlineKeyboardButton, InlineKeyboardMarkup

PENDING_DEPOSITS = {}

ADMIN_IDS = [8281129727]


# ADMIN PANEL ENTRY (use /admin command)
async def admin_panel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id

    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Not authorized")
        return

    keyboard = [
        [InlineKeyboardButton("📥 View Deposits", callback_data="admin_deposits")]
    ]

    await update.message.reply_text(
        "👮 Admin Panel",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


# VIEW PENDING DEPOSITS
async def admin_actions(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    data = query.data

    if data == "admin_deposits":
        text = "📥 Pending Deposits:\n\n"

        if not PENDING_DEPOSITS:
            text += "No deposits yet."
        else:
            for uid, dep in PENDING_DEPOSITS.items():
                text += f"User: {uid}\nAmount: {dep['amount']}\nMethod: {dep['method']}\n\n"

        await query.edit_message_text(text)


# APPROVE / DECLINE BUTTONS
async def deposit_decision(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    data = query.data

    if data.startswith("approve_"):
        uid = int(data.split("_")[1])
        dep = PENDING_DEPOSITS.get(uid)

        if dep:
            from database import add_balance
            add_balance(uid, dep["amount"])
            del PENDING_DEPOSITS[uid]

            await query.edit_message_text("✅ Deposit Approved")

    elif data.startswith("decline_"):
        uid = int(data.split("_")[1])

        if uid in PENDING_DEPOSITS:
            del PENDING_DEPOSITS[uid]

        await query.edit_message_text("❌ Deposit Declined")


# REGISTER ADMIN COMMAND
async def admin_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await admin_panel(update, context)


# ================= REGISTER ADMIN HANDLERS =================

app.add_handler(CommandHandler("admin", admin_cmd))
app.add_handler(CallbackQueryHandler(admin_actions))
app.add_handler(CallbackQueryHandler(deposit_decision))


# ================= CONNECT DEPOSITS TO ADMIN =================

def register_deposit(user_id, amount, method):
    PENDING_DEPOSITS[user_id] = {
        "amount": amount,
        "method": method
    }


# OVERRIDE PAYMENT HANDLER UPDATE
    query = update.callback_query
    await query.answer()

    data = query.data
    user_id = query.from_user.id

    if data.startswith("pay_"):
        parts = data.split("_")
        method = parts[1]
        amount = int(parts[2])

        register_deposit(user_id, amount, method)

        await query.edit_message_text(
            f"⏳ Deposit Pending Approval\n\nAmount: {amount}\nMethod: {method}\n\nAdmin will approve soon."
        )


# ================= PAYMENT DETAILS DISPLAY =================

PAYMENT_DETAILS = {
    "monie": {
        "bank": "Moniepoint",
        "account": "8060310630",
        "name": "Emmanuel Ugwu"
    },
    "opay": {
        "bank": "Opay",
        "account": "8060310630",
        "name": "Emmanuel Ugwu"
    }
}


# ================= UPDATED PAYMENT HANDLER =================

    query = update.callback_query
    await query.answer()

    data = query.data
    user_id = query.from_user.id

    if data.startswith("pay_"):
        parts = data.split("_")
        method = parts[1]
        amount = int(parts[2])

        register_deposit(user_id, amount, method)

        details = PAYMENT_DETAILS.get(method, {})

        text = (
            f"💳 PAYMENT DETAILS\n\n"
            f"Bank: {details.get('bank')}\n"
            f"Account: {details.get('account')}\n"
            f"Name: {details.get('name')}\n\n"
            f"💰 Amount: {amount}\n\n"
            f"⚠️ After payment, wait for admin approval."
        )

        await query.edit_message_text(text)


from config import (
    ADMIN_ID,
    WHATSAPP_PRICE,
    TELEGRAM_PRICE,
    MONIEPOINT_NAME,
    MONIEPOINT_NUMBER,
    OPAY_NAME,
    OPAY_NUMBER
)

# ================= PAYMENT DETAILS VIEW =================

    query = update.callback_query
    await query.answer()

    data = query.data
    user_id = query.from_user.id

    if data.startswith("pay_"):
        parts = data.split("_")
        method = parts[1]
        amount = int(parts[2])

        register_deposit(user_id, amount, method)

        if method == "monie":
            text = f"""
💳 MONIEPOINT PAYMENT DETAILS

Name: {MONIEPOINT_NAME}
Account Number: {MONIEPOINT_NUMBER}

💰 Amount: {amount}

⚠️ Send receipt after payment for approval.
"""

        elif method == "opay":
            text = f"""
💳 OPAY PAYMENT DETAILS

Name: {OPAY_NAME}
Account Number: {OPAY_NUMBER}

💰 Amount: {amount}

⚠️ Send receipt after payment for approval.
"""

        else:
            text = "❌ Invalid payment method"

        await query.edit_message_text(text)


# ================= CLEAN PAYMENT SYSTEM =================

    query = update.callback_query
    await query.answer()

    data = query.data

    if not data.startswith("pay_"):
        return

    parts = data.split("_")

    method = parts[1]
    amount = parts[2]

    if method == "monie":
        text = (
            "💳 MONIEPOINT PAYMENT DETAILS\n\n"
            "Bank: Moniepoint\n"
            "Account Name: Emmanuel Ugwu\n"
            "Account Number: 8060310630\n\n"
            f"💰 Amount: {amount}\n\n"
            "⚠️ Send receipt after payment for approval."
        )

    elif method == "opay":
        text = (
            "💳 OPAY PAYMENT DETAILS\n\n"
            "Bank: Opay\n"
            "Account Name: Emmanuel Ugwu\n"
            "Account Number: 8060310630\n\n"
            f"💰 Amount: {amount}\n\n"
            "⚠️ Send receipt after payment for approval."
        )

    else:
        text = "❌ Invalid payment method"

    await query.edit_message_text(text)


# ================= PAYMENT HANDLER CLEAN FIX =================

async def payment_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    data = query.data

    if not data.startswith("pay_"):
        return

    parts = data.split("_")

    method = parts[1]
    amount = parts[2]

    if method == "monie":
        text = (
            "💳 MONIEPOINT PAYMENT DETAILS\n\n"
            "Bank: Moniepoint\n"
            "Account Name: Emmanuel Ugwu\n"
            "Account Number: 8060310630\n\n"
            f"💰 Amount: {amount}\n\n"
            "⚠️ Send receipt after payment for approval."
        )

    elif method == "opay":
        text = (
            "💳 OPAY PAYMENT DETAILS\n\n"
            "Bank: Opay\n"
            "Account Name: Emmanuel Ugwu\n"
            "Account Number: 8060310630\n\n"
            f"💰 Amount: {amount}\n\n"
            "⚠️ Send receipt after payment for approval."
        )

    else:
        text = "❌ Invalid payment method"

    await query.edit_message_text(text)

