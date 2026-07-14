<?php
require_once __DIR__ . '/config.php';

$authority = trim((string)($_GET['Authority'] ?? ''));
$status    = trim((string)($_GET['Status'] ?? ''));

if ($authority === '') {
    redirect('index.php');
}

$db = db();
$st = $db->prepare('SELECT * FROM payments WHERE authority = ? LIMIT 1');
$st->execute([$authority]);
$payment = $st->fetch();

if (!$payment) {
    redirect('fail.php');
}

// اگر قبلاً موفق شده، دوباره به رسید هدایت شود
if ($payment['status'] === 'success' && $payment['view_token'] !== '') {
    redirect('success.php?t=' . urlencode($payment['view_token']));
}

if ($status !== 'OK') {
    $db->prepare('UPDATE payments SET status = "failed", fail_reason = ? WHERE id = ?')
       ->execute(['انصراف کاربر از پرداخت', $payment['id']]);
    redirect('fail.php');
}

$result = zp_verify((int)$payment['amount'], $authority);

if (!$result['ok']) {
    $db->prepare('UPDATE payments SET status = "failed", fail_reason = ? WHERE id = ?')
       ->execute([$result['error'], $payment['id']]);
    redirect('fail.php');
}

$token = bin2hex(random_bytes(16));
$db->prepare('UPDATE payments
    SET status = "success", ref_id = ?, card_pan = ?, view_token = ?, paid_at = ?, fail_reason = ""
    WHERE id = ?')
   ->execute([$result['ref_id'], $result['card_pan'], $token, time(), $payment['id']]);

redirect('success.php?t=' . urlencode($token));
