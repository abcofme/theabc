import { Wand2 } from 'lucide-react';
import { useProfile, portraitState } from '../../context/profile';
import { useAppNav, useErrorHandler } from '../../navigation/appNav';

// Путь к портрету личности: сколько тестов осталось и что делать, когда все пройдены
export default function PortraitProgress() {
  const { profile, generatePortrait, isGeneratingPortrait } = useProfile();
  const { navigate } = useAppNav();
  const handleError = useErrorHandler();
  const state = portraitState(profile);
  if (!state) return null;

  const { passed_tests: passed, total_tests: total } = profile;
  const percent = total > 0 ? Math.round((Math.min(passed, total) / total) * 100) : 0;
  const openPortrait = () => navigate({ tab: 'profile', page: 'portrait' });

  const generate = async () => {
    try {
      await generatePortrait();
      openPortrait();
    } catch (err) {
      handleError(err);
    }
  };

  let text;
  let action = null;
  if (isGeneratingPortrait) {
    text = 'Портрет формируется — это займет пару минут.';
  } else if (state === 'tests') {
    text = 'Когда пройдешь все тесты, сложится портрет личности — и дневник начнет сверять с ним твои реакции.';
  } else if (state === 'ready') {
    text = 'Все тесты пройдены — можно сформировать портрет.';
    action = { label: 'Сформировать портрет', onClick: generate };
  } else if (state === 'outdated') {
    text = 'Есть новые результаты — портрет можно обновить.';
    action = { label: 'Обновить портрет', onClick: generate };
  } else {
    text = 'Портрет готов. Дневник сверяет с ним твои реакции.';
    action = { label: 'Открыть портрет', onClick: openPortrait, secondary: true };
  }

  return (
    <section className="bg-rose-900/80 rounded-3xl p-5 mx-2" aria-label="Путь к портрету личности">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="text-lg font-bold text-[#F5E6D3]">Портрет личности</h2>
        <span className="text-sm font-bold text-[#F5E6D3]/80 shrink-0">{Math.min(passed, total)} из {total}</span>
      </div>
      <div className="h-2 w-full bg-rose-950 rounded-full overflow-hidden mb-3">
        <div className="h-full bg-emerald-700 transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-sm text-[#F5E6D3]/80 leading-relaxed">{text}</p>
      {action && (
        <button
          onClick={action.onClick}
          className={`mt-4 w-full py-3 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] ${
            action.secondary ? 'border border-[#F5E6D3]/40 text-[#F5E6D3]' : 'bg-emerald-800 text-[#F5E6D3]'
          }`}
        >
          {!action.secondary && <Wand2 size={18} />} {action.label}
        </button>
      )}
    </section>
  );
}
