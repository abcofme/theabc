from collections import Counter, defaultdict

from sqlalchemy import BigInteger, String, and_, case, cast, func, literal, null, select, union_all
from sqlalchemy.orm import aliased

from backend.database.models import (
    AppOpening, ContentLog, DictationLog, PartnerAccount, PartnerEarning, Payment,
    PortraitLog, ProgressLog, ReferralAttribution, TokenMovement, TrackingLink, User,
)

PAGE_SIZE = 30


def referral_network(partner_id=None):
    edge = ReferralAttribution
    columns = [edge.id, edge.user_id, edge.inviter_id, edge.partner_id, edge.source_id, edge.kind, edge.created_at]
    roots = select(*columns, literal(1).label("level"))
    if partner_id is None:
        parent = aliased(edge)
        roots = roots.outerjoin(parent, parent.user_id == edge.inviter_id).where(parent.id.is_(None))
    else:
        roots = roots.where(edge.inviter_id == partner_id)
    network = roots.cte("referral_network", recursive=True)
    return network.union_all(select(*columns, network.c.level + 1).join(network, edge.inviter_id == network.c.user_id))


def _within(timestamp, bounds):
    start, end = bounds
    conditions = [timestamp.is_not(None)]
    if start is not None:
        conditions.append(timestamp >= start)
    if end is not None:
        conditions.append(timestamp <= end)
    return conditions


def _activity_query(network, bounds, partner_id):
    def count_events(model, when, metric, amount=None, owner=None):
        user = model.user_id if owner is None else owner
        return (select(user.label("user_id"), cast(metric, String).label("metric"),
                       func.count().label("count"), func.coalesce(func.sum(amount), 0).label("amount")
                       if amount is not None else cast(literal(0), BigInteger).label("amount"))
                .select_from(model).join(network, network.c.user_id == user)
                .where(when >= network.c.created_at, *_within(when, bounds))
                .group_by(user, metric))

    def kind(name):
        return literal(name, type_=String)

    payment_kind = case(
        (Payment.is_topup.is_(True), "topup"),
        (Payment.is_premium_subscription.is_(True), "premium"),
        else_="career",
    )
    payment_metric = literal("payment:") + payment_kind
    content_kind = case(
        (ContentLog.kind == "compatibility", func.coalesce(literal("compatibility_") + ContentLog.detail, ContentLog.kind)),
        else_=ContentLog.kind,
    )
    content_metric = literal("use:") + content_kind
    purchase_metric = literal("purchase:") + TokenMovement.feature
    token_metric = literal("token:") + TokenMovement.kind
    earnings = (select(Payment.user_id.label("user_id"), kind("commission").label("metric"),
                       func.count().label("count"), func.sum(PartnerEarning.amount_kopecks).label("amount"))
                .select_from(PartnerEarning).join(Payment, Payment.id == PartnerEarning.payment_id)
                .join(network, network.c.user_id == Payment.user_id)
                .where(*_within(PartnerEarning.created_at, bounds)).group_by(Payment.user_id))
    if partner_id is not None:
        earnings = earnings.where(PartnerEarning.partner_id == partner_id)

    return union_all(
        count_events(Payment, Payment.paid_at, payment_metric, Payment.amount).where(Payment.success.is_(True)),
        count_events(Payment, Payment.paid_at, kind("payment_unknown")).where(Payment.success.is_(True), Payment.amount.is_(None)),
        count_events(ContentLog, ContentLog.created_at, content_metric),
        count_events(ProgressLog, ProgressLog.created_at, kind("use:test")),
        count_events(PortraitLog, PortraitLog.created_at, kind("use:portrait")),
        count_events(DictationLog, DictationLog.created_at, kind("use:dictation")).where(DictationLog.status == "ok"),
        count_events(AppOpening, AppOpening.opened_at, kind("use:app_open")),
        count_events(TokenMovement, TokenMovement.created_at, token_metric, TokenMovement.amount).where(TokenMovement.kind != "spend"),
        count_events(TokenMovement, TokenMovement.completed_at, purchase_metric, TokenMovement.amount).where(TokenMovement.kind == "spend"),
        count_events(TokenMovement, TokenMovement.refunded_at, kind("token:refunded"), TokenMovement.amount),
        count_events(TokenMovement, TokenMovement.created_at, kind("token:pending"), TokenMovement.amount).where(
            TokenMovement.kind == "spend", TokenMovement.completed_at.is_(None), TokenMovement.refunded_at.is_(None)
        ),
        earnings,
    )


