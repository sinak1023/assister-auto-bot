<?php
declare(strict_types=1);

function e(?string $s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

function fa_to_en_digits(string $s): string
{
    $fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹','٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    $en = ['0','1','2','3','4','5','6','7','8','9','0','1','2','3','4','5','6','7','8','9'];
    return str_replace($fa, $en, $s);
}

function format_toman($amount): string
{
    return number_format((float)$amount) . ' تومان';
}

function base_url(): string
{
    $https  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') == '443')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $scheme = $https ? 'https' : 'http';
    $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $dir    = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    return $scheme . '://' . $host . $dir;
}

function redirect(string $url): void
{
    header('Location: ' . $url);
    exit;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    return $_SESSION['csrf'];
}

function csrf_check(): void
{
    $sent = (string)($_POST['csrf'] ?? '');
    $real = (string)($_SESSION['csrf'] ?? '');
    if ($real === '' || !hash_equals($real, $sent)) {
        http_response_code(400);
        exit('درخواست نامعتبر است.');
    }
}

/* ---------- تاریخ شمسی ---------- */

function gregorian_to_jalali(int $gy, int $gm, int $gd): array
{
    $g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    $gy2   = ($gm > 2) ? ($gy + 1) : $gy;
    $days  = 355666 + (365 * $gy) + intdiv($gy2 + 3, 4) - intdiv($gy2 + 99, 100)
        + intdiv($gy2 + 399, 400) + $gd + $g_d_m[$gm - 1];
    $jy    = -1595 + (33 * intdiv($days, 12053));
    $days %= 12053;
    $jy   += 4 * intdiv($days, 1461);
    $days %= 1461;
    if ($days > 365) {
        $jy  += intdiv($days - 1, 365);
        $days = ($days - 1) % 365;
    }
    if ($days < 186) {
        $jm = 1 + intdiv($days, 31);
        $jd = 1 + ($days % 31);
    } else {
        $jm = 7 + intdiv($days - 186, 30);
        $jd = 1 + (($days - 186) % 30);
    }
    return [$jy, $jm, $jd];
}

function jalali_to_gregorian(int $jy, int $jm, int $jd): array
{
    $jy   += 1595;
    $days  = -355668 + (365 * $jy) + (intdiv($jy, 33) * 8) + intdiv(($jy % 33) + 3, 4)
        + $jd + (($jm < 7) ? ($jm - 1) * 31 : (($jm - 7) * 30) + 186);
    $gy    = 400 * intdiv($days, 146097);
    $days %= 146097;
    if ($days > 36524) {
        $gy   += 100 * intdiv(--$days, 36524);
        $days %= 36524;
        if ($days >= 365) {
            $days++;
        }
    }
    $gy   += 4 * intdiv($days, 1461);
    $days %= 1461;
    if ($days > 365) {
        $gy  += intdiv($days - 1, 365);
        $days = ($days - 1) % 365;
    }
    $gd    = $days + 1;
    $leap  = (($gy % 4 === 0 && $gy % 100 !== 0) || ($gy % 400 === 0));
    $sal_a = [31, $leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    $gm    = 1;
    foreach ($sal_a as $i => $len) {
        if ($gd <= $len) {
            $gm = $i + 1;
            break;
        }
        $gd -= $len;
    }
    return [$gy, $gm, $gd];
}

function jdate(?int $ts, bool $withTime = true): string
{
    if (!$ts) {
        return '—';
    }
    [$jy, $jm, $jd] = gregorian_to_jalali((int)date('Y', $ts), (int)date('n', $ts), (int)date('j', $ts));
    $out = sprintf('%04d/%02d/%02d', $jy, $jm, $jd);
    if ($withTime) {
        $out .= ' - ' . date('H:i', $ts);
    }
    return $out;
}

/**
 * ورودی شمسی مثل «1405/04/23» را به تایم‌استمپ ابتدای همان روز تبدیل می‌کند.
 */
function parse_jalali_date(string $input): ?int
{
    $input = trim(fa_to_en_digits($input));
    if ($input === '') {
        return null;
    }
    if (!preg_match('~^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$~', $input, $m)) {
        return null;
    }
    [$gy, $gm, $gd] = jalali_to_gregorian((int)$m[1], (int)$m[2], (int)$m[3]);
    $ts = mktime(0, 0, 0, $gm, $gd, $gy);
    return $ts === false ? null : $ts;
}
