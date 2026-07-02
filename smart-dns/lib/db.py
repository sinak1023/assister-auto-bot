# -----------------------------------------------------------------------------
# lib/db.py  —  لایه‌ی دیتابیس SQLite برای سرویس Smart DNS
# -----------------------------------------------------------------------------
# این ماژول تمام دسترسی‌ها به دیتابیس را کپسوله می‌کند. هم پنل وب و هم اسکریپت
# سینک از همین توابع استفاده می‌کنند.
#
# جدول‌ها:
#   admins  : کاربران ادمین پنل (نام کاربری + هش پسورد)
#   clients : IPهای مجاز، تاریخ انقضا، وضعیت و آمار مصرف ترافیک
#
# زمان‌ها به‌صورت «ثانیه‌ی epoch با مبنای UTC» ذخیره می‌شوند تا محاسبات ساده و
# مستقل از منطقه‌ی زمانی باشند.
# -----------------------------------------------------------------------------

import os
import sqlite3
import time
import contextlib

from werkzeug.security import generate_password_hash, check_password_hash


# مسیر دیتابیس از متغیر محیطی خوانده می‌شود؛ در غیر این صورت مسیر پیش‌فرض.
DB_PATH = os.environ.get("DB_PATH", "/opt/smartdns/data/smartdns.db")


