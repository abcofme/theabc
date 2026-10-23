import { useEffect, useMemo, useState } from 'react';
import { REPORT_TYPES, reportTypeOf } from './reportTypes';
import { newEntriesStart } from './reportHelpers';
import { api } from '../../utils/api';

// Сколько записей дневника появилось после последнего отчета каждого вида: { [typeId]: число }.
// Пересчитывается, когда меняются отчеты или записи и когда вкладка снова на экране
export default function useNewEntries(reports, active) {
  const [counts, setCounts] = useState({});
  const [diaryTick, setDiaryTick] = useState(0);

  useEffect(() => {
    const bump = () => setDiaryTick(t => t + 1);
    window.addEventListener('diary:changed', bump);
    return () => window.removeEventListener('diary:changed', bump);
  }, []);

  // Для каждого вида — дата, с которой записи новые; строкой, чтобы эффект не перезапускался без нужды
  const starts = useMemo(() => {
    const result = {};
    (reports || []).forEach(report => {
      const type = reportTypeOf(report);
      if (type && !result[type.id]) result[type.id] = newEntriesStart(report.created_at);
    });
    return REPORT_TYPES.filter(t => result[t.id]).map(t => `${t.id}=${result[t.id]}`).join('&');
  }, [reports]);

  useEffect(() => {
    if (!active || !starts) return;
    let cancelled = false;
    Promise.all(starts.split('&').map(pair => {
      const [typeId, start] = pair.split('=');
      return api(`/api/reports/entries-count?period=custom&start_date=${start}`)
        .then(data => [typeId, data.count])
        .catch(() => [typeId, null]);
    })).then(pairs => { if (!cancelled) setCounts(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [starts, active, diaryTick]);

  return starts ? counts : {};
}
