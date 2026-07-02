#!/usr/bin/env python3
# -----------------------------------------------------------------------------
# scripts/sync_whitelist.py  —  سینک whitelist و آمار مصرف
# -----------------------------------------------------------------------------
# این اسکریپت توسط سرویس/تایمر systemd به‌صورت دوره‌ای (پیش‌فرض هر ۲ دقیقه)
# اجرا می‌شود و کارهای زیر را انجام می‌دهد:
#
#   1) اطمینان از وجود ساختار پایه‌ی فایروال (ipset/iptables) — خودترمیمی.
#   2) منقضی‌کردن رکوردهایی که تاریخ انقضایشان گذشته است.
#   3) خواندن شمارنده‌های ترافیک از ipset و افزودن تفاضل به مجموع انباشته در DB.
#   4) هماهنگ‌کردن عضویت ست‌های ipset با فهرست IPهای فعالِ دیتابیس
#      (افزودن جدیدها، حذف منقضی/حذف‌شده‌ها).
#
# چون مرحله‌ی ۳ (خواندن و ثبت مصرف) پیش از مرحله‌ی ۴ (حذف عضویت) انجام می‌شود،
# آمار مصرفِ IPهایی که در این دور حذف می‌شوند نیز از دست نمی‌رود.
# -----------------------------------------------------------------------------

import os
import sys

# افزودن ریشه‌ی پروژه به مسیر پایتون تا بتوان lib را import کرد.
INSTALL_DIR = os.environ.get("INSTALL_DIR", "/opt/smartdns")
sys.path.insert(0, INSTALL_DIR)

from lib import db, firewall  # noqa: E402


def log(msg):
    print(f"[sync] {msg}", flush=True)


def main():
    # اطمینان از آماده‌بودن دیتابیس و فایروال (idempotent)
    db.init_db()
    try:
        firewall.ensure_base()
        firewall.ensure_panel_guard()
    except Exception as e:  # noqa: BLE001
        log(f"خطا در آماده‌سازی فایروال: {e}")
        return 1

    # (۲) منقضی‌کردن رکوردهای گذشته
    expired = db.expire_stale()
    if expired:
        log(f"{expired} رکورد منقضی شد و غیرفعال گردید.")

    # (۳) به‌روزرسانی آمار مصرف بر اساس تفاضل شمارنده‌ها
    live_counters = firewall.read_all_counters()
    stored_raw = db.get_raw_counters()
    for ip, cur in live_counters.items():
        if ip not in stored_raw:
            continue  # IP در DB نیست؛ نادیده بگیر
        raw_in_old, raw_out_old = stored_raw[ip]
        cur_in, cur_out = cur["in"], cur["out"]
        # اگر شمارنده کوچک‌تر شده باشد (ری‌استارت/ری‌ست شدن ست) از صفر حساب کن
        delta_in = cur_in - raw_in_old if cur_in >= raw_in_old else cur_in
        delta_out = cur_out - raw_out_old if cur_out >= raw_out_old else cur_out
        if delta_in or delta_out or cur_in != raw_in_old or cur_out != raw_out_old:
            db.update_traffic(ip, delta_in, delta_out, cur_in, cur_out)

    # (۴) هماهنگ‌سازی عضویت ست‌ها با IPهای فعال
    active = set(db.get_active_ips())
    members = firewall.get_members()

    to_add = active - members
    to_remove = members - active

    for ip in to_add:
        try:
            firewall.add_ip(ip)
            log(f"افزوده شد به whitelist: {ip}")
        except Exception as e:  # noqa: BLE001
            log(f"خطا در افزودن {ip}: {e}")

    for ip in to_remove:
        try:
            firewall.remove_ip(ip)
            log(f"حذف شد از whitelist: {ip}")
        except Exception as e:  # noqa: BLE001
            log(f"خطا در حذف {ip}: {e}")

    log(f"سینک کامل شد. فعال={len(active)} افزوده={len(to_add)} حذف={len(to_remove)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
