import { Check } from '../../components/ClayIcon';
import { useProfile, portraitState } from '../../context/profile';
import { useAppNav } from '../../navigation/appNav';
import headerVine from '../../assets/profile/header-vine-handmade.webp';

// Пока нет портрета, дневник не отвечает. Карточка показывает весь путь: тесты → портрет → ответы
export default function PortraitPath({ onNavigate }) {
  const { profile, isGeneratingPortrait } = useProfile();
  const { navigate } = useAppNav();
  const state = portraitState(profile);
  if (!profile || profile.portrait) return null;
  const total = profile.total_tests || 0;
  const passed = Math.min(profile.passed_tests || 0, total);
  const testsDone = state === 'ready';
  const steps = [
    { title: 'Пройди тесты', hint: `Пройдено ${passed} из ${total}`, done: testsDone, current: !testsDone },
    { title: 'Сформируй портрет личности', hint: isGeneratingPortrait ? 'Портрет формируется…' : 'По результатам тестов', done: false, current: testsDone },
    { title: 'Дневник начнет отвечать', hint: 'Сверит каждую реакцию с портретом', done: false, current: false },
  ];
  const go = () => {
    onNavigate?.();
    navigate(testsDone ? { tab: 'profile', page: 'portrait' } : { tab: 'tests' });
  };

  return (
    <section className="ui-card vine-card" aria-labelledby="portrait-path-title">
      <img className="vine-card__vine" src={headerVine} alt="" aria-hidden="true" width="512" height="512" draggable="false" />
      <div className="vine-card__content">
        <h2 id="portrait-path-title" className="text-lg leading-6 font-semibold pr-16">Как дневник начнет отвечать</h2>
        <p className="ui-secondary mt-2 pr-6">
          Записывай, что произошло и какой была твоя реакция. Дневник сверит реакцию с портретом личности и ответит — без искажений.
        </p>
        <ol className="portrait-path">
          {steps.map((step, index) => (
            <li key={step.title} data-done={step.done || undefined} data-current={step.current || undefined}>
              <span className="portrait-path__mark" aria-hidden="true">{step.done ? <Check size={14} strokeWidth={3} /> : index + 1}</span>
              <span className="min-w-0">
                <span className="block font-medium leading-6">{step.title}</span>
                <span className="ui-muted block">{step.hint}</span>
              </span>
            </li>
          ))}
        </ol>
        <button type="button" onClick={go} className="ui-button ui-button--outline">
          {testsDone ? 'К портрету личности' : 'К тестам'}
        </button>
      </div>
    </section>
  );
}
