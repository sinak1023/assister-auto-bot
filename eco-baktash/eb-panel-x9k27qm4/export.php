<?php
require_once __DIR__ . '/auth.php';
require_admin();

$db     = db();
$filter = payment_filters();

// دانلود CSV با همان فیلترها
if (isset($_GET['download'])) {
    $st = $db->prepare("SELECT * FROM payments {$filter['sql']} ORDER BY id DESC");
    $st->execute($filter['args']);

    $filename = 'payments-' . str_replace('/', '-', jdate(time(), false)) . '.csv';
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');

    $out = fopen('php://output', 'w');
    // BOM برای نمایش درست فارسی در اکسل
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, ['ردیف', 'نام و نام خانوادگی', 'شماره تماس', 'مبلغ (تومان)', 'وضعیت',
        'شناسه پرداخت', 'شماره کارت', 'کد پیگیری', 'تاریخ ثبت', 'تاریخ پرداخت', 'توضیح']);

    $statusFa = ['pending' => 'در انتظار پرداخت', 'success' => 'موفق', 'failed' => 'ناموفق'];
    while ($r = $st->fetch()) {
        fputcsv($out, [
            $r['id'],
            $r['name'],
            $r['phone'],
            $r['amount'],
            $statusFa[$r['status']] ?? $r['status'],
            $r['ref_id'],
            $r['card_pan'],
            $r['authority'],
            jdate((int)$r['created_at']),
            jdate($r['paid_at'] !== null ? (int)$r['paid_at'] : null),
            $r['fail_reason'],
        ]);
    }
    fclose($out);
    exit;
}

$st = $db->prepare("SELECT COUNT(*) FROM payments {$filter['sql']}");
$st->execute($filter['args']);
$total = (int)$st->fetchColumn();

$msg = '';
if (isset($_GET['reset'])) {
    $msg = 'دیتابیس پرداخت‌ها با موفقیت ریست شد. کمپین جدید مبارک! 🎉';
}

$pageTitle = 'خروجی و ریست';
require __DIR__ . '/header.php';
?>
<h1 class="page-title">خروجی اکسل و ریست دیتابیس</h1>

<?php if ($msg !== ''): ?>
    <div class="msg ok"><?= e($msg) ?></div>
<?php endif; ?>

<div class="panel">
    <h2>فیلتر خروجی</h2>
    <form method="get" class="filters">
        <div>
            <label>جستجو (شماره / نام / شناسه پرداخت)</label>
            <input type="text" name="q" value="<?= e($filter['q']) ?>" placeholder="0912... یا نام">
        </div>
        <div>
            <label>وضعیت</label>
            <select name="status">
                <option value="all" <?= $filter['status'] === 'all' ? 'selected' : '' ?>>همه</option>
                <option value="success" <?= $filter['status'] === 'success' ? 'selected' : '' ?>>موفق</option>
                <option value="pending" <?= $filter['status'] === 'pending' ? 'selected' : '' ?>>در انتظار پرداخت</option>
                <option value="failed" <?= $filter['status'] === 'failed' ? 'selected' : '' ?>>ناموفق</option>
            </select>
        </div>
        <div>
            <label>از تاریخ (شمسی)</label>
            <input type="text" name="from" value="<?= e($filter['from']) ?>" placeholder="1405/01/01">
        </div>
        <div>
            <label>تا تاریخ (شمسی)</label>
            <input type="text" name="to" value="<?= e($filter['to']) ?>" placeholder="1405/12/29">
        </div>
        <div style="display:flex; gap:8px;">
            <button type="submit" class="btn ghost">اعمال فیلتر</button>
        </div>
    </form>

    <div style="margin-top:18px; display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
        <a class="btn green" href="export.php?<?= e(http_build_query(array_merge($_GET, ['download' => 1]))) ?>">
            ⬇️ دانلود CSV (<?= number_format($total) ?> رکورد)
        </a>
        <span class="hint">فایل CSV با اکسل و Google Sheets باز می‌شود.</span>
    </div>
</div>

<div class="panel danger-zone">
    <h2>⚠️ ریست دیتابیس (شروع کمپین جدید)</h2>
    <p style="font-size:0.9rem; color:var(--muted); line-height:2; margin-bottom:16px;">
        با این کار <strong style="color:var(--bad);">تمام رکوردهای پرداخت حذف می‌شوند</strong> و قابل بازگشت نیستند.
        تنظیمات سایت دست‌نخورده می‌ماند. قبل از ریست حتماً خروجی CSV بگیرید.
    </p>
    <form method="post" action="reset.php" onsubmit="return confirm('مطمئن هستید؟ همه پرداخت‌ها برای همیشه حذف می‌شوند!');">
        <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
        <div class="fgroup" style="max-width:320px;">
            <label for="confirm_text">برای تأیید، عبارت <b style="color:var(--bad);">RESET</b> را تایپ کنید</label>
            <input type="text" id="confirm_text" name="confirm_text" autocomplete="off" placeholder="RESET">
        </div>
        <button type="submit" class="btn danger">🗑 ریست کامل پرداخت‌ها</button>
    </form>
</div>

<?php require __DIR__ . '/footer.php'; ?>
