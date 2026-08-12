#!/usr/bin/env bash
#
# Hermes in the browser — a *persistent* terminal session.
#
# Runs your interactive `hermes -p <profile>` inside a tmux session and serves
# that exact terminal as a web page (ttyd + xterm.js). The point is resilience:
# hermes runs in tmux on the server, so when your internet drops the session
# keeps running. You just reload the page to reattach — no more starting the
# session from scratch. Persian is rendered by the browser (UTF-8), which is
# cleaner than a broken SSH terminal.
#
# Usage:
#   ./hermes-web-term.sh                     # profile "conduit", port 8787
#   ./hermes-web-term.sh --profile conduit --port 9000
#   PORT=9000 PROFILE=conduit ./hermes-web-term.sh
#   ./hermes-web-term.sh --cred user:pass    # add basic-auth login
#
# Reattach after a drop: just refresh the browser tab.
# Manage the session by hand:  tmux attach -t hermes  |  tmux kill-session -t hermes
#
set -euo pipefail

# ---- settings (env vars are defaults; flags override) ----------------------
PORT="${PORT:-8787}"
PROFILE="${PROFILE:-conduit}"
SESSION="${SESSION:-hermes}"
IFACE="${IFACE:-0.0.0.0}"          # 0.0.0.0 = reachable from your phone on the LAN
CRED="${CRED:-}"                    # optional  user:pass  for a login prompt
FONTSIZE="${FONTSIZE:-16}"
FONTFAMILY="${FONTFAMILY:-Vazirmatn, Vazir, Menlo, Consolas, DejaVu Sans Mono, monospace}"
HERMES_CMD="${HERMES_CMD:-}"        # set to override the whole command

usage() {
  sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --port)      PORT="$2"; shift 2 ;;
    --profile)   PROFILE="$2"; shift 2 ;;
    --session)   SESSION="$2"; shift 2 ;;
    --iface)     IFACE="$2"; shift 2 ;;
    --cred)      CRED="$2"; shift 2 ;;
    --fontsize)  FONTSIZE="$2"; shift 2 ;;
    --font)      FONTFAMILY="$2"; shift 2 ;;
    --cmd)       HERMES_CMD="$2"; shift 2 ;;
    -h|--help)   usage; exit 0 ;;
    *) echo "گزینه‌ی ناشناخته: $1" >&2; echo "برای راهنما: $0 --help" >&2; exit 1 ;;
  esac
done

[ -z "$HERMES_CMD" ] && HERMES_CMD="hermes -p $PROFILE"

# ---- UTF-8 locale (Persian needs it; fall back to C.UTF-8) ------------------
case "${LC_ALL:-${LANG:-}}" in
  *UTF-8*|*utf8*) : ;;
  *) export LANG="C.UTF-8"; export LC_ALL="C.UTF-8" ;;
esac
export TERM="xterm-256color"

# ---- tiny helpers ----------------------------------------------------------
have() { command -v "$1" >/dev/null 2>&1; }

SUDO=""
if [ "$(id -u)" -ne 0 ]; then have sudo && SUDO="sudo"; fi

ensure_tmux() {
  have tmux && return 0
  echo "==> نصب tmux ..."
  if have apt-get; then $SUDO apt-get update -y && $SUDO apt-get install -y tmux
  elif have dnf; then $SUDO dnf install -y tmux
  elif have yum; then $SUDO yum install -y tmux
  else echo "tmux نصب نیست و نصب خودکار نشد. دستی نصبش کن." >&2; exit 1
  fi
}

ensure_ttyd() {
  have ttyd && return 0
  echo "==> نصب ttyd ..."
  if have apt-get && $SUDO apt-get install -y ttyd 2>/dev/null; then
    have ttyd && return 0
  fi
  # Fallback: download a static binary into ~/.local/bin (no sudo needed).
  local arch bindir url
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) arch="x86_64" ;;
    aarch64|arm64) arch="aarch64" ;;
    armv7l|armhf) arch="armhf" ;;
    *) echo "معماری ناشناخته برای ttyd: $arch — دستی نصبش کن." >&2; exit 1 ;;
  esac
  bindir="$HOME/.local/bin"; mkdir -p "$bindir"
  url="https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.${arch}"
  echo "    دانلود از: $url"
  if have curl; then curl -fL "$url" -o "$bindir/ttyd"
  elif have wget; then wget -O "$bindir/ttyd" "$url"
  else echo "نه curl هست نه wget؛ ttyd رو دستی نصب کن." >&2; exit 1
  fi
  chmod +x "$bindir/ttyd"
  case ":$PATH:" in *":$bindir:"*) : ;; *) export PATH="$bindir:$PATH" ;; esac
  have ttyd || { echo "نصب ttyd ناموفق بود." >&2; exit 1; }
}

ensure_hermes() {
  have hermes && return 0
  echo "هشدار: دستور 'hermes' توی PATH پیدا نشد." >&2
  echo "اگه هرمس رو با اسم دیگه‌ای صدا می‌زنی، از --cmd استفاده کن. مثلا:" >&2
  echo "  $0 --cmd '~/.local/bin/hermes -p $PROFILE'" >&2
}

# ---- go --------------------------------------------------------------------
ensure_tmux
ensure_ttyd
ensure_hermes

# Create the tmux session only if it isn't already running. `-u` forces UTF-8.
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "==> سشن tmux با نام '$SESSION' از قبل زنده‌ست؛ به همون وصل می‌شیم."
else
  echo "==> ساخت سشن tmux جدید '$SESSION' با دستور: $HERMES_CMD"
  tmux -u new-session -d -s "$SESSION" "$HERMES_CMD"
  # keep the pane alive if hermes exits, so you can read the last screen
  tmux set-option -t "$SESSION" remain-on-exit on 2>/dev/null || true
fi

shown_host="localhost"; [ "$IFACE" != "0.0.0.0" ] && [ "$IFACE" != "" ] && shown_host="$IFACE"
echo
echo "  ✅ آماده‌ست. توی مرورگر باز کن:  http://$shown_host:$PORT/"
echo "     (از گوشی: http://<آی‌پی-سرور>:$PORT/ )"
[ -n "$CRED" ] && echo "     ورود با یوزر/پس: $CRED"
echo "     قطع شد؟ فقط صفحه رو رفرش کن — سشن سمت سرور زنده می‌مونه."
echo "     خروج کامل:  tmux kill-session -t $SESSION"
echo

# Build ttyd args. -W = writable (allow typing). Each browser connection just
# reattaches to the same tmux session, so reconnecting resumes where you were.
args=( -p "$PORT" -i "$IFACE" -W
       -t "fontSize=$FONTSIZE"
       -t "fontFamily=$FONTFAMILY"
       -t 'theme={"background":"#0f1115","foreground":"#e7ecf3"}'
       -t 'disableLeaveAlert=true'
       -t 'titleFixed=Hermes' )
[ -n "$CRED" ] && args+=( -c "$CRED" )

exec ttyd "${args[@]}" tmux -u attach -t "$SESSION"
