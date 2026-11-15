import hashlib
import hmac
import json
import os
import time
import unittest
from types import SimpleNamespace
from urllib.parse import urlencode
from unittest.mock import AsyncMock, patch

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
from backend.api.common import get_session, require_admin
from backend.api.routers import auth, profile
from backend.api.security import validate_twa_data
from backend import redis_db, web_auth
from backend.password_auth import BROWSER_USER_ID, BROWSER_USER_NAME, hash_password, verify_password


class MemoryRedis:
    def __init__(self):
        self.values = {}
        self.ttls = {}

    def pipeline(self, transaction=True):
        self.commands = []
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    def incr(self, key):
        def increment():
            self.values[key] = self.values.get(key, 0) + 1
            return self.values[key]
        self.commands.append(increment)
        return self

    def expire(self, *args, **kwargs):
        self.commands.append(lambda: True)
        return self

    async def execute(self):
        return [operation() for operation in self.commands]

    async def set(self, key, value, *, ex):
        self.values[key] = value
        self.ttls[key] = ex

    async def get(self, key):
        return self.values.get(key)

    def ttl(self, key):
        self.commands.append(lambda: self.ttls.get(key, -2))

    def getdel(self, key):
        def remove():
            self.ttls.pop(key, None)
            return self.values.pop(key, None)
        if key.startswith("webhandoff:"):
            async def getdel_handoff():
                return remove()
            return getdel_handoff()
        self.commands.append(remove)

    async def delete(self, key):
        self.values.pop(key, None)
        self.ttls.pop(key, None)


