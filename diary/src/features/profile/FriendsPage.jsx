import { useCallback, useEffect, useState } from 'react';
import { Check, Lock, Trash2, User, UserPlus, X, ChevronRight } from 'lucide-react';
import Page from '../../components/Page';
import Spinner from '../../components/Spinner';
import Avatar from '../../components/Avatar';
import InviteModal from './InviteModal';
import CompatibilityPage from './CompatibilityPage';
import { useErrorHandler } from '../../navigation/appNav';
import { api } from '../../utils/api';

const WebApp = window.Telegram.WebApp;

function UserRow({ user, children }) {
  return (
    <div className="flex items-center justify-between bg-rose-900/60 p-4 rounded-2xl gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Avatar
          src={user.photo_url}
          className="w-12 h-12 aspect-square rounded-full object-cover shadow-sm shrink-0"
          fallback={
            <div className="w-12 h-12 aspect-square shrink-0 rounded-full bg-rose-800 flex items-center justify-center shadow-sm">
              {user.first_name || user.username
                ? <span className="text-lg font-bold text-[#F5E6D3]">{(user.first_name || user.username)[0].toUpperCase()}</span>
                : <User className="text-[#F5E6D3]" size={24} />}
            </div>
          }
        />
        <div className="min-w-0 flex-1">
          <p className="text-[#F5E6D3] font-bold text-sm sm:text-base truncate">{user.first_name || 'Без имени'}</p>
          {user.username && <p className="text-[#F5E6D3]/80 text-xs sm:text-sm truncate">@{user.username}</p>}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">{children}</div>
    </div>
  );
}

// Друзья: приглашение по личной ссылке, список и совместимость
export default function FriendsPage({ onBack }) {
  const handleError = useErrorHandler();
  const [data, setData] = useState(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [compatFriend, setCompatFriend] = useState(null);

  const load = useCallback(() => api('/api/friends').then(setData).catch(err => handleError(err, 'Не удалось загрузить друзей')), [handleError]);

  useEffect(() => {
    load();
  }, [load]);

  const act = (path, method = 'POST') => api(path, { method }).then(load).catch(err => handleError(err));

  const removeFriend = (friend) => {
    WebApp.showConfirm(`Удалить ${friend.first_name || 'друга'} из друзей?`, (confirmed) => {
      if (confirmed) act(`/api/friends/${friend.id}`, 'DELETE');
    });
  };

  return (
    <Page title="Друзья" onBack={onBack}>
      {!data ? <Spinner /> : (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setIsInviteOpen(true)}
            className="w-full py-3.5 bg-emerald-800 text-[#F5E6D3] font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <UserPlus size={20} /> Пригласить друга
          </button>

          {data.incoming_requests.length > 0 && (
            <section className="mt-3 flex flex-col gap-2">
              <h3 className="text-xs font-bold text-[#F5E6D3]/70 uppercase tracking-wider px-1">Хотят дружить</h3>
              {data.incoming_requests.map(req => (
                <UserRow key={req.request_id} user={req}>
                  <button onClick={() => act(`/api/friends/accept/${req.request_id}`)} aria-label="Принять" className="p-2 text-emerald-400 bg-emerald-800/10 rounded-lg">
                    <Check size={20} />
                  </button>
                  <button onClick={() => act(`/api/friends/reject/${req.request_id}`)} aria-label="Отклонить" className="p-2 text-[#F5E6D3]/60 bg-rose-800 rounded-lg">
                    <X size={20} />
                  </button>
                </UserRow>
              ))}
            </section>
          )}

          {data.outgoing_requests.length > 0 && (
            <section className="mt-3 flex flex-col gap-2">
              <h3 className="text-xs font-bold text-[#F5E6D3]/70 uppercase tracking-wider px-1">Ждут ответа</h3>
              {data.outgoing_requests.map(req => (
                <UserRow key={req.request_id} user={req}>
                  <button onClick={() => act(`/api/friends/reject/${req.request_id}`)} className="px-3 py-1.5 text-sm font-medium text-[#F5E6D3]/70 bg-rose-800 rounded-lg">
                    Отменить
                  </button>
                </UserRow>
              ))}
            </section>
          )}

          <section className="mt-3 flex flex-col gap-3">
            {data.friends.length > 0 && <h3 className="text-xs font-bold text-[#F5E6D3]/70 uppercase tracking-wider px-1">Мои друзья</h3>}
            {data.friends.length === 0 ? (
              <p className="text-[#F5E6D3]/70 text-sm text-center py-6 px-4 leading-relaxed">
                Пока никого. Пригласи друга — и узнайте совместимость и особенности общения друг с другом.
              </p>
            ) : data.friends.map(friend => {
              const bothHavePortraits = friend.has_portrait && data.current_user_has_portrait;
              return (
                <div key={friend.id} className="flex flex-col gap-1.5">
                  <UserRow user={friend}>
                    <button onClick={() => removeFriend(friend)} aria-label="Удалить из друзей" className="p-2 text-[#F5E6D3]/50 hover:text-[#F5E6D3] rounded-lg">
                      <Trash2 size={18} />
                    </button>
                  </UserRow>
                  {friend.has_compatibility || bothHavePortraits ? (
                    <button
                      onClick={() => setCompatFriend(friend)}
                      className="w-full bg-rose-900/80 rounded-2xl px-4 py-3 text-left text-[#F5E6D3] font-bold flex items-center justify-between active:scale-[0.98]"
                    >
                      {friend.has_compatibility ? 'Совместимость' : 'Узнать совместимость'}
                      <ChevronRight size={20} />
                    </button>
                  ) : (
                    <p className="text-xs text-[#F5E6D3]/70 px-2 flex items-start gap-1.5 leading-tight">
                      <Lock size={12} className="shrink-0 mt-0.5" />
                      {data.current_user_has_portrait
                        ? 'Совместимость откроется, когда у друга появится портрет личности'
                        : 'Совместимость откроется, когда у вас обоих будет портрет личности'}
                    </p>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      )}

      {isInviteOpen && data && <InviteModal link={data.invite_link} onClose={() => setIsInviteOpen(false)} />}
      {compatFriend && (
        <CompatibilityPage
          friend={compatFriend}
          myGender={data?.my_gender}
          onBack={() => setCompatFriend(null)}
          onCreated={load}
        />
      )}
    </Page>
  );
}
