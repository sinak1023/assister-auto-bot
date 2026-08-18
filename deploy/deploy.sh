#!/bin/bash
# ═══ دیپلوی Sinox API — نسخه‌ی بازطراحی ═══
# اجرا روی سرور:  bash deploy.sh <PASSPHRASE>
set -euo pipefail
PASS="${1:?passphrase لازم است: bash deploy.sh <PASSPHRASE>}"
STAMP=$(date +%Y%m%d-%H%M%S)
URL="https://raw.githubusercontent.com/sinak1023/assister-auto-bot/claude/sinoxapi-ui-redesign-hts0tf/deploy/sinoxapi-redesign.tar.gz.enc"

echo "── ۰) پیش‌نیازها"
node -v; command -v openssl >/dev/null
test -d /root/api-reseller || { echo "❌ /root/api-reseller نیست"; exit 1; }
test -f /root/api-reseller/.env || { echo "❌ .env نیست"; exit 1; }

echo "── ۱) دانلود بسته"
cd /root
curl -fsSL "$URL" -o /root/sinoxapi-redesign.tar.gz.enc
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in sinoxapi-redesign.tar.gz.enc -pass "pass:$PASS" -out sinoxapi-redesign.tar.gz
tar tzf sinoxapi-redesign.tar.gz >/dev/null && echo "  بسته سالم است ✅"

echo "── ۲) بک‌آپ (دیتابیس + کد)"
mkdir -p /root/backups
cp /root/api-reseller/data/app.db /root/backups/app.db.pre-redesign.$STAMP
tar czf /root/backups/code.pre-redesign.$STAMP.tgz -C /root/api-reseller --exclude node_modules --exclude data . 2>/dev/null || true
echo "  بک‌آپ: /root/backups/app.db.pre-redesign.$STAMP ✅"

echo "── ۳) استخراج و آماده‌سازی (سرویس هنوز روشن است — بدون قطعی)"
rm -rf /root/api-reseller-new
mkdir /root/api-reseller-new
tar xzf sinoxapi-redesign.tar.gz -C /root/api-reseller-new --strip-components=1
cp /root/api-reseller/.env /root/api-reseller-new/.env
# آپلودهای مقالات production را نگه دار (بسته فقط snapshot دارد)
if [ -d /root/api-reseller/public/uploads ]; then
  cp -rn /root/api-reseller/public/uploads/. /root/api-reseller-new/public/uploads/ 2>/dev/null || true
fi
cd /root/api-reseller-new
npm install --omit=dev --no-audit --no-fund 2>&1 | tail -2

echo "── ۴) توقف سرویس و اتصال دیتای واقعی"
systemctl stop api-reseller
cp -r /root/api-reseller/data /root/api-reseller-new/data

echo "── ۵) تست بوت (مهاجرت‌ها اینجا اجرا می‌شوند + بک‌آپ خودکار در data/backups)"
cd /root/api-reseller-new
set +e
timeout 25 node server.js > /tmp/sinox-boot-test.log 2>&1
BOOTRC=$?
set -e
grep -E "\[migrate\]|running on port" /tmp/sinox-boot-test.log | head -15
if ! grep -q "running on port" /tmp/sinox-boot-test.log; then
  echo "❌ بوت ناموفق — سرویس قدیمی را برمی‌گردانم"; tail -30 /tmp/sinox-boot-test.log
  systemctl start api-reseller; exit 1
fi
echo "  بوت آزمایشی موفق ✅ (rc=$BOOTRC = timeout یعنی سرور زنده ماند)"

echo "── ۶) سوییچ"
mv /root/api-reseller /root/api-reseller-old.$STAMP
mv /root/api-reseller-new /root/api-reseller
systemctl start api-reseller
sleep 4
systemctl is-active api-reseller

echo "── ۷) سلامت"
for e in /api/config /api/plans /api/health/system; do
  printf "  %-24s %s\n" "$e" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3401$e)"
done
curl -s http://127.0.0.1:3401/ | grep -o "<title>[^<]*" | head -1

echo ""
echo "🏆 دیپلوی تمام شد. رول‌بک در صورت نیاز:"
echo "   systemctl stop api-reseller && mv /root/api-reseller /root/api-reseller-failed && mv /root/api-reseller-old.$STAMP /root/api-reseller && systemctl start api-reseller"
rm -f /root/sinoxapi-redesign.tar.gz.enc /root/sinoxapi-redesign.tar.gz
