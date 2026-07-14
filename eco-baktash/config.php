<?php
declare(strict_types=1);

mb_internal_encoding('UTF-8');
date_default_timezone_set('Asia/Tehran');

if (session_status() === PHP_SESSION_NONE) {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

define('BASE_DIR', __DIR__);
define('DATA_DIR', BASE_DIR . '/data');

require_once BASE_DIR . '/inc/helpers.php';
require_once BASE_DIR . '/inc/db.php';
require_once BASE_DIR . '/inc/zarinpal.php';
