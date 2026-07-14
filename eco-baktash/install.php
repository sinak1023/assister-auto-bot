<?php
/**
 * نصب‌کننده — فقط یک بار اجرا می‌شود.
 * بعد از نصب موفق، این فایل به‌صورت خودکار حذف می‌شود.
 */
declare(strict_types=1);

define('ADMIN_DIR', 'eb-panel-x9k27qm4');

mb_internal_encoding('UTF-8');
date_default_timezone_set('Asia/Tehran');
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

define('BASE_DIR', __DIR__);
define('DATA_DIR', BASE_DIR . '/data');

require_once BASE_DIR . '/inc/helpers.php';

/* ---------- بررسی پیش‌نیازها ---------- */
$checks = [];

$checks['نسخه PHP (حداقل 7.4)'] = PHP_VERSION_ID >= 70400
    ? [true, 'نسخه فعلی: ' . PHP_VERSION]
    : [false, 'نسخه فعلی: ' . PHP_VERSION . ' — از هاست بخواهید PHP را ارتقا دهد.'];

foreach (['pdo_sqlite' => 'ذخیره اطلاعات', 'curl' => 'ارتباط با زرین‌پال', 'mbstring' => 'پردازش متن فارسی'] as $ext => $why) {
    $checks["افزونه $ext ($why)"] = extension_loaded($ext)
        ? [true, 'فعال است']
        : [false, 'فعال نیست — از پنل هاست (PHP Extensions) فعالش کنید.'];
}

$writable = is_dir(DATA_DIR) ? is_writable(DATA_DIR) : is_writable(BASE_DIR);
$checks['دسترسی نوشتن در پوشه data'] = $writable
    ? [true, 'قابل نوشتن است']
    : [false, 'قابل نوشتن نیست — سطح دسترسی (Permission) پوشه را 755 یا 775 کنید.'];

$allOk = true;
foreach ($checks as $c) {
    if (!$c[0]) {
        $allOk = false;
    }
}

/* ---------- بررسی نصب قبلی ---------- */
$alreadyInstalled = false;
if ($allOk && file_exists(DATA_DIR . '/database.sqlite')) {
    require_once BASE_DIR . '/inc/db.php';
    $alreadyInstalled = setting('admin_password_hash') !== '';
}

/* ---------- اجرای نصب ---------- */
$done          = false;
$adminPassword = '';
$selfDeleted   = false;

if ($allOk && !$alreadyInstalled && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    require_once BASE_DIR . '/inc/db.php';
    db(); // ساخت دیتابیس و جدول‌ها

    // تولید رمز تصادفی قوی برای مدیریت
    $alphabet      = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    $adminPassword = '';
    for ($i = 0; $i < 14; $i++) {
        $adminPassword .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    set_setting('admin_password_hash', password_hash($adminPassword, PASSWORD_DEFAULT));

    $done        = true;
    $selfDeleted = @unlink(__FILE__);
}

function check_icon(bool $ok): string
{
    return $ok ? '✅' : '❌';
}

$adminUrl = ADMIN_DIR . '/';
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>نصب Eco Baktash</title>
<link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/Vazirmatn-font-face.css" rel="stylesheet">
<link rel="stylesheet" href="assets/admin.css">
</head>
<body>
<div class="container" style="max-width:640px;">
    <h1 class="page-title" style="margin-top:30px;">🚀 نصب لندینگ Eco Baktash</h1>

    <?php if ($done): ?>
        <div class="msg ok">نصب با موفقیت انجام شد! 🎉</div>

        <div class="panel">
            <h2>اطلاعات ورود به پنل مدیریت</h2>
            <p style="line-height:2.2; font-size:0.95rem;">
                آدرس پنل مدیریت:<br>
                <b style="direction:ltr; display:inline-block;">https://دامنه-شما/<?= e($adminUrl) ?></b>
            </p>
            <p style="line-height:2.2; font-size:0.95rem; margin-top:10px;">
                رمز عبور مدیریت (فقط همین یک بار نمایش داده می‌شود):
            </p>
            <div style="direction:ltr; text-align:center; font-size:1.5rem; font-weight:800; letter-spacing:2px;
                        background:var(--panel2); border:1px dashed var(--accent); border-radius:12px;
                        padding:16px; margin:10px 0;">
                <?= e($adminPassword) ?>
            </div>
            <div class="msg bad" style="margin-top:14px;">
                ⚠️ همین حالا این رمز و آدرس پنل را در جای امنی ذخیره کنید.
                این اطلاعات دیگر قابل مشاهده نیستند (البته می‌توانید بعداً رمز را از تنظیمات عوض کنید).
            </div>
            <?php if ($selfDeleted): ?>
                <div class="msg ok">فایل install.php به‌صورت خودکار حذف شد. ✅</div>
            <?php else: ?>
                <div class="msg bad">حذف خودکار install.php ممکن نشد — لطفاً خودتان این فایل را از هاست حذف کنید.</div>
            <?php endif; ?>
            <a class="btn" href="<?= e($adminUrl) ?>">ورود به پنل مدیریت</a>
        </div>

        <div class="panel">
            <h2>قدم‌های بعدی</h2>
            <ol style="line-height:2.4; font-size:0.92rem; padding-right:20px; color:var(--text);">
                <li>در تنظیمات، <b>مرچنت کد زرین‌پال</b> را وارد کنید.</li>
                <li>متن‌ها، قیمت و لینک کانال را تنظیم کنید.</li>
                <li>یک پرداخت تستی در حالت سندباکس انجام دهید.</li>
                <li>تیک «حالت تست (سندباکس)» را بردارید تا پرداخت واقعی فعال شود.</li>
            </ol>
        </div>

    <?php elseif ($alreadyInstalled): ?>
        <div class="msg bad">
            سیستم قبلاً نصب شده است. به دلایل امنیتی نصب مجدد ممکن نیست —
            لطفاً فایل install.php را از هاست حذف کنید.
        </div>
        <a class="btn" href="index.php">مشاهده سایت</a>

    <?php else: ?>
        <div class="panel">
            <h2>بررسی پیش‌نیازهای هاست</h2>
            <table>
                <?php foreach ($checks as $label => $c): ?>
                <tr>
                    <td><?= check_icon($c[0]) ?> <?= e($label) ?></td>
                    <td style="color:var(--muted);"><?= e($c[1]) ?></td>
                </tr>
                <?php endforeach; ?>
            </table>
        </div>

        <?php if ($allOk): ?>
            <form method="post">
                <button type="submit" class="btn green" style="width:100%; padding:15px; font-size:1.05rem;">
                    ✅ همه‌چیز آماده است — نصب کن
                </button>
            </form>
        <?php else: ?>
            <div class="msg bad">
                موارد بالا را برطرف کنید و صفحه را رفرش کنید.
            </div>
        <?php endif; ?>
    <?php endif; ?>
</div>
</body>
</html>
