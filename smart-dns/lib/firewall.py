# -----------------------------------------------------------------------------
# lib/firewall.py  —  مدیریت whitelist و شمارش ترافیک با ipset + iptables
# -----------------------------------------------------------------------------
# راهبرد:
#   - دو ست ipset از نوع «hash:ip» با گزینه‌ی counters ساخته می‌شوند:
#       * IPSET_IN  : برای شمارش بایت ورودی (client -> server)، در INPUT با src
#       * IPSET_OUT : برای شمارش بایت خروجی (server -> client)، در OUTPUT با dst
#   - فقط IPهایی که عضو این ست‌ها هستند اجازه‌ی استفاده از پورت‌های سرویس
#     (53/80/443) را دارند؛ بقیه DROP می‌شوند.
#   - شمارنده‌های ipset مقدار «بایت مصرف‌شده» را نگه می‌دارند و اسکریپت سینک
#     تفاضل (delta) را به مجموع انباشته در دیتابیس اضافه می‌کند.
#
# مزیت این روش نسبت به قانون‌های iptables به‌ازای هر IP: مقیاس‌پذیری بالا و
# مدیریت ساده‌ی عضویت (افزودن/حذف IP بدون بازنویسی زنجیره‌ها).
# -----------------------------------------------------------------------------

import os
import subprocess


IPSET_IN = os.environ.get("IPSET_IN", "smartdns_in")
IPSET_OUT = os.environ.get("IPSET_OUT", "smartdns_out")
SERVICE_PORTS_TCP = os.environ.get("SERVICE_PORTS_TCP", "53,80,443")
SERVICE_PORTS_UDP = os.environ.get("SERVICE_PORTS_UDP", "53")

# محافظت از پورت پنل: فقط ADMIN_IP اجازه‌ی دسترسی دارد
ADMIN_IP = os.environ.get("ADMIN_IP", "")
PANEL_PORT = os.environ.get("PANEL_PORT", "8088")

# نام زنجیره‌های اختصاصی ما (تا با قوانین دیگر تداخل نداشته باشیم)
CHAIN_IN = "SMARTDNS"       # هوک از INPUT: کنترل دسترسی + شمارش ورودی
CHAIN_OUT = "SMARTDNS_OUT"  # هوک از OUTPUT: شمارش خروجی


def _run(cmd, check=False, capture=False):
    """اجرای یک دستور و برگرداندن CompletedProcess.

    check=False است چون بسیاری از دستورها (مثل بررسی وجود قانون) عمداً ممکن است
    با کد خطا برگردند و این طبیعی است.
    """
    return subprocess.run(
        cmd,
        check=check,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        text=True,
    )


def _rule_exists(table_args):
    """بررسی وجود یک قانون iptables با استفاده از سوییچ -C."""
    cmd = ["iptables", "-C"] + table_args
    return _run(cmd, capture=True).returncode == 0


def _ensure_rule(insert, table_args):
    """اگر قانون وجود نداشت، آن را اضافه کن (idempotent).

    insert=True از -I (ابتدای زنجیره) و insert=False از -A (انتهای زنجیره)
    استفاده می‌کند.
    """
    if _rule_exists(table_args):
        return
    flag = "-I" if insert else "-A"
    _run(["iptables", flag] + table_args, check=True)


def ensure_base():
    """ساخت idempotent ست‌های ipset، زنجیره‌ها و هوک‌های لازم.

    این تابع در هر اجرای سینک و نیز هنگام بوت فراخوانی می‌شود تا فایروال حتی
    پس از ری‌استارت سرور خودترمیم باشد.
    """
    # 1) ساخت ست‌های ipset با شمارنده (در صورت عدم وجود)
    for setname in (IPSET_IN, IPSET_OUT):
        _run(["ipset", "create", setname, "hash:ip", "counters", "-exist"],
             check=True)

    # 2) ساخت زنجیره‌های اختصاصی (خطا اگر از قبل وجود داشته باشند نادیده گرفته می‌شود)
    for chain in (CHAIN_IN, CHAIN_OUT):
        _run(["iptables", "-N", chain], capture=True)

    # 3) هوک‌کردن CHAIN_IN از INPUT برای پورت‌های سرویس
    for port in SERVICE_PORTS_TCP.split(","):
        _ensure_rule(True, ["INPUT", "-p", "tcp", "--dport", port.strip(),
                            "-j", CHAIN_IN])
    for port in SERVICE_PORTS_UDP.split(","):
        _ensure_rule(True, ["INPUT", "-p", "udp", "--dport", port.strip(),
                            "-j", CHAIN_IN])

    # 4) هوک‌کردن CHAIN_OUT از OUTPUT برای شمارش ترافیک بازگشتی
    for port in SERVICE_PORTS_TCP.split(","):
        _ensure_rule(True, ["OUTPUT", "-p", "tcp", "--sport", port.strip(),
                            "-j", CHAIN_OUT])
    for port in SERVICE_PORTS_UDP.split(","):
        _ensure_rule(True, ["OUTPUT", "-p", "udp", "--sport", port.strip(),
                            "-j", CHAIN_OUT])

    # 5) قوانین داخل CHAIN_IN:
    #    الف) اگر IP در ست ورودی باشد → ACCEPT (و شمارش خودکار توسط ipset)
    _ensure_rule(False, [CHAIN_IN, "-m", "set", "--match-set", IPSET_IN, "src",
                        "-j", "ACCEPT"])
    #    ب) در غیر این صورت → DROP (کلاینت غیرمجاز)
    _ensure_rule(False, [CHAIN_IN, "-j", "DROP"])

    # 6) قوانین داخل CHAIN_OUT:
    #    فقط شمارش؛ سپس RETURN تا سیاست پیش‌فرض OUTPUT ادامه یابد.
    _ensure_rule(False, [CHAIN_OUT, "-m", "set", "--match-set", IPSET_OUT, "dst",
                        "-j", "RETURN"])


