import asyncio
import importlib.util
import sys
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from httpx import ASGITransport, AsyncClient


class SpeechLimitsTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        # Load HTTP routes with a stub model. The tests require neither native decoding nor a model download.
        source = Path(__file__).resolve().parents[2] / "stt" / "app.py"
        spec = importlib.util.spec_from_file_location("stt_limits_test_app", source)
        self.stt = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {
            "av": Mock(), "numpy": Mock(), "onnxruntime": Mock(),
            "onnx_asr": SimpleNamespace(load_model=Mock(), load_vad=Mock()),
        }):
            spec.loader.exec_module(self.stt)
        self.client = AsyncClient(transport=ASGITransport(app=self.stt.app), base_url="http://test")
        self.addAsyncCleanup(self.client.aclose)
        self.stt.MAX_ACTIVE_REQUESTS = 1
        self.stt.MAX_BYTES = 16

    async def test_oversized_audio_does_not_start_decoding(self):
        with patch.object(self.stt, "_recognize") as recognize:
            response = await self.client.post("/transcribe", content=b"a" * 17)
        self.assertEqual(response.status_code, 413)
        recognize.assert_not_called()
        self.assertEqual(self.stt._active, 0)

    async def test_cancelled_request_holds_decoder_slot_until_thread_finishes(self):
        started = threading.Event()
        release = threading.Event()

        def recognize(_):
            started.set()
            if not release.wait(5):
                raise AssertionError("Decoder was not released")
            return "sample", 1

        with patch.object(self.stt, "_recognize", recognize):
            first = asyncio.create_task(self.client.post("/transcribe", content=b"sample"))
            try:
                self.assertTrue(await asyncio.to_thread(started.wait, 5))
                first.cancel()
                await asyncio.sleep(0)
                response = await self.client.post("/transcribe", content=b"other sample")
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.headers["Retry-After"], "10")
                self.assertTrue(self.stt._lock.locked())
            finally:
                release.set()
            with self.assertRaises(asyncio.CancelledError):
                await first
            self.assertFalse(self.stt._lock.locked())
            self.assertEqual(self.stt._active, 0)
            self.assertEqual((await self.client.post("/transcribe", content=b"sample")).json()["text"], "sample")
