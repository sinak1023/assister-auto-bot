<?php
require_once __DIR__ . '/config.php';

$err   = trim((string)($_GET['err'] ?? ''));
$name  = trim((string)($_GET['name'] ?? ''));
$phone = trim((string)($_GET['phone'] ?? ''));
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e(setting('brand_name')) ?> | <?= e(setting('course_name')) ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/Vazirmatn-font-face.css" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="wrap">

    <h1 class="brand"><?= e(setting('brand_name')) ?></h1>

    <div class="course-name"><?= e(setting('course_name')) ?></div>

    <div class="price"><?= format_toman(setting('price_toman', '0')) ?></div>

    <div>
        <button type="button" class="btn-details" id="btnDetails">
            <?= e(setting('details_button_text')) ?>
        </button>
    </div>

    <?php if ($err !== ''): ?>
        <div class="alert"><?= e($err) ?></div>
    <?php endif; ?>

    <form class="card" method="post" action="pay.php" id="payForm">
        <h2><?= e(setting('form_title')) ?></h2>
        <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">

        <div class="field">
            <label for="name">نام و نام خانوادگی</label>
            <input type="text" id="name" name="name" required maxlength="100"
                   placeholder="مثلاً: علی محمدی" value="<?= e($name) ?>">
        </div>

        <div class="field">
            <label for="phone">شماره تماس</label>
            <input type="tel" id="phone" name="phone" required maxlength="15"
                   placeholder="09xxxxxxxxx" inputmode="tel" value="<?= e($phone) ?>">
        </div>

        <button type="submit" class="btn-pay" id="btnPay">
            <?= e(setting('pay_button_text')) ?> — <?= format_toman(setting('price_toman', '0')) ?>
        </button>
    </form>

    <div class="footer-note">پرداخت امن از طریق درگاه زرین‌پال</div>
</div>

<!-- پاپ‌آپ توضیحات -->
<div class="modal-overlay" id="modalOverlay">
    <div class="modal">
        <h3><?= e(setting('description_title')) ?></h3>
        <div class="modal-body"><?= nl2br(e(setting('description_text'))) ?></div>
        <button type="button" class="btn-close" id="btnClose">بستن</button>
    </div>
</div>

<script>
(function () {
    var overlay = document.getElementById('modalOverlay');
    document.getElementById('btnDetails').addEventListener('click', function () {
        overlay.classList.add('open');
    });
    document.getElementById('btnClose').addEventListener('click', function () {
        overlay.classList.remove('open');
    });
    overlay.addEventListener('click', function (ev) {
        if (ev.target === overlay) overlay.classList.remove('open');
    });

    document.getElementById('payForm').addEventListener('submit', function () {
        var btn = document.getElementById('btnPay');
        btn.disabled = true;
        btn.textContent = 'در حال انتقال به درگاه پرداخت...';
    });
})();
</script>
</body>
</html>
