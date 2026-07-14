<?php
declare(strict_types=1);

function zp_is_sandbox(): bool
{
    return setting('sandbox', '1') === '1';
}

function zp_base(): string
{
    return zp_is_sandbox() ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com';
}

function zp_start_url(string $authority): string
{
    return zp_base() . '/pg/StartPay/' . rawurlencode($authority);
}

function zp_api(string $path, array $payload): array
{
    $ch = curl_init(zp_base() . '/pg/v4/payment/' . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_TIMEOUT        => 30,
    ]);
    $res = curl_exec($ch);
    if ($res === false) {
        $err = curl_error($ch);
        curl_close($ch);
        return ['errors' => ['message' => 'خطا در ارتباط با درگاه پرداخت: ' . $err]];
    }
    curl_close($ch);
    $json = json_decode($res, true);
    return is_array($json) ? $json : ['errors' => ['message' => 'پاسخ نامعتبر از درگاه پرداخت']];
}

function zp_error_message(array $response): string
{
    $errors = $response['errors'] ?? [];
    $msg    = is_array($errors) ? ($errors['message'] ?? '') : '';
    $code   = is_array($errors) ? ($errors['code'] ?? '') : '';
    if ($msg === '') {
        $msg = 'خطای نامشخص از درگاه پرداخت';
    }
    return $code !== '' ? $msg . ' (کد ' . $code . ')' : $msg;
}

/**
 * ایجاد تراکنش. مبلغ به تومان است (currency = IRT).
 */
function zp_request(int $amountToman, string $description, string $callbackUrl, string $mobile): array
{
    $response = zp_api('request.json', [
        'merchant_id'  => setting('merchant_id'),
        'amount'       => $amountToman,
        'currency'     => 'IRT',
        'description'  => $description,
        'callback_url' => $callbackUrl,
        'metadata'     => ['mobile' => $mobile],
    ]);

    $data = $response['data'] ?? [];
    if (is_array($data) && (int)($data['code'] ?? 0) === 100 && !empty($data['authority'])) {
        return ['ok' => true, 'authority' => (string)$data['authority']];
    }
    return ['ok' => false, 'error' => zp_error_message($response)];
}

/**
 * تأیید تراکنش. کد ۱۰۰ یعنی موفق، کد ۱۰۱ یعنی قبلاً تأیید شده.
 */
function zp_verify(int $amountToman, string $authority): array
{
    $response = zp_api('verify.json', [
        'merchant_id' => setting('merchant_id'),
        'amount'      => $amountToman,
        'currency'    => 'IRT',
        'authority'   => $authority,
    ]);

    $data = $response['data'] ?? [];
    $code = is_array($data) ? (int)($data['code'] ?? 0) : 0;
    if ($code === 100 || $code === 101) {
        return [
            'ok'       => true,
            'ref_id'   => (string)($data['ref_id'] ?? ''),
            'card_pan' => (string)($data['card_pan'] ?? ''),
        ];
    }
    return ['ok' => false, 'error' => zp_error_message($response)];
}
