import { Trash2, Wand2 } from 'lucide-react';
import Page from '../../components/Page';
import ClayBanner from '../../components/ClayBanner';
import ClayText from '../../components/ClayText';
import ResultContent from '../../components/ResultContent';
import GenerationProgress from '../../components/GenerationProgress';
import { useProfile, portraitState } from '../../context/profile';
import { useAppNav, useErrorHandler } from '../../navigation/appNav';
import { api } from '../../utils/api';
import { parseScales, scaleValue } from './portraitScales';
import portraitBanner from '../../assets/profile/portrait-woman-handmade.webp';

const WebApp = window.Telegram.WebApp;

// Шкала — спектр между двумя полюсами: метка стоит там, куда склоняется человек
function PortraitScale({ scale }) {
  const leftValue = scaleValue(scale.leftValue);
  const rightValue = scaleValue(scale.rightValue);
  const sum = leftValue + rightValue;
  const position = sum > 0 ? (rightValue / sum) * 100 : 50;
  return (
    <div className="portrait-scale">
      <div className="portrait-scale__labels">
        <span data-strong={position < 50 || undefined}>{scale.left || ''} <span className="whitespace-nowrap">· {Math.round(leftValue)}%</span></span>
        <span data-strong={position > 50 || undefined}>{scale.right || ''} <span className="whitespace-nowrap">· {Math.round(rightValue)}%</span></span>
      </div>
      <div className="portrait-scale__track" aria-hidden="true">
        <span className="portrait-scale__fill" style={{ left: `${Math.min(position, 50)}%`, width: `${Math.abs(position - 50)}%` }} />
        <span className="portrait-scale__mark" style={{ left: `${position}%` }} />
      </div>
      {scale.description && <p className="portrait-scale__description">{scale.description}</p>}
    </div>
  );
}

const formatDate = iso => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

function ScaleCode({ className, children }) {
  let scales = [];
  if (className?.includes('language-json')) {
    try { scales = parseScales(String(children)); }
    catch { /* При неизвестном формате сохраняется весь исходный текст. */ }
  }
  return scales.length ? <div className="portrait-scales">{scales.map((scale, index) => <PortraitScale key={index} scale={scale} />)}</div> : <code className={className}>{children}</code>;
}

const portraitComponents = { pre: ({ children }) => <>{children}</>, code: ScaleCode };

export default function PortraitPage({ onBack }) {
  const { profile, refreshProfile, generatePortrait, isGeneratingPortrait } = useProfile();
  const { navigate } = useAppNav();
  const handleError = useErrorHandler();
  const state = portraitState(profile);
  const portrait = profile?.portrait;
  let content = portrait?.content || '';
  if (content && !content.includes('```json')) content = content.replace(/(\[\s*\{[\s\S]*"leftValue"[\s\S]*\}\s*\])/, '```json\n$1\n```');
  const generate = () => generatePortrait().catch(err => handleError(err));
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
    <Page title="Портрет личности" onBack={onBack} clayTitle>
      <header className="mb-6">
        <ClayBanner id="portrait-hero" kind="profile" title="Мой портрет личности" description="Подробный анализ черт характера" image={portraitBanner} />
        {portrait?.updated_at && !isGeneratingPortrait && <p className="ui-secondary mt-3 px-1">Обновлен {formatDate(portrait.updated_at)}</p>}
      </header>
      {isGeneratingPortrait ? <GenerationProgress text="Портрет личности формируется…" /> : <div className="ui-stack">
        {state === 'outdated' && <section className="ui-card">
          <p className="ui-secondary mb-4">Есть новые результаты тестов — портрет можно обновить.</p>
          <button type="button" onClick={generate} className="ui-button ui-button--primary"><Wand2 size={20} /> Обновить портрет</button>
        </section>}
        {portrait ? <ResultContent content={content} titles={['Портрет личности', 'Мой портрет личности']} components={portraitComponents} variant="document" clayHeadings /> : state === 'ready' ? <section className="ui-card">
          <h3 className="text-lg font-semibold mb-3"><ClayText text="Все тесты пройдены" /></h3>
          <p className="ui-secondary mb-5">Можно сформировать портрет личности. Он поможет дневнику лучше понимать твои реакции.</p>
          <button type="button" onClick={generate} className="ui-button ui-button--primary"><Wand2 size={20} /> Сформировать портрет</button>
        </section> : <section className="ui-card">
          <h3 className="text-lg font-semibold mb-3"><ClayText text="Портрет складывается из тестов" /></h3>
          <p className="ui-secondary mb-5">Пройдено {profile?.passed_tests ?? 0} из {profile?.total_tests ?? 0}. Пройди оставшиеся тесты, чтобы сформировать портрет.</p>
          <button type="button" onClick={toTests} className="ui-button ui-button--primary">К тестам</button>
        </section>}
        {portrait && <button type="button" onClick={remove} className="ui-button ui-button--quiet"><Trash2 size={20} /> Удалить портрет</button>}
      </div>}
    </Page>
  );
}
