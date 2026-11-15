#!/usr/bin/env bash
# Автодеплой: раз в минуту (theabc-autodeploy.timer) проверяет main и, если есть новый коммит,
# пересобирает и перезапускает контейнеры. Репозиторий публичный, ключи не нужны.
set -euo pipefail
cd /opt/theabc

git fetch -q origin main
target=$(git rev-parse origin/main)

# Уже задеплоено или этот коммит уже падал при сборке — ждём следующий
deployed=$(cat .deployed-commit 2>/dev/null || true)
[ "$target" = "$deployed" ] && exit 0
[ "$target" = "$(cat .failed-commit 2>/dev/null || true)" ] && exit 0

echo "Deploying $target"
git reset -q --hard "$target"
reload_web_config() {
    if [ -n "$deployed" ] && git diff --quiet "$deployed" "$target" -- deploy/Caddyfile; then
        return 0
    fi
    docker compose exec -T web caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
}

if docker compose up --build --remove-orphans --wait --wait-timeout 600 && reload_web_config; then
    echo "$target" > .deployed-commit
    rm -f .failed-commit
    docker image prune -f >/dev/null
    echo "Deployed $target"
else
    echo "$target" > .failed-commit
    echo "Deploy of $target failed" >&2
    exit 1
fi
