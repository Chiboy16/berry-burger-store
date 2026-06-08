import sqlite3

def connect():
    return sqlite3.connect("bot.db")


def init_db():
    conn = connect()
    cur = conn.cursor()

    cur.execute("CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY, balance INTEGER DEFAULT 0)")

    cur.execute("CREATE TABLE IF NOT EXISTS deposits (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, amount INTEGER, method TEXT, status TEXT DEFAULT 'pending')")

    conn.commit()
    conn.close()


def add_user(user_id):
    conn = connect()
    cur = conn.cursor()

    cur.execute("SELECT user_id FROM users WHERE user_id=?", (user_id,))
    if not cur.fetchone():
        cur.execute("INSERT INTO users (user_id, balance) VALUES (?,0)", (user_id,))

    conn.commit()
    conn.close()


def create_deposit(user_id, amount, method):
    conn = connect()
    cur = conn.cursor()

    cur.execute("INSERT INTO deposits (user_id, amount, method) VALUES (?,?,?)",
                (user_id, amount, method))

    conn.commit()
    conn.close()


def get_balance(user_id):
    conn = connect()
    cur = conn.cursor()

    cur.execute("SELECT balance FROM users WHERE user_id=?", (user_id,))
    data = cur.fetchone()

    conn.close()
    return data[0] if data else 0
