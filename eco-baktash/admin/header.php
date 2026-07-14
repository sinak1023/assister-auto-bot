<?php
/** @var string $pageTitle */
$currentPage = basename($_SERVER['SCRIPT_NAME'] ?? '');
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?= e($pageTitle ?? 'مدیریت') ?> | <?= e(setting('brand_name')) ?></title>
<link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/Vazirmatn-font-face.css" rel="stylesheet">
<link rel="stylesheet" href="../assets/admin.css">
</head>
<body>
<div class="topbar">
    <div class="logo"><?= e(setting('brand_name')) ?> | پنل مدیریت</div>
    <nav>
        <a href="payments.php" class="<?= $currentPage === 'payments.php' ? 'active' : '' ?>">پرداخت‌ها</a>
        <a href="settings.php" class="<?= $currentPage === 'settings.php' ? 'active' : '' ?>">تنظیمات</a>
        <a href="export.php" class="<?= $currentPage === 'export.php' ? 'active' : '' ?>">خروجی و ریست</a>
        <a href="../index.php" target="_blank">نمایش سایت ↗</a>
        <a href="logout.php" class="logout">خروج</a>
    </nav>
</div>
<div class="container">
