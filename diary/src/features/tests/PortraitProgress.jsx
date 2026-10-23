import { Wand2 } from '../../components/ClayIcon';
import { useProfile, portraitState } from '../../context/profile';
import { useAppNav, useErrorHandler } from '../../navigation/appNav';

export default function PortraitProgress({ nextTest, onContinue }) {
  const { profile, generatePortrait, isGeneratingPortrait } = useProfile();
  const { navigate } = useAppNav();
  const handleError = useErrorHandler();
  const state = portraitState(profile);
  if (!state) return null;
  const { passed_tests: passed, total_tests: total } = profile;
  const percent = total > 0 ? Math.round(Math.min(passed, total) / total * 100) : 0;
  const openPortrait = () => navigate({ tab: 'profile', page: 'portrait' });
  const generate = async () => {
    try { await generatePortrait(); openPortrait(); }
    catch (err) { handleError(err); }
  };
  const text = isGeneratingPortrait ? 'Портрет формируется — это займет пару минут.' : state === 'tests' ? 'Пройди оставшиеся тесты, чтобы дневник понимал твои реакции.' : state === 'ready' ? 'Все тесты пройдены — можно сформировать портрет.' : state === 'outdated' ? 'Есть новые результаты — портрет можно обновить.' : 'Портрет готов. Дневник сверяет с ним твои реакции.';
  return (
    <section className="ui-card" aria-label="Путь к портрету личности">
      <div className="flex items-baseline justify-between gap-3"><h2 className="text-lg leading-6 font-semibold">Портрет личности</h2><span className="ui-secondary shrink-0 tabular-nums">{Math.min(passed, total)} из {total}</span></div>
      <div className="h-1.5 bg-rose-950 rounded-full overflow-hidden my-3" role="progressbar" aria-label="Пройденные тесты" aria-valuenow={Math.min(passed, total)} aria-valuemin={0} aria-valuemax={total || 1}><div className="h-full bg-[var(--ui-sage)] transition-[width] duration-300" style={{ width: `${percent}%` }} /></div>
      <p className="ui-secondary">{text}</p>
      {state === 'tests' && nextTest && <>
        <button type="button" onClick={onContinue} className="ui-button ui-button--primary mt-4">Продолжить тест</button>
        <p className="ui-muted mt-3">{nextTest.name}</p>
      </>}
      {!isGeneratingPortrait && (state === 'ready' || state === 'outdated') && <button type="button" onClick={generate} className="ui-button ui-button--primary mt-4"><Wand2 size={20} />{state === 'ready' ? 'Сформировать' : 'Обновить'} портрет</button>}
      {(state === 'done' || isGeneratingPortrait) && <button type="button" onClick={openPortrait} className="ui-button ui-button--outline mt-4">Открыть портрет</button>}
    </section>
  );
}
