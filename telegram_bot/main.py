from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, ContextTypes, filters

# ================= CONFIG =================
TOKEN = "PASTE_8641508442:AAFagfWIQPaJETZYc5ARH-MS2cDeKOtTm8I_HERE"
ADMIN_ID = 8281129727

MONIEPOINT_NAME = "Emmanuel Ugwu"
MONIEPOINT_NUMBER = "8060310630"

OPAY_NAME = "Emmanuel Ugwu"
OPAY_NUMBER = "8060310630"

# ================= STORAGE =================
user_state = {}
pending_deposits = {}

# ================= START =================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("💰 Wallet", callback_data="wallet")]
    ]

    await update.message.reply_text(
        "Welcome to the bot",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )

# ================= CALLBACK HANDLER =================
async def menu_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    user_id = query.from_user.id
    data = query.data

    # WALLET MENU
    if data == "wallet":
        keyboard = [
            [InlineKeyboardButton("➕ Top Up", callback_data="topup")],
            [InlineKeyboardButton("💰 Balance", callback_data="balance")]
        ]
        await query.edit_message_text("Wallet Menu", reply_markup=InlineKeyboardMarkup(keyboard))

    # BALANCE
    elif data == "balance":
        await query.edit_message_text("Balance feature coming soon")

    # TOPUP AMOUNT
    elif data == "topup":
        user_state[user_id] = "amount"
        await query.edit_message_text("Send amount you want to deposit")

    # PAYMENT METHODS
    elif data.startswith("pay_"):
        parts = data.split("_")
        method = parts[1]
        amount = parts[2]

        deposit_id = f"DEP{user_id}{amount}"

        pending_deposits[deposit_id] = {
            "user_id": user_id,
            "amount": amount,
            "method": method,
            "status": "pending"
        }

        if method == "monie":
            text = f"""💳 MONIEPOINT
Name: {MONIEPOINT_NAME}
Account: {MONIEPOINT_NUMBER}
Amount: {amount}
Deposit ID: {deposit_id}"""
        else:
            text = f"""💳 OPAY
Name: {OPAY_NAME}
Account: {OPAY_NUMBER}
Amount: {amount}
Deposit ID: {deposit_id}"""

        # SEND TO USER
        await query.edit_message_text(text)

        # SEND TO ADMIN
        keyboard = [
            [
                InlineKeyboardButton("✅ Approve", callback_data=f"approve_{deposit_id}"),
                InlineKeyboardButton("❌ Decline", callback_data=f"decline_{deposit_id}")
            ]
        ]

        await context.bot.send_message(
            chat_id=ADMIN_ID,
            text=f"NEW DEPOSIT REQUEST\n\nUser: {user_id}\nAmount: {amount}\nMethod: {method}\nID: {deposit_id}",
            reply_markup=InlineKeyboardMarkup(keyboard)
        )

# ================= TEXT HANDLER =================
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
                "Choose payment method",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )

            user_state[user_id] = None

        except:
            await update.message.reply_text("Invalid amount")

# ================= ADMIN HANDLER =================
async def admin_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    data = query.data

    if data.startswith("approve_"):
        dep_id = data.split("_")[1]

        if dep_id in pending_deposits:
            pending_deposits[dep_id]["status"] = "approved"
            await query.edit_message_text(f"Approved {dep_id}")
        else:
            await query.edit_message_text("Already processed")

    elif data.startswith("decline_"):
        dep_id = data.split("_")[1]

        if dep_id in pending_deposits:
            pending_deposits[dep_id]["status"] = "declined"
            await query.edit_message_text(f"Declined {dep_id}")
        else:
            await query.edit_message_text("Already processed")

# ================= MAIN =================
def main():
    app = Application.builder().token(TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(menu_handler))
    app.add_handler(CallbackQueryHandler(admin_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_handler))

    print("Bot running...")
    app.run_polling()

if __name__ == "__main__":
    main()
