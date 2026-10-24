#!/usr/bin/env bash
# Мониторинг продакшена с ретранслятора (theabc-monitor.timer, раз в минуту).
# После 2 неудачных проверок подряд шлёт алерт в Telegram, после восстановления — сообщение «снова работает».
# Настройки в /etc/theabc-monitor.env: BOT_TOKEN, ALERT_CHAT_IDS (через пробел),
# HEALTH_URL — один или несколько через пробел: путь через NL (abcofme.ru) и прямой (direct.abcofme.ru)
set -uo pipefail
source /etc/theabc-monitor.env

state_dir=/var/lib/theabc-monitor
mkdir -p "$state_dir"
fails=$(cat "$state_dir/fails" 2>/dev/null || echo 0)
alerted=$(cat "$state_dir/alerted" 2>/dev/null || echo 0)

notify() {
    for chat in $ALERT_CHAT_IDS; do
        curl -s -m 10 -o /dev/null "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
            --data-urlencode "chat_id=$chat" --data-urlencode "text=$1"
    done
}

failed=""
for url in $HEALTH_URL; do
    code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$url")
    [ "$code" = "200" ] || failed="$failed $url ответил «${code:-нет ответа}»;"
done

if [ -z "$failed" ]; then
    if [ "$alerted" = "1" ]; then
        notify "✅ abcofme.ru снова работает"
    fi
    echo 0 > "$state_dir/fails"; echo 0 > "$state_dir/alerted"
else
    fails=$((fails + 1)); echo "$fails" > "$state_dir/fails"
    if [ "$fails" -ge 2 ] && [ "$alerted" = "0" ]; then
        notify "🔴 abcofme.ru недоступен $fails раз подряд:$failed"
        echo 1 > "$state_dir/alerted"
    fi
fi
