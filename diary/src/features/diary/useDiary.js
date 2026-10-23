import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../utils/api';

const POLL_INTERVAL = 3000;
// Разбор идёт по всему портрету и может занять до пары минут; дольше — считаем, что он не удался
const POLL_TIMEOUT = 150000;

const withoutKey = (obj, key) => {
  const next = { ...obj };
  delete next[key];
  return next;
};

// Все записи дневника, загруженные в этой сессии, и действия с ними.
// Разбор новой записи запускает бэкенд; здесь мы только ждём его, опрашивая запись
export default function useDiary(today) {
  const [entriesById, setEntriesById] = useState({});
  const [streak, setStreak] = useState(0);
  const [overviewStatus, setOverviewStatus] = useState('loading'); // loading | ready | error
  const [pending, setPending] = useState({}); // id записи → когда начали ждать разбор

  const upsert = useCallback((list) => {
    setEntriesById(prev => {
      const next = { ...prev };
      list.forEach(e => { next[e.id] = { ...e, date: e.date.slice(0, 10) }; });
      return next;
    });
  }, []);

  const startWaiting = useCallback((id) => setPending(prev => ({ ...prev, [id]: Date.now() })), []);
  const stopWaiting = useCallback((id) => setPending(prev => withoutKey(prev, id)), []);

  const loadOverview = useCallback(async () => {
    try {
      const data = await api(`/api/diary/overview?today=${today}`);
      upsert(data.entries);
      setStreak(data.streak);
      setOverviewStatus('ready');
    } catch (err) {
      console.error('Ошибка загрузки дневника:', err);
      setOverviewStatus(status => status === 'ready' ? status : 'error');
    }
  }, [today, upsert]);

  const loadMonth = useCallback(async (year, month) => {
    upsert(await api(`/api/diary?year=${year}&month=${month}`));
  }, [upsert]);

  const addEntry = useCallback(async (date, event, reaction) => {
    const res = await api('/api/diary', { method: 'POST', body: { date, event, reaction } });
    upsert([{ id: res.id, date, event, reaction, rating: null, portrait_match_score: null, portrait_match_explanation: null }]);
    window.dispatchEvent(new Event('diary:changed'));
    if (res.analysis_started) startWaiting(res.id);
    loadOverview(); // серия дней могла вырасти
    return res.id;
  }, [upsert, startWaiting, loadOverview]);

  const updateEntry = useCallback(async (entry, event, reaction) => {
    const res = await api(`/api/diary/${entry.id}`, { method: 'PATCH', body: { event, reaction } });
    upsert([{ ...entry, event, reaction, portrait_match_score: null, portrait_match_explanation: null }]);
    if (res.analysis_started) startWaiting(entry.id);
  }, [upsert, startWaiting]);

  const deleteEntry = useCallback(async (id) => {
    await api(`/api/diary/${id}`, { method: 'DELETE' });
    setEntriesById(prev => withoutKey(prev, id));
    window.dispatchEvent(new Event('diary:changed'));
    stopWaiting(id);
    loadOverview();
  }, [stopWaiting, loadOverview]);

  // Повторный разбор, если фоновый не удался или запись старше портрета
  const retryAnalysis = useCallback(async (id) => {
    startWaiting(id);
    try {
      const res = await api(`/api/analyze-reaction/${id}`, { method: 'POST' });
      setEntriesById(prev => prev[id]
        ? { ...prev, [id]: { ...prev[id], portrait_match_score: res.score, portrait_match_explanation: res.explanation } }
        : prev);
    } finally {
      stopWaiting(id);
    }
  }, [startWaiting, stopWaiting]);

  // Опрос записей, по которым идёт разбор
  const pendingRef = useRef(pending);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  const hasPending = Object.keys(pending).length > 0;

  useEffect(() => {
    if (!hasPending) return;
    let busy = false;
    const interval = setInterval(async () => {
      if (busy) return;
      busy = true;
      const now = Date.now();
      await Promise.all(Object.entries(pendingRef.current).map(async ([id, since]) => {
        try {
          const entry = await api(`/api/diary/${id}`);
          if (entry.portrait_match_score !== null) {
            upsert([entry]);
            stopWaiting(id);
          } else if (now - since > POLL_TIMEOUT) {
            stopWaiting(id);
          }
        } catch (err) {
          if (err.status === 404 || now - since > POLL_TIMEOUT) stopWaiting(id);
        }
      }));
      busy = false;
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [hasPending, upsert, stopWaiting]);

  return {
    entries: Object.values(entriesById),
    streak,
    overviewStatus,
    isPending: (id) => id in pending,
    loadOverview,
    loadMonth,
    addEntry,
    updateEntry,
    deleteEntry,
    retryAnalysis,
  };
}
