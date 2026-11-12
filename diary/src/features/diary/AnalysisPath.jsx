import ClayText from '../../components/ClayText';
import { useAppNav } from '../../navigation/appNav';
import headerVine from '../../assets/profile/header-vine-handmade.webp';

export default function AnalysisPath({ testProgress, onNavigate }) {
  const { navigate } = useAppNav();
  const { covered, total } = testProgress;
  const steps = [
    { title: 'Пройди по одному тесту в каждой категории', hint: total > 0 ? `Прогресс по категориям · ${covered} из ${total}` : '' },
    { title: 'Получи ответ дневника', hint: 'Он учтёт результаты всех пройденных тестов' },
  ];
  const go = () => {
    onNavigate?.();
    navigate({ tab: 'tests' });
  };

  return (
    <section className="ui-card vine-card" aria-labelledby="analysis-path-title">
      <img className="vine-card__vine" src={headerVine} alt="" aria-hidden="true" width="512" height="512" draggable="false" />
      <div className="vine-card__content">
        <h2 id="analysis-path-title" className="text-lg leading-6 font-semibold pr-16">
          <ClayText text="Как дневник начнёт отвечать" />
        </h2>
        <p className="ui-secondary mt-2 pr-6">
          Записывай, что произошло и какой была твоя реакция.
        </p>
        <ol className="portrait-path">
          {steps.map((step, index) => (
            <li key={step.title} data-current={index === 0 || undefined}>
              <span className="portrait-path__mark" aria-hidden="true"><ClayText className="text-base" text={String(index + 1)} /></span>
              <span className="min-w-0">
                <span className="block font-medium leading-6">{step.title}</span>
                {step.hint && <span className="ui-muted block">{step.hint}</span>}
              </span>
            </li>
          ))}
        </ol>
        <button type="button" onClick={go} className="ui-button ui-button--outline">
          К тестам
        </button>
      </div>
    </section>
  );
}
