<?php
require_once __DIR__ . '/auth.php';
redirect(admin_logged_in() ? 'payments.php' : 'login.php');
