#!/usr/bin/env bash
# =============================================================================
# uninstall.sh — حذف کامل سرویس Smart DNS
# =============================================================================
# سرویس‌ها را متوقف و غیرفعال می‌کند، قوانین فایروال و ست‌های ipset را پاک
# می‌کند و فایل‌های نصب را حذف می‌کند. دیتابیس به‌صورت اختیاری نگه داشته می‌شود.
#
# اجرا:  sudo bash uninstall.sh
# =============================================================================

set -uo pipefail
INSTALL_DIR="${INSTALL_DIR:-/opt/smartdns}"
PANEL_PORT="${PANEL_PORT:-8088}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "این اسکریپت باید با root اجرا شود: sudo bash uninstall.sh"; exit 1
fi

echo "==> توقف و غیرفعال‌سازی سرویس‌ها"
systemctl disable --now smartdns-panel.service 2>/dev/null || true
systemctl disable --now smartdns-sync.timer 2>/dev/null || true
systemctl disable --now smartdns-sync.service 2>/dev/null || true
rm -f /etc/systemd/system/smartdns-*.service /etc/systemd/system/smartdns-*.timer
systemctl daemon-reload

echo "==> پاک‌سازی قوانین فایروال و ipset"
# حذف هوک‌های زنجیره از INPUT/OUTPUT
for p in 53 80 443; do
  iptables -D INPUT -p tcp --dport $p -j SMARTDNS 2>/dev/null || true
  iptables -D OUTPUT -p tcp --sport $p -j SMARTDNS_OUT 2>/dev/null || true
done
iptables -D INPUT -p udp --dport 53 -j SMARTDNS 2>/dev/null || true
iptables -D OUTPUT -p udp --sport 53 -j SMARTDNS_OUT 2>/dev/null || true
# حذف قانون پنل
iptables -D INPUT -p tcp --dport "${PANEL_PORT}" -j DROP 2>/dev/null || true
# تخلیه و حذف زنجیره‌ها
for chain in SMARTDNS SMARTDNS_OUT; do
  iptables -F $chain 2>/dev/null || true
  iptables -X $chain 2>/dev/null || true
done
ipset destroy smartdns_in 2>/dev/null || true
ipset destroy smartdns_out 2>/dev/null || true

echo "==> حذف کانفیگ‌های DNS/SNI"
rm -f /etc/dnsmasq.d/smartdns.conf /etc/sniproxy.conf
rm -f /etc/systemd/resolved.conf.d/smartdns.conf

read -rp "دیتابیس و فایل‌های نصب در ${INSTALL_DIR} حذف شوند؟ (y/N) " ans
if [[ "${ans:-N}" =~ ^[Yy]$ ]]; then
  rm -rf "${INSTALL_DIR}"
  echo "پوشه‌ی نصب حذف شد."
else
  echo "پوشه‌ی نصب نگه داشته شد: ${INSTALL_DIR}"
fi

echo "==> حذف کامل شد. برای بازگرداندن DNS محلی می‌توانید systemd-resolved را دوباره فعال کنید."
