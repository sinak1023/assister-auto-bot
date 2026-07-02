#!/usr/bin/env python3
# -----------------------------------------------------------------------------
# scripts/generate_dns_config.py  —  تولید کانفیگ DNS و SNI Proxy
# -----------------------------------------------------------------------------
# این اسکریپت از روی فهرست دامنه‌ها (config/domains.list) دو فایل کانفیگ می‌سازد:
#
#   1) dnsmasq  : برای هر دامنه‌ی هدف یک خط «address=/domain/SERVER_IP» تا آن
#      دامنه و تمام زیردامنه‌هایش به IP سرور اشاره کنند؛ بقیه‌ی دامنه‌ها به
#      upstream فوروارد می‌شوند.
#
#   2) sniproxy : جدول مسیریابی (table) که فقط دامنه‌های هدف را پروکسی می‌کند.
#
# نحوه‌ی استفاده:
#   generate_dns_config.py <SERVER_IP> <UPSTREAM_DNS> <domains.list>
#                          <dnsmasq_out> <sniproxy_template> <sniproxy_out>
# -----------------------------------------------------------------------------

import sys


def read_domains(path):
    """خواندن دامنه‌های معتبر از فایل لیست (نادیده‌گرفتن کامنت‌ها و خطوط خالی)."""
    domains = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            domains.append(line.lower())
    return domains


def build_dnsmasq(domains, server_ip, upstream_dns):
    """ساخت محتوای کانفیگ dnsmasq."""
    lines = [
        "# -----------------------------------------------------------------",
        "# این فایل به‌صورت خودکار توسط generate_dns_config.py ساخته شده است.",
        "# تغییرات دستی با نصب/به‌روزرسانی بعدی بازنویسی می‌شوند.",
        "# -----------------------------------------------------------------",
        "",
        "# فقط از upstream مشخص‌شده استفاده کن، نه از /etc/resolv.conf",
        "no-resolv",
        "# روی همه‌ی اینترفیس‌ها و پورت 53 گوش بده",
        "listen-address=0.0.0.0",
        "bind-interfaces",
        "port=53",
        "# کش برای کاهش تأخیر",
        "cache-size=1000",
        "",
        f"# DNS بالادستی برای دامنه‌هایی که هدف نیستند (رفتار شفاف)",
        f"server={upstream_dns}",
        "",
        "# --- دامنه‌های هدف: به IP خودِ سرور اشاره می‌کنند ---",
    ]
    for d in domains:
        # قالب address=/domain/ip خودِ دامنه و همه‌ی زیردامنه‌ها را پوشش می‌دهد
        lines.append(f"address=/{d}/{server_ip}")
    lines.append("")
    return "\n".join(lines)


def build_sniproxy(domains, template_path, upstream_dns):
    """ساخت محتوای کانفیگ sniproxy از روی قالب."""
    with open(template_path, "r", encoding="utf-8") as f:
        template = f.read()

    # هر دامنه به دو ورودی regex نیاز دارد: خود دامنه و زیردامنه‌ها.
    # قالب sniproxy: '<regex>  *'  یعنی به همان hostِ SNI رزولو و فوروارد شود.
    table_lines = []
    for d in domains:
        escaped = d.replace(".", "\\.")
        table_lines.append(f"    {escaped}$          *")
        table_lines.append(f"    .*\\.{escaped}$        *")

    table_block = "\n".join(table_lines)
    out = template.replace("__PROXY_TABLE__", table_block)
    out = out.replace("__UPSTREAM_DNS__", upstream_dns)
    return out


def main():
    if len(sys.argv) != 7:
        print(__doc__)
        print("تعداد آرگومان‌ها نادرست است.")
        return 1

    (server_ip, upstream_dns, domains_path,
     dnsmasq_out, sniproxy_template, sniproxy_out) = sys.argv[1:7]

    domains = read_domains(domains_path)
    if not domains:
        print("هیچ دامنه‌ای در لیست یافت نشد!")
        return 1

    with open(dnsmasq_out, "w", encoding="utf-8") as f:
        f.write(build_dnsmasq(domains, server_ip, upstream_dns))
    print(f"کانفیگ dnsmasq نوشته شد: {dnsmasq_out} ({len(domains)} دامنه)")

    with open(sniproxy_out, "w", encoding="utf-8") as f:
        f.write(build_sniproxy(domains, sniproxy_template, upstream_dns))
    print(f"کانفیگ sniproxy نوشته شد: {sniproxy_out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