@contextlib.contextmanager
def get_conn(db_path: str = None):
    """یک اتصال دیتابیس با row_factory دیکشنری‌مانند برمی‌گرداند.

    از context manager استفاده می‌کنیم تا commit/close به‌درستی انجام شود.
    """
    path = db_path or DB_PATH
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path, timeout=15)
    conn.row_factory = sqlite3.Row
    # فعال‌سازی WAL برای دسترسی هم‌زمان پنل و سرویس سینک
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db(db_path: str = None):
    """ساخت جدول‌ها در صورت عدم وجود (idempotent)."""
    with get_conn(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS admins (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS clients (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ip          TEXT UNIQUE NOT NULL,
                label       TEXT DEFAULT '',
                created_at  INTEGER NOT NULL,   -- epoch ثانیه، زمان افزودن
                expires_at  INTEGER NOT NULL,   -- epoch ثانیه، زمان انقضا
                active      INTEGER NOT NULL DEFAULT 1,  -- 1=فعال، 0=غیرفعال/منقضی
                bytes_in    INTEGER NOT NULL DEFAULT 0,  -- مجموع بایت ورودی (انباشته)
                bytes_out   INTEGER NOT NULL DEFAULT 0,  -- مجموع بایت خروجی (انباشته)
                raw_in      INTEGER NOT NULL DEFAULT 0,  -- آخرین مقدار خام شمارنده‌ی ipset ورودی
                raw_out     INTEGER NOT NULL DEFAULT 0,  -- آخرین مقدار خام شمارنده‌ی ipset خروجی
                last_sync   INTEGER NOT NULL DEFAULT 0   -- زمان آخرین سینک
            );
            """
        )


# --------------------------- توابع مدیریت ادمین ---------------------------

def create_admin(username: str, password: str, db_path: str = None):
    """ساخت یا به‌روزرسانی ادمین با پسورد هش‌شده."""
    pw_hash = generate_password_hash(password)
    with get_conn(db_path) as conn:
        conn.execute(
            "INSERT INTO admins (username, password_hash) VALUES (?, ?) "
            "ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash",
            (username, pw_hash),
        )


def verify_admin(username: str, password: str, db_path: str = None) -> bool:
    """اعتبارسنجی نام کاربری و پسورد ادمین."""
    with get_conn(db_path) as conn:
        row = conn.execute(
            "SELECT password_hash FROM admins WHERE username = ?", (username,)
        ).fetchone()
    if not row:
        return False
    return check_password_hash(row["password_hash"], password)


def change_admin_password(username: str, new_password: str, db_path: str = None):
    """تغییر پسورد ادمین موجود."""
    pw_hash = generate_password_hash(new_password)
    with get_conn(db_path) as conn:
        conn.execute(
            "UPDATE admins SET password_hash = ? WHERE username = ?",
            (pw_hash, username),
        )


# --------------------------- توابع مدیریت کلاینت‌ها ---------------------------

def add_client(ip: str, days: int, label: str = "", db_path: str = None):
    """افزودن یک IP جدید با تعداد روز اعتبار.

    اگر IP از قبل وجود داشته باشد، تاریخ انقضا از «حالا» تمدید و دوباره فعال
    می‌شود (رفتار تمدید).
    """
    now = int(time.time())
    expires = now + int(days) * 86400
    with get_conn(db_path) as conn:
        existing = conn.execute(
            "SELECT id FROM clients WHERE ip = ?", (ip,)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE clients SET expires_at = ?, active = 1, label = ? WHERE ip = ?",
                (expires, label, ip),
            )
        else:
            conn.execute(
                "INSERT INTO clients (ip, label, created_at, expires_at, active) "
                "VALUES (?, ?, ?, ?, 1)",
                (ip, label, now, expires),
            )


def extend_client(ip: str, days: int, db_path: str = None):
    """تمدید اعتبار یک IP به‌اندازه‌ی تعداد روز مشخص.

    اگر منقضی شده باشد، از «حالا» و اگر هنوز اعتبار دارد، از تاریخ انقضای فعلی
    تمدید می‌شود.
    """
    now = int(time.time())
    with get_conn(db_path) as conn:
        row = conn.execute(
            "SELECT expires_at FROM clients WHERE ip = ?", (ip,)
        ).fetchone()
        if not row:
            return False
        base = max(now, row["expires_at"])
        new_expires = base + int(days) * 86400
        conn.execute(
            "UPDATE clients SET expires_at = ?, active = 1 WHERE ip = ?",
            (new_expires, ip),
        )
    return True


def remove_client(ip: str, db_path: str = None):
    """حذف کامل یک IP از دیتابیس."""
    with get_conn(db_path) as conn:
        conn.execute("DELETE FROM clients WHERE ip = ?", (ip,))


def list_clients(db_path: str = None):
    """فهرست تمام کلاینت‌ها به‌همراه فیلدهای محاسبه‌شده (وضعیت و روزهای باقی‌مانده)."""
    now = int(time.time())
    with get_conn(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM clients ORDER BY created_at DESC"
        ).fetchall()

    clients = []
    for r in rows:
        d = dict(r)
        remaining = r["expires_at"] - now
        d["expired"] = remaining <= 0
        d["days_left"] = max(0, remaining // 86400)
        d["hours_left"] = max(0, (remaining % 86400) // 3600)
        clients.append(d)
    return clients


def get_active_ips(db_path: str = None):
    """فهرست IPهایی که فعال و منقضی‌نشده هستند (برای اعمال در فایروال)."""
    now = int(time.time())
    with get_conn(db_path) as conn:
        rows = conn.execute(
            "SELECT ip FROM clients WHERE active = 1 AND expires_at > ?", (now,)
        ).fetchall()
    return [r["ip"] for r in rows]


def expire_stale(db_path: str = None):
    """غیرفعال‌کردن رکوردهایی که تاریخ انقضایشان گذشته است.

    تعداد رکوردهای منقضی‌شده را برمی‌گرداند.
    """
    now = int(time.time())
    with get_conn(db_path) as conn:
        cur = conn.execute(
            "UPDATE clients SET active = 0 WHERE active = 1 AND expires_at <= ?",
            (now,),
        )
        return cur.rowcount


def update_traffic(ip: str, delta_in: int, delta_out: int,
                   raw_in: int, raw_out: int, db_path: str = None):
    """افزودن مصرف اخیر به مجموع انباشته و ذخیره‌ی مقادیر خام جدید."""
    now = int(time.time())
    with get_conn(db_path) as conn:
        conn.execute(
            "UPDATE clients SET bytes_in = bytes_in + ?, bytes_out = bytes_out + ?, "
            "raw_in = ?, raw_out = ?, last_sync = ? WHERE ip = ?",
            (delta_in, delta_out, raw_in, raw_out, now, ip),
        )


def get_raw_counters(db_path: str = None):
    """دیکشنری {ip: (raw_in, raw_out)} از آخرین مقادیر خام ذخیره‌شده."""
    with get_conn(db_path) as conn:
        rows = conn.execute("SELECT ip, raw_in, raw_out FROM clients").fetchall()
    return {r["ip"]: (r["raw_in"], r["raw_out"]) for r in rows}
