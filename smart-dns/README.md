# 🛰️ Smart DNS — سرویس DNS هوشمند + SNI Proxy + پنل مدیریت

یک سرویس Smart DNS مشابه **Shecan / 403** برای عبور دادن ترافیک دامنه‌های خاص
(مثلاً شبکه‌ی PlayStation) از طریق سرور شما، به‌همراه یک **پنل مدیریت وب** برای
مدیریت IPهای مجاز، تاریخ انقضا و آمار مصرف ترافیک.

> این پروژه برای اجرا روی **Ubuntu** (تست‌شده روی 20.04 / 22.04 / 24.04) و روی
> سرورهایی مثل DigitalOcean طراحی شده است.

---

## 🧩 اجزای سرویس

| جزء | فناوری | نقش |
|-----|--------|-----|
| DNS Server | **dnsmasq** | برای دامنه‌های هدف IP سرور را برمی‌گرداند، بقیه را به upstream فوروارد می‌کند |
| SNI Proxy | **sniproxy** | ترافیک HTTPS پورت 80/443 را بر اساس SNI به مقصد واقعی فوروارد می‌کند |
| Whitelist | **ipset + iptables** | فقط IPهای مجاز به پورت‌های 53/80/443 دسترسی دارند + شمارش مصرف |
| پنل مدیریت | **Python / Flask** | مدیریت IP، انقضا، آمار مصرف، احراز هویت ادمین |
| دیتابیس | **SQLite** | نگهداری IPها، تاریخ انقضا و آمار |
| زمان‌بندی | **systemd timer** | سینک دوره‌ای whitelist، حذف منقضی‌ها، آپدیت مصرف |

---

## 📂 ساختار پروژه

```
smart-dns/
├── install.sh                  # نصب کامل و خودکار
├── uninstall.sh                # حذف کامل
├── README.md
├── config/
│   ├── domains.list            # لیست دامنه‌های هدف
│   ├── sniproxy.conf.template  # قالب کانفیگ SNI Proxy
│   └── settings.env.template   # متغیرهای پیکربندی
├── lib/                        # ماژول‌های مشترک پایتون
│   ├── db.py                   # لایه‌ی SQLite
│   └── firewall.py             # مدیریت ipset/iptables و شمارش مصرف
├── panel/                      # پنل وب Flask
│   ├── app.py
│   ├── requirements.txt
│   ├── templates/
│   └── static/
├── scripts/
│   ├── sync_whitelist.py       # سینک whitelist + مصرف + حذف منقضی‌ها
│   └── generate_dns_config.py  # تولید کانفیگ dnsmasq و sniproxy
└── systemd/
    ├── smartdns-panel.service
    ├── smartdns-sync.service
    └── smartdns-sync.timer
```

---

## 🚀 نصب

روی سرور Ubuntu خود، به‌عنوان **root**:

```bash
# انتقال پروژه به سرور (مثلاً با scp یا آنزیپ فایل zip)
unzip smart-dns.zip
cd smart-dns

# اجرای نصب (به‌صورت تعاملی IP سرور و IP ادمین را می‌پرسد)
sudo bash install.sh
```

یا بدون پرسش تعاملی، با تعیین متغیرها:

```bash
sudo ADMIN_IP=YOUR.HOME.IP.ADDR SERVER_IP=YOUR.SERVER.IP PANEL_PORT=8088 bash install.sh
```

در پایان، آدرس پنل، نام کاربری و **رمز عبور پیش‌فرض** چاپ می‌شود.

---

## 🖥️ استفاده

1. وارد پنل شوید: `http://SERVER_IP:8088`
2. با نام کاربری `admin` و رمز چاپ‌شده لاگین کنید و **بلافاصله رمز را تغییر دهید**.
3. IP دستگاه یا مودم خود را به‌همراه تعداد روز اعتبار در پنل اضافه کنید.
4. روی دستگاه/کنسول خود، **DNS را روی `SERVER_IP` تنظیم کنید**.
5. حالا دامنه‌های هدف از طریق سرور شما عبور می‌کنند.

> تغییرات whitelist حداکثر ظرف **۲ دقیقه** (بازه‌ی تایمر سینک) روی فایروال اعمال
> می‌شوند. برای اعمال فوری: `sudo systemctl start smartdns-sync.service`

---

## ⚙️ پیکربندی

همه‌ی متغیرها در `/opt/smartdns/settings.env` قرار دارند. پس از تغییر:

```bash
sudo systemctl restart smartdns-panel
sudo systemctl restart smartdns-sync.timer
```

**افزودن دامنه‌ی جدید:** دامنه را به `/opt/smartdns/config/domains.list` اضافه
کنید و کانفیگ‌ها را دوباره تولید کنید:

```bash
cd /opt/smartdns
sudo venv/bin/python scripts/generate_dns_config.py \
  "$SERVER_IP" 1.1.1.1 config/domains.list \
  /etc/dnsmasq.d/smartdns.conf config/sniproxy.conf.template /etc/sniproxy.conf
sudo systemctl restart dnsmasq sniproxy
```

---

## 🔍 عیب‌یابی

```bash
# وضعیت سرویس‌ها
systemctl status dnsmasq sniproxy smartdns-panel
systemctl list-timers | grep smartdns

# بررسی اشغال‌بودن پورت 53
sudo ss -lntup | grep ':53'

# تست DNS از یک دستگاه دیگر (باید IP سرور را برگرداند)
dig @SERVER_IP www.playstation.com +short

# مشاهده‌ی لاگ سینک
journalctl -u smartdns-sync.service -n 50

# مشاهده‌ی عضویت whitelist و شمارنده‌ها
sudo ipset list smartdns_in
```

**اگر پورت 53 آزاد نشد:** مطمئن شوید `systemd-resolved` با تنظیم
`DNSStubListener=no` ری‌استارت شده است (اسکریپت این کار را انجام می‌دهد).

---

## 🗑️ حذف

```bash
sudo bash uninstall.sh
```

---

## 🔐 نکات امنیتی

- پورت پنل فقط از `ADMIN_IP` قابل دسترسی است (توسط iptables). این محدودیت در هر
  بوت و هر سینک بازسازی می‌شود.
- رمز عبور ادمین در دیتابیس به‌صورت **هش‌شده** (Werkzeug) نگهداری می‌شود.
- فایل `settings.env` با مجوز `600` ذخیره می‌شود.
- توصیه می‌شود پشت پنل یک reverse proxy با TLS قرار دهید یا از طریق تونل SSH به
  آن دسترسی بگیرید.
