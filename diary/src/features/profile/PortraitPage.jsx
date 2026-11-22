import { ChevronRight, Trash2, Wand2 } from '../../components/ClayIcon';
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
import portraitVine from '../../assets/profile/header-vine-thick.webp';
import temperament from '../../assets/profile/portrait-symbols/temperament.webp';
import personality from '../../assets/profile/portrait-symbols/personality.webp';
import selfEsteem from '../../assets/profile/portrait-symbols/self-esteem.webp';
import sociability from '../../assets/profile/portrait-symbols/sociability.webp';
import career from '../../assets/profile/portrait-symbols/career.webp';
import './portrait-cards.css';

const WebApp = window.Telegram.WebApp;
const categoryArt = {
  'Темперамент': temperament,
  'Личность': personality,
  'Самооценка': selfEsteem,
  'Общительность': sociability,
  'Профориентация': career,
};

function PortraitCategory({ section, onOpenTests }) {
  const { category, test_count: count, lead, interpretation } = section;
  const art = categoryArt[category];
  return (
    <section className="portrait-chapter" aria-label={category}>
      <header className="portrait-chapter__header">
        {art && <img className="portrait-chapter__art" src={art} alt="" width="88" height="88" decoding="async" />}
        <ClayText as="h3" text={category} />
      </header>
      <div className="portrait-chapter__body">
        {count > 0 ? <>
          <p className="portrait-chapter__lead">{lead}</p>
          <p>{interpretation}</p>
        </> : <>
          <p>Пройди тест в этой категории, чтобы добавить её в портрет.</p>
          <button type="button" onClick={onOpenTests} className="ui-button ui-button--outline mt-4">К тестам категории</button>
        </>}
      </div>
      {count > 0 && <p className="portrait-chapter__source">По результатам {count} {plural(count, ['теста', 'тестов', 'тестов'])}</p>}
    </section>
  );
}

function PortraitTests({ profile, onOpenTests }) {
  const required = profile.categories.filter(category => category.tests.length > 0);
  return (
    <section>
      <ClayText as="h3" className="portrait-section-title" text="Обязательные тесты" />
      {required.length ? <div className="ui-card portrait-list">
        {required.map(({ id, name, tests }) => {
          const art = categoryArt[name];
          const passed = tests.filter(test => test.passed).length;
          return <button key={id} type="button" className="portrait-row" onClick={() => onOpenTests(name)}>
            {art && <img className="portrait-row__art" src={art} alt="" width="60" height="60" />}
            <span className="portrait-row__label"><ClayText text={name} /><small>Пройдено {passed} из {tests.length}</small></span>
            <ChevronRight size={20} />
          </button>;
        })}
      </div> : <button type="button" className="ui-button ui-button--primary" onClick={() => onOpenTests()}>К тестам</button>}
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
  if (!sections?.length && content && !content.includes('```json')) content = content.replace(/(\[\s*\{[\s\S]*"leftValue"[\s\S]*\}\s*\])/, '```json\n$1\n```');
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
  const hasRemaining = profile.passed_tests < profile.total_tests;
  const showProgress = (!portrait || hasRemaining) && !isGeneratingPortrait;
  return (
    <Page title="Портрет личности" onBack={onBack} clayTitle>
      <div className="portrait-page">
        <header className="portrait-intro">
          <ClayBanner id="portrait-hero" kind="profile" title="Мой портрет личности" description="Интерпретация результатов тестов" image={portraitBanner} />
          {updatedAt && <p className="portrait-updated">Обновлено <time dateTime={updatedAt}>{formatDate(updatedAt)}</time></p>}
        </header>
        {showProgress && <section className="ui-card portrait-progress">
          <div className="portrait-progress-label"><ClayText as="h3" text="Пройдено тестов" /><strong>{profile.passed_tests} из {profile.total_tests}</strong></div>
          <progress aria-label="Пройдено обязательных тестов" value={profile.passed_tests} max={profile.total_tests || 1} />
          {hasRemaining && <p>{portrait ? 'Пройди оставшиеся тесты, чтобы обновить портрет.' : 'Пройди все тесты, чтобы получить свой разбор.'}</p>}
          {portrait && hasRemaining && <button type="button" onClick={() => toTests()} className="ui-button ui-button--outline mt-4">К тестам</button>}
        </section>}
        {isGeneratingPortrait ? <GenerationProgress text="Портрет личности формируется…" /> : <>
          {state === 'outdated' && <section className="ui-card portrait-action">
            <ClayText as="h3" text="Можно обновить портрет" />
            <p>{sections ? 'В тестах появились новые результаты. Обнови портрет, чтобы их учесть.' : 'Обнови портрет, чтобы увидеть отдельный разбор по каждой категории.'}</p>
            <button type="button" onClick={generate} className="ui-button ui-button--primary"><Wand2 size={20} />Обновить портрет</button>
          </section>}
          {sections?.length ? <article className="portrait-document" aria-label="Разбор по категориям">
            <img className="portrait-document__vine portrait-document__vine--start" src={portraitVine} alt="" width="76" height="76" aria-hidden="true" />
            <img className="portrait-document__vine portrait-document__vine--end" src={portraitVine} alt="" width="76" height="76" aria-hidden="true" />
            {sections.map(section => <PortraitCategory key={section.key} section={section} onOpenTests={() => toTests(section.category)} />)}
          </article> : portrait ? <ResultContent content={content} titles={['Портрет личности', 'Мой портрет личности']} components={portraitComponents} contents={false} variant="document" clayHeadings /> : state === 'ready' ? <section className="ui-card portrait-action">
            <ClayText as="h3" text="Все тесты пройдены" />
            <p>Теперь можно собрать результаты в портрет и прочитать разбор по категориям.</p>
            <button type="button" onClick={generate} className="ui-button ui-button--primary"><Wand2 size={20} />Сформировать портрет</button>
          </section> : <PortraitTests profile={profile} onOpenTests={toTests} />}
          {portrait && <button type="button" onClick={remove} className="ui-button ui-button--quiet"><Trash2 size={18} />Удалить портрет</button>}
        </>}
      </div>
    </Page>
  );
}
