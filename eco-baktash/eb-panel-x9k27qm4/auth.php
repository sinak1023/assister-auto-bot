<?php
require_once dirname(__DIR__) . '/config.php';

function admin_logged_in(): bool
{
    return !empty($_SESSION['admin_ok']);
}

function require_admin(): void
{
    if (!admin_logged_in()) {
        redirect('login.php');
    }
}

/**
 * فیلترهای مشترک صفحه پرداخت‌ها و خروجی را از GET می‌خواند
 * و شرط WHERE به همراه پارامترها را برمی‌گرداند.
 */
function payment_filters(): array
{
    $status = (string)($_GET['status'] ?? 'all');
    if (!in_array($status, ['pending', 'success', 'failed'], true)) {
        $status = 'all';
    }
    $q    = trim(fa_to_en_digits((string)($_GET['q'] ?? '')));
    $from = trim((string)($_GET['from'] ?? ''));
    $to   = trim((string)($_GET['to'] ?? ''));

    $where = [];
    $args  = [];

    if ($status !== 'all') {
        $where[] = 'status = ?';
        $args[]  = $status;
    }
    if ($q !== '') {
        $where[] = '(phone LIKE ? OR name LIKE ? OR ref_id LIKE ?)';
        $args[]  = "%$q%";
        $args[]  = "%$q%";
        $args[]  = "%$q%";
    }
    $fromTs = parse_jalali_date($from);
    if ($fromTs !== null) {
        $where[] = 'created_at >= ?';
        $args[]  = $fromTs;
    }
    $toTs = parse_jalali_date($to);
    if ($toTs !== null) {
        $where[] = 'created_at < ?';
        $args[]  = $toTs + 86400;
    }

    return [
        'sql'    => $where ? ('WHERE ' . implode(' AND ', $where)) : '',
        'args'   => $args,
        'status' => $status,
        'q'      => (string)($_GET['q'] ?? ''),
        'from'   => $from,
        'to'     => $to,
    ];
}

function status_badge(string $status): string
{
    switch ($status) {
        case 'success':
            return '<span class="badge ok">موفق</span>';
        case 'failed':
            return '<span class="badge bad">ناموفق</span>';
        default:
            return '<span class="badge wait">در انتظار</span>';
    }
}
