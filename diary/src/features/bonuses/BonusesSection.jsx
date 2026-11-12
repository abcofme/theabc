import { Check, ChevronDown, ChevronRight, ChevronUp, Sparkles } from '../../components/ClayIcon';
import { formatTokens } from '../diary/utils';
import './bonuses.css';

const stepArt = import.meta.glob('../../assets/bonuses/*.webp', { eager: true, query: '?url&no-inline', import: 'default' });

// Куда вести за невыполненным шагом
function targetOf(kind) {
  if (kind.startsWith('report_')) return { tab: 'reports', type: kind.slice('report_'.length) };
  return {
    portrait: { tab: 'profile', page: 'portrait' },
    diary_answer: { tab: 'diary' },
    friend_invited: { tab: 'reports', section: 'compatibility' },
    compatibility: { tab: 'reports', section: 'compatibility' },
    install_app: { tab: 'profile', page: 'install' },
  }[kind] || null;
}

function BonusRow({ bonus, onGo }) {
  const art = stepArt[`../../assets/bonuses/${bonus.test_id ? 'first_test' : bonus.kind}.webp`];
  const target = !bonus.done && (bonus.test_id ? { tab: 'tests', testId: bonus.test_id } : targetOf(bonus.kind));
  const Tag = target ? 'button' : 'div';
  return (
    <li>
      <Tag
        type={target ? 'button' : undefined}
        onClick={target ? () => onGo(target) : undefined}
        className="bonus-step"
      >
        <span className="bonus-step__visual" aria-hidden="true">
          {art && <img className="bonus-step__art" src={art} alt="" width={36} height={36} loading="lazy" decoding="async" draggable="false" />}
          {(!art || bonus.done) && (
            <span className="bonus-step__mark" data-done={bonus.done || undefined}>
              {bonus.done && <Check size={art ? 10 : 14} />}
            </span>
          )}
        </span>
        <span className="bonus-step__title">
          {bonus.title}
          {bonus.done && <span className="sr-only"> — выполнено</span>}
        </span>
        {bonus.amount > 0 && (
          <span className="bonus-step__amount" data-done={bonus.done || undefined}>
            <span aria-hidden="true">+{bonus.amount.toLocaleString('ru-RU')}</span>
            <span className="sr-only">, {formatTokens(bonus.amount)} на баланс</span>
          </span>
        )}
        {target && <ChevronRight size={16} />}
      </Tag>
    </li>
  );
}

function groupSteps(bonuses, categories) {
  const stepsByTest = new Map();
  const groups = categories.map(category => {
    const steps = [];
    for (const test of category.tests) stepsByTest.set(test.id, steps);
    return { key: category.id, title: category.name, steps, collapsible: true };
  });
  const otherSteps = [];
  for (const bonus of bonuses) {
    const steps = stepsByTest.get(bonus.test_id) ?? otherSteps;
    steps.push(bonus);
  }
  const testGroups = groups.filter(group => group.steps.length > 0);
  if (otherSteps.length > 0) {
    testGroups.push({ key: 'other', title: testGroups.length ? 'Другие достижения' : undefined, steps: otherSteps });
  }
  return testGroups;
}

export default function BonusesSection({ bonuses, categories = [], expanded, onToggle, onGo }) {
  if (!bonuses?.length) return null;

  const pending = bonuses.filter(bonus => !bonus.done);
  const done = bonuses.length - pending.length;
  const available = pending.reduce((sum, bonus) => sum + bonus.amount, 0);
  const groups = expanded ? groupSteps(bonuses, categories) : [{ key: 'next', steps: pending.slice(0, 1) }];

  return (
    <section className="bonus-section" aria-labelledby="profile-bonuses-title">
      <header className="bonus-section__header">
        <span className="bonus-section__emblem"><Sparkles size={28} /></span>
        <div>
          <h2 id="profile-bonuses-title">Бонусы за первые шаги</h2>
          <p className="ui-secondary">Выполняй задания и получай токены на баланс.</p>
        </div>
      </header>

      <div className="bonus-section__progress">
        <div className="bonus-section__numbers">
          <span>{pending.length ? `Выполнено ${done} из ${bonuses.length}` : 'Все шаги выполнены'}</span>
          {available > 0 && <span className="bonus-section__available">Впереди +{formatTokens(available)}</span>}
        </div>
        <div className="bonus-progress" data-complete={pending.length === 0 || undefined} role="progressbar" aria-label="Выполнено шагов" aria-valuemin={0} aria-valuemax={bonuses.length} aria-valuenow={done}>
          <span style={{ width: `${done / bonuses.length * 100}%` }} />
        </div>
      </div>

      <div className="bonus-section__steps-header">
        {(expanded || pending.length > 0) && (
          <span className="ui-section-label">{expanded ? 'Задания' : 'Следующий шаг'}</span>
        )}
        <button type="button" className="bonus-section__toggle" aria-expanded={expanded} aria-controls="profile-bonus-steps" onClick={onToggle}>
          {expanded ? 'Свернуть' : 'Все шаги'}
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      <div id="profile-bonus-steps">
        <div className="space-y-3">
          {groups.map(({ key, title, steps, collapsible }) => {
            if (steps.length === 0) return null;
            const list = (
              <ul className={`bonus-section__steps${collapsible ? ' mt-2' : ''}`} role="list" aria-label={title}>
                {steps.map(bonus => <BonusRow key={bonus.kind} bonus={bonus} onGo={onGo} />)}
              </ul>
            );
            return collapsible ? (
              <details key={key} className="ui-disclosure">
                <summary className="min-h-11 cursor-pointer rounded-[15px] border border-[var(--ui-line)] bg-[var(--ui-inset)] px-3 py-2 text-sm font-semibold">
                  {title}
                </summary>
                {list}
              </details>
            ) : (
              <div key={key}>
                {title && <h3 className="ui-section-label mb-2">{title}</h3>}
                {list}
              </div>
            );
          })}
        </div>
        {expanded && (
          <p className="bonus-section__note ui-muted">Бонус за каждый шаг начисляется один раз. Токены можно потратить на функции с ИИ.</p>
        )}
      </div>
    </section>
  );
}
