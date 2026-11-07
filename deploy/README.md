# Инфраструктура

```
Мини-апп ──► abcofme.ru (DNS → NL) ──► NL: пересылка TLS без расшифровки ──┐
         └─► direct.abcofme.ru (DNS → Москва), если прямой путь быстрый ───┴─► сервер в Москве
                   web (Caddy): TLS, HTTP/1.1+2, сжатие, статика, /api → api
                   api (FastAPI) · bot (aiogram + планировщик) · db (Postgres 17) · redis
                   stt — распознавание речи для диктовки в дневнике (stt/app.py), ходит к нему только api
                   bot ──► ретранслятор в NL ──► api.telegram.org
```

- **Москва** — всё, что видит пользователь, и все данные. Снаружи открыты только 22, 80, 443.
- **NL** — один nginx на 443 с разбором по SNI (`relay/nginx-stream.conf`, нужен `libnginx-mod-stream`):
  - `abcofme.ru`, `www.`, `app.` — пересылка TCP в Москву как есть. TLS не расшифровывается, сертификаты
    выпускает Caddy в Москве (80-й порт тоже пересылается). Зачем: из РФ режут ответы московского сервера
    на адреса многих VPN, и у пользователей Telegram через VPN мини-апп падал с ERR_TIMED_OUT.
    `app.` — запасное имя для проверки этого пути, не трогая основной домен.
  - без SNI — ретранслятор Bot API (`relay/nginx-tg-relay.conf`, слушает `127.0.0.1:8443`): из российских ДЦ
    `api.telegram.org` недоступен. Пускает только IP московского сервера (`geo` в stream),
    сертификат самоподписанный, бот проверяет именно его.
  - мониторинг: раз в минуту проверяет `/api/health` и шлёт алерт в Telegram.

  Адрес NL и сертификат ретранслятора в репозиторий не кладём (`.env`, `/etc/theabc/relay-ca.pem`).
- **Мини-апп** (`diary/src/utils/api.js`): страница всегда приходит через NL. При старте проба
  `direct.abcofme.ru/api/health` (2 с): если успела — запросы к API идут напрямую в Москву.
  Сетевая ошибка или GET дольше 8 с — до конца сессии через NL. Откат на чисто прямой путь —
  вернуть A-записи `abcofme.ru` и `www` на IP Москвы (TTL 5 минут).

## Деплой

Автоматический: `theabc-autodeploy.timer` раз в минуту делает `git fetch` и при новом коммите в `main`
запускает `docker compose up -d --build`. Упавший коммит повторно не собирается — нужен следующий.

```bash
journalctl -u theabc-autodeploy -n 50     # лог деплоя
docker compose ps                          # состояние контейнеров
docker compose logs -f bot api             # логи
```

## ЮKassa

- Описания услуг, цены и порядок получения размещены в существующем разделе «Подписка и баланс»: `https://abcofme.ru/?page=billing`. Контакты и реквизиты: `https://abcofme.ru/?tab=profile&page=contacts`. Оферта: `https://abcofme.ru/?tab=profile&page=offer`. Для просмотра нужен вход в приложение.
- Контакты исполнителя хранятся в `diary/src/features/legal/business.js`. Цены в разделе «Подписка и баланс» берутся из профиля (`backend/pricing.py`). При изменении тарифов обновляйте также фиксированные суммы в оферте `diary/src/features/legal/offer.js`.
- Ключи в `.env`: `ACCOUNT_ID` — shopId, `SECRET_KEY` — секретный ключ (кабинет → Интеграция → Ключи API). Тестовый магазин даёт ключ `test_…`, боевой — `live_…`.
- HTTP-уведомления (кабинет → Интеграция → HTTP-уведомления): URL `https://abcofme.ru/api/webhook/yookassa`, события `payment.succeeded` и `payment.canceled`. Перед зачислением сервер сверяет статус, сумму и валюту через API ЮKassa.
- ЮKassa принимает оплату на сайте. После оплаты пользователь возвращается в «Подписка и баланс». По умолчанию адрес берётся из `WEB_APP_URL`, при необходимости задайте `PAYMENT_RETURN_URL` с адресом этого раздела.
- По умолчанию Premium оплачивается разово на 30 дней. Задайте `YOOKASSA_AUTORENEW=true` после подключения автоплатежей менеджером ЮKassa.
- Проверяйте тестовый магазин на отдельном окружении с его `ACCOUNT_ID`, `SECRET_KEY` и URL HTTP-уведомлений. Боевой магазин может авторизовать запрос `GET /v3/me`, даже когда приём платежей ещё выключен (`status: disabled`).
- Исполнитель регистрирует доход в «Мой налог» и передаёт сформированный чек покупателю.

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
2. `apt install libnginx-mod-stream`. Скопировать `relay/nginx-tg-relay.conf` в `/etc/nginx/sites-enabled/`,
   `relay/nginx-stream.conf` — в `/etc/nginx/stream.conf` и добавить `include /etc/nginx/stream.conf;`
   в `nginx.conf` вне блока `http`. ufw: открыть 80 и 443.
3. На московском сервере обновить `/etc/theabc/relay-ca.pem` и `TELEGRAM_API_URL` в `.env`,
   затем `docker compose up -d bot`.
4. В DNS перевести `abcofme.ru`, `www` и `app` на новый IP.

## Вход по логину и паролю

- `BROWSER_LOGIN_NAME` и `BROWSER_PASSWORD_HASH` задаются в серверном `.env`. Пароль в репозиторий и клиентский код не помещается. Хеш создаёт `backend.password_auth.hash_password`. Значение хеша в `.env` заключайте в одинарные кавычки, чтобы Docker Compose не интерпретировал символы `$`. При пустых значениях вход отключён.
- Браузерный аккаунт использует отдельный отрицательный ID `-1`, имя «Тестовый пользователь» и логотип вместо аватара; Telegram-профили используют положительные ID. Вход не привязывает аккаунты. Данные сохраняются между входами, права администратора не выдаются.
- Проверка пароля выполняется на сервере, максимум 10 попыток за 5 минут на IP. Выход завершает текущую сессию.
