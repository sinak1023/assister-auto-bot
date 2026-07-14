<?php
declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        if (!is_dir(DATA_DIR)) {
            mkdir(DATA_DIR, 0775, true);
        }
        $pdo = new PDO('sqlite:' . DATA_DIR . '/database.sqlite');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        // WAL: خواندن‌های همزمان بدون قفل شدن؛ busy_timeout: به‌جای خطای
        // «database is locked» زیر بار همزمان، تا ۵ ثانیه منتظر آزاد شدن قفل می‌ماند.
        $pdo->exec('PRAGMA journal_mode=WAL');
        $pdo->exec('PRAGMA synchronous=NORMAL');
        $pdo->exec('PRAGMA busy_timeout=5000');

        // ساخت جدول‌ها فقط یک بار انجام می‌شود، نه در هر درخواست
        $version = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
        if ($version < 1) {
            init_db($pdo);
            $pdo->exec('PRAGMA user_version = 1');
        }
    }
    return $pdo;
}

function init_db(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS settings (
        k TEXT PRIMARY KEY,
        v TEXT NOT NULL DEFAULT ""
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        amount INTEGER NOT NULL,
        authority TEXT NOT NULL DEFAULT "",
        ref_id TEXT NOT NULL DEFAULT "",
        card_pan TEXT NOT NULL DEFAULT "",
        status TEXT NOT NULL DEFAULT "pending",
        fail_reason TEXT NOT NULL DEFAULT "",
        view_token TEXT NOT NULL DEFAULT "",
        created_at INTEGER NOT NULL,
        paid_at INTEGER
    )');

    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_payments_authority ON payments(authority)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_payments_token ON payments(view_token)');

    $defaults = [
        'brand_name'          => 'Eco Baktash',
        'course_name'         => 'دوره جامع اکو بکتاش',
        'price_toman'         => '500000',
        'details_button_text' => 'توضیحات دوره',
        'description_title'   => 'توضیحات دوره',
        'description_text'    => "در این دوره صفر تا صد مباحث را یاد می‌گیرید.\n\nسرفصل‌ها:\n• مبحث اول\n• مبحث دوم\n• مبحث سوم\n\nپشتیبانی کامل در طول دوره همراه شماست.",
        'pay_button_text'     => 'پرداخت و ثبت‌نام',
        'form_title'          => 'برای ثبت‌نام اطلاعات خود را وارد کنید',
        'merchant_id'         => '',
        'sandbox'             => '1',
        'success_title'       => 'پرداخت شما با موفقیت انجام شد ✅',
        'screenshot_note'     => 'لطفاً حتماً از این صفحه اسکرین‌شات بگیرید 📸',
        'final_link'          => 'https://t.me/',
        'final_link_text'     => 'ورود به کانال دوره',
        'fail_title'          => 'پرداخت ناموفق بود ❌',
        'fail_text'           => 'در صورت کسر وجه از حساب شما، مبلغ تا ۷۲ ساعت آینده به حسابتان باز می‌گردد.',
        // رمز مدیریت در install.php ساخته می‌شود؛ تا قبل از نصب ورود ممکن نیست
        'admin_password_hash' => '',
    ];

    $pdo->beginTransaction();
    $st = $pdo->prepare('INSERT OR IGNORE INTO settings (k, v) VALUES (?, ?)');
    foreach ($defaults as $k => $v) {
        $st->execute([$k, $v]);
    }
    $pdo->commit();
}

function settings(bool $fresh = false): array
{
    static $cache = null;
    if ($cache === null || $fresh) {
        $cache = [];
        foreach (db()->query('SELECT k, v FROM settings') as $row) {
            $cache[$row['k']] = $row['v'];
        }
    }
    return $cache;
}

function setting(string $key, string $default = ''): string
{
    return settings()[$key] ?? $default;
}

function set_setting(string $key, string $value): void
{
    $st = db()->prepare('INSERT INTO settings (k, v) VALUES (?, ?)
        ON CONFLICT(k) DO UPDATE SET v = excluded.v');
    $st->execute([$key, $value]);
    settings(true);
}
