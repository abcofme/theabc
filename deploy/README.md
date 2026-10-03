# Инфраструктура

```
Пользователь ──► abcofme.ru (сервер в Москве, DNS Timeweb)
                   web (Caddy): TLS, HTTP/2+3, сжатие, статика, /api → api
                   api (FastAPI) · bot (aiogram + планировщик) · db (Postgres 17) · redis
                   bot ──► ретранслятор в NL ──► api.telegram.org
```

- **Москва** — всё, что видит пользователь, и все данные. Снаружи открыты только 22, 80, 443.
- **Ретранслятор (NL)** — nginx-прокси к Bot API: из российских ДЦ `api.telegram.org` недоступен.
  Пускает только IP московского сервера, сертификат самоподписанный, бот проверяет именно его.
  Там же мониторинг: раз в минуту проверяет `/api/health` и шлёт алерт в Telegram.
  Адрес ретранслятора и его сертификат хранятся только на серверах (`.env`, `/etc/theabc/relay-ca.pem`), не в репозитории.

## Деплой

Автоматический: `theabc-autodeploy.timer` раз в минуту делает `git fetch` и при новом коммите в `main`
запускает `docker compose up -d --build`. Упавший коммит повторно не собирается — нужен следующий.

```bash
journalctl -u theabc-autodeploy -n 50     # лог деплоя
docker compose ps                          # состояние контейнеров
docker compose logs -f bot api             # логи
```

## Бэкапы

`theabc-backup.timer` каждый день в 03:30 кладёт дамп в `/var/backups/theabc/` (хранится 14 дней).
Плюс бэкапы диска в панели Timeweb.

Восстановление:

```bash
gunzip -c /var/backups/theabc/db-ДАТА.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

## Если заблокировали ретранслятор

Он ничего не хранит. Новый VPS за рубежом (1 vCPU / 1 ГБ):

1. `apt install nginx`, сгенерировать сертификат с `subjectAltName=IP:<новый IP>`
   (команда — в истории настройки, `openssl req -x509 -newkey ec ...`), положить в `/etc/nginx/relay/`.
2. Скопировать `relay/nginx-tg-relay.conf` в `/etc/nginx/sites-enabled/`, ufw: 443 только с IP Москвы.
3. На московском сервере обновить `/etc/theabc/relay-ca.pem` и `TELEGRAM_API_URL` в `.env`,
   затем `docker compose up -d bot`.
