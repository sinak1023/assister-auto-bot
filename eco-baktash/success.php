<?php
require_once __DIR__ . '/config.php';

$token = trim((string)($_GET['t'] ?? ''));
if ($token === '') {
    redirect('index.php');
}

$st = db()->prepare('SELECT * FROM payments WHERE view_token = ? AND status = "success" LIMIT 1');
$st->execute([$token]);
$payment = $st->fetch();

if (!$payment) {
    redirect('index.php');
}
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>پرداخت موفق | <?= e(setting('brand_name')) ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/Vazirmatn-font-face.css" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="wrap">

    <h1 class="brand"><?= e(setting('brand_name')) ?></h1>

    <div class="card" style="margin-top:28px; text-align:center;">
        <div class="result-icon">🎉</div>
        <div class="result-title ok"><?= e(setting('success_title')) ?></div>
        <strong class="screenshot-note"><?= e(setting('screenshot_note')) ?></strong>

        <div class="receipt">
            <div class="row">
                <span class="k">نام و نام خانوادگی</span>
                <span class="v"><?= e($payment['name']) ?></span>
            </div>
            <div class="row">
                <span class="k">شماره تماس</span>
                <span class="v ltr"><?= e($payment['phone']) ?></span>
            </div>
            <div class="row">
                <span class="k">دوره</span>
                <span class="v"><?= e(setting('course_name')) ?></span>
            </div>
            <div class="row">
                <span class="k">مبلغ پرداختی</span>
                <span class="v"><?= format_toman($payment['amount']) ?></span>
            </div>
            <div class="row">
                <span class="k">زمان پرداخت</span>
                <span class="v"><?= e(jdate((int)$payment['paid_at'])) ?></span>
            </div>
            <div class="row">
                <span class="k">شناسه پرداخت</span>
                <span class="v ltr"><?= e($payment['ref_id']) ?></span>
            </div>
            <?php if ($payment['card_pan'] !== ''): ?>
            <div class="row">
                <span class="k">شماره کارت</span>
                <span class="v ltr"><?= e($payment['card_pan']) ?></span>
            </div>
            <?php endif; ?>
            <div class="row">
                <span class="k">کد پیگیری</span>
                <span class="v ltr"><?= e($payment['authority']) ?></span>
            </div>
        </div>

        <a class="btn-final" href="<?= e(setting('final_link')) ?>">
            <?= e(setting('final_link_text')) ?>
        </a>
    </div>

    <div class="footer-note">پرداخت امن از طریق درگاه زرین‌پال</div>
</div>
</body>
</html>
