<?php
require_once __DIR__ . '/auth.php';

if (admin_logged_in()) {
    redirect('payments.php');
}

$notInstalled = setting('admin_password_hash') === '';

$error = '';
if (!$notInstalled && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    csrf_check();
    $password = (string)($_POST['password'] ?? '');
    if ($password !== '' && password_verify($password, setting('admin_password_hash'))) {
        session_regenerate_id(true);
        $_SESSION['admin_ok']    = true;
        $_SESSION['login_fails'] = 0;
        redirect('payments.php');
    }
    // کند کردن حملات حدس رمز: هر تلاش ناموفق، تأخیر بیشتر
    $_SESSION['login_fails'] = (int)($_SESSION['login_fails'] ?? 0) + 1;
    sleep(min($_SESSION['login_fails'], 5));
    $error = 'رمز عبور اشتباه است.';
}
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ورود به مدیریت</title>
<link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/Vazirmatn-font-face.css" rel="stylesheet">
<link rel="stylesheet" href="../assets/admin.css">
</head>
<body>
<div class="login-box">
    <h1>🔐 ورود به پنل مدیریت</h1>
    <?php if ($notInstalled): ?>
        <div class="msg bad">
            سیستم هنوز نصب نشده است. ابتدا فایل <b>install.php</b> را در مرورگر اجرا کنید.
        </div>
    <?php else: ?>
        <?php if ($error !== ''): ?>
            <div class="msg bad"><?= e($error) ?></div>
        <?php endif; ?>
        <form method="post">
            <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
            <div class="fgroup">
                <label for="password">رمز عبور</label>
                <input type="password" id="password" name="password" required autofocus>
            </div>
            <button type="submit" class="btn" style="width:100%">ورود</button>
        </form>
    <?php endif; ?>
</div>
</body>
</html>
