# Цены. Приложение получает их через /api/profile, оплата, списания и автопродление берут отсюда.
# Платежи — в рублях, баланс — в токенах
# Premium за месяц, в рублях: и первая оплата, и каждое автопродление
PREMIUM_PRICE = 299
PREMIUM_PERIOD_DAYS = 30
AUTORENEW_TERMS_VERSION = "2026-11-07"

# Сколько токенов начисляется на баланс за рубль пополнения
TOKENS_PER_RUBLE = 10

# Без Premium функции с ИИ оплачиваются с баланса: столько токенов стоит одно использование
AI_PRICES = {
    "diary_answer": 47,
    "report": 183,
    "portrait": 287,
    "compatibility": 263,
}

# Пополнение, в рублях
MIN_TOPUP = 100
MAX_TOPUP = 50000
# Начисляется один раз при первом открытии приложения, в токенах
DEMO_BALANCE = 1000

# Токены за первое прохождение теста и за каждый его вопрос. 0 отключает соответствующую часть.
TEST_COMPLETION_BONUS = 0
TEST_QUESTION_BONUS = 1

# Бонусы за первые шаги в приложении: каждый начисляется один раз, в токенах (backend/bonuses.py)
BONUSES = {
    "portrait": 50,
    "diary_answer": 50,
    "report_repeating_events": 50,
    "report_effective_reactions": 50,
    "report_energy": 50,
    "report_competence": 50,
    "friend_invited": 150,
    "compatibility": 100,
    "install_app": 50,
}


def tokens(n: int) -> str:
    """tokens(3) → '3 токена'"""
    mod10, mod100 = n % 10, n % 100
    if mod10 == 1 and mod100 != 11:
        word = "токен"
    elif 2 <= mod10 <= 4 and not 12 <= mod100 <= 14:
        word = "токена"
    else:
        word = "токенов"
    return f"{n} {word}"