def _present(counts):
    return {
        "members": counts["members"],
        "invited": counts["invited"],
        "direct": counts["direct"],
        "active": counts["active"],
        "topups": counts["payment:topup"],
        "topup_rubles": counts["amount:payment:topup"],
        "paid_rubles": sum(counts[f"amount:payment:{kind}"] for kind in ("topup", "premium", "career")),
        "unknown_payments": counts["payment_unknown"],
        "commission": counts["amount:commission"],
        "tokens": {key: counts[f"amount:token:{key}"] for key in ("topup", "bonus", "demo", "spent", "refunded", "pending")},
        "purchases": {key.split(":", 1)[1]: value for key, value in sorted(counts.items()) if key.startswith("purchase:")},
        "usage": {key.split(":", 1)[1]: value for key, value in sorted(counts.items()) if key.startswith("use:")},
    }


async def _activity(session, network, bounds, partner_id):
    counts = defaultdict(Counter)
    for user_id, metric, amount_count, amount in (await session.execute(_activity_query(network, bounds, partner_id))):
        user = counts[user_id]
        user[metric] += amount_count
        user[f"amount:{metric}"] += amount
        if metric.startswith("purchase:"):
            user["amount:token:spent"] += amount
        elif metric in ("payment:premium", "payment:career"):
            user[metric.replace("payment:", "purchase:", 1)] += amount_count
    for user in counts.values():
        user["active"] = int(user["use:app_open"] > 0)
    return counts


def _member(row, partner_id):
    label = f"Участник №{row.id}"
    if partner_id is None and row.username:
        label = f"@{row.username}"
    if row.inviter_id is None:
        inviter = None
    elif row.inviter_id == partner_id:
        inviter = {"label": "Вы"}
    elif row.parent_ref:
        inviter = {"id": row.parent_ref, "label": f"Участник №{row.parent_ref}"}
        if partner_id is None and row.inviter_username:
            inviter["label"] = f"@{row.inviter_username}"
    else:
        inviter = {"label": f"ID {row.inviter_id}" if partner_id is None else "Пригласивший партнёр"}
    return {
        "id": row.id, "label": label, "inviter": inviter, "level": row.level, "source_id": row.source_id,
        "kind": row.kind, "joined_at": row.created_at, "independent": bool(row.enabled),
        "separate_branch": partner_id is not None and row.partner_id != partner_id,
    }


def _member_query(network, bounds):
    parent = aliased(ReferralAttribution)
    inviter = aliased(User)
    return (select(network, User.username, parent.id.label("parent_ref"),
                   inviter.username.label("inviter_username"), PartnerAccount.enabled,
                   and_(*_within(network.c.created_at, bounds)).label("in_period"))
            .join(User, User.id == network.c.user_id)
            .outerjoin(parent, parent.user_id == network.c.inviter_id)
            .outerjoin(inviter, inviter.id == network.c.inviter_id)
            .outerjoin(PartnerAccount, PartnerAccount.user_id == network.c.user_id))


