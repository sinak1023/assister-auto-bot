<?php
require_once __DIR__ . '/auth.php';
require_admin();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    redirect('export.php');
}
csrf_check();

if (trim((string)($_POST['confirm_text'] ?? '')) !== 'RESET') {
    redirect('export.php');
}

$db = db();
$db->exec('DELETE FROM payments');
$db->exec('DELETE FROM sqlite_sequence WHERE name = "payments"');
$db->exec('VACUUM');

redirect('export.php?reset=1');
