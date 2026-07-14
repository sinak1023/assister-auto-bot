<?php
declare(strict_types=1);

mb_internal_encoding('UTF-8');
date_default_timezone_set('Asia/Tehran');

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

define('BASE_DIR', __DIR__);
define('DATA_DIR', BASE_DIR . '/data');

require_once BASE_DIR . '/inc/helpers.php';
require_once BASE_DIR . '/inc/db.php';
require_once BASE_DIR . '/inc/zarinpal.php';
