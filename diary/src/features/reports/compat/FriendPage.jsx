import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Heart, Lock, Sparkles, UserMinus } from 'lucide-react';
import Page from '../../../components/Page';
import Spinner from '../../../components/Spinner';
import GenerationProgress from '../../../components/GenerationProgress';
import { useErrorHandler } from '../../../navigation/appNav';
import { api, apiStream } from '../../../utils/api';
import { friendName } from './friends';

const WebApp = window.Telegram.WebApp;

const GENDERS = ['Мужской', 'Женский'];

const markdownComponents = {
  h1: ({ children }) => <h1 className="text-2xl sm:text-3xl font-black text-[#F5E6D3] text-center mb-8 mt-4 uppercase drop-shadow-sm break-words">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl sm:text-2xl font-bold text-[#F5E6D3] mt-10 mb-6 flex items-center justify-center pb-4 break-words text-center"><Sparkles className="text-[#F5E6D3] inline mb-1 mr-3" size={24} /> {children}</h2>,
  h3: ({ children }) => <h3 className="text-lg sm:text-xl font-bold text-[#F5E6D3] mt-8 mb-4 break-words text-left">{children}</h3>,
  p: ({ children }) => <p className="text-[#F5E6D3] leading-relaxed mb-6 text-base font-medium text-left break-words">{children}</p>,
  strong: ({ children }) => <strong className="text-[#F5E6D3] font-bold break-words">{children}</strong>,
  ul: ({ children }) => <ul className="space-y-4 mb-8 mt-4 pl-1 w-full">{children}</ul>,
  li: ({ children }) => (
    <li className="flex items-start text-base font-medium text-[#F5E6D3] break-words w-full">
      <Heart className="shrink-0 text-[#F5E6D3] mr-3 mt-1" size={20} />
      <span className="flex-1 block">{children}</span>
    </li>
  ),
};

function Choice({ options, value, onChange }) {
  return (
    <div className="flex gap-2">
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex-1 py-3 rounded-xl font-medium ${value === id ? 'bg-[#F5E6D3] text-rose-950' : 'bg-rose-950/60 text-[#F5E6D3]/80'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Друг: готовый анализ совместимости, форма для нового или почему он пока недоступен.
// Пол спрашиваем, только если он нужен (партнерская совместимость) и еще не известен
export default function FriendPage({ friend, myGender: knownMyGender, myPortrait, onBack, onChanged }) {
  const handleError = useErrorHandler();
  const name = friendName(friend);
  const canCompare = myPortrait && friend.has_portrait;
  const [mode, setMode] = useState(friend.has_compatibility ? 'loading' : 'form'); // loading | view | form | generating
  const [content, setContent] = useState(null);
  const [type, setType] = useState('friendly');
  const [myGender, setMyGender] = useState(knownMyGender || '');
  const [friendGender, setFriendGender] = useState(friend.gender || '');

  useEffect(() => {
    if (!friend.has_compatibility) return;
    api(`/api/friends/compatibility/${friend.id}`)
      .then(data => { setContent(data.content); setMode('view'); })
      .catch(() => setMode('form'));
  }, [friend]);

  const needsGender = type === 'partner';
  const canSubmit = !needsGender || (myGender && friendGender);

  const generate = async () => {
    setMode('generating');
    try {
      const data = await apiStream('/api/friends/compatibility', {
        friend_id: friend.id,
        type,
        my_gender: needsGender ? myGender : '',
        friend_gender: needsGender ? friendGender : '',
      });
      setContent(data.content);
      setMode('view');
      onChanged?.();
    } catch (err) {
      setMode('form');
      handleError(err);
    }
  };

  const remove = () => {
    WebApp.showConfirm(`Удалить ${name} из друзей?`, async (confirmed) => {
      if (!confirmed) return;
      try {
        await api(`/api/friends/${friend.id}`, { method: 'DELETE' });
        onChanged?.();
        onBack();
      } catch (err) {
        handleError(err, 'Не удалось удалить из друзей');
      }
    });
  };

  return (
    <Page title={name} onBack={onBack}>
      <div className="flex flex-col gap-4">
        {!canCompare && !friend.has_compatibility ? (
          <section className="bg-rose-900/80 rounded-3xl p-5 flex gap-3">
            <Lock size={18} className="shrink-0 mt-0.5 text-[#F5E6D3]/70" />
            <p className="text-sm text-[#F5E6D3]/80 leading-relaxed">
              {myPortrait
                ? `Совместимость откроется, когда у ${name} появится портрет личности.`
                : 'Совместимость откроется, когда у вас обоих будет портрет личности.'}
            </p>
          </section>
        ) : mode === 'loading' ? (
          <Spinner />
        ) : mode === 'generating' ? (
          <section className="bg-rose-900/80 rounded-3xl px-5 py-2">
            <GenerationProgress text="Анализ совместимости..." />
          </section>
        ) : mode === 'view' && content ? (
          <>
            <section className="bg-rose-900/80 rounded-3xl p-5 sm:p-8 overflow-x-hidden">
              <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
            </section>
            {canCompare && (
              <button onClick={() => setMode('form')} className="w-full py-3.5 border border-[#F5E6D3]/40 text-[#F5E6D3] font-bold rounded-2xl active:scale-[0.98]">
                Пересчитать совместимость
              </button>
            )}
          </>
        ) : (
          <section className="bg-rose-900/80 rounded-3xl p-5 flex flex-col gap-5">
            <div>
              <p className="text-[#F5E6D3] font-bold mb-3">Какая совместимость?</p>
              <Choice options={[['friendly', 'Дружеская'], ['partner', 'Партнерская']]} value={type} onChange={setType} />
            </div>
            {needsGender && !knownMyGender && (
              <div>
                <p className="text-[#F5E6D3]/80 text-sm mb-2">Ваш пол (спросим один раз):</p>
                <Choice options={GENDERS.map(g => [g, g])} value={myGender} onChange={setMyGender} />
              </div>
            )}
            {needsGender && !friend.gender && (
              <div>
                <p className="text-[#F5E6D3]/80 text-sm mb-2">Пол: {name}</p>
                <Choice options={GENDERS.map(g => [g, g])} value={friendGender} onChange={setFriendGender} />
              </div>
            )}
            <button
              onClick={generate}
              disabled={!canSubmit}
              className="w-full bg-emerald-800 disabled:bg-emerald-950/40 disabled:text-[#F5E6D3]/50 text-[#F5E6D3] font-bold py-3.5 rounded-2xl active:scale-[0.98]"
            >
              Узнать совместимость
            </button>
          </section>
        )}

        <button onClick={remove} className="mt-2 flex items-center justify-center gap-2 w-full py-3 text-sm text-[#F5E6D3]/60">
          <UserMinus size={16} /> Удалить из друзей
        </button>
      </div>
    </Page>
  );
}
