import ReactMarkdown from 'react-markdown';
import { User, Brain, Activity, Star, ShieldAlert, Sparkles, Target, Heart, Flame, Trash2, Wand2 } from 'lucide-react';
import Page from '../../components/Page';
import GenerationProgress from '../../components/GenerationProgress';
import { useProfile, portraitState } from '../../context/profile';
import { useAppNav, useErrorHandler } from '../../navigation/appNav';
import { api } from '../../utils/api';

const WebApp = window.Telegram.WebApp;

function PortraitScale({ left, right, leftValue, rightValue, description }) {
  return (
    <div className="mb-10 w-full">
      <div className="flex justify-start items-end text-base sm:text-lg font-bold text-[#F5E6D3] mb-3">
        <span>{left} <span className="text-xs sm:text-sm font-medium opacity-70 ml-1">{Math.round(leftValue)}%</span></span>
      </div>
      <div className="h-4 w-full bg-rose-800 rounded-full overflow-hidden flex shadow-inner mb-3">
        <div className="h-full bg-emerald-800" style={{ width: `${leftValue}%` }}></div>
        <div className="h-full bg-orange-500" style={{ width: `${rightValue}%` }}></div>
      </div>
      <div className="flex justify-end items-start text-base sm:text-lg font-bold text-[#F5E6D3] mb-4">
        <span><span className="text-xs sm:text-sm font-medium opacity-70 mr-1">{Math.round(rightValue)}%</span> {right}</span>
      </div>
      {description && <div className="mt-4"><p className="text-sm sm:text-base text-[#F5E6D3] font-medium leading-relaxed block break-words whitespace-pre-wrap">{description}</p></div>}
    </div>
  );
}

// Шкалы портрета приходят JSON-массивом внутри Markdown
function parseScales(jsonString) {
  const parsed = JSON.parse(jsonString);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.scales)) return parsed.scales;
    if (Array.isArray(parsed.data)) return parsed.data;
    return Object.values(parsed).find(v => Array.isArray(v)) || [];
  }
  return [];
}

function markdownComponents(sectionTitle) {
  let IconComponent = Sparkles;
  if (sectionTitle.includes('Поведенческие')) IconComponent = Target;
  else if (sectionTitle.includes('ценностей')) IconComponent = Heart;
  else if (sectionTitle.includes('барьеры')) IconComponent = Flame;

  return {
    h1: ({ children }) => (
      <h1 className="text-3xl sm:text-4xl font-black text-[#F5E6D3] text-center mb-10 mt-6 first:mt-2 uppercase drop-shadow-sm break-words">{children}</h1>
    ),
    h2: (props) => {
      let textStr = '';
      if (typeof props.children === 'string') textStr = props.children;
      else if (Array.isArray(props.children)) textStr = props.children.map(c => typeof c === 'string' ? c : '').join('');

      let h2Icon = null;
      if (textStr.includes('Устойчивые')) h2Icon = <Activity className="text-[#F5E6D3] inline mb-1 mr-3" size={28} />;
      else if (textStr.includes('Поведенческие')) h2Icon = <Brain className="text-[#F5E6D3] inline mb-1 mr-3" size={28} />;
      else if (textStr.includes('ценностей')) h2Icon = <Star className="text-[#F5E6D3] inline mb-1 mr-3" size={28} />;
      else if (textStr.includes('барьеры')) h2Icon = <ShieldAlert className="text-[#F5E6D3] inline mb-1 mr-3" size={28} />;
      else if (textStr.includes('Личность')) h2Icon = <User className="text-[#F5E6D3] inline mb-1 mr-3" size={28} />;

      return <h2 className="text-2xl sm:text-3xl font-bold text-[#F5E6D3] mt-14 mb-8 flex items-center justify-center pb-4 break-words text-center">{h2Icon} {props.children}</h2>;
    },
    p: ({ children }) => <p className="text-[#F5E6D3] leading-loose mb-8 text-base sm:text-lg font-semibold text-left break-words">{children}</p>,
    strong: ({ children }) => (
      <strong className="text-[#F5E6D3] font-black text-lg sm:text-xl break-words">
        <IconComponent className="inline text-[#F5E6D3] mb-1 mr-2" size={22} />
        {children}
      </strong>
    ),
    ul: ({ children }) => <ul className="space-y-6 mb-10 mt-6 pl-1 w-full">{children}</ul>,
    li: ({ children }) => (
      <li className="flex items-start text-base sm:text-lg font-semibold text-[#F5E6D3] break-words w-full">
        <IconComponent className="shrink-0 text-[#F5E6D3] mr-3 mt-1" size={22} />
        <span className="flex-1 block">{children}</span>
      </li>
    ),
    // Шкалы приходят блоком кода: без обёртки <pre>, иначе пояснения к ним набираются моноширинным шрифтом
    pre: ({ children }) => <>{children}</>,
    code: ({ inline, className, children }) => {
      const match = /language-(\w+)/.exec(className || '');
      if (!inline && match && match[1] === 'json') {
        let scales;
        try {
          scales = parseScales(String(children).replace(/\n$/, ''));
        } catch {
          return <code className={className}>{children}</code>;
        }
        return (
          <div className="my-10 px-2 sm:px-4">
            {scales.map((s, idx) => (
              <PortraitScale key={idx} left={s.left || ''} right={s.right || ''} leftValue={s.leftValue || 50} rightValue={s.rightValue || 50} description={s.description || ''} />
            ))}
          </div>
        );
      }
      return <code className="bg-rose-800 text-[#F5E6D3] px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>;
    },
  };
}

