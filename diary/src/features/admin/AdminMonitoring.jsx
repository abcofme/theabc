import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, LoaderCircle, RefreshCw } from '../../components/ClayIcon';
import ScreenState from '../../components/ScreenState';
import { api } from '../../utils/api';
import { AdminRow, AdminSection } from './AdminReport';

// Мониторинг: алерты (backend/alerts.py) и отчет о производительности (backend/performance.py)

const PERIODS = [[24, '24 часа'], [168, '7 дней']];

const num = (value, digits = 1) => value.toLocaleString('ru-RU', { maximumFractionDigits: digits });
const gb = (bytes) => bytes == null ? '—' : bytes >= 2 ** 30 ? `${num(bytes / 2 ** 30)} ГБ` : `${Math.round(bytes / 2 ** 20)} МБ`;
const pct = (share) => share == null ? '—' : `${Math.round(share * 100)}%`;
const sec = (value) => value == null ? '—' : `${num(value)} с`;
const ms = (value) => value == null ? 'дольше минуты' : value >= 1000 ? `${num(value / 1000)} с` : `${value} мс`;
// 95% запросов уложились в границу корзины; null — дольше последней границы
const p95 = (value) => value == null ? '95% дольше минуты' : `95% до ${ms(value)}`;
const plural = (n, [one, few, many]) => {
  const tens = n % 100, units = n % 10;
  return tens > 10 && tens < 20 ? many : units === 1 ? one : units >= 2 && units <= 4 ? few : many;
};
const when = (iso) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const uptime = (s) => s == null ? '—' : s < 3600 ? `${Math.round(s / 60)} мин` : s < 86400 ? `${Math.round(s / 3600)} ч` : `${Math.round(s / 86400)} дн`;

