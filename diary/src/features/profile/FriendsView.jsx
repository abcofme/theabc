import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Search, UserPlus, Check, X, Trash2, Clock, User, Lock, Sparkles, Target, Heart, Flame, Activity, Brain, ShieldAlert } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import GenerationProgress from '../../components/GenerationProgress';


const WebApp = window.Telegram.WebApp;
const API_URL = window.location.origin;

export default function FriendsView({ onBack }) {
  const [activeTab, setActiveTab] = useState('friends'); // friends, search, requests
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [currentUserHasPortrait, setCurrentUserHasPortrait] = useState(false);
  const [activeCompatFriend, setActiveCompatFriend] = useState(null);
  const [compatType, setCompatType] = useState('friendly');
  const [myGender, setMyGender] = useState('');
  const [friendGender, setFriendGender] = useState('');
  const [isGeneratingCompat, setIsGeneratingCompat] = useState(false);
  const [compatResult, setCompatResult] = useState(null);

  const fetchFriends = async () => {
    try {
      const res = await fetch(`${API_URL}/api/friends`, {
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
        setIncomingRequests(data.incoming_requests || []);
        setOutgoingRequests(data.outgoing_requests || []);
        setCurrentUserHasPortrait(data.current_user_has_portrait || false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFriends();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        handleSearch(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleSearch = async (query) => {
    setIsSearching(true);
    try {
      const res = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(query)}`, {
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const sendRequest = async (targetId) => {
    try {
      const res = await fetch(`${API_URL}/api/friends/request/${targetId}`, {
        method: 'POST',
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      if (res.ok) {
        WebApp.showAlert("Заявка отправлена!");
        fetchFriends();
      } else {
        const err = await res.json();
        WebApp.showAlert(err.message || "Ошибка при отправке");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const acceptRequest = async (requestId) => {
    try {
      const res = await fetch(`${API_URL}/api/friends/accept/${requestId}`, {
        method: 'POST',
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      if (res.ok) fetchFriends();
    } catch (e) {
      console.error(e);
    }
  };

  const rejectRequest = async (requestId) => {
    try {
      const res = await fetch(`${API_URL}/api/friends/reject/${requestId}`, {
        method: 'POST',
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      if (res.ok) fetchFriends();
    } catch (e) {
      console.error(e);
    }
  };

  const removeFriend = async (friendId) => {
    if (!window.confirm("Удалить пользователя из друзей?")) return;
    try {
      const res = await fetch(`${API_URL}/api/friends/${friendId}`, {
        method: 'DELETE',
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      if (res.ok) fetchFriends();
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCompatibility = async (friendId) => {
    setActiveTab('compatibility_result');
    setIsGeneratingCompat(true);
    try {
      const res = await fetch(`${API_URL}/api/friends/compatibility/${friendId}`, {
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCompatResult(data.content);
      } else {
        WebApp.showAlert("Ошибка загрузки совместимости");
        setActiveTab('friends');
      }
    } catch (e) {
      console.error(e);
      setActiveTab('friends');
    } finally {
      setIsGeneratingCompat(false);
    }
  };

  const handleGenerateCompatibility = async () => {
    if (!myGender || !friendGender) {
      WebApp.showAlert('Пожалуйста, укажите пол обоих пользователей');
      return;
    }
    setActiveTab('compatibility_result');
    setIsGeneratingCompat(true);
    setCompatResult(null);
    try {
      const res = await fetch(`${API_URL}/api/friends/compatibility`, {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${WebApp.initData}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          friend_id: activeCompatFriend.id,
          type: compatType,
          my_gender: myGender,
          friend_gender: friendGender
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.detail) {
          WebApp.showAlert(data.detail);
          setActiveTab('compatibility_form');
          return;
        }
        setCompatResult(data.content);
        fetchFriends(); // update has_compatibility status
      } else {
        const err = await res.json();
        WebApp.showAlert(err.detail || 'Произошла ошибка при генерации');
        setActiveTab('compatibility_form');
      }
    } catch (e) {
      console.error(e);
      setActiveTab('compatibility_form');
    } finally {
      setIsGeneratingCompat(false);
    }
  };

  const getMarkdownComponents = () => {
    return {
      h1: ({node, ...props}) => <h1 className="text-3xl sm:text-4xl font-black text-[#F5E6D3] text-center mb-10 mt-6 uppercase drop-shadow-sm break-words" {...props} />,
      h2: ({node, ...props}) => <h2 className="text-2xl sm:text-3xl font-bold text-[#F5E6D3] mt-14 mb-8 flex items-center justify-center pb-4 break-words text-center"><Sparkles className="text-[#F5E6D3] inline mb-1 mr-3" size={28} /> {props.children}</h2>,
      h3: ({node, ...props}) => <h3 className="text-xl sm:text-2xl font-bold text-[#F5E6D3] mt-10 mb-6 flex items-center pb-2 break-words text-left" {...props} />,
      p: ({node, ...props}) => <p className="text-[#F5E6D3] leading-loose mb-8 text-base sm:text-lg font-semibold text-left break-words" {...props} />,
      strong: ({node, ...props}) => <strong className="text-[#F5E6D3] font-black text-lg sm:text-xl break-words" {...props} />,
      ul: ({node, ...props}) => <ul className="space-y-6 mb-10 mt-6 pl-1 w-full" {...props} />,
      li: ({node, ...props}) => (
        <li className="flex items-start text-base sm:text-lg font-semibold text-[#F5E6D3] break-words w-full">
          <Heart className="shrink-0 text-[#F5E6D3] mr-3 mt-1" size={22} />
          <span className="flex-1 block">{props.children}</span>
        </li>
      ),
    };
  };

  const UserCard = ({ user, children }) => (
    <div className="flex items-center justify-between bg-rose-900/60 p-4 rounded-2xl mb-3">
      <div className="flex items-center gap-3">
        {user.photo_url ? (
          <img src={user.photo_url} alt="" className="w-12 h-12 rounded-full object-cover shadow-sm" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-rose-800 flex items-center justify-center shadow-sm">
            {user.first_name ? (
              <span className="text-lg font-bold text-[#F5E6D3]">{user.first_name[0]}</span>
            ) : user.username ? (
              <span className="text-lg font-bold text-[#F5E6D3]">{user.username[0].toUpperCase()}</span>
            ) : (
              <User className="text-[#F5E6D3]" size={24} />
            )}
          </div>
        )}
        <div>
          <p className="text-[#F5E6D3] font-bold text-sm sm:text-base">
            {user.first_name || 'Без имени'}
          </p>
          {user.username && (
            <p className="text-[#F5E6D3]/80 text-xs sm:text-sm">@{user.username}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        {children}
      </div>
    </div>
  );

  return (
    <div className="px-2 sm:px-4 pt-0 pb-20 animate-in fade-in slide-in-from-right-8 duration-300 min-h-full flex flex-col">
      <div className="flex items-center mb-4 mx-2">
        <button 
          onClick={() => {
            if (activeTab === 'compatibility_form' || activeTab === 'compatibility_result') {
              setActiveTab('friends');
              setCompatResult(null);
            } else {
              onBack();
            }
          }}
          className="p-2 -ml-2 text-[#F5E6D3] hover:bg-rose-800/50 rounded-xl transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <h2 className="text-2xl font-black text-[#F5E6D3] ml-2">
          {(activeTab === 'compatibility_form' || activeTab === 'compatibility_result') ? 'Совместимость' : 'Друзья'}
        </h2>
      </div>

      {(activeTab !== 'compatibility_form' && activeTab !== 'compatibility_result') && (
        <div className="flex bg-rose-900/40 rounded-xl p-1 mb-4 mx-2">
        <button
          onClick={() => setActiveTab('friends')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'friends' ? 'bg-rose-800 text-[#F5E6D3] shadow-sm' : 'text-[#F5E6D3]/60 hover:text-[#F5E6D3]/80'
          }`}
        >
          Мои друзья
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'search' ? 'bg-rose-800 text-[#F5E6D3] shadow-sm' : 'text-[#F5E6D3]/60 hover:text-[#F5E6D3]/80'
          }`}
        >
          Найти
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`flex-1 relative py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'requests' ? 'bg-rose-800 text-[#F5E6D3] shadow-sm' : 'text-[#F5E6D3]/60 hover:text-[#F5E6D3]/80'
          }`}
        >
          Запросы
          {incomingRequests.length > 0 && (
            <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          )}
        </button>
      </div>
      )}

      <div className="flex-1 flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#F5E6D3]"></div>
          </div>
        ) : (
          <>
            {activeTab === 'friends' && (
              <div>
                {friends.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-[#F5E6D3]/80">У вас пока нет добавленных друзей.</p>
                    <button 
                      onClick={() => setActiveTab('search')}
                      className="mt-4 text-emerald-600 font-medium hover:underline"
                    >
                      Найти друзей
                    </button>
                  </div>
                ) : (
                  friends.map(f => (
                    <div key={f.id} className="mb-4">
                      <UserCard user={f}>
                        {!f.has_compatibility && (
                          <button 
                            onClick={() => {
                              if (f.has_portrait && currentUserHasPortrait) {
                                setActiveCompatFriend(f);
                                setActiveTab('compatibility_form');
                              }
                            }}
                            disabled={!(f.has_portrait && currentUserHasPortrait)}
                            className={`px-3 py-2 text-sm font-bold rounded-xl transition-colors ${
                              f.has_portrait && currentUserHasPortrait 
                                ? 'bg-emerald-800 hover:bg-emerald-800 text-white shadow-md shadow-emerald-900/40' 
                                : 'bg-rose-800 text-white/50 cursor-not-allowed'
                            }`}
                          >
                            Узнать совместимость
                          </button>
                        )}
                      </UserCard>
                      {!f.has_compatibility && !(f.has_portrait && currentUserHasPortrait) && (
                        <p className="text-[11px] sm:text-xs text-[#F5E6D3]/70 px-2 mt-[-4px] flex items-start gap-1 leading-tight">
                          <Lock size={12} className="shrink-0 mt-0.5" /> 
                          Для анализа совместимости, необходимы портреты личности обоих пользователей!
                        </p>
                      )}
                      {f.has_compatibility && (
                        <button
                          onClick={() => {
                            setActiveCompatFriend(f);
                            fetchCompatibility(f.id);
                          }}
                          className="w-full bg-rose-900/80 rounded-2xl p-4 text-left hover:bg-rose-800/80 transition-all duration-300 flex items-center justify-between shadow-sm mt-[-4px]"
                        >
                          <div>
                            <h3 className="text-base font-bold text-[#F5E6D3]">Совместимость</h3>
                          </div>
                          <ChevronLeft className="text-[#F5E6D3] rotate-180" size={20} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'search' && (
              <div className="flex flex-col flex-1">
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#F5E6D3]/60" size={20} />
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Введите @username"
                    className="w-full bg-rose-900/60 text-[#F5E6D3] placeholder:text-[#F5E6D3] rounded-xl py-3 pl-10 pr-4 focus:outline-none"
                  />
                </div>
                
                {isSearching ? (
                  <div className="text-center py-6 text-[#F5E6D3]/60">Поиск...</div>
                ) : searchResults.length > 0 ? (
                  searchResults.map(u => {
                    const isFriend = friends.some(f => f.id === u.id);
                    const isIncoming = incomingRequests.some(req => req.id === u.id);
                    const isOutgoing = outgoingRequests.some(req => req.id === u.id);
                    
                    return (
                      <UserCard key={u.id} user={u}>
                        {isFriend ? (
                          <span className="text-emerald-400 text-sm font-medium pr-2">В друзьях</span>
                        ) : isOutgoing ? (
                          <span className="text-emerald-500 text-sm font-medium pr-2 flex items-center gap-1">
                            <Clock size={16} /> Запрос отправлен
                          </span>
                        ) : isIncoming ? (
                          <button 
                            onClick={() => setActiveTab('requests')}
                            className="bg-emerald-800/30 text-emerald-500 px-3 py-1.5 rounded-lg text-sm font-medium"
                          >
                            Ответить
                          </button>
                        ) : (
                          <button 
                            onClick={() => sendRequest(u.id)}
                            className="bg-emerald-800 hover:bg-emerald-800 text-white p-2 rounded-lg transition-colors shadow-lg shadow-emerald-950/50"
                          >
                            <UserPlus size={20} />
                          </button>
                        )}
                      </UserCard>
                    );
                  })
                ) : searchQuery.length >= 2 ? (
                  <div className="text-center py-6 text-[#F5E6D3]/60">Пользователи не найдены</div>
                ) : null}
              </div>
            )}

            {activeTab === 'requests' && (
              <div>
                {incomingRequests.length === 0 && outgoingRequests.length === 0 && (
                  <div className="text-center py-10 text-[#F5E6D3]/80">
                    Нет активных запросов.
                  </div>
                )}
                
                {incomingRequests.length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-[#F5E6D3] font-bold mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-800"></span>
                      Входящие запросы
                    </h3>
                    {incomingRequests.map(req => (
                      <UserCard key={req.request_id} user={req}>
                        <button 
                          onClick={() => acceptRequest(req.request_id)}
                          className="p-2 text-emerald-400 bg-emerald-800/10 hover:bg-emerald-800/20 rounded-lg transition-colors"
                        >
                          <Check size={20} />
                        </button>
                        <button 
                          onClick={() => rejectRequest(req.request_id)}
                          className="p-2 text-[#F5E6D3]/60 bg-rose-800 hover:bg-rose-700 rounded-lg transition-colors"
                        >
                          <X size={20} />
                        </button>
                      </UserCard>
                    ))}
                  </div>
                )}

                {outgoingRequests.length > 0 && (
                  <div>
                    <h3 className="text-[#F5E6D3]/80 font-bold mb-3">Исходящие запросы</h3>
                    {outgoingRequests.map(req => (
                      <UserCard key={req.request_id} user={req}>
                        <button 
                          onClick={() => rejectRequest(req.request_id)}
                          className="px-3 py-1.5 text-sm font-medium text-[#F5E6D3]/60 bg-rose-800 hover:bg-rose-700 rounded-lg transition-colors"
                        >
                          Отменить
                        </button>
                      </UserCard>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'compatibility_form' && activeCompatFriend && (
              <div className="flex flex-col gap-6 mx-2 animate-in fade-in duration-300 pb-10">
                <div className="bg-rose-900/80 rounded-3xl p-6 text-center">
                  <h3 className="text-[#F5E6D3] text-lg font-bold mb-1">
                    Совместимость с @{activeCompatFriend.username}
                  </h3>
                  <p className="text-[#F5E6D3]/70 text-sm">
                    Настройте параметры анализа
                  </p>
                </div>

                <div className="bg-rose-900/40 p-5 rounded-3xl flex flex-col gap-5">
                  <div>
                    <p className="text-[#F5E6D3] font-bold mb-3">1. Тип совместимости:</p>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setCompatType('friendly')}
                        className={`flex-1 py-3 rounded-xl font-medium transition-colors ${compatType === 'friendly' ? 'bg-emerald-800 text-white' : 'bg-rose-800 text-[#F5E6D3]/70'}`}
                      >
                        Дружеская
                      </button>
                      <button 
                        onClick={() => setCompatType('partner')}
                        className={`flex-1 py-3 rounded-xl font-medium transition-colors ${compatType === 'partner' ? 'bg-emerald-800 text-white' : 'bg-rose-800 text-[#F5E6D3]/70'}`}
                      >
                        Партнерская
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-[#F5E6D3] font-bold mb-3">2. Укажите пол:</p>
                    <div className="flex flex-col gap-4">
                      <div>
                        <p className="text-[#F5E6D3]/80 text-sm mb-2">Ваш пол:</p>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setMyGender('Мужской')}
                            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${myGender === 'Мужской' ? 'bg-emerald-800 text-white' : 'bg-rose-800 text-[#F5E6D3]/70'}`}
                          >
                            Мужской
                          </button>
                          <button 
                            onClick={() => setMyGender('Женский')}
                            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${myGender === 'Женский' ? 'bg-emerald-800 text-white' : 'bg-rose-800 text-[#F5E6D3]/70'}`}
                          >
                            Женский
                          </button>
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-[#F5E6D3]/80 text-sm mb-2">Пол @{activeCompatFriend.username}:</p>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setFriendGender('Мужской')}
                            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${friendGender === 'Мужской' ? 'bg-emerald-800 text-white' : 'bg-rose-800 text-[#F5E6D3]/70'}`}
                          >
                            Мужской
                          </button>
                          <button 
                            onClick={() => setFriendGender('Женский')}
                            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${friendGender === 'Женский' ? 'bg-emerald-800 text-white' : 'bg-rose-800 text-[#F5E6D3]/70'}`}
                          >
                            Женский
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={handleGenerateCompatibility}
                  className="w-full bg-emerald-800 hover:bg-emerald-800 text-white font-bold py-4 rounded-2xl transition-colors active:scale-[0.98] mt-4 shadow-lg shadow-emerald-900/40"
                >
                  Узнать совместимость
                </button>
              </div>
            )}

            {activeTab === 'compatibility_result' && (
              <div className="flex flex-col mx-2 animate-in fade-in duration-300 h-full">
                {isGeneratingCompat ? (
                  <div className="flex flex-col items-center justify-center flex-1 py-20 px-4">
                    <GenerationProgress text="Анализ совместимости..." />
                  </div>
                ) : compatResult ? (
                  <div className="bg-rose-900/80 rounded-3xl p-5 sm:p-8 shadow-xl backdrop-blur-sm overflow-x-hidden mb-10">
                    <ReactMarkdown components={getMarkdownComponents()}>
                      {compatResult}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex items-center justify-center flex-1">
                    <p className="text-red-400">Ошибка загрузки результата.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