def ensure_panel_guard():
    """محدودکردن دسترسی پورت پنل فقط به ADMIN_IP.

    این تابع در هر سینک و هنگام بوت اجرا می‌شود تا حتی پس از ری‌استارت سرور،
    پورت پنل بسته بماند (بدون نیاز به بسته‌های iptables-persistent).
    اگر ADMIN_IP خالی باشد (یعنی محدودیت غیرفعال است) کاری انجام نمی‌دهد.
    """
    if not ADMIN_IP:
        return
    # قانون DROP باید در انتها و بعد از ACCEPT قرار گیرد؛ با درج ترتیبی مطمئن
    # می‌شویم ACCEPT (قانون ۱) پیش از DROP (قانون ۲) باشد.
    drop_args = ["INPUT", "-p", "tcp", "--dport", PANEL_PORT, "-j", "DROP"]
    accept_args = ["INPUT", "-p", "tcp", "--dport", PANEL_PORT,
                   "-s", ADMIN_IP, "-j", "ACCEPT"]
    if not _rule_exists(drop_args):
        _run(["iptables", "-I"] + drop_args, check=True)
    if not _rule_exists(accept_args):
        _run(["iptables", "-I"] + accept_args, check=True)


def get_members():
    """مجموعه‌ی IPهای موجود در ست ورودی را برمی‌گرداند."""
    res = _run(["ipset", "list", IPSET_IN, "-o", "save"], capture=True)
    members = set()
    for line in res.stdout.splitlines() if res.stdout else []:
        parts = line.split()
        # قالب: add <setname> <ip> [packets N bytes M]
        if len(parts) >= 3 and parts[0] == "add":
            members.add(parts[2])
    return members


def add_ip(ip: str):
    """افزودن یک IP به هر دو ست ورودی و خروجی."""
    _run(["ipset", "add", IPSET_IN, ip, "-exist"], check=True)
    _run(["ipset", "add", IPSET_OUT, ip, "-exist"], check=True)


def remove_ip(ip: str):
    """حذف یک IP از هر دو ست."""
    _run(["ipset", "del", IPSET_IN, ip, "-exist"], capture=True)
    _run(["ipset", "del", IPSET_OUT, ip, "-exist"], capture=True)


def _read_counters(setname):
    """دیکشنری {ip: bytes} از شمارنده‌های یک ست ipset را برمی‌گرداند."""
    res = _run(["ipset", "list", setname, "-o", "save"], capture=True)
    counters = {}
    for line in res.stdout.splitlines() if res.stdout else []:
        parts = line.split()
        if len(parts) >= 3 and parts[0] == "add":
            ip = parts[2]
            byte_val = 0
            if "bytes" in parts:
                try:
                    byte_val = int(parts[parts.index("bytes") + 1])
                except (ValueError, IndexError):
                    byte_val = 0
            counters[ip] = byte_val
    return counters


def read_all_counters():
    """شمارنده‌های ورودی و خروجی را با هم برمی‌گرداند.

    خروجی: dict {ip: {"in": bytes, "out": bytes}}
    """
    ins = _read_counters(IPSET_IN)
    outs = _read_counters(IPSET_OUT)
    all_ips = set(ins) | set(outs)
    return {ip: {"in": ins.get(ip, 0), "out": outs.get(ip, 0)} for ip in all_ips}