function Alerts({ alerts }) {
  if (!alerts.length) {
    return (
      <AdminSection title="Алерты">
        <p className="flex items-center gap-2 ui-secondary"><Check size={18} />Алертов не было — все в норме</p>
      </AdminSection>
    );
  }
  return (
    <AdminSection title="Алерты">
      <ul className="flex flex-col gap-3">
        {alerts.map(alert => (
          <li key={alert.id} className={`admin-alert${alert.seen ? '' : ' is-new'}`}>
            <p className="font-semibold text-[var(--ui-text)] flex items-start gap-2">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />{alert.title}
            </p>
            <p className="ui-secondary mt-1">{alert.text}</p>
            <p className="ui-muted mt-1">
              {when(alert.created_at)}
              {alert.count > 1 && ` · повторялся ${alert.count} ${plural(alert.count, ['раз', 'раза', 'раз'])}, последний — ${when(alert.last_at)}`}
            </p>
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}

function Report({ report }) {
  const { server, stt, dictation, api: requests } = report;
  const memoryUsed = server.memory_total - server.memory_free;
  return (
    <>
      <AdminSection title="Сервер">
        <AdminRow label="Процессор сейчас" value={pct(server.cpu)} hint={`ядер: ${server.cpus}, нагрузка ${num(server.load, 2)}`} />
        <AdminRow label="Процессор в среднем / пик" value={`${pct(server.cpu_avg)} / ${pct(server.cpu_peak)}`} />
        <AdminRow label="Память" value={`${gb(memoryUsed)} из ${gb(server.memory_total)}`} hint={`пик за период ${pct(server.memory_peak)}`} />
        <AdminRow label="Диск" value={`${gb(server.disk_used)} из ${gb(server.disk_total)}`} />
        <AdminRow label="База данных" value={gb(server.db_size)} />
      </AdminSection>

      <AdminSection title="Диктовка">
        <AdminRow label="Сервис распознавания" value={stt.up ? 'работает' : 'не отвечает'} hint={stt.up ? `без перезапуска ${uptime(stt.uptime)}` : undefined} />
        <AdminRow label="Память" value={`${gb(stt.memory)} из ${gb(stt.memory_limit)}`} hint={`пик ${gb(stt.memory_peak)}`} />
        <AdminRow label="Процессор в среднем / пик" value={`${pct(stt.cpu_avg)} / ${pct(stt.cpu_peak)}`} hint="доля всех ядер сервера" />
        <AdminRow label="Очередь сейчас / пик" value={`${stt.queue ?? '—'} / ${stt.queue_peak ?? '—'}`} />
        <AdminRow label="Диктовок" value={dictation.count} hint={`людей ${dictation.users}, пробных ${dictation.trials}`} />
        <AdminRow label="Записано речи" value={`${num(dictation.audio_minutes ?? 0)} мин`} />
        <AdminRow label="Ответ в среднем / 95%" value={`${sec(dictation.avg_seconds)} / ${sec(dictation.p95_seconds)}`} hint="очередь и распознавание" />
        <AdminRow label="Дольше всех ждали очереди" value={sec(dictation.max_wait_seconds)} />
        <AdminRow label="Минута речи распознается за" value={sec(dictation.ratio == null ? null : dictation.ratio * 60)} />
        <AdminRow label="Без слов / ошибок" value={`${dictation.empty} / ${dictation.errors}`} />
      </AdminSection>

      <AdminSection title="API">
        <AdminRow label="Запросов" value={requests.count.toLocaleString('ru-RU')} hint={`ошибок сервера ${requests.errors}`} />
        <AdminRow label="Ответ в среднем / 95%" value={`${ms(requests.avg_ms)} / ${ms(requests.p95_ms)}`} />
        <ul className="flex flex-col gap-2 mt-3">
          {requests.routes.slice(0, 15).map(route => (
            <li key={route.route} className="admin-route">
              <code>{route.route}</code>
              <span className="ui-muted">
                {route.count} запр. · среднее {ms(route.avg_ms)} · {p95(route.p95_ms)}{route.errors > 0 && ` · ошибок ${route.errors}`}
              </span>
            </li>
          ))}
        </ul>
        <p className="ui-muted mt-2">95% — так быстро отвечают 95 запросов из 100. Генерация ИИ считается до последнего байта ответа.</p>
      </AdminSection>
    </>
  );
}

export default function AdminMonitoring({ onAlertsSeen }) {
  const [hours, setHours] = useState(24);
  const [report, setReport] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // Родитель передает новую функцию на каждый рендер — иначе загрузка запускалась бы по кругу
  const onSeenRef = useRef(onAlertsSeen);
  useEffect(() => { onSeenRef.current = onAlertsSeen; });

  const load = useCallback(() => Promise.all([api(`/api/admin/performance?hours=${hours}`), api('/api/admin/alerts')])
    .then(([nextReport, nextAlerts]) => {
      setReport(nextReport);
      setAlerts(nextAlerts.alerts);
      setError(null);
      if (nextAlerts.unseen) api('/api/admin/alerts/seen', { method: 'POST' }).then(() => onSeenRef.current?.()).catch(() => {});
    })
    .catch(setError)
    .finally(() => setRefreshing(false)), [hours]);

  useEffect(() => { load(); }, [load]);

  const refresh = () => { setRefreshing(true); load(); };
  const loading = refreshing || (report && report.hours !== hours);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <div role="tablist" aria-label="Период отчета" className="ui-segmented flex-1">
          {PERIODS.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={hours === value} onClick={() => setHours(value)}>{label}</button>
          ))}
        </div>
        <button type="button" onClick={refresh} disabled={loading} aria-label="Обновить" className="ui-icon-button">
          {loading ? <LoaderCircle size={20} className="animate-spin" /> : <RefreshCw size={20} />}
        </button>
      </div>
      {error && <ScreenState error title="Не удалось загрузить мониторинг" onRetry={refresh} />}
      {!report && !error && <div className="flex justify-center py-12"><LoaderCircle size={40} className="animate-spin" aria-label="Загрузка" /></div>}
      {alerts && <Alerts alerts={alerts} />}
      {report && <Report report={report} />}
      {report && (
        <p className="ui-muted">
          Алерты приходят админам в Telegram: диктовка дольше 30 с или медленнее обычного, очередь от 4 записей,
          память сервиса от 85%, процессор занят 5 минут подряд, сервис не отвечает, на сервере мало памяти или диска.
        </p>
      )}
    </div>
  );
}
