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
        $pdo->exec('PRAGMA journal_mode=WAL');
        init_db($pdo);
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
        'admin_password_hash' => password_hash('admin1234', PASSWORD_DEFAULT),
    ];

    $st = $pdo->prepare('INSERT OR IGNORE INTO settings (k, v) VALUES (?, ?)');
    foreach ($defaults as $k => $v) {
        $st->execute([$k, $v]);
    }
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