async def referral_report(session, bounds, partner_id, source_id, page, branch_id=None):
    network = referral_network(partner_id)
    branch = None
    if branch_id is not None:
        anchor = (await session.execute(_member_query(network, bounds).where(network.c.id == branch_id))).one_or_none()
        if anchor is None:
            return None
        branch = _member(anchor, partner_id)
        network = referral_network(anchor.user_id)
    members = (await session.execute(_member_query(network, bounds)
                                     .order_by(network.c.level, network.c.created_at.desc(), network.c.id))).all()
    metrics = await _activity(session, network, bounds, partner_id)
    children = Counter(row.inviter_id for row in members if row.in_period and row.inviter_id is not None)
    sources = {row.id: row for row in (await session.execute(select(TrackingLink).where(
        TrackingLink.id.in_({row.source_id for row in members if row.source_id is not None})
    ))).scalars()}

    grouped = defaultdict(Counter)
    totals = Counter()
    rows = []
    for row in members:
        counts = metrics[row.user_id]
        counts["members"] = 1
        counts["invited"] = int(row.in_period)
        counts["direct"] = int(row.in_period and row.level == 1)
        key = row.source_id or 0
        grouped[key].update(counts)
        if source_id is None or source_id == key:
            totals.update(counts)
            rows.append(row)

    offset = (page - 1) * PAGE_SIZE
    return {
        "summary": _present(totals),
        "branch": branch,
        "sources": [{
            "id": key,
            "name": sources[key].name if key in sources else "Без рекламного источника",
            "stats": _present(counts),
        } for key, counts in sorted(grouped.items(), key=lambda item: (-item[1]["invited"], item[0]))],
        "members": [{**_member(row, partner_id), "invited_count": children[row.user_id],
                     "stats": _present(metrics[row.user_id])} for row in rows[offset:offset + PAGE_SIZE]],
        "page": page,
        "pages": max(1, (len(rows) + PAGE_SIZE - 1) // PAGE_SIZE),
    }


async def referral_member(session, member_id, bounds, partner_id, page):
    tree = referral_network(partner_id)
    member = (await session.execute(_member_query(tree, bounds).where(tree.c.id == member_id))).one_or_none()
    if member is None:
        return None
    network = select(tree).where(tree.c.id == member_id).subquery()
    counts = (await _activity(session, network, bounds, partner_id))[member.user_id]
    counts["members"] = 1
    counts["invited"] = int(member.in_period)
    child_count = await session.scalar(select(func.count()).select_from(tree).where(
        tree.c.inviter_id == member.user_id, *_within(tree.c.created_at, bounds)
    ))

    def member_event(model, when, kind, feature, rubles, tokens, *extra):
        return (select(model.id, when.label("at"), cast(kind, String).label("kind"), feature.label("feature"),
                       rubles.label("rubles"), tokens.label("tokens"))
                .where(model.user_id == member.user_id, when >= member.created_at, *_within(when, bounds), *extra))

    money_kind = case(
        (Payment.is_topup.is_(True), "topup"),
        (Payment.is_premium_subscription.is_(True) & Payment.is_recurring.is_(True), "renewal"),
        (Payment.is_premium_subscription.is_(True), "premium"),
        else_="career",
    )
    operations = union_all(
        member_event(Payment, Payment.paid_at, money_kind, null(), Payment.amount, null(), Payment.success.is_(True)),
        member_event(TokenMovement, TokenMovement.completed_at, literal("purchase"), TokenMovement.feature, null(), TokenMovement.amount),
        member_event(TokenMovement, TokenMovement.refunded_at, literal("refund"), TokenMovement.feature, null(), TokenMovement.amount),
        member_event(TokenMovement, TokenMovement.created_at, TokenMovement.kind, null(), null(), TokenMovement.amount,
                     TokenMovement.kind.in_(("bonus", "demo"))),
    ).subquery()
    offset = (page - 1) * PAGE_SIZE
    history = (await session.execute(select(operations).order_by(operations.c.at.desc(), operations.c.kind, operations.c.id.desc())
                                     .offset(offset).limit(PAGE_SIZE + 1))).mappings().all()
    return {
        **_member(member, partner_id), "invited_count": child_count, "stats": _present(counts),
        "operations": [dict(operation) for operation in history[:PAGE_SIZE]], "more": len(history) > PAGE_SIZE,
    }
