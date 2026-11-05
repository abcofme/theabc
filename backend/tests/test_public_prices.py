import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.api.routers.public import router
from backend.pricing import AI_PRICES, MIN_TOPUP, PREMIUM_PRICE, TOKENS_PER_RUBLE


class PublicPricesTest(unittest.TestCase):
    def test_prices_available_without_auth_or_database(self):
        app = FastAPI()
        app.include_router(router)
        with TestClient(app) as client:
            response = client.get("/api/public/prices")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["premium"], PREMIUM_PRICE)
        self.assertEqual(data["premium_period_days"], 30)
        self.assertEqual(data["min_topup"], MIN_TOPUP)
        for feature, tokens in AI_PRICES.items():
            self.assertEqual(data[feature], tokens)
            self.assertEqual(data[feature] / data["tokens_per_ruble"], tokens / TOKENS_PER_RUBLE)
        self.assertEqual(data["tokens_per_ruble"], TOKENS_PER_RUBLE)
        self.assertGreater(data["max_topup"], data["min_topup"])


if __name__ == "__main__":
    unittest.main()