class MemorySession:
    def __init__(self):
        self.users = {}
        self.calls = 0
        self.friendship = None

    @property
    def user(self):
        return self.users.get(BROWSER_USER_ID)

    async def execute(self, statement):
        self.calls += 1
        params = statement.compile().params
        user_id = params['id']
        assert params['admin'] is not True
        self.users.setdefault(user_id, SimpleNamespace(**{**params, 'banned': False, 'balance': 0}))

    async def commit(self):
        pass

    async def get(self, model, user_id, **kwargs):
        return self.users.get(user_id)

    async def scalar(self, statement):
        return self.friendship


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
        self.app.include_router(profile.router)

        async def session():
            yield self.db
        self.app.dependency_overrides[auth.get_session] = session

        @self.app.get('/me')
        async def me(user=Depends(validate_twa_data)):
            return user

        @self.app.get('/admin')
        async def admin(user=Depends(validate_twa_data), session=Depends(get_session)):
            await require_admin(user, session)
            return {'ok': True}

        self.client = TestClient(self.app, base_url='https://testserver', headers={
            'Origin': 'https://testserver', 'X-ABC-CSRF': '1', 'X-ABC-Account': str(BROWSER_USER_ID),
        })
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
        self.assertNotIn('token', data)
        for attribute in ('HttpOnly', 'Secure', 'SameSite=strict', 'Path=/'):
            self.assertIn(attribute, response.headers['Set-Cookie'])
        self.assertEqual(self.client.get('/me').json()['id'], BROWSER_USER_ID)
        self.assertEqual(self.client.post('/api/auth/logout').status_code, 200)
        self.assertEqual(self.client.get('/me').status_code, 401)

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
        self.assertEqual(self.client.get('/me').status_code, 401)
        self.db.user.banned = False
        self.assertEqual(self.client.get('/me').status_code, 401)

    def test_rate_limit_stops_password_guessing(self):
        for _ in range(10):
            self.assertEqual(self.login(password='wrong').status_code, 401)
        response = self.login()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers['Retry-After'], '300')
        self.assertEqual(self.db.calls, 0)

    def test_cookie_mutation_requires_same_origin_and_current_account(self):
        self.assertEqual(self.login().status_code, 200)
        self.assertEqual(self.client.post('/api/auth/logout', headers={'Origin': 'https://evil.invalid'}).status_code, 403)
        self.assertEqual(self.client.post('/api/auth/logout', headers={'X-ABC-CSRF': ''}).status_code, 403)
        self.assertEqual(self.client.get('/me', headers={'X-ABC-Account': '10'}).status_code, 401)
        self.assertEqual(self.client.post('/api/auth/logout', headers={'X-ABC-Account': '10'}).status_code, 409)
        self.assertEqual(self.client.get('/me').status_code, 200)

    def test_migration_rotates_legacy_token_and_preserves_remaining_expiry(self):
        self.assertEqual(self.login().status_code, 200)
        self.client.post('/api/auth/logout')
        legacy = 'a' * 43
        key = web_auth._session_key(legacy, legacy=True)
        self.redis.values[key] = json.dumps({'id': BROWSER_USER_ID})
        self.redis.ttls[key] = 1234
        headers = {'Authorization': f'Session {legacy}'}
        self.assertEqual(self.client.get('/me', headers=headers).status_code, 401)
        migrated = self.client.post('/api/auth/session/migrate', headers=headers)
        self.assertEqual(migrated.status_code, 200)
        self.assertIn('Max-Age=1234', migrated.headers['Set-Cookie'])
        self.assertNotIn(key, self.redis.values)
        token = self.client.cookies[web_auth.SESSION_COOKIE]
        self.assertNotEqual(token, legacy)
        self.assertEqual(self.client.get('/me').status_code, 200)
        self.assertEqual(self.redis.ttls[web_auth._session_key(token)], 1234)
        self.client.post('/api/auth/logout')
        self.assertEqual(self.client.post('/api/auth/session/migrate', headers=headers).status_code, 401)

    def test_handoff_requires_confirmation_and_remains_single_use(self):
        self.assertEqual(self.login().status_code, 200)
        self.db.users[10] = SimpleNamespace(id=10, banned=False, tg_first_name='Another account', username='other', photo_url=None)
        code = 'h' * 24
        self.redis.values[f'webhandoff:{code}'] = 10
        preview = self.client.post('/api/auth/handoff/preview', json={'code': code})
        self.assertEqual(preview.json(), {'id': 10, 'first_name': 'Another account', 'username': 'other'})
        self.assertNotIn('Set-Cookie', preview.headers)
        self.assertEqual(self.client.get('/me').json()['id'], BROWSER_USER_ID)
        self.assertEqual(self.client.post('/api/auth/handoff/claim', json={'code': code, 'user_id': 11}).status_code, 410)
        claimed = self.client.post('/api/auth/handoff/claim', json={'code': code, 'user_id': 10})
        self.assertEqual(claimed.json()['user']['id'], 10)
        self.assertEqual(self.client.get('/me').status_code, 401)
        self.assertEqual(self.client.get('/me', headers={'X-ABC-Account': '10'}).status_code, 200)
        self.assertEqual(self.client.post('/api/auth/handoff/claim', json={'code': code, 'user_id': 10}).status_code, 410)

    def test_first_telegram_entry_checks_account_role_and_future_timestamp(self):
        def signed_telegram_headers(auth_date):
            values = {'auth_date': str(auth_date), 'user': json.dumps({'id': 10, 'first_name': 'New', 'username': 'ingenfrid'})}
            key = hmac.new(b'WebAppData', auth.settings.BOT_TOKEN.encode(), hashlib.sha256).digest()
            message = '\n'.join(f'{name}={value}' for name, value in sorted(values.items()))
            values['hash'] = hmac.new(key, message.encode(), hashlib.sha256).hexdigest()
            return {'Authorization': 'Bearer ' + urlencode(values)}

        now = int(time.time())
        self.assertEqual(self.client.get('/me', headers=signed_telegram_headers(now + 3600)).status_code, 401)
        self.assertNotIn(10, self.db.users)
        headers = signed_telegram_headers(now)
        self.assertEqual(self.client.get('/me', headers=headers).json()['id'], 10)
        self.assertEqual(self.client.get('/admin', headers=headers).status_code, 403)
        self.db.users[10].admin = True
        self.assertEqual(self.client.get('/admin', headers=headers).status_code, 200)
        self.db.users[10].banned = True
        self.assertEqual(self.client.get('/admin', headers=headers).status_code, 401)

    def test_avatar_requires_current_account_and_relationship_even_after_caching(self):
        target = SimpleNamespace(id=10, banned=False, photo_url='https://example.invalid/avatar')
        self.db.users[target.id] = target
        with patch.object(redis_db, 'async_redis', self.redis), patch.object(profile, '_fetch_avatar', AsyncMock(return_value=b'avatar')) as fetch:
            self.assertEqual(self.client.get('/api/avatar/10').status_code, 401)
            self.assertEqual(self.login().status_code, 200)
            self.assertEqual(self.client.get('/api/avatar/10').status_code, 404)
            fetch.assert_not_awaited()
            self.db.friendship = 1
            image = self.client.get('/api/avatar/10')
            self.assertEqual(image.status_code, 200)
            self.assertEqual(image.headers['Cache-Control'], 'private, no-store')
            self.assertEqual(image.content, b'avatar')
            fetch.assert_awaited_once_with(10)
            self.db.friendship = None
            self.assertEqual(self.client.get('/api/avatar/10').status_code, 404)
            fetch.assert_awaited_once_with(10)
