#!/usr/bin/env bash
# =============================================================================
# install.sh — نصب خودکار و کامل سرویس Smart DNS (شبیه Shecan/403)
# =============================================================================
# این اسکریپت:
#   1) پکیج‌های لازم را نصب می‌کند (dnsmasq, sniproxy, ipset, python venv, ...).
#   2) پورت 53 را بررسی و آزاد می‌کند (غیرفعال‌کردن stub سرویس systemd-resolved).
#   3) فایل‌های پروژه را در مسیر نصب کپی و کانفیگ‌ها را تولید می‌کند.
#   4) دیتابیس SQLite و یک ادمین با پسورد تصادفی می‌سازد.
#   5) سرویس‌های systemd (پنل، سینک، dnsmasq، sniproxy) را فعال می‌کند.
#   6) فایروال را طوری تنظیم می‌کند که پورت پنل فقط از ADMIN_IP در دسترس باشد.
#   7) در پایان آدرس پنل و رمز پیش‌فرض را چاپ می‌کند.
#
# نحوه‌ی اجرا (روی سرور Ubuntu، با کاربر root):
#   sudo bash install.sh
#   # یا با تعیین متغیرها بدون پرسش تعاملی:
#   sudo ADMIN_IP=1.2.3.4 SERVER_IP=5.6.7.8 bash install.sh
# =============================================================================

set -euo pipefail

# --------------------------- متغیرهای قابل تنظیم ---------------------------
INSTALL_DIR="${INSTALL_DIR:-/opt/smartdns}"
PANEL_PORT="${PANEL_PORT:-8088}"
PANEL_HOST="${PANEL_HOST:-0.0.0.0}"
UPSTREAM_DNS="${UPSTREAM_DNS:-1.1.1.1}"
ADMIN_USER="${ADMIN_USER:-admin}"
# SERVER_IP و ADMIN_IP در صورت خالی‌بودن به‌صورت تعاملی پرسیده می‌شوند.
SERVER_IP="${SERVER_IP:-}"
ADMIN_IP="${ADMIN_IP:-}"

# مسیر پوشه‌ی سورس (جایی که این اسکریپت قرار دارد)
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ------------------------------- توابع کمکی -------------------------------
c_green(){ printf '\033[32m%s\033[0m\n' "$*"; }
c_yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }
c_red(){ printf '\033[31m%s\033[0m\n' "$*"; }
step(){ printf '\n\033[36m==> %s\033[0m\n' "$*"; }

require_root(){
  if [[ "${EUID}" -ne 0 ]]; then
    c_red "این اسکریپت باید با دسترسی root اجرا شود:  sudo bash install.sh"
    exit 1
  fi
}

# ------------------------------ مرحله ۰: بررسی ------------------------------
require_root

step "بررسی و دریافت متغیرهای پیکربندی"

# تشخیص خودکار IP عمومی سرور در صورت تعیین‌نشدن
if [[ -z "${SERVER_IP}" ]]; then
  SERVER_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  if [[ -z "${SERVER_IP}" ]]; then
    SERVER_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')"
  fi
fi
if [[ -z "${SERVER_IP}" ]]; then
  read -rp "IP عمومی سرور را وارد کنید: " SERVER_IP
fi

# دریافت IP مجاز برای دسترسی به پنل
if [[ -z "${ADMIN_IP}" ]]; then
  c_yellow "برای امنیت، پورت پنل فقط از یک IP قابل دسترسی خواهد بود."
  read -rp "IP مجاز شما برای دسترسی به پنل (خالی = بدون محدودیت، توصیه نمی‌شود): " ADMIN_IP
fi

c_green "SERVER_IP = ${SERVER_IP}"
c_green "ADMIN_IP  = ${ADMIN_IP:-<بدون محدودیت>}"
c_green "PANEL     = ${PANEL_HOST}:${PANEL_PORT}"

# --------------------------- مرحله ۱: نصب پکیج‌ها ---------------------------
step "نصب پکیج‌های مورد نیاز"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  dnsmasq sniproxy ipset iptables \
  python3 python3-venv python3-pip \
  curl ca-certificates

# ------------------------ مرحله ۲: آزادسازی پورت 53 ------------------------
step "بررسی و آزادسازی پورت 53"

# نمایش وضعیت فعلی پورت 53
if ss -lntup 2>/dev/null | grep -qE ':53\b'; then
  c_yellow "پورت 53 در حال حاضر اشغال است. تلاش برای آزادسازی..."
  ss -lntup | grep -E ':53\b' || true
fi

