<?php
require_once __DIR__ . '/auth.php';

if (admin_logged_in()) {
    redirect('payments.php');
}

$error = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    csrf_check();
    $password = (string)($_POST['password'] ?? '');
    if ($password !== '' && password_verify($password, setting('admin_password_hash'))) {
        session_regenerate_id(true);
        $_SESSION['admin_ok'] = true;
        redirect('payments.php');
    }
    sleep(1);
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
</div>
</body>
</html>
