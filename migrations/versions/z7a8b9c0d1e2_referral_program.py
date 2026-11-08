"""Partner access, referral attribution, manual payouts and usage ledgers."""

from alembic import op

revision = "z7a8b9c0d1e2"
down_revision = "y6z7a8b9c0d1"
branch_labels = None
depends_on = None

TIMESTAMPS = """
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP NOT NULL DEFAULT timezone('utc', now())
"""


def upgrade():
    op.execute("ALTER TABLE tracking_links ADD COLUMN IF NOT EXISTS partner_id BIGINT CONSTRAINT fk_tracking_links_partner REFERENCES users(id) ON DELETE CASCADE")
    op.execute("ALTER TABLE tracking_links ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP")
    op.execute("ALTER TABLE content_logs ADD COLUMN IF NOT EXISTS detail VARCHAR(32)")
    op.execute("UPDATE payments SET paid_at = updated_at WHERE success AND paid_at IS NULL")
    op.execute("""
        CREATE TABLE IF NOT EXISTS partner_accounts (
            user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            enabled BOOLEAN NOT NULL,
            changed_at TIMESTAMP NOT NULL
        )
    """)
    op.execute(f"""
        CREATE TABLE IF NOT EXISTS referral_attributions (
            {TIMESTAMPS},
            user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            inviter_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
            partner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
            source_id BIGINT REFERENCES tracking_links(id) ON DELETE SET NULL,
            kind VARCHAR(16) NOT NULL
        )
    """)
    op.execute(f"""
        CREATE TABLE IF NOT EXISTS partner_earnings (
            {TIMESTAMPS},
            partner_id BIGINT NOT NULL REFERENCES users(id),
            payment_id BIGINT UNIQUE REFERENCES payments(id),
            amount_kopecks BIGINT NOT NULL CONSTRAINT ck_partner_earnings_amount CHECK (amount_kopecks > 0),
            available_at TIMESTAMP NOT NULL
        )
    """)
    op.execute(f"""
        CREATE TABLE IF NOT EXISTS partner_withdrawals (
            {TIMESTAMPS},
            partner_id BIGINT NOT NULL REFERENCES users(id),
            amount_kopecks BIGINT NOT NULL CONSTRAINT ck_partner_withdrawals_amount CHECK (amount_kopecks > 0),
            status VARCHAR(12) NOT NULL CONSTRAINT ck_partner_withdrawals_status CHECK (status IN ('pending', 'paid', 'rejected')),
            request_key VARCHAR(36) NOT NULL,
            resolved_at TIMESTAMP,
            resolved_by BIGINT REFERENCES users(id),
            note VARCHAR(240),
            CONSTRAINT uq_partner_withdrawals_request UNIQUE (partner_id, request_key)
        )
    """)
    op.execute(f"""
        CREATE TABLE IF NOT EXISTS token_movements (
            {TIMESTAMPS},
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            kind VARCHAR(16) NOT NULL,
            feature VARCHAR(32),
            amount INTEGER NOT NULL,
            completed_at TIMESTAMP,
            refunded_at TIMESTAMP
        )
    """)
    for table, fields in (
        ("tracking_links", ("partner_id",)), ("referral_attributions", ("inviter_id", "partner_id", "source_id")),
        ("partner_earnings", ("partner_id",)), ("partner_withdrawals", ("partner_id",)),
    ):
        for field in fields:
            op.execute(f"CREATE INDEX IF NOT EXISTS ix_{table}_{field} ON {table} ({field})")
    op.execute("CREATE INDEX IF NOT EXISTS ix_token_movements_user_created ON token_movements (user_id, created_at)")
    op.execute("""
        INSERT INTO tracking_links (name, code, created_at, updated_at)
        SELECT DISTINCT invited_id, 'legacy_' || md5(invited_id), now(), now()
        FROM users WHERE invited_id IS NOT NULL AND invited_id !~ '^[-]?[0-9]+$' AND length(invited_id) > 0
        ON CONFLICT (code) DO NOTHING
    """)
    # Храним только явные старые приглашения. Принятая дружба сама по себе не означает привлечение.
    # Строгий порядок регистрации отсеивает старые самоприглашения и циклы.
    op.execute("""
        INSERT INTO referral_attributions (user_id, inviter_id, source_id, kind, created_at, updated_at)
        SELECT u.id, parent.id, COALESCE(u.tracking_link_id, legacy.id),
               CASE WHEN parent.id IS NULL THEN 'campaign' ELSE 'legacy' END, u.created_at, u.created_at
        FROM users u
        LEFT JOIN users parent ON parent.id::text = u.invited_id AND parent.created_at < u.created_at
        LEFT JOIN tracking_links legacy ON legacy.code = 'legacy_' || md5(u.invited_id)
        WHERE parent.id IS NOT NULL OR u.tracking_link_id IS NOT NULL OR legacy.id IS NOT NULL
        ON CONFLICT (user_id) DO NOTHING
    """)
    op.execute("""
        WITH RECURSIVE inherited AS (
            SELECT user_id, source_id FROM referral_attributions WHERE source_id IS NOT NULL
            UNION ALL
            SELECT child.user_id, inherited.source_id FROM referral_attributions child
            JOIN inherited ON child.inviter_id = inherited.user_id WHERE child.source_id IS NULL
        )
        UPDATE referral_attributions a SET source_id = inherited.source_id
        FROM inherited WHERE inherited.user_id = a.user_id AND a.source_id IS NULL
    """)
    op.execute("""
        INSERT INTO content_logs (user_id, kind, created_at, updated_at)
        SELECT user_id, 'friendship', updated_at, updated_at FROM friendships WHERE status = 'accepted'
    """)
    # Тариф 10 токенов за рубль действует в текущем эквиваленте и для прежних пополнений.
    op.execute("""
        INSERT INTO token_movements (user_id, kind, amount, created_at, updated_at)
        SELECT user_id, 'topup', amount * 10, paid_at, paid_at
        FROM payments WHERE success AND is_topup AND amount > 0 AND paid_at IS NOT NULL
        UNION ALL
        SELECT user_id, 'bonus', amount, created_at, created_at FROM bonuses WHERE amount > 0
    """)
    # В старых инсталляциях могут остаться реальные начисления. Их переносим, исторические оплаты заново не начисляем.
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
                      AND table_name = 'users' AND column_name = 'referral_balance_available') THEN
                INSERT INTO partner_earnings (partner_id, amount_kopecks, available_at, created_at, updated_at)
                SELECT id, referral_balance_available::bigint * 100, timezone('utc', now()),
                       timezone('utc', now()), timezone('utc', now())
                FROM users WHERE referral_balance_available > 0;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
                      AND table_name = 'users' AND column_name = 'referral_balance_pending') THEN
                INSERT INTO partner_earnings (partner_id, amount_kopecks, available_at, created_at, updated_at)
                SELECT id, referral_balance_pending::bigint * 100,
                       timezone('utc', (date_trunc('month', timezone('Europe/Moscow', now())) + interval '1 month')
                                       AT TIME ZONE 'Europe/Moscow'), timezone('utc', now()), timezone('utc', now())
                FROM users WHERE referral_balance_pending > 0;
            END IF;
        END $$
    """)


def downgrade():
    raise RuntimeError("Downgrading would discard partner earnings and withdrawal history")
