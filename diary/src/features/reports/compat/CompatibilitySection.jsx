import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronRight, User, UserPlus, X } from 'lucide-react';
import Avatar from '../../../components/Avatar';
import Spinner from '../../../components/Spinner';
import InviteModal from './InviteModal';
import FriendPage from './FriendPage';
import { friendName, compatStatus } from './friends';
import { useAppNav, useErrorHandler } from '../../../navigation/appNav';
import { api } from '../../../utils/api';
import friendsImage from '../../../assets/reports/friends-handmade.webp';

const SectionLabel = ({ children }) => (
  <h3 className="text-xs font-bold text-[#F5E6D3]/70 uppercase tracking-wider px-1">{children}</h3>
);

function FriendAvatar({ user }) {
  return (
    <Avatar
      src={user.photo_url}
      className="w-11 h-11 rounded-full object-cover shrink-0"
      fallback={
        <span className="w-11 h-11 shrink-0 rounded-full bg-rose-800 flex items-center justify-center text-lg font-bold text-[#F5E6D3]">
          {(user.first_name || user.username)?.[0]?.toUpperCase() || <User size={22} />}
        </span>
      }
    />
  );
}

// Строка списка: аватар, имя, подпись и действие справа
function FriendRow({ user, caption, onClick, children }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 text-left">
      <FriendAvatar user={user} />
      <span className="flex-1 min-w-0">
        <span className="block text-[#F5E6D3] font-bold truncate">{friendName(user)}</span>
        {caption}
      </span>
      {children}
    </Tag>
  );
}

// Раздел «Совместимость с друзьями»: приглашение по личной ссылке, заявки, друзья и анализ совместимости
export default function CompatibilitySection() {
  const { navigate } = useAppNav();
  const handleError = useErrorHandler();
  const [data, setData] = useState(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [openFriend, setOpenFriend] = useState(null);

  const load = useCallback(
    () => api('/api/friends').then(setData).catch(err => handleError(err, 'Не удалось загрузить друзей')),
    [handleError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const act = (path) => api(path, { method: 'POST' }).then(load).catch(err => handleError(err));

  if (!data) return <Spinner />;

  const myPortrait = data.current_user_has_portrait;
  const hasRequests = data.incoming_requests.length > 0 || data.outgoing_requests.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-rose-900/80 rounded-3xl overflow-hidden">
        <img src={friendsImage} alt="" className="w-full aspect-[12/5] object-cover pointer-events-none select-none" draggable="false" />
        <div className="p-5 pt-3">
          <h2 className="font-bold text-[#F5E6D3] text-lg">Совместимость с друзьями</h2>
          <p className="text-sm text-[#F5E6D3]/75 leading-relaxed mt-1 mb-4">
            Сравним ваши портреты личности: в чем вы дополняете друг друга, где нужно терпение и что помогает мириться.
          </p>
          <button
            onClick={() => setIsInviteOpen(true)}
            className="w-full py-3.5 bg-emerald-800 text-[#F5E6D3] font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <UserPlus size={20} /> Пригласить друга
          </button>
          {!myPortrait && (
            <button onClick={() => navigate({ tab: 'tests' })} className="w-full mt-3 text-sm text-[#F5E6D3]/75 underline underline-offset-2">
              Для совместимости нужен твой портрет личности — к тестам
            </button>
          )}
        </div>
      </section>

      {hasRequests && (
        <section className="flex flex-col gap-2">
          <SectionLabel>Заявки</SectionLabel>
          <div className="bg-rose-900/60 rounded-3xl divide-y divide-[#F5E6D3]/10 overflow-hidden">
            {data.incoming_requests.map(req => (
              <FriendRow key={req.request_id} user={req} caption={<span className="block text-xs text-[#F5E6D3]/60">Хочет дружить</span>}>
                <button onClick={() => act(`/api/friends/accept/${req.request_id}`)} aria-label="Принять" className="p-2 rounded-lg bg-[#F5E6D3] text-rose-950">
                  <Check size={18} />
                </button>
                <button onClick={() => act(`/api/friends/reject/${req.request_id}`)} aria-label="Отклонить" className="p-2 rounded-lg bg-rose-950/60 text-[#F5E6D3]/70">
                  <X size={18} />
                </button>
              </FriendRow>
            ))}
            {data.outgoing_requests.map(req => (
              <FriendRow key={req.request_id} user={req} caption={<span className="block text-xs text-[#F5E6D3]/60">Ждет ответа</span>}>
                <button onClick={() => act(`/api/friends/reject/${req.request_id}`)} className="px-3 py-1.5 text-sm font-medium text-[#F5E6D3]/70 bg-rose-950/60 rounded-lg">
                  Отменить
                </button>
              </FriendRow>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionLabel>Друзья</SectionLabel>
        {data.friends.length === 0 ? (
          <p className="text-sm text-[#F5E6D3]/70 text-center py-6 px-4 leading-relaxed bg-rose-900/40 rounded-3xl">
            Пока никого. Отправь другу личную ссылку — он появится здесь, как только ее откроет.
          </p>
        ) : (
          <div className="bg-rose-900/60 rounded-3xl divide-y divide-[#F5E6D3]/10 overflow-hidden">
            {data.friends.map(friend => {
              const status = compatStatus(friend, myPortrait);
              return (
                <FriendRow
                  key={friend.id}
                  user={friend}
                  onClick={() => setOpenFriend(friend)}
                  caption={<span className={`block text-xs ${status.ready ? 'text-[#F5E6D3]/80' : 'text-[#F5E6D3]/50'}`}>{status.text}</span>}
                >
                  <ChevronRight size={18} className="shrink-0 text-[#F5E6D3]/60" />
                </FriendRow>
              );
            })}
          </div>
        )}
      </section>

      {isInviteOpen && <InviteModal link={data.invite_link} onClose={() => setIsInviteOpen(false)} />}
      {openFriend && (
        <FriendPage
          friend={openFriend}
          myGender={data.my_gender}
          myPortrait={myPortrait}
          onBack={() => setOpenFriend(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
