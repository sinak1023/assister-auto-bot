<?php
require_once __DIR__ . '/auth.php';
require_admin();

$db     = db();
$filter = payment_filters();

// آمار کلی (مستقل از فیلتر)
$stats = ['all' => 0, 'success' => 0, 'failed' => 0, 'pending' => 0, 'income' => 0];
foreach ($db->query('SELECT status, COUNT(*) AS c, SUM(amount) AS s FROM payments GROUP BY status') as $row) {
    $stats[$row['status']] = (int)$row['c'];
    $stats['all']         += (int)$row['c'];
    if ($row['status'] === 'success') {
        $stats['income'] = (int)$row['s'];
    }
}

// شمارش نتایج فیلترشده و صفحه‌بندی
$perPage = 50;
$page    = max(1, (int)($_GET['page'] ?? 1));

$st = $db->prepare("SELECT COUNT(*) FROM payments {$filter['sql']}");
$st->execute($filter['args']);
$total      = (int)$st->fetchColumn();
$totalPages = max(1, (int)ceil($total / $perPage));
$page       = min($page, $totalPages);
$offset     = ($page - 1) * $perPage;

$st = $db->prepare("SELECT * FROM payments {$filter['sql']} ORDER BY id DESC LIMIT $perPage OFFSET $offset");
$st->execute($filter['args']);
$rows = $st->fetchAll();

$pageTitle = 'لیست پرداخت‌ها';
require __DIR__ . '/header.php';

function page_link(int $p): string
{
    $params         = $_GET;
    $params['page'] = $p;
    return 'payments.php?' . http_build_query($params);
}
?>
<h1 class="page-title">لیست پرداخت‌ها</h1>

<div class="stats">
    <div class="stat"><div class="num"><?= number_format($stats['all']) ?></div><div class="lbl">کل تراکنش‌ها</div></div>
    <div class="stat s-ok"><div class="num"><?= number_format($stats['success']) ?></div><div class="lbl">موفق</div></div>
    <div class="stat s-wait"><div class="num"><?= number_format($stats['pending']) ?></div><div class="lbl">در انتظار پرداخت</div></div>
    <div class="stat s-bad"><div class="num"><?= number_format($stats['failed']) ?></div><div class="lbl">ناموفق</div></div>
    <div class="stat s-ok"><div class="num"><?= number_format($stats['income']) ?></div><div class="lbl">مجموع درآمد (تومان)</div></div>
</div>

<div class="panel">
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
            <button type="submit" class="btn">اعمال فیلتر</button>
            <a href="payments.php" class="btn ghost">پاک کردن</a>
        </div>
    </form>
</div>

<div class="panel">
    <h2><?= number_format($total) ?> نتیجه</h2>
    <?php if (!$rows): ?>
        <div class="empty">تراکنشی یافت نشد.</div>
    <?php else: ?>
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>نام و نام خانوادگی</th>
                    <th>شماره تماس</th>
                    <th>مبلغ (تومان)</th>
                    <th>وضعیت</th>
                    <th>شناسه پرداخت</th>
                    <th>تاریخ ثبت</th>
                    <th>تاریخ پرداخت</th>
                    <th>توضیح</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($rows as $r): ?>
                <tr>
                    <td><?= (int)$r['id'] ?></td>
                    <td><?= e($r['name']) ?></td>
                    <td class="ltr"><?= e($r['phone']) ?></td>
                    <td><?= number_format((int)$r['amount']) ?></td>
                    <td><?= status_badge($r['status']) ?></td>
                    <td class="ltr"><?= $r['ref_id'] !== '' ? e($r['ref_id']) : '—' ?></td>
                    <td><?= e(jdate((int)$r['created_at'])) ?></td>
                    <td><?= e(jdate($r['paid_at'] !== null ? (int)$r['paid_at'] : null)) ?></td>
                    <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis;" title="<?= e($r['fail_reason']) ?>">
                        <?= $r['fail_reason'] !== '' ? e($r['fail_reason']) : '—' ?>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>

    <?php if ($totalPages > 1): ?>
    <div class="pagination">
        <?php for ($p = 1; $p <= $totalPages; $p++): ?>
            <?php if ($p === $page): ?>
                <span class="current"><?= $p ?></span>
            <?php elseif ($p <= 2 || $p > $totalPages - 2 || abs($p - $page) <= 2): ?>
                <a href="<?= e(page_link($p)) ?>"><?= $p ?></a>
            <?php elseif (abs($p - $page) === 3): ?>
                <span>…</span>
            <?php endif; ?>
        <?php endfor; ?>
    </div>
    <?php endif; ?>
    <?php endif; ?>
</div>

<?php require __DIR__ . '/footer.php'; ?>
