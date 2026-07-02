#!/usr/bin/env python3
# -----------------------------------------------------------------------------
# panel/app.py  —  پنل مدیریت وب سرویس Smart DNS (Flask)
# -----------------------------------------------------------------------------
# قابلیت‌ها:
#   - احراز هویت ادمین با نام کاربری/پسورد (سشن‌محور).
#   - افزودن/حذف/تمدید IP مجاز به‌همراه تعداد روز اعتبار.
#   - نمایش وضعیت هر IP (فعال/منقضی)، تاریخ افزوده‌شدن، روزهای باقی‌مانده و
#     میزان مصرف ترافیک ورودی/خروجی.
#   - تغییر پسورد ادمین.
#
# اعمال واقعی روی فایروال توسط سرویس سینک (systemd) انجام می‌شود؛ پنل فقط
# دیتابیس را تغییر می‌دهد تا مسئولیت‌ها جدا و امن بماند (پنل نیازی به دسترسی
# مستقیم به iptables ندارد).
# -----------------------------------------------------------------------------

import os
import sys
import ipaddress
import functools
from datetime import datetime, timezone

# افزودن ریشه‌ی پروژه برای import پکیج lib
INSTALL_DIR = os.environ.get("INSTALL_DIR", "/opt/smartdns")
sys.path.insert(0, INSTALL_DIR)

from flask import (Flask, request, redirect, url_for, render_template,
                   session, flash)

from lib import db  # noqa: E402


app = Flask(__name__)
app.secret_key = os.environ.get("PANEL_SECRET", "change-me-please")
# نام کاربری ادمین (پسورد در دیتابیس هش‌شده نگهداری می‌شود)
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")


# --------------------------- توابع کمکی نمایش ---------------------------

def human_bytes(n):
    """تبدیل تعداد بایت به رشته‌ی خوانا (KB/MB/GB)."""
    n = float(n or 0)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024.0:
            return f"{n:.1f} {unit}"
        n /= 1024.0
    return f"{n:.1f} PB"


def fmt_ts(ts):
    """تبدیل epoch به رشته‌ی تاریخ خوانا (UTC)."""
    if not ts:
        return "-"
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")


# در دسترس قراردادن توابع کمکی در قالب‌ها
app.jinja_env.filters["human_bytes"] = human_bytes
app.jinja_env.filters["fmt_ts"] = fmt_ts


# --------------------------- دکوراتور احراز هویت ---------------------------

def login_required(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("logged_in"):
            return redirect(url_for("login"))
        return view(*args, **kwargs)
    return wrapped


def valid_ip(ip):
    """اعتبارسنجی رشته‌ی IP (v4 یا v6)."""
    try:
        ipaddress.ip_address(ip)
        return True
    except ValueError:
        return False


# --------------------------------- مسیرها ---------------------------------

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        if db.verify_admin(username, password):
            session["logged_in"] = True
            session["user"] = username
            return redirect(url_for("dashboard"))
        flash("نام کاربری یا پسورد اشتباه است.", "error")
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def dashboard():
    clients = db.list_clients()
    # آمار خلاصه برای بالای صفحه
    total = len(clients)
    active = sum(1 for c in clients if not c["expired"])
    total_in = sum(c["bytes_in"] for c in clients)
    total_out = sum(c["bytes_out"] for c in clients)
    stats = {
        "total": total,
        "active": active,
        "expired": total - active,
        "total_in": total_in,
        "total_out": total_out,
    }
    return render_template("dashboard.html", clients=clients, stats=stats)


@app.route("/add", methods=["POST"])
@login_required
def add_ip():
    ip = request.form.get("ip", "").strip()
    label = request.form.get("label", "").strip()
    days = request.form.get("days", "").strip()

    if not valid_ip(ip):
        flash("IP وارد شده معتبر نیست.", "error")
        return redirect(url_for("dashboard"))
    try:
        days = int(days)
        if days <= 0:
            raise ValueError
    except ValueError:
        flash("تعداد روز باید عددی مثبت باشد.", "error")
        return redirect(url_for("dashboard"))

    db.add_client(ip, days, label)
    flash(f"IP {ip} برای {days} روز اضافه/تمدید شد.", "success")
    return redirect(url_for("dashboard"))


@app.route("/extend", methods=["POST"])
@login_required
def extend_ip():
    ip = request.form.get("ip", "").strip()
    days = request.form.get("days", "").strip()
    try:
        days = int(days)
        if days <= 0:
            raise ValueError
    except ValueError:
        flash("تعداد روز باید عددی مثبت باشد.", "error")
        return redirect(url_for("dashboard"))

    if db.extend_client(ip, days):
        flash(f"اعتبار {ip} به‌اندازه‌ی {days} روز تمدید شد.", "success")
    else:
        flash("IP یافت نشد.", "error")
    return redirect(url_for("dashboard"))


@app.route("/remove", methods=["POST"])
@login_required
def remove_ip():
    ip = request.form.get("ip", "").strip()
    db.remove_client(ip)
    flash(f"IP {ip} حذف شد.", "success")
    return redirect(url_for("dashboard"))


@app.route("/password", methods=["POST"])
@login_required
def change_password():
    current = request.form.get("current", "")
    new = request.form.get("new", "")
    user = session.get("user", ADMIN_USER)
    if not db.verify_admin(user, current):
        flash("پسورد فعلی نادرست است.", "error")
    elif len(new) < 6:
        flash("پسورد جدید باید حداقل ۶ کاراکتر باشد.", "error")
    else:
        db.change_admin_password(user, new)
        flash("پسورد با موفقیت تغییر کرد.", "success")
    return redirect(url_for("dashboard"))


if __name__ == "__main__":
    # اجرای مستقیم فقط برای توسعه/تست است؛ در production از gunicorn استفاده کنید.
    db.init_db()
    host = os.environ.get("PANEL_HOST", "0.0.0.0")
    port = int(os.environ.get("PANEL_PORT", "8088"))
    app.run(host=host, port=port, debug=False)
