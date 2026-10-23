import { useEffect, useRef, useState } from 'react';
import ResultContent from '../../../components/ResultContent';
import ScreenState from '../../../components/ScreenState';
import { useProfile } from '../../../context/profile';
import { Lock, UserMinus } from 'lucide-react';
import Page from '../../../components/Page';
import Spinner from '../../../components/Spinner';
import GenerationProgress from '../../../components/GenerationProgress';
import { useErrorHandler } from '../../../navigation/appNav';
import { api, apiStream } from '../../../utils/api';
import { friendName } from './friends';

const WebApp = window.Telegram.WebApp;

const GENDERS = ['Мужской', 'Женский'];

function Choice({ options, value, onChange }) {
  return (
    <div className="ui-segmented">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}

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
  const { profile, isPremium, refreshProfile } = useProfile();
  const generating = useRef(false);
  const [retry, setRetry] = useState(0);
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
      .catch(() => setMode('error'));
  }, [friend, retry]);

  const needsGender = type === 'partner';
  const canSubmit = !needsGender || (myGender && friendGender);

  const generate = async () => {
    if (generating.current) return;
    generating.current = true;
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
      refreshProfile();
    } catch (err) {
      setMode('form');
      handleError(err);
    } finally { generating.current = false; }
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
      <div className="ui-stack">
        {!canCompare && !friend.has_compatibility ? (
          <section className="ui-card flex gap-3">
            <Lock size={18} className="shrink-0 mt-0.5 text-[#F5E6D3]/70" />
            <p className="text-sm text-[#F5E6D3]/80 leading-relaxed">
              {myPortrait
                ? `Совместимость откроется, когда у ${name} появится портрет личности.`
                : 'Совместимость откроется, когда у вас обоих будет портрет личности.'}
            </p>
          </section>
        ) : mode === 'loading' ? (
          <Spinner />
        ) : mode === 'error' ? (
          <ScreenState error title="Не удалось загрузить совместимость" onRetry={() => { setMode('loading'); setRetry(value => value + 1); }} />
        ) : mode === 'generating' ? (
          <section className="ui-card">
            <GenerationProgress text="Анализ совместимости..." />
          </section>
        ) : mode === 'view' && content ? (
          <>
            <ResultContent content={content} />
            {canCompare && (
              <button onClick={() => setMode('form')} className="ui-button ui-button--outline">
                Пересчитать совместимость
              </button>
            )}
          </>
        ) : (
          <section className="ui-card flex flex-col gap-5">
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
              className="ui-button ui-button--primary"
            >
              Узнать совместимость{isPremium ? '' : ` · ${profile.prices.compatibility} ₽`}
            </button>
          </section>
        )}

        <button onClick={remove} className="ui-button ui-button--quiet">
          <UserMinus size={16} /> Удалить из друзей
        </button>
      </div>
    </Page>
  );
}
