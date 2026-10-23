import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Heart, Sparkles } from 'lucide-react';
import Page from '../../components/Page';
import Spinner from '../../components/Spinner';
import GenerationProgress from '../../components/GenerationProgress';
import { useErrorHandler } from '../../navigation/appNav';
import { api, apiStream } from '../../utils/api';

const GENDERS = ['Мужской', 'Женский'];

const markdownComponents = {
  h1: (props) => <h1 className="text-3xl sm:text-4xl font-black text-[#F5E6D3] text-center mb-10 mt-6 uppercase drop-shadow-sm break-words">{props.children}</h1>,
  h2: (props) => <h2 className="text-2xl sm:text-3xl font-bold text-[#F5E6D3] mt-14 mb-8 flex items-center justify-center pb-4 break-words text-center"><Sparkles className="text-[#F5E6D3] inline mb-1 mr-3" size={28} /> {props.children}</h2>,
  h3: (props) => <h3 className="text-xl sm:text-2xl font-bold text-[#F5E6D3] mt-10 mb-6 flex items-center pb-2 break-words text-left">{props.children}</h3>,
  p: (props) => <p className="text-[#F5E6D3] leading-loose mb-8 text-base sm:text-lg font-semibold text-left break-words">{props.children}</p>,
  strong: (props) => <strong className="text-[#F5E6D3] font-black text-lg sm:text-xl break-words">{props.children}</strong>,
  ul: (props) => <ul className="space-y-6 mb-10 mt-6 pl-1 w-full">{props.children}</ul>,
  li: (props) => (
    <li className="flex items-start text-base sm:text-lg font-semibold text-[#F5E6D3] break-words w-full">
      <Heart className="shrink-0 text-[#F5E6D3] mr-3 mt-1" size={22} />
      <span className="flex-1 block">{props.children}</span>
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
          className={`flex-1 py-3 rounded-xl font-medium ${value === id ? 'bg-emerald-800 text-[#F5E6D3]' : 'bg-rose-800 text-[#F5E6D3]/70'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Совместимость с другом: готовый анализ или форма для нового. Пол спрашиваем, только если он нужен и ещё не известен
export default function CompatibilityPage({ friend, myGender: knownMyGender, onBack, onCreated }) {
  const handleError = useErrorHandler();
  const name = friend.first_name || (friend.username ? `@${friend.username}` : 'другом');
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
      onCreated?.();
    } catch (err) {
      setMode('form');
      handleError(err);
    }
  };

  return (
    <Page title={`Совместимость с ${name}`} onBack={onBack}>
      {mode === 'loading' && <Spinner />}

      {mode === 'generating' && (
        <div className="py-12"><GenerationProgress text="Анализ совместимости..." /></div>
      )}

      {mode === 'view' && content && (
        <div className="bg-rose-900/80 rounded-3xl p-5 sm:p-8 shadow-xl overflow-x-hidden">
          <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
          <button onClick={() => setMode('form')} className="w-full bg-emerald-800 text-[#F5E6D3] font-bold py-4 rounded-2xl active:scale-[0.98] mt-8">
            Пересчитать совместимость
          </button>
        </div>
      )}

      {mode === 'form' && (
        <div className="flex flex-col gap-5">
          <div className="bg-rose-900/40 p-5 rounded-3xl flex flex-col gap-5">
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
          </div>

          <button
            onClick={generate}
            disabled={!canSubmit}
            className="w-full bg-emerald-800 disabled:bg-emerald-950/40 disabled:text-[#F5E6D3]/50 text-[#F5E6D3] font-bold py-4 rounded-2xl active:scale-[0.98]"
          >
            Узнать совместимость
          </button>
        </div>
      )}
    </Page>
  );
}
