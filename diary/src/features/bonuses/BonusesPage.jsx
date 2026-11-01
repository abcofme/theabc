import { Check, ChevronRight } from '../../components/ClayIcon';
import Page from '../../components/Page';
import { useProfile } from '../../context/profile';
import './bonuses.css';

// Куда вести за невыполненным шагом
function targetOf(kind) {
  if (kind.startsWith('report_')) return { tab: 'reports', type: kind.slice('report_'.length) };
  return {
    first_test: { tab: 'tests' },
    all_tests: { tab: 'tests' },
    portrait: { tab: 'profile', page: 'portrait' },
    diary_answer: { tab: 'diary' },
    diary_week: { tab: 'diary' },
    friend_invited: { tab: 'reports', section: 'compatibility' },
    compatibility: { tab: 'reports', section: 'compatibility' },
    install_app: { tab: 'profile', page: 'install' },
  }[kind] || null;
}

function BonusRow({ bonus, onGo }) {
  const target = !bonus.done && targetOf(bonus.kind);
  const Tag = target ? 'button' : 'div';
  return (
    <li>
      <Tag
        type={target ? 'button' : undefined}
        onClick={target ? () => onGo(target) : undefined}
        className="w-full flex items-center gap-3 py-3.5 text-left"
      >
        <span className={`bonus-mark ${bonus.done ? 'bonus-mark--done' : ''}`} aria-hidden="true">
          {bonus.done && <Check size={16} />}
        </span>
        <span className={`flex-1 min-w-0 ${bonus.done ? 'text-[var(--ui-secondary)]' : 'text-[var(--ui-text)] font-medium'}`}>
          {bonus.title}
          {bonus.done && <span className="sr-only"> — выполнено</span>}
        </span>
        {bonus.done ? (
          bonus.amount > 0 && <span className="ui-secondary shrink-0">+{bonus.amount}</span>
        ) : (
          <>
            <span className="ui-badge shrink-0">+{bonus.amount}</span>
            <ChevronRight size={20} className="shrink-0 text-[var(--ui-muted)]" />
          </>
        )}
      </Tag>
    </li>
  );
}

// Бонусы за первые шаги: что уже сделано и что еще можно сделать. Невыполненный шаг ведет к своей функции
export default function BonusesPage({ onBack, onGo }) {
  const { profile } = useProfile();
  const bonuses = profile?.bonuses || [];
  const done = bonuses.filter(b => b.done).length;
  const hasEarlierSteps = bonuses.some(b => b.done && !b.amount);

  return (
    <Page title="Бонусы" onBack={onBack} clayTitle>
      <div className="ui-stack">
        <div className="ui-card flex flex-col gap-3">
          <p className="font-semibold text-[var(--ui-text)]">Выполнено {done} из {bonuses.length}</p>
          <div className="bonus-progress" role="progressbar" aria-label="Выполнено шагов" aria-valuemin={0} aria-valuemax={bonuses.length} aria-valuenow={done}>
            <span style={{ width: `${bonuses.length ? (done / bonuses.length) * 100 : 0}%` }} />
          </div>
          <p className="ui-secondary">
            За первые шаги в приложении на баланс начисляются токены — один раз за каждый шаг.
            Их можно потратить на функции с ИИ.
          </p>
          {hasEarlierSteps && <p className="ui-muted">Шаги, сделанные до появления бонусов, отмечены без начисления.</p>}
        </div>

        <ul className="ui-card py-1! divide-y divide-[var(--ui-text)]/10">
          {bonuses.map(bonus => <BonusRow key={bonus.kind} bonus={bonus} onGo={onGo} />)}
        </ul>
      </div>
    </Page>
  );
}
