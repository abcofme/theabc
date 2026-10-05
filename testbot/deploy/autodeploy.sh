#!/usr/bin/env bash
# Автодеплой бота с тестами на NL-сервере (theabc-testbot-autodeploy.timer, раз в минуту).
# Репозиторий клонирован в /opt/theabc со sparse-checkout только папки testbot.
set -euo pipefail
cd /opt/theabc

git fetch -q origin main
target=$(git rev-parse origin/main)

[ "$target" = "$(cat .deployed-commit 2>/dev/null || true)" ] && exit 0
[ "$target" = "$(cat .failed-commit 2>/dev/null || true)" ] && exit 0

echo "Deploying $target"
git reset -q --hard "$target"
cd testbot
if docker compose up -d --build --remove-orphans; then
    echo "$target" > ../.deployed-commit
    rm -f ../.failed-commit
    docker image prune -f >/dev/null
    echo "Deployed $target"
else
    echo "$target" > ../.failed-commit
    echo "Deploy of $target failed" >&2
    exit 1
fi
