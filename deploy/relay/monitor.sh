#!/usr/bin/env bash
# Мониторинг продакшена с ретранслятора (theabc-monitor.timer, раз в минуту).
# После 2 неудачных проверок подряд шлёт алерт в Telegram, после восстановления — сообщение «снова работает».
# Настройки в /etc/theabc-monitor.env: BOT_TOKEN, ALERT_CHAT_IDS (через пробел), HEALTH_URL
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

if code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$HEALTH_URL") && [ "$code" = "200" ]; then
    if [ "$alerted" = "1" ]; then
        notify "✅ abcofme.ru снова работает"
    fi
    echo 0 > "$state_dir/fails"; echo 0 > "$state_dir/alerted"
else
    fails=$((fails + 1)); echo "$fails" > "$state_dir/fails"
    if [ "$fails" -ge 2 ] && [ "$alerted" = "0" ]; then
        notify "🔴 abcofme.ru недоступен: $HEALTH_URL ответил «${code:-нет ответа}» $fails раз подряд"
        echo 1 > "$state_dir/alerted"
    fi
fi
