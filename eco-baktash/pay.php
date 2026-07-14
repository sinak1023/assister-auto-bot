<?php
require_once __DIR__ . '/config.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    redirect('index.php');
}
csrf_check();

$name  = trim((string)($_POST['name'] ?? ''));
$phone = trim(fa_to_en_digits((string)($_POST['phone'] ?? '')));
$phone = preg_replace('/[\s\-]+/', '', $phone);

$back = static function (string $err) use ($name, $phone): void {
    redirect('index.php?' . http_build_query(['err' => $err, 'name' => $name, 'phone' => $phone]) . '#payForm');
};

if (mb_strlen($name) < 3) {
    $back('لطفاً نام و نام خانوادگی را کامل وارد کنید.');
}
if (!preg_match('/^09\d{9}$/', $phone)) {
    $back('شماره تماس معتبر نیست. شماره را به صورت 09xxxxxxxxx وارد کنید.');
}

$amount = (int)fa_to_en_digits(setting('price_toman', '0'));
if ($amount < 1000) {
    $back('قیمت دوره به‌درستی تنظیم نشده است. لطفاً به مدیر اطلاع دهید.');
}
if (setting('merchant_id') === '') {
    $back('درگاه پرداخت هنوز پیکربندی نشده است. لطفاً به مدیر اطلاع دهید.');
}

$db = db();
$st = $db->prepare('INSERT INTO payments (name, phone, amount, status, created_at)
    VALUES (?, ?, ?, "pending", ?)');
$st->execute([$name, $phone, $amount, time()]);
$paymentId = (int)$db->lastInsertId();

$description = setting('course_name') . ' - ' . $name . ' - ' . $phone;
$callback    = base_url() . '/verify.php';

$result = zp_request($amount, $description, $callback, $phone);

if (!$result['ok']) {
    $db->prepare('UPDATE payments SET status = "failed", fail_reason = ? WHERE id = ?')
       ->execute([$result['error'], $paymentId]);
    $back($result['error']);
}

$db->prepare('UPDATE payments SET authority = ? WHERE id = ?')
   ->execute([$result['authority'], $paymentId]);

redirect(zp_start_url($result['authority']));
