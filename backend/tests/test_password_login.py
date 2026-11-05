import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

# Тесты не подключаются к PostgreSQL, Redis или Telegram.
for key, value in {
    "BOT_TOKEN": "test-only-token", "WEB_APP_URL": "http://localhost", "ACCOUNT_ID": "test",
    "SECRET_KEY": "test", "BOT_LINK": "https://t.me/example", "REQUESTS_CHAT_ID": "1",
    "SUPPORT_CHAT_ID": "1", "POSTGRES_DB": "test", "POSTGRES_HOST": "localhost",
    "POSTGRES_PORT": "5432", "POSTGRES_USER": "test", "POSTGRES_PASSWORD": "test", "REDIS_PORT": "6379",
    "REDIS_DB": "0", "REDIS_HOST": "localhost", "REDIS_PASSWORD": "test",
}.items():
    os.environ.setdefault(key, value)

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from backend.api.routers import auth
from backend.api.security import validate_twa_data
from backend import web_auth
from backend.password_auth import BROWSER_USER_ID, BROWSER_USER_NAME, hash_password, verify_password


class MemoryRedis:
    def __init__(self):
        self.values = {}

    def pipeline(self, transaction=True):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    def incr(self, key):
        self.pending_key = key
        return self

    def expire(self, *args, **kwargs):
        return self

    async def execute(self):
        count = self.values.get(self.pending_key, 0) + 1
        self.values[self.pending_key] = count
        return count, True

    async def set(self, key, value, **kwargs):
        self.values[key] = value

    async def getex(self, key, **kwargs):
        return self.values.get(key)

    async def delete(self, key):
        self.values.pop(key, None)


class MemorySession:
    def __init__(self):
        self.user = None
        self.calls = 0

    async def execute(self, statement):
        self.calls += 1
        params = statement.compile().params
        assert params['id'] == BROWSER_USER_ID
        assert params['admin'] is False
        if self.user is None:
            self.user = SimpleNamespace(**{**params, 'banned': False, 'balance': 1000})

    async def commit(self):
        pass

    async def get(self, model, user_id):
        assert user_id == BROWSER_USER_ID
        return self.user


class PasswordLoginTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.encoded = hash_password('Example-test-password!')

    def setUp(self):
        self.redis = MemoryRedis()
        self.db = MemorySession()
        for target, name, value in [
            (auth, 'async_redis', self.redis), (web_auth, 'async_redis', self.redis),
            (auth.settings, 'BROWSER_LOGIN_NAME', 'test-account'),
            (auth.settings, 'BROWSER_PASSWORD_HASH', self.encoded),
        ]:
            patcher = patch.object(target, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.app = FastAPI()
        self.app.include_router(auth.router)

        async def session():
            yield self.db
        self.app.dependency_overrides[auth.get_session] = session

        @self.app.get('/me')
        async def me(user=Depends(validate_twa_data)):
            return user

        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)

    def login(self, username='test-account', password='Example-test-password!'):
        return self.client.post('/api/auth/password', json={'username': username, 'password': password})

    def test_password_hash_is_salted_and_rejects_wrong_or_malformed_values(self):
        self.assertTrue(verify_password('Example-test-password!', self.encoded))
        self.assertFalse(verify_password('wrong', self.encoded))
        self.assertFalse(verify_password('a' * 1025, self.encoded))
        self.assertFalse(verify_password('anything', 'invalid'))
        self.assertNotEqual(hash_password('Example-test-password!'), self.encoded)

    def test_login_creates_separate_profile_and_reuses_data(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['user']['id'], BROWSER_USER_ID)
        self.assertLess(data['user']['id'], 0)
        self.assertEqual(data['user']['first_name'], BROWSER_USER_NAME)
        self.assertEqual(data['user']['avatar_kind'], 'logo')
        self.assertEqual(data['user']['auth_provider'], 'password')
        self.assertIsNone(data['user']['username'])
        self.assertFalse(self.db.user.admin)
        self.assertFalse(self.db.user.diary_reminders)
        self.db.user.balance = 321
        self.assertEqual(self.login().json()['user']['id'], BROWSER_USER_ID)
        self.assertEqual(self.db.user.balance, 321)
        headers = {'Authorization': 'Session ' + data['token']}
        self.assertEqual(self.client.get('/me', headers=headers).json()['id'], BROWSER_USER_ID)
        self.assertEqual(self.client.post('/api/auth/logout', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/me', headers=headers).status_code, 401)

    def test_wrong_credentials_do_not_access_database_or_reveal_username(self):
        first = self.login(password='wrong')
        second = self.login(username='someone-else')
        self.assertEqual((first.status_code, second.status_code), (401, 401))
        self.assertEqual(first.json(), second.json())
        self.assertEqual(self.db.calls, 0)

    def test_disabled_and_banned_accounts_cannot_login(self):
        with patch.object(auth.settings, 'BROWSER_PASSWORD_HASH', ''):
            self.assertEqual(self.login().status_code, 401)
        self.assertEqual(self.login().status_code, 200)
        self.db.user.banned = True
        self.assertEqual(self.login().status_code, 403)

    def test_rate_limit_stops_password_guessing(self):
        for _ in range(10):
            self.assertEqual(self.login(password='wrong').status_code, 401)
        response = self.login()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers['Retry-After'], '300')
        self.assertEqual(self.db.calls, 0)
