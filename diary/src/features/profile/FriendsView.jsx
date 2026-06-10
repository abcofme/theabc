import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Search, UserPlus, Check, X, Trash2, Clock, User } from 'lucide-react';

const WebApp = window.Telegram.WebApp;
const API_URL = "https://friendly-various-near-across.trycloudflare.com";

export default function FriendsView({ onBack }) {
  const [activeTab, setActiveTab] = useState('friends'); // friends, search, requests
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
    <div className="px-4 sm:px-6 pt-6 pb-20 animate-in fade-in slide-in-from-right-8 duration-300 min-h-full flex flex-col">
      <div className="flex items-center mb-6">
        <button 
          onClick={onBack}
          className="p-2 -ml-2 text-[#F5E6D3] hover:bg-rose-800/50 rounded-xl transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <h2 className="text-2xl font-black text-[#F5E6D3] ml-2">Друзья</h2>
      </div>

      <div className="flex bg-rose-900/40 rounded-xl p-1 mb-6">
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
                      className="mt-4 text-blue-400 font-medium hover:underline"
                    >
                      Найти друзей
                    </button>
                  </div>
                ) : (
                  friends.map(f => (
                    <UserCard key={f.id} user={f}>
                      <button 
                        onClick={() => removeFriend(f.id)}
                        className="p-2 text-red-400 hover:bg-red-400/20 rounded-lg transition-colors"
                      >
                        <Trash2 size={20} />
                      </button>
                    </UserCard>
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
                    className="w-full bg-rose-900/60 text-[#F5E6D3] placeholder-rose-300/50 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
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
                          <span className="text-green-400 text-sm font-medium pr-2">В друзьях</span>
                        ) : isOutgoing ? (
                          <span className="text-blue-300 text-sm font-medium pr-2 flex items-center gap-1">
                            <Clock size={16} /> Запрос отправлен
                          </span>
                        ) : isIncoming ? (
                          <button 
                            onClick={() => setActiveTab('requests')}
                            className="bg-blue-600/30 text-blue-300 px-3 py-1.5 rounded-lg text-sm font-medium"
                          >
                            Ответить
                          </button>
                        ) : (
                          <button 
                            onClick={() => sendRequest(u.id)}
                            className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg transition-colors shadow-lg shadow-blue-900/50"
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
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Входящие запросы
                    </h3>
                    {incomingRequests.map(req => (
                      <UserCard key={req.request_id} user={req}>
                        <button 
                          onClick={() => acceptRequest(req.request_id)}
                          className="p-2 text-green-400 bg-green-400/10 hover:bg-green-400/20 rounded-lg transition-colors"
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
          </>
        )}
      </div>
    </div>
  );
}
