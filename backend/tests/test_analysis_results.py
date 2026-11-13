import asyncio
import os
import unittest
from contextlib import asynccontextmanager
from datetime import date, datetime
from unittest.mock import AsyncMock, patch

# Тесты используют SQLite и заглушку ИИ, внешние сервисы не нужны.
for key, value in {
    "BOT_TOKEN": "test-only-token", "WEB_APP_URL": "http://localhost", "ACCOUNT_ID": "test",
    "SECRET_KEY": "test", "BOT_LINK": "https://t.me/example", "REQUESTS_CHAT_ID": "1",
    "SUPPORT_CHAT_ID": "1", "POSTGRES_DB": "test", "POSTGRES_HOST": "localhost",
    "POSTGRES_PORT": "5432", "POSTGRES_USER": "test", "POSTGRES_PASSWORD": "test", "REDIS_PORT": "6379",
    "REDIS_DB": "0", "REDIS_HOST": "localhost", "REDIS_PASSWORD": "test",
}.items():
    os.environ.setdefault(key, value)

from fastapi import HTTPException
import httpx
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from backend.analysis_results import format_test_results, load_analysis_test_results
from backend.api.routers import diary, reports
from backend.database.models import Category, ContentLog, DiaryEntry, PersonalityPortrait, Progress, Result, Test, User


class SQLiteSession:
    def __init__(self, session):
        self.session = session

    async def execute(self, statement):
        return self.session.execute(statement)

    def add(self, instance):
        if isinstance(instance, ContentLog):
            instance.id = 1
        self.session.add(instance)

    async def commit(self):
        self.session.commit()


class AnalysisResultsTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        self.addCleanup(engine.dispose)
        for model in (User, Category, Test, Progress, Result, DiaryEntry, PersonalityPortrait, ContentLog):
            model.__table__.create(engine)
        self.db = Session(engine, expire_on_commit=False)
        self.addCleanup(self.db.close)
        self.session = SQLiteSession(self.db)

        first_day = datetime(2026, 10, 1)
        second_day = datetime(2026, 10, 2)
        self.db.add_all([
            User(id=1), User(id=2), User(id=3), User(id=4),
            Category(id=1, name="Личность", price=0, description=""),
            Category(id=2, name="Профориентация", price=0, description=""),
            Category(id=3, name="Пустая категория", price=0, description=""),
            Test(id=10, category_id=1, name="Копинг"),
            Test(id=11, category_id=2, name="Тип мотивации"),
            Test(id=12, category_id=1, name="Шкала самооценки"),
            Test(id=13, category_id=1, name="Чужой тест"),
            Result(id=1, test_id=11, range_from=0, range_to=4, name="Низкая мотивация"),
            Result(id=2, test_id=11, range_from=5, range_to=None, name="Сильная мотивация"),
            Progress(id=1, test_id=10, user_id=1, created_at=second_day, hardcode_value="Устаревший результат"),
            Progress(id=2, test_id=10, user_id=1, created_at=second_day, hardcode_value="Новый результат\nВторая шкала"),
            Progress(id=9, test_id=10, user_id=1, created_at=first_day, hardcode_value="Результат более ранней даты"),
            Progress(id=3, test_id=11, user_id=1, value=5),
            Progress(id=4, test_id=12, user_id=1, value=0),
            Progress(id=5, test_id=13, user_id=2, hardcode_value="Результат другого пользователя"),
            Progress(id=6, test_id=10, user_id=2, value=0),
            Progress(id=7, test_id=11, user_id=2, hardcode_value="  "),
            Progress(id=8, test_id=11, user_id=4, value=5),
            PersonalityPortrait(id=1, user_id=3, content="Портрет без результатов"),
            DiaryEntry(id=1, user_id=1, date=date.today(), event="Событие дневника", reaction="Реакция дневника"),
            DiaryEntry(id=2, user_id=2, date=date.today(), event="Событие", reaction="Реакция"),
            DiaryEntry(id=3, user_id=3, date=date.today(), event="Событие", reaction="Реакция"),
            DiaryEntry(id=4, user_id=4, date=date.today(), event="Событие", reaction="Реакция"),
        ])
        self.db.commit()

    async def test_loads_latest_results_for_each_test_across_categories(self):
        results = await load_analysis_test_results(self.session, 1)
        by_name = {result.name: result for result in results}
        self.assertCountEqual([result.name for result in results], ["Копинг", "Тип мотивации", "Шкала самооценки"])
        self.assertEqual(by_name["Копинг"].text, "Новый результат\nВторая шкала")
        self.assertEqual(by_name["Тип мотивации"].category, "Профориентация")
        self.assertIn("Сильная мотивация", by_name["Тип мотивации"].text)
        self.assertIn("5", by_name["Тип мотивации"].text)
        self.assertIn("0", by_name["Шкала самооценки"].text)
        self.assertEqual(await load_analysis_test_results(self.session, 2), [])
        self.assertEqual(await load_analysis_test_results(self.session, 3), [])
        context = format_test_results(results)
        for result in results:
            self.assertIn(result.name, context)
            self.assertIn(result.text, context)

    async def test_one_result_per_nonempty_category_is_enough(self):
        self.assertEqual(await load_analysis_test_results(self.session, 4), [])
        progress = Progress(id=14, test_id=10, user_id=4, value=0)
        self.db.add(progress)
        self.db.commit()

        results = await load_analysis_test_results(self.session, 4)
        self.assertCountEqual([result.name for result in results], ["Копинг", "Тип мотивации"])

        self.db.delete(progress)
        self.db.commit()
        self.assertEqual(await load_analysis_test_results(self.session, 4), [])

    async def test_diary_sends_all_results_without_a_portrait(self):
        @asynccontextmanager
        async def database_session():
            yield self.session

        @asynccontextmanager
        async def ai_client(**kwargs):
            yield client

        response = httpx.Response(200, json={"choices": [{"message": {"content": "75\n===\nРазбор"}}]})
        client = AsyncMock()
        client.post.return_value = response
        with (
            patch("backend.database.async_session", database_session),
            patch("httpx.AsyncClient", ai_client),
            patch.object(diary, "ai_endpoint", return_value=("https://ai.example", "test")),
            patch.object(diary, "charge", new_callable=AsyncMock, return_value=None) as charge,
            patch.object(diary, "award", new_callable=AsyncMock),
        ):
            result = await diary.analyze_reaction(1, {"id": 1}, self.session)

        self.assertEqual(result["score"], 75)
        charge.assert_awaited_once_with(self.session, 1, "diary_answer")
        prompt = client.post.call_args.kwargs["json"]["messages"][1]["content"]
        for text in ("Новый результат", "Вторая шкала", "Сильная мотивация", "Шкала самооценки", "Реакция дневника"):
            self.assertIn(text, prompt)
        self.assertNotIn("Результат другого пользователя", prompt)

    async def test_diary_addition_reloads_results_and_keeps_earlier_reply_as_context(self):
        entry = self.db.get(DiaryEntry, 1)
        entry.portrait_match_score = 50
        entry.portrait_match_explanation = "Прежний ответ по портрету"
        self.db.get(Progress, 2).hardcode_value = "Результат после повторного теста"
        self.db.commit()

        tasks = []

        def run_in_background(coroutine):
            tasks.append(asyncio.create_task(coroutine))

        @asynccontextmanager
        async def database_session():
            yield self.session

        @asynccontextmanager
        async def ai_client(**kwargs):
            yield client

        client = AsyncMock()
        client.post.return_value = httpx.Response(200, json={"choices": [{"message": {"content": "80\n===\nНовый разбор"}}]})
        with (
            patch("backend.database.async_session", database_session),
            patch("httpx.AsyncClient", ai_client),
            patch.object(diary, "ai_endpoint", return_value=("https://ai.example", "test")),
            patch.object(diary, "charge", new_callable=AsyncMock, return_value=None),
            patch.object(diary, "award", new_callable=AsyncMock),
            patch.object(diary, "run_in_background", run_in_background),
        ):
            result = await diary.add_diary_addition(1, {"text": "Дополнительная деталь"}, {"id": 1}, self.session)
            self.assertTrue(result["analysis_started"])
            await tasks[0]

        messages = client.post.call_args.kwargs["json"]["messages"]
        self.assertIn("Результат после повторного теста", messages[1]["content"])
        self.assertIn("Прежний ответ по портрету", messages[2]["content"])
        self.assertIn("Дополнительная деталь", messages[3]["content"])
        self.assertEqual(entry.portrait_match_explanation, "Новый разбор")

    async def test_diary_requires_results_in_every_category_before_charging(self):
        with patch.object(diary, "charge", new_callable=AsyncMock) as charge:
            for user_id in (2, 3, 4):
                with self.subTest(user_id=user_id):
                    self.assertFalse(await diary._start_reaction_analysis(user_id, user_id, self.session))
                    with self.assertRaises(HTTPException) as error:
                        await diary.analyze_reaction(user_id, {"id": user_id}, self.session)
                    self.assertEqual(error.exception.status_code, 400)
                    self.assertIn("в каждой категории", error.exception.detail)

        charge.assert_not_awaited()

    async def test_all_report_types_send_all_results_without_a_portrait(self):
        with (
            patch.object(reports, "ai_endpoint", return_value=("https://ai.example", "test")),
            patch.object(reports, "charge", new_callable=AsyncMock, return_value=None),
            patch.object(reports, "_generate_report_bg", new_callable=AsyncMock) as generate,
        ):
            for report_type in ("repeating_events", "effective_reactions", "energy", "competence"):
                with self.subTest(report_type=report_type):
                    req = reports.ReportGenerateRequest(period="all", report_type=report_type)
                    response = await reports.generate_report(req, {"id": 1}, self.session)
                    await asyncio.sleep(0)
                    self.assertEqual(response.status_code, 200)
                    prompt = generate.call_args.args[3]
                    for text in ("Новый результат", "Вторая шкала", "Сильная мотивация", "Шкала самооценки", "Событие дневника"):
                        self.assertIn(text, prompt)
                    self.assertNotIn("Результат другого пользователя", prompt)

    async def test_report_generation_requests_more_tokens_and_refunds_incomplete_output(self):
        client = AsyncMock()
        db = AsyncMock(spec=AsyncSession)

        async def request_report(url, *, headers, json):
            # Модель исчерпывает стандартный лимит на рассуждениях.
            enough_tokens = json.get("max_tokens", 4096) >= 8192
            return httpx.Response(200, request=httpx.Request("POST", url), json={"choices": [{
                "finish_reason": "stop" if enough_tokens else "length",
                "message": {"content": "Полный отчёт" if enough_tokens else ""},
            }]})

        client.post.side_effect = request_report
        args = (1, "energy", "Энергия", "Записи дневника", None, date.today(), "https://ai.example", "test", 77, 10)
        with (
            patch("httpx.AsyncClient") as ai_client,
            patch("backend.database.async_session") as database_session,
            patch.object(reports, "complete_charge", new_callable=AsyncMock) as complete_charge,
            patch.object(reports, "refund", new_callable=AsyncMock) as refund,
        ):
            ai_client.return_value.__aenter__.return_value = client
            database_session.return_value.__aenter__.return_value = db
            report = await reports._generate_report(*args)

            self.assertEqual(report["report"].content, "Полный отчёт")
            complete_charge.assert_awaited_once_with(db, 10, feature="energy")
            db.commit.assert_awaited_once()

            client.post.side_effect = None
            for content in (None, "Начало отчёта"):
                with self.subTest(content=content):
                    refund.reset_mock()
                    client.post.return_value = httpx.Response(
                        200, request=httpx.Request("POST", "https://ai.example"),
                        json={"choices": [{"finish_reason": "length", "message": {"content": content}}]},
                    )
                    result = await reports._generate_report_bg(*args)

                    self.assertIn("detail", result)
                    refund.assert_awaited_once_with(1, 10)
            database_session.assert_called_once()

    async def test_all_report_types_require_results_in_every_category_before_charging(self):
        with patch.object(reports, "charge", new_callable=AsyncMock) as charge:
            for report_type in ("repeating_events", "effective_reactions", "energy", "competence"):
                req = reports.ReportGenerateRequest(period="all", report_type=report_type)
                for user_id in (2, 3, 4):
                    with self.subTest(report_type=report_type, user_id=user_id):
                        with self.assertRaises(HTTPException) as error:
                            await reports.generate_report(req, {"id": user_id}, self.session)
                        self.assertEqual(error.exception.status_code, 400)
                        self.assertIn("в каждой категории", error.exception.detail)
        charge.assert_not_awaited()
