import { Trash2, Wand2 } from 'lucide-react';
import Page from '../../components/Page';
import ResultContent from '../../components/ResultContent';
import GenerationProgress from '../../components/GenerationProgress';
import { useProfile, portraitState } from '../../context/profile';
import { useAppNav, useErrorHandler } from '../../navigation/appNav';
import { api } from '../../utils/api';
import { parseScales, scaleValue } from './portraitScales';

const WebApp = window.Telegram.WebApp;

function PortraitScale({ scale }) {
  const leftValue = scaleValue(scale.leftValue);
  const rightValue = scaleValue(scale.rightValue);
  return (
    <div className="portrait-scale">
      <div className="portrait-scale__labels"><span>{scale.left || ''} · {Math.round(leftValue)}%</span><span>{scale.right || ''} · {Math.round(rightValue)}%</span></div>
      <div className="portrait-scale__track" aria-hidden="true"><div className="bg-[#7BA887]" style={{ width: `${leftValue}%` }} /><div className="bg-[#B88A4E]" style={{ width: `${rightValue}%` }} /></div>
      {scale.description && <p className="portrait-scale__description">{scale.description}</p>}
    </div>
  );
}

function ScaleCode({ className, children }) {
  let scales = [];
  if (className?.includes('language-json')) {
    try { scales = parseScales(String(children)); }
    catch { /* При неизвестном формате сохраняется весь исходный текст. */ }
  }
  return scales.length ? <div>{scales.map((scale, index) => <PortraitScale key={index} scale={scale} />)}</div> : <code className={className}>{children}</code>;
}

const portraitComponents = { pre: ({ children }) => <>{children}</>, code: ScaleCode };

export default function PortraitPage({ onBack }) {
  const { profile, refreshProfile, generatePortrait, isGeneratingPortrait, isPremium } = useProfile();
  const { navigate } = useAppNav();
  const handleError = useErrorHandler();
  const state = portraitState(profile);
  const portrait = profile?.portrait;
  let content = portrait?.content || '';
  if (content && !content.includes('```json')) content = content.replace(/(\[\s*\{[\s\S]*"leftValue"[\s\S]*\}\s*\])/, '```json\n$1\n```');
  const generate = () => generatePortrait().catch(err => handleError(err));
  const price = isPremium ? '' : ` · ${profile.prices.portrait} ₽`;
  const remove = () => WebApp.showConfirm('Удалить портрет личности? Дневник перестанет отвечать на записи, пока портрет не сформирован заново.', async (confirmed) => {
    if (!confirmed) return;
    try {
      await api('/api/portrait/clear', { method: 'DELETE' });
      await refreshProfile();
      onBack();
    } catch (err) { handleError(err, 'Не удалось удалить портрет.'); }
  });
  const toTests = () => { onBack(); navigate({ tab: 'tests' }); };
  return (
    <Page title="Портрет личности" onBack={onBack}>
      {isGeneratingPortrait ? <GenerationProgress text="Портрет личности формируется…" /> : <div className="ui-stack">
        {state === 'outdated' && <section className="ui-card">
          <p className="ui-secondary mb-4">Есть новые результаты тестов — портрет можно обновить.</p>
          <button type="button" onClick={generate} className="ui-button ui-button--primary"><Wand2 size={20} /> Обновить портрет{price}</button>
        </section>}
        {portrait ? <ResultContent content={content} titles={['Портрет личности', 'Мой портрет личности']} components={portraitComponents} /> : state === 'ready' ? <section className="ui-card">
          <h3 className="text-lg font-semibold mb-3">Все тесты пройдены</h3>
          <p className="ui-secondary mb-5">Можно сформировать портрет личности. Он поможет дневнику лучше понимать твои реакции.</p>
          <button type="button" onClick={generate} className="ui-button ui-button--primary"><Wand2 size={20} /> Сформировать портрет{price}</button>
        </section> : <section className="ui-card">
          <h3 className="text-lg font-semibold mb-3">Портрет складывается из тестов</h3>
          <p className="ui-secondary mb-5">Пройдено {profile?.passed_tests ?? 0} из {profile?.total_tests ?? 0}. Пройди оставшиеся тесты, чтобы сформировать портрет.</p>
          <button type="button" onClick={toTests} className="ui-button ui-button--primary">К тестам</button>
        </section>}
        {portrait && <button type="button" onClick={remove} className="ui-button ui-button--quiet"><Trash2 size={20} /> Удалить портрет</button>}
      </div>}
    </Page>
  );
}