# غیرفعال‌کردن stub سرویس systemd-resolved (که معمولاً پورت 53 را اشغال می‌کند)
if systemctl is-active --quiet systemd-resolved 2>/dev/null; then
  mkdir -p /etc/systemd/resolved.conf.d
  cat > /etc/systemd/resolved.conf.d/smartdns.conf <<EOF
# غیرفعال‌کردن listener محلی روی پورت 53 تا dnsmasq بتواند آن را بگیرد
[Resolve]
DNSStubListener=no
EOF
  systemctl restart systemd-resolved || true
fi

# جایگزینی resolv.conf با یک DNS واقعی تا خودِ سرور بتواند نام‌ها را رزولو کند
# (پس از غیرفعال‌شدن stub، اشاره به 127.0.0.53 دیگر کار نمی‌کند)
if [[ -L /etc/resolv.conf ]]; then rm -f /etc/resolv.conf; fi
cat > /etc/resolv.conf <<EOF
nameserver ${UPSTREAM_DNS}
nameserver 8.8.8.8
EOF

# اگر هنوز فرایندی پورت 53 را گرفته، آن را متوقف کن
if ss -lntup 2>/dev/null | grep -qE ':53\b'; then
  c_yellow "توقف سرویس‌های مزاحم روی پورت 53..."
  fuser -k 53/udp 2>/dev/null || true
  fuser -k 53/tcp 2>/dev/null || true
  sleep 1
fi

# ------------------------ مرحله ۳: کپی فایل‌های پروژه ------------------------
step "کپی فایل‌های پروژه در ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"/{data,lib,panel,scripts,config,systemd}
cp -r "${SRC_DIR}/lib/."     "${INSTALL_DIR}/lib/"
cp -r "${SRC_DIR}/panel/."   "${INSTALL_DIR}/panel/"
cp -r "${SRC_DIR}/scripts/." "${INSTALL_DIR}/scripts/"
cp -r "${SRC_DIR}/config/."  "${INSTALL_DIR}/config/"
cp -r "${SRC_DIR}/systemd/." "${INSTALL_DIR}/systemd/"
chmod +x "${INSTALL_DIR}/scripts/"*.py

# ------------------------- مرحله ۴: ساخت settings.env -------------------------
step "تولید فایل تنظیمات settings.env"
PANEL_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
sed \
  -e "s|__SERVER_IP__|${SERVER_IP}|g" \
  -e "s|__ADMIN_IP__|${ADMIN_IP}|g" \
  -e "s|__PANEL_SECRET__|${PANEL_SECRET}|g" \
  "${INSTALL_DIR}/config/settings.env.template" > "${INSTALL_DIR}/settings.env"

# افزودن مقادیر پورت/هاست پنل (برای همسویی با ورودی‌های اسکریپت)
{
  echo ""
  echo "PANEL_HOST=${PANEL_HOST}"
  echo "PANEL_PORT=${PANEL_PORT}"
  echo "UPSTREAM_DNS=${UPSTREAM_DNS}"
  echo "ADMIN_USER=${ADMIN_USER}"
} >> "${INSTALL_DIR}/settings.env"
chmod 600 "${INSTALL_DIR}/settings.env"

# ---------------------- مرحله ۵: راه‌اندازی محیط پایتون ----------------------
step "ساخت محیط مجازی پایتون و نصب وابستگی‌ها"
python3 -m venv "${INSTALL_DIR}/venv"
"${INSTALL_DIR}/venv/bin/pip" install --upgrade pip >/dev/null
"${INSTALL_DIR}/venv/bin/pip" install -r "${INSTALL_DIR}/panel/requirements.txt"

# --------------------- مرحله ۶: تولید کانفیگ DNS و SNI ---------------------
step "تولید کانفیگ dnsmasq و sniproxy از روی لیست دامنه‌ها"
"${INSTALL_DIR}/venv/bin/python" "${INSTALL_DIR}/scripts/generate_dns_config.py" \
  "${SERVER_IP}" \
  "${UPSTREAM_DNS}" \
  "${INSTALL_DIR}/config/domains.list" \
  "/etc/dnsmasq.d/smartdns.conf" \
  "${INSTALL_DIR}/config/sniproxy.conf.template" \
  "/etc/sniproxy.conf"

# اطمینان از فعال‌بودن conf-dir در dnsmasq
if ! grep -qE '^\s*conf-dir=/etc/dnsmasq.d' /etc/dnsmasq.conf 2>/dev/null; then
  echo "conf-dir=/etc/dnsmasq.d/,*.conf" >> /etc/dnsmasq.conf
fi

