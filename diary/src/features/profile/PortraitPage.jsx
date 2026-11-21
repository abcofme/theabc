import { Trash2, Wand2 } from '../../components/ClayIcon';
import Page from '../../components/Page';
import ClayBanner from '../../components/ClayBanner';
import ClayText from '../../components/ClayText';
import ResultContent from '../../components/ResultContent';
import GenerationProgress from '../../components/GenerationProgress';
import { useProfile, portraitState } from '../../context/profile';
import { plural } from '../diary/utils';
import { useAppNav, useErrorHandler } from '../../navigation/appNav';
import { api } from '../../utils/api';
import { parseScales, scaleValue } from './portraitScales';
import portraitBanner from '../../assets/profile/portrait-woman-handmade.webp';
import temperament from '../../assets/profile/portrait/temperament.webp';
import personality from '../../assets/profile/portrait/personality.webp';
import selfEsteem from '../../assets/profile/portrait/self-esteem.webp';
import sociability from '../../assets/profile/portrait/sociability.webp';
import career from '../../assets/profile/portrait/career.webp';
import './portrait-cards.css';

const WebApp = window.Telegram.WebApp;
const categoryArt = { temperament, personality, 'self-esteem': selfEsteem, sociability, career };

function PortraitCategory({ section, onOpenTests }) {
  const id = `portrait-category-${section.key}`;
  const count = section.test_count;
  return (
    <section className="ui-card portrait-category" aria-labelledby={id}>
      <header className="portrait-category__header">
        <ClayText as="h3" id={id} text={section.category} />
        <img src={categoryArt[section.key]} alt="" width="86" height="86" decoding="async" />
      </header>
      {count > 0 ? <>
        <p className="portrait-category__lead">{section.lead}</p>
        <p className="portrait-category__interpretation">{section.interpretation}</p>
        <p className="portrait-category__coverage">По результатам {count} {plural(count, ['теста', 'тестов', 'тестов'])}</p>
      </> : <>
        <p className="portrait-category__interpretation">В этой категории пока нет результатов. Пройди тест, чтобы добавить вывод в портрет.</p>
        <button type="button" onClick={onOpenTests} className="ui-button ui-button--outline mt-4">К тестам категории</button>
      </>}
    </section>
  );
}

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
  const sections = portrait?.sections;
  let content = portrait?.content || '';
  if (!sections && content && !content.includes('```json')) content = content.replace(/(\[\s*\{[\s\S]*"leftValue"[\s\S]*\}\s*\])/, '```json\n$1\n```');
  const generate = () => generatePortrait().catch(err => handleError(err));
  const remove = () => WebApp.showConfirm('Удалить портрет личности?', async (confirmed) => {
    if (!confirmed) return;
    try {
      await api('/api/portrait/clear', { method: 'DELETE' });
      await refreshProfile();
      onBack();
    } catch (err) { handleError(err, 'Не удалось удалить портрет.'); }
  });
  const toTests = category => { onBack(); navigate({ tab: 'tests', category }); };
  const updatedAt = !isGeneratingPortrait && portrait?.updated_at;
  return (
    <Page title="Портрет личности" onBack={onBack} clayTitle>
      {(!sections || updatedAt) && <header className={sections ? 'mb-4' : 'mb-6'}>
        {!sections && <ClayBanner id="portrait-hero" kind="profile" title="Мой портрет личности" description="Интерпретация результатов тестов" image={portraitBanner} />}
        {updatedAt && <p className={`ui-secondary px-1${sections ? '' : ' mt-3'}`}>Обновлено {formatDate(updatedAt)}</p>}
      </header>}
      {isGeneratingPortrait ? <GenerationProgress text="Портрет личности формируется…" /> : <div className="ui-stack">
        {state === 'outdated' && <section className="ui-card">
          <p className="ui-secondary mb-4">{sections ? 'Есть изменения в результатах тестов. Обнови портрет, чтобы их учесть.' : 'Портрет теперь состоит из пяти категорий. Обнови его, чтобы получить разбор по каждой.'}</p>
          <button type="button" onClick={generate} className="ui-button ui-button--primary"><Wand2 size={20} /> Обновить портрет</button>
        </section>}
        {sections ? <div className="portrait-categories">
          {sections.map(section => <PortraitCategory key={section.key} section={section} onOpenTests={() => toTests(section.category)} />)}
        </div> : portrait ? <ResultContent content={content} titles={['Портрет личности', 'Мой портрет личности']} components={portraitComponents} contents={false} variant="document" clayHeadings /> : state === 'ready' ? <section className="ui-card">
          <h3 className="text-lg font-semibold mb-3"><ClayText text="Все тесты пройдены" /></h3>
          <p className="ui-secondary mb-5">Портрет объяснит, что результаты тестов говорят о тебе в каждой категории.</p>
          <button type="button" onClick={generate} className="ui-button ui-button--primary"><Wand2 size={20} /> Сформировать портрет</button>
        </section> : <section className="ui-card">
          <h3 className="text-lg font-semibold mb-3"><ClayText text="Портрет складывается из тестов" /></h3>
          <p className="ui-secondary mb-5">Пройдено {profile?.passed_tests ?? 0} из {profile?.total_tests ?? 0}. Пройди оставшиеся тесты, чтобы сформировать портрет.</p>
          <button type="button" onClick={() => toTests()} className="ui-button ui-button--primary">К тестам</button>
        </section>}
        {portrait && <button type="button" onClick={remove} className="ui-button ui-button--quiet"><Trash2 size={20} /> Удалить портрет</button>}
      </div>}
    </Page>
  );
}
