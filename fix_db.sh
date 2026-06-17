#!/bin/bash
docker compose exec -T db psql -U postgres -d psy_bot_db -c "ALTER TABLE users ADD COLUMN tracking_link_id BIGINT;"
docker compose exec -T db psql -U postgres -d psy_bot_db -c "ALTER TABLE users ADD CONSTRAINT fk_users_tracking_link_id FOREIGN KEY (tracking_link_id) REFERENCES tracking_links (id) ON DELETE SET NULL;"
docker compose exec -T db psql -U postgres -d psy_bot_db -c "UPDATE alembic_version SET version_num = 'k6l7m8n9p0q1';"
docker compose restart backend