# ساخت پوشه‌های لاگ و pid برای sniproxy
mkdir -p /var/log/sniproxy /var/run/sniproxy
# فعال‌سازی sniproxy در فایل پیش‌فرض (بعضی نسخه‌ها ENABLED=0 دارند)
if [[ -f /etc/default/sniproxy ]]; then
  sed -i 's/^ENABLED=.*/ENABLED=1/' /etc/default/sniproxy || true
fi

# ------------------------ مرحله ۷: مقداردهی دیتابیس ------------------------
step "ساخت دیتابیس و کاربر ادمین"
ADMIN_PASS="$(python3 -c 'import secrets; print(secrets.token_urlsafe(12))')"
DB_PATH="${INSTALL_DIR}/data/smartdns.db"
INSTALL_DIR="${INSTALL_DIR}" DB_PATH="${DB_PATH}" \
  "${INSTALL_DIR}/venv/bin/python" - "$ADMIN_USER" "$ADMIN_PASS" <<'PYEOF'
import os, sys
sys.path.insert(0, os.environ["INSTALL_DIR"])
from lib import db
db.init_db()
db.create_admin(sys.argv[1], sys.argv[2])
print("دیتابیس و ادمین ساخته شد.")
PYEOF

# ------------------------ مرحله ۸: نصب سرویس‌های systemd ------------------------
step "نصب و فعال‌سازی سرویس‌های systemd"
for unit in smartdns-panel.service smartdns-sync.service smartdns-sync.timer; do
  sed "s|__INSTALL_DIR__|${INSTALL_DIR}|g" \
    "${INSTALL_DIR}/systemd/${unit}" > "/etc/systemd/system/${unit}"
done
systemctl daemon-reload

# فعال‌سازی و راه‌اندازی سرویس‌های DNS و پروکسی
systemctl enable --now dnsmasq   || c_yellow "هشدار: راه‌اندازی dnsmasq با خطا مواجه شد؛ لاگ را بررسی کنید."
systemctl enable --now sniproxy  || c_yellow "هشدار: راه‌اندازی sniproxy با خطا مواجه شد؛ لاگ را بررسی کنید."

# فعال‌سازی پنل و تایمر سینک
systemctl enable --now smartdns-panel.service
systemctl enable --now smartdns-sync.timer
# یک اجرای فوری سینک برای ساخت ساختار فایروال
systemctl start smartdns-sync.service || true

# --------------------------- مرحله ۹: فایروال پنل ---------------------------
step "اعمال محدودیت فایروال روی پورت پنل"
# محافظت بلافاصله (سینک هم در هر بوت این را بازسازی می‌کند)
if [[ -n "${ADMIN_IP}" ]]; then
  iptables -C INPUT -p tcp --dport "${PANEL_PORT}" -j DROP 2>/dev/null || \
    iptables -I INPUT -p tcp --dport "${PANEL_PORT}" -j DROP
  iptables -C INPUT -p tcp --dport "${PANEL_PORT}" -s "${ADMIN_IP}" -j ACCEPT 2>/dev/null || \
    iptables -I INPUT -p tcp --dport "${PANEL_PORT}" -s "${ADMIN_IP}" -j ACCEPT
  c_green "پورت ${PANEL_PORT} فقط برای ${ADMIN_IP} باز است."
else
  c_yellow "ADMIN_IP تعیین نشد؛ پورت پنل برای همه باز است (ناامن)."
fi

# ------------------------------ مرحله ۱۰: پایان ------------------------------
step "بررسی نهایی وضعیت سرویس‌ها"
systemctl --no-pager --lines=0 status dnsmasq sniproxy smartdns-panel 2>/dev/null | \
  grep -E 'Active:|●' || true

echo ""
c_green "======================================================================"
c_green "  ✅ نصب Smart DNS با موفقیت کامل شد"
c_green "======================================================================"
echo ""
echo "  🌐 آدرس پنل مدیریت :  http://${SERVER_IP}:${PANEL_PORT}"
echo "  👤 نام کاربری       :  ${ADMIN_USER}"
echo "  🔑 رمز عبور پیش‌فرض  :  ${ADMIN_PASS}"
echo ""
echo "  🛰️  DNS سرور        :  ${SERVER_IP}  (پورت 53)"
echo "  📁 مسیر نصب        :  ${INSTALL_DIR}"
echo "  🗄️  دیتابیس         :  ${DB_PATH}"
echo ""
c_yellow "  ⚠️  حتماً پس از اولین ورود، رمز عبور را از داخل پنل تغییر دهید."
c_yellow "  ⚠️  برای استفاده از سرویس، ابتدا IP دستگاه خود را در پنل اضافه کنید،"
c_yellow "      سپس DNS دستگاه را روی ${SERVER_IP} تنظیم کنید."
echo ""
c_green "======================================================================"
