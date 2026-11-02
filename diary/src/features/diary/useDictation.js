import { useEffect, useRef, useState } from 'react';
import { useProfile } from '../../context/profile';
import { api } from '../../utils/api';

const WebApp = window.Telegram.WebApp;

// Одна диктовка — до 5 минут: этого хватает на любую запись, а сервер защищен от часовых записей.
// Сервер режет длиннее 6 минут (stt/app.py)
export const MAX_SECONDS = 300;
// Первый поддерживаемый формат: Chrome и Android пишут webm/opus, Safari и iPhone — mp4/aac
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];

const supported = Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== 'undefined';

// Распознанный текст продолжает уже написанное через пробел
export function appendDictated(value, text) {
  const before = value.replace(/\s+$/, '');
  return before ? `${before} ${text}` : text;
}

function micError(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') return 'Нет доступа к микрофону. Разреши его в настройках и попробуй снова';
  if (err?.name === 'NotFoundError') return 'Микрофон не найден';
  return 'Не удалось включить микрофон';
}

// Останавливает запись и освобождает микрофон. cancelled — запись выбросить, а не распознавать
function finish(current, cancelled) {
  if (!current) return;
  current.cancelled ||= cancelled;
  clearInterval(current.timer);
  cancelAnimationFrame(current.frame);
  current.audio?.close().catch(() => {});
  if (current.recorder?.state === 'recording') current.recorder.stop();
  current.stream?.getTracks().forEach(track => track.stop());
}

// Диктовка: запись с микрофона → распознавание на нашем сервере → onText(текст).
// state: idle | starting | recording | processing. meterRef — элемент, которому пишем громкость в --level
export function useDictation(onText) {
  const [state, setState] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const onTextRef = useRef(onText);
  const meterRef = useRef(null);
  const session = useRef(null);
  const { profile, isPremium, refreshProfile } = useProfile();
  // premium — без ограничений, trial — одна пробная диктовка, locked — пробная уже была.
  // Пока профиль грузится, не запрещаем: доступ все равно проверит сервер
  const access = !profile || isPremium ? 'premium' : profile.dictation_trial ? 'trial' : 'locked';

  useEffect(() => { onTextRef.current = onText; });

  // Закрыли форму посреди диктовки — выключаем микрофон и забываем запись
  useEffect(() => () => finish(session.current, true), []);

  async function transcribe(current, blob) {
    setState('processing');
    try {
      const { text, trial_used: trialUsed } = await api('/api/diary/transcribe', { method: 'POST', body: blob });
      // Пробная диктовка потрачена — поле переключится на предложение Premium
      if (trialUsed) refreshProfile();
      if (current.cancelled) return;
      if (text?.trim()) {
        onTextRef.current(text.trim());
        WebApp.HapticFeedback?.notificationOccurred('success');
      } else {
        setError('Не получилось разобрать слова. Попробуй говорить ближе к микрофону');
      }
    } catch (err) {
      // 403 — пробная уже потрачена (например, в другой вкладке): профиль покажет это
      if (err.status === 403) refreshProfile();
      if (!current.cancelled) setError(err.message || 'Не удалось распознать запись');
    } finally {
      if (!current.cancelled) setState('idle');
    }
  }

  // Громкость голоса — чтобы было видно, что микрофон слышит. Не вышло — диктовка работает и без нее
  function watchLevel(current) {
    try {
      const source = current.audio.createMediaStreamSource(current.stream);
      const analyser = current.audio.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
        meterRef.current?.style.setProperty('--level', Math.min(1, Math.sqrt(sum / samples.length) * 5).toFixed(2));
        current.frame = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* без индикатора громкости */ }
  }

  async function start() {
    if (!supported || session.current?.recorder?.state === 'recording' || state === 'starting' || state === 'processing') return;
    const current = { cancelled: false, chunks: [] };
    session.current = current;
    setError('');
    setSeconds(0);
    setState('starting');
    // AudioContext создаем по нажатию: иначе iOS оставит его на паузе
    try { current.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* без индикатора */ }
    try {
      current.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (err) {
      finish(current, true);
      setError(micError(err));
      setState('idle');
      return;
    }
    if (current.cancelled) { finish(current, true); return; }

    const mimeType = MIME_TYPES.find(type => MediaRecorder.isTypeSupported?.(type));
    try {
      current.recorder = new MediaRecorder(current.stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
    } catch (err) {
      finish(current, true);
      setError(micError(err));
      setState('idle');
      return;
    }
    current.recorder.ondataavailable = (e) => { if (e.data.size) current.chunks.push(e.data); };
    current.recorder.onstop = () => {
      if (current.cancelled) return;
      const blob = new Blob(current.chunks, { type: current.recorder.mimeType || mimeType || 'audio/webm' });
      transcribe(current, blob);
    };
    current.recorder.start(1000);
    current.startedAt = Date.now();
    current.timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - current.startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) finish(current, false);
    }, 250);
    if (current.audio) {
      current.audio.resume?.().catch(() => {});
      watchLevel(current);
    }
    WebApp.HapticFeedback?.impactOccurred('light');
    setState('recording');
  }

  const stop = () => { finish(session.current, false); WebApp.HapticFeedback?.impactOccurred('light'); };
  const cancel = () => { finish(session.current, true); setState('idle'); };

  return { supported, access, state, busy: state !== 'idle', seconds, error, meterRef, start, stop, cancel };
}