export default function PortraitPage({ onBack }) {
  const { profile, refreshProfile, generatePortrait, isGeneratingPortrait } = useProfile();
  const { navigate } = useAppNav();
  const handleError = useErrorHandler();
  const state = portraitState(profile);
  const portrait = profile?.portrait;

  let content = portrait?.content || '';
  if (content && !content.includes('```json')) {
    // Модель иногда отдаёт шкалы без обёртки ```json — оборачиваем сами
    content = content.replace(/(\[\s*\{[\s\S]*"leftValue"[\s\S]*\}\s*\])/, '```json\n$1\n```');
  }

  const generate = () => generatePortrait().catch(err => handleError(err));

  const remove = () => {
    WebApp.showConfirm('Удалить портрет личности? Дневник перестанет отвечать на записи, пока портрет не сформирован заново.', async (confirmed) => {
      if (!confirmed) return;
      try {
        await api('/api/portrait/clear', { method: 'DELETE' });
        await refreshProfile();
        onBack();
      } catch (err) {
        handleError(err, 'Не удалось удалить портрет.');
      }
    });
  };

  const toTests = () => {
    onBack();
    navigate({ tab: 'tests' });
  };

  return (
    <Page title="Портрет личности" onBack={onBack}>
      {isGeneratingPortrait ? (
        <div className="py-12">
          <GenerationProgress text="Портрет личности формируется..." />
        </div>
      ) : (
        <>
          {state === 'outdated' && (
            <div className="mb-4 bg-rose-900/80 p-5 rounded-3xl text-center">
              <p className="text-[#F5E6D3] text-sm mb-4">Есть новые результаты тестов — портрет можно обновить.</p>
              <button onClick={generate} className="w-full py-3.5 rounded-2xl bg-emerald-800 text-[#F5E6D3] font-bold flex items-center justify-center gap-2 active:scale-[0.98]">
                <Wand2 size={18} /> Обновить портрет
              </button>
            </div>
          )}

          {portrait ? (
            <div className="bg-rose-900/80 rounded-3xl p-5 sm:p-8 shadow-xl overflow-x-hidden">
              {content.split(/(?=^#\s)/m).map((sectionText, i) => {
                if (!sectionText.trim()) return null;
                const firstLine = sectionText.trim().split('\n')[0];
                return (
                  <ReactMarkdown key={i} components={markdownComponents(firstLine)}>
                    {sectionText}
                  </ReactMarkdown>
                );
              })}
            </div>
          ) : state === 'ready' ? (
            <div className="bg-rose-900/80 p-6 rounded-3xl text-center">
              <p className="text-[#F5E6D3] text-sm mb-4">Все тесты пройдены — можно сформировать портрет личности.</p>
              <button onClick={generate} className="w-full py-3.5 rounded-2xl bg-emerald-800 text-[#F5E6D3] font-bold active:scale-[0.98]">
                Сформировать портрет
              </button>
            </div>
          ) : (
            <div className="bg-rose-900/80 p-6 rounded-3xl text-center">
              <p className="text-[#F5E6D3] text-sm mb-4">
                Портрет складывается из результатов тестов. Пройдено {profile?.passed_tests ?? 0} из {profile?.total_tests ?? 0}.
              </p>
              <button onClick={toTests} className="w-full py-3.5 rounded-2xl bg-emerald-800 text-[#F5E6D3] font-bold active:scale-[0.98]">
                К тестам
              </button>
            </div>
          )}

          {portrait && (
            <button
              onClick={remove}
              className="mt-4 flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-red-900/10 text-[#F5E6D3]/80 hover:bg-red-900/30 font-medium text-sm active:scale-[0.98]"
            >
              <Trash2 size={18} /> Удалить портрет
            </button>
          )}
        </>
      )}
    </Page>
  );
}
