<?php
require_once __DIR__ . '/auth.php';
require_admin();

$fields = [
    'محتوای صفحه اصلی' => [
        'brand_name'          => ['label' => 'نام برند (بالای صفحه)', 'type' => 'text'],
        'course_name'         => ['label' => 'نام دوره', 'type' => 'text'],
        'price_toman'         => ['label' => 'قیمت دوره (تومان)', 'type' => 'number'],
        'form_title'          => ['label' => 'عنوان فرم ثبت‌نام', 'type' => 'text'],
        'details_button_text' => ['label' => 'متن دکمه توضیحات', 'type' => 'text'],
        'description_title'   => ['label' => 'عنوان پاپ‌آپ توضیحات', 'type' => 'text'],
        'description_text'    => ['label' => 'متن پاپ‌آپ توضیحات', 'type' => 'textarea'],
        'pay_button_text'     => ['label' => 'متن دکمه پرداخت', 'type' => 'text'],
    ],
    'درگاه زرین‌پال' => [
        'merchant_id' => ['label' => 'مرچنت کد زرین‌پال', 'type' => 'text',
            'hint' => 'کد ۳۶ رقمی که از پنل زرین‌پال دریافت کرده‌اید.'],
        'sandbox'     => ['label' => 'حالت تست (سندباکس)', 'type' => 'checkbox',
            'hint' => 'برای پرداخت واقعی این گزینه را غیرفعال کنید.'],
    ],
    'صفحه پرداخت موفق' => [
        'success_title'   => ['label' => 'عنوان پرداخت موفق', 'type' => 'text'],
        'screenshot_note' => ['label' => 'متن یادآوری اسکرین‌شات', 'type' => 'text'],
        'final_link'      => ['label' => 'لینک دکمه پایانی (مثلاً کانال تلگرام)', 'type' => 'text'],
        'final_link_text' => ['label' => 'متن دکمه پایانی', 'type' => 'text'],
    ],
    'صفحه پرداخت ناموفق' => [
        'fail_title' => ['label' => 'عنوان پرداخت ناموفق', 'type' => 'text'],
        'fail_text'  => ['label' => 'متن پرداخت ناموفق', 'type' => 'textarea'],
    ],
];

$msg = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    csrf_check();

    foreach ($fields as $group) {
        foreach ($group as $key => $def) {
            if ($def['type'] === 'checkbox') {
                set_setting($key, isset($_POST[$key]) ? '1' : '0');
            } elseif (isset($_POST[$key])) {
                $value = trim((string)$_POST[$key]);
                if ($def['type'] === 'number') {
                    $value = (string)(int)fa_to_en_digits($value);
                }
                set_setting($key, $value);
            }
        }
    }

    $newPass = (string)($_POST['new_password'] ?? '');
    if ($newPass !== '') {
        if (mb_strlen($newPass) < 6) {
            $msg = 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد؛ بقیه تنظیمات ذخیره شد.';
        } else {
            set_setting('admin_password_hash', password_hash($newPass, PASSWORD_DEFAULT));
        }
    }

    if ($msg === '') {
        redirect('settings.php?saved=1');
    }
}

if (isset($_GET['saved'])) {
    $msg = 'تنظیمات با موفقیت ذخیره شد. ✅';
}

$pageTitle = 'تنظیمات';
require __DIR__ . '/header.php';
?>
<h1 class="page-title">تنظیمات</h1>

<?php if ($msg !== ''): ?>
    <div class="msg <?= isset($_GET['saved']) ? 'ok' : 'bad' ?>"><?= e($msg) ?></div>
<?php endif; ?>

<form method="post">
    <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">

    <?php foreach ($fields as $groupTitle => $group): ?>
    <div class="panel">
        <h2><?= e($groupTitle) ?></h2>
        <?php foreach ($group as $key => $def): ?>
            <div class="fgroup">
                <?php if ($def['type'] === 'checkbox'): ?>
                    <label style="display:flex; align-items:center; gap:10px; cursor:pointer; color:var(--text); font-size:0.95rem;">
                        <input type="checkbox" name="<?= e($key) ?>" value="1" style="width:auto;"
                            <?= setting($key) === '1' ? 'checked' : '' ?>>
                        <?= e($def['label']) ?>
                    </label>
                <?php elseif ($def['type'] === 'textarea'): ?>
                    <label for="f_<?= e($key) ?>"><?= e($def['label']) ?></label>
                    <textarea id="f_<?= e($key) ?>" name="<?= e($key) ?>"><?= e(setting($key)) ?></textarea>
                <?php else: ?>
                    <label for="f_<?= e($key) ?>"><?= e($def['label']) ?></label>
                    <input type="text" id="f_<?= e($key) ?>" name="<?= e($key) ?>"
                           value="<?= e(setting($key)) ?>"
                           <?= $def['type'] === 'number' ? 'inputmode="numeric"' : '' ?>>
                <?php endif; ?>
                <?php if (!empty($def['hint'])): ?>
                    <div class="hint"><?= e($def['hint']) ?></div>
                <?php endif; ?>
            </div>
        <?php endforeach; ?>
    </div>
    <?php endforeach; ?>

    <div class="panel">
        <h2>تغییر رمز عبور مدیریت</h2>
        <div class="fgroup">
            <label for="new_password">رمز عبور جدید (برای عدم تغییر خالی بگذارید)</label>
            <input type="password" id="new_password" name="new_password" autocomplete="new-password">
            <div class="hint">حداقل ۶ کاراکتر.</div>
        </div>
    </div>

    <button type="submit" class="btn">💾 ذخیره تنظیمات</button>
</form>

<?php require __DIR__ . '/footer.php'; ?>
