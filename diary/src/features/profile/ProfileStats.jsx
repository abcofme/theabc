import { useEffect, useState } from 'react';
import { CalendarDays, PenLine, Flame, Brain, FileText, Users } from '../../components/ClayIcon';
import { useProfile } from '../../context/profile';
import { api } from '../../utils/api';
import { dayKey, plural } from '../diary/utils';

function StatTile({ icon: Icon, value, label, hint }) {
  return (
    <div className="profile-stat ui-card">
      <span className="profile-stat__top">
        <span className="profile-stat__value">{value}</span>
        <Icon size={20} className="shrink-0 text-[var(--ui-gold)]" />
      </span>
      <span className="profile-stat__label">{label}</span>
      {hint && <span className="profile-stat__hint">{hint}</span>}
    </div>
  );
}

// Статистика загружается, когда пользователь открывает вкладку: за это время могли появиться записи и отчеты
export default function ProfileStats({ active }) {
  const { profile } = useProfile();
  const [stats, setStats] = useState(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!active) return;
    api(`/api/profile/stats?today=${dayKey(new Date())}`)
      .then(data => { setStats(data); setHasError(false); })
      .catch(() => setHasError(true));
  }, [active]);

  // Тесты берем из профиля: он обновляется сразу после прохождения теста
  const tests = profile?.categories?.flatMap(c => c.tests) ?? [];
  const passedTests = tests.filter(t => t.passed).length;

  const show = (n) => (stats ? n : hasError ? '—' : '…');
  const word = (n, forms) => plural(stats ? n : 0, forms);

  return (
    <section aria-label="Статистика" className="grid grid-cols-2 gap-3">
      <StatTile
        icon={CalendarDays}
        value={show(stats?.days_with_us)}
        label={`${word(stats?.days_with_us, ['день', 'дня', 'дней'])} с нами`}
      />
      <StatTile
        icon={Flame}
        value={show(stats?.streak)}
        label={`${word(stats?.streak, ['день', 'дня', 'дней'])} подряд`}
        hint={stats?.best_streak > stats?.streak ? `Рекорд — ${stats.best_streak}` : null}
      />
      <StatTile
        icon={PenLine}
        value={show(stats?.diary_entries)}
        label={`${word(stats?.diary_entries, ['запись', 'записи', 'записей'])} в дневнике`}
      />
      <StatTile
        icon={Brain}
        value={`${passedTests} из ${tests.length}`}
        label={`${plural(tests.length, ['теста', 'тестов', 'тестов'])} пройдено`}
      />
      <StatTile
        icon={FileText}
        value={show(stats?.reports)}
        label={word(stats?.reports, ['отчет получен', 'отчета получено', 'отчетов получено'])}
      />
      <StatTile
        icon={Users}
        value={show(stats?.friends)}
        label={word(stats?.friends, ['друг', 'друга', 'друзей'])}
      />
    </section>
  );
}
