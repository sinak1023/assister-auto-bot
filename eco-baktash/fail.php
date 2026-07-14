<?php
require_once __DIR__ . '/config.php';
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>پرداخت ناموفق | <?= e(setting('brand_name')) ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/Vazirmatn-font-face.css" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="wrap">

    <h1 class="brand"><?= e(setting('brand_name')) ?></h1>

    <div class="card" style="margin-top:28px; text-align:center;">
        <div class="result-icon">😔</div>
        <div class="result-title bad"><?= e(setting('fail_title')) ?></div>
        <p style="margin-top:16px; color:var(--muted); line-height:2;">
            <?= nl2br(e(setting('fail_text'))) ?>
        </p>
        <a class="btn-back" href="index.php">تلاش مجدد</a>
    </div>

    <div class="footer-note">پرداخت امن از طریق درگاه زرین‌پال</div>
</div>
</body>
</html>
