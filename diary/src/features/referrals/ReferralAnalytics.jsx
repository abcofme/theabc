import { useState } from 'react';
import Select from '../../components/Select';
import { ChevronDown, RefreshCw } from '../../components/ClayIcon';
import { AdminRow, AdminSection } from '../admin/AdminReport';
import { formatLeaves } from '../diary/utils';
import { CountList, LoadState, Pages, ReferralMetrics } from './ReferralParts';
import { LABELS, displayDate, number, rubles, useReferralData } from './referralData';

const KINDS = { friend: 'Обычная ссылка', legacy: 'Прежняя пригласительная ссылка', partner: 'Партнёрская ссылка', campaign: 'Рекламная кампания' };

function SourceCards({ sources, sourceId, onSource }) {
  return (
    <AdminSection title="Сравнение источников">
      {sources.length === 0 && <p className="ui-muted">Источники появятся после первых приглашений.</p>}
      {sources.map(source => (
        <details key={source.id} className="admin-breakdown group">
          <summary className="admin-row">
            <span>{source.name}<small>Пополнения {rubles(source.stats.topup_rubles)}</small></span>
            <b className="flex items-center gap-2">{number(source.stats.invited)} пригл.
              <ChevronDown size={16} aria-hidden="true" className="group-open:rotate-180" />
            </b>
          </summary>
          <div className="flex flex-col gap-2 pb-2">
            <div className="admin-breakdown__body">
              <AdminRow label="Открывали приложение" value={number(source.stats.active)} />
              <AdminRow label="Пополнения" value={rubles(source.stats.topup_rubles)} hint={`Операций · ${number(source.stats.topups)}`} />
              <AdminRow label="Оплаты" value={rubles(source.stats.paid_rubles)} />
              <AdminRow label="Покупки услуг" value={number(Object.values(source.stats.purchases).reduce((a, b) => a + b, 0))} />
            </div>
            <h4 className="font-semibold">Покупки</h4>
            <CountList values={source.stats.purchases} empty="Покупок за период не было." />
            <h4 className="font-semibold">Использование функций</h4>
            <CountList values={source.stats.usage} empty="Событий за период не было." />
            <button className="ui-button ui-button--secondary" type="button"
              onClick={() => onSource(String(source.id) === sourceId ? '' : String(source.id))}>
              {String(source.id) === sourceId ? 'Сбросить фильтр' : 'Показать участников источника'}
            </button>
          </div>
        </details>
      ))}
    </AdminSection>
  );
}

function MemberDetails({ id, query, onBranch }) {
  const [page, setPage] = useState(1);
  const data = useReferralData(query === null ? null : `/api/referral/members/${id}?${query}&page=${page}`);
  if (!data.data) return <LoadState request={data} title="Не удалось загрузить участника" />;
  const member = data.data;

  return (
    <div className="flex flex-col gap-3 py-3">
      <button type="button" className="ui-button ui-button--secondary" onClick={() => onBranch(id)}>Открыть ветку участника</button>
      <ReferralMetrics stats={member.stats} />
      <AdminSection title="История пополнений и покупок">
        {member.operations.length === 0 && <p className="ui-muted">Операций за период не было.</p>}
        {member.operations.map(event => (
          <AdminRow key={`${event.kind}-${event.id}`}
            label={event.kind === 'purchase' ? LABELS[event.feature] || event.feature : LABELS[event.kind]}
            hint={displayDate(event.at, true)}
            value={event.tokens != null ? formatLeaves(event.tokens) : event.rubles == null ? '—' : rubles(event.rubles)} />
        ))}
        <Pages page={page} more={member.more} onChange={setPage} label="Страницы операций" />
      </AdminSection>
    </div>
  );
}

export default function ReferralAnalytics({ query, admin }) {
  const [sourceId, setSourceId] = useState('');
  const [branchId, setBranchId] = useState(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const apiQuery = query === null ? null : `${query}&admin=${admin}`;
  const scope = new URLSearchParams({ page });
  if (sourceId !== '') scope.set('source_id', sourceId);
  if (branchId != null) scope.set('branch_id', branchId);
  const request = useReferralData(apiQuery === null ? null : `/api/referral?${apiQuery}&${scope}`);
  const onSource = value => { setSourceId(value); setPage(1); setSelected(null); };
  const onBranch = id => { setBranchId(id); onSource(''); };
  if (!request.data) return <LoadState request={request} title="Не удалось загрузить аналитику" />;
  const { summary, sources, members, pages, branch, start_date, end_date } = request.data;
  const selectedSource = sources.find(source => String(source.id) === sourceId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <p className="ui-muted text-sm">{start_date || end_date ? `${displayDate(start_date)} — ${displayDate(end_date)} · МСК` : 'Всё время · МСК'}</p>
        <button type="button" className="ui-icon-button" aria-label="Обновить аналитику" onClick={request.reload}>
          <RefreshCw size={20} aria-hidden="true" />
        </button>
      </div>
      {branch && <AdminSection title={`Ветка · ${branch.label}`}>
        <button type="button" className="ui-button ui-button--secondary" onClick={() => onBranch(null)}>Ко всей сети</button>
      </AdminSection>}
      <div className="flex flex-col gap-1 ui-secondary text-sm">
        <label htmlFor="referral-source">Источник</label>
        <Select id="referral-source" className="ui-input" value={sourceId} onChange={event => onSource(event.target.value)}>
          <option value="">Все источники</option>
          {sources.map(source => <option key={source.id} value={source.id}>{source.name}{source.id ? ` · №${source.id}` : ''}</option>)}
        </Select>
      </div>
      <ReferralMetrics stats={summary} summary />
      <p className="ui-muted text-sm">По старым операциям показана доступная история. Точный расход листиков собирается с запуска кабинета.</p>
      <SourceCards sources={sources} sourceId={sourceId} onSource={onSource} />
      <AdminSection title={selectedSource ? `Сеть · ${selectedSource.name}` : 'Сеть приглашений'}>
        {members.length === 0 && <p className="ui-muted">В этой выборке пока нет участников.</p>}
        {members.map(member => (
          <div key={member.id} className="admin-breakdown">
            <button type="button" aria-expanded={selected === member.id} className="admin-row w-full text-left"
              onClick={() => setSelected(id => id === member.id ? null : member.id)}>
              <span>
                <strong>{member.label}</strong>
                <small>{`Уровень ${member.level} · ${displayDate(member.joined_at)}`}</small>
                <small>{member.inviter ? `Пригласил · ${member.inviter.label}` : KINDS[member.kind]}</small>
                {member.independent && <small>Самостоятельный партнёр</small>}
                {member.separate_branch && <small>Отдельная ветка вознаграждений</small>}
              </span>
              <b className="flex items-center gap-2 text-sm">{number(member.invited_count)} пригл.
                <ChevronDown size={16} aria-hidden="true" className={selected === member.id ? 'rotate-180' : ''} />
              </b>
            </button>
            {selected === member.id && <MemberDetails key={`${member.id}|${apiQuery}`} id={member.id} query={apiQuery} onBranch={onBranch} />}
          </div>
        ))}
        <Pages page={page} more={page < pages} onChange={next => { setPage(next); setSelected(null); }} label="Страницы участников" />
      </AdminSection>
    </div>
  );
}
