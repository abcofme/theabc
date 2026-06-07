import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { User, ChevronDown, ChevronUp, CheckCircle, XCircle, X, ChevronLeft, Lock, Wand2, Trash2, Brain, Activity, Star, ShieldAlert, Sparkles, Target, Heart, Flame, ClipboardList } from 'lucide-react';
import AdminPanel from '../admin/AdminPanel';

const WebApp = window.Telegram.WebApp;
const API_URL = "https://friendly-various-near-across.trycloudflare.com";

export default function ProfileTab() {
  const [categories, setCategories] = useState([]);
  const [totalTests, setTotalTests] = useState(0);
  const [passedTests, setPassedTests] = useState(0);
  const [portraitData, setPortraitData] = useState(null);
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // РќРѕРІС‹Р№ СЃС‚РµР№С‚ РґР»СЏ РІРєР»Р°РґРѕРє
  const [activeSubTab, setActiveSubTab] = useState('tests'); // 'tests' | 'analyses' | 'portrait'

  // РҐСЂР°РЅРёС‚ ID РѕС‚РєСЂС‹С‚РѕР№ РєР°С‚РµРіРѕСЂРёРё (Р°РєРєРѕСЂРґРµРѕРЅ)
  const [openCategory, setOpenCategory] = useState(null);
  
  // РҐСЂР°РЅРёС‚ РґР°РЅРЅС‹Рµ С‚РµСЃС‚Р°, РїРѕ РєРѕС‚РѕСЂРѕРјСѓ РєР»РёРєРЅСѓР»Рё, РґР»СЏ РїРѕРєР°Р·Р° РІ РјРѕРґР°Р»СЊРЅРѕРј РѕРєРЅРµ
  const [selectedResult, setSelectedResult] = useState(null);

  // РџРѕР»СѓС‡Р°РµРј РґР°РЅРЅС‹Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РёР· Telegram (РµСЃР»Рё РѕС‚РєСЂС‹С‚Рѕ РІ Р±СЂР°СѓР·РµСЂРµ - СЃС‚Р°РІРёРј Р·Р°РіР»СѓС€РєСѓ)
  const tgUser = WebApp.initDataUnsafe?.user || {
    first_name: "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ",
    username: "username",
    photo_url: ""
  };

  // Р—Р°РіСЂСѓР¶Р°РµРј РґР°РЅРЅС‹Рµ СЃ Р±СЌРєРµРЅРґР° РїСЂРё РѕС‚РєСЂС‹С‚РёРё РІРєР»Р°РґРєРё
  useEffect(() => {
    if (WebApp.initData) {
      fetch(`${API_URL}/api/profile`, {
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      })
        .then(res => res.json())
        .then(data => {
          setCategories(data.categories || []);
          setTotalTests(data.total_tests || 0);
          setPassedTests(data.passed_tests || 0);
          setPortraitData(data.portrait || null);
          setLoading(false);
        })
        .catch(err => {
          console.error("РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РїСЂРѕС„РёР»СЏ:", err);
          setLoading(false);
        });
    } else {
      // Р—Р°С‰РёС‚Р° РґР»СЏ Р»РѕРєР°Р»СЊРЅРѕРіРѕ С‚РµСЃС‚РёСЂРѕРІР°РЅРёСЏ
      setLoading(false);
    }
  }, []);

  const handleGeneratePortrait = async () => {
    if (portraitData && portraitData.tests_count >= passedTests) {
      WebApp.showAlert("РЈ РІР°СЃ РЅРµС‚ РЅРѕРІС‹С… РїСЂРѕР№РґРµРЅРЅС‹С… С‚РµСЃС‚РѕРІ РґР»СЏ РѕР±РЅРѕРІР»РµРЅРёСЏ РїРѕСЂС‚СЂРµС‚Р°.");
      return;
    }
    setIsGeneratingPortrait(true);
    try {
      const response = await fetch(`${API_URL}/api/portrait/generate`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "РќРµРёР·РІРµСЃС‚РЅР°СЏ РѕС€РёР±РєР° СЃРµСЂРІРµСЂР°");
      }
      setPortraitData(data.portrait);
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      console.error(error);
      WebApp.showAlert(`РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР° РїСЂРё РіРµРЅРµСЂР°С†РёРё РїРѕСЂС‚СЂРµС‚Р°: ${error.message}`);
    } finally {
      setIsGeneratingPortrait(false);
    }
  };

  const handleClearPortrait = async () => {
    try {
      const response = await fetch(`${API_URL}/api/portrait/clear`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      if (response.ok) {
        setPortraitData(null);
        WebApp.HapticFeedback.notificationOccurred('success');
      }
    } catch (error) {
      console.error(error);
    }
  };

  let markdownContent = portraitData ? portraitData.content : "";
  if (portraitData && markdownContent) {
    if (!markdownContent.includes("```json")) {
      // Find the raw array and wrap it in ```json ... ```
      markdownContent = markdownContent.replace(/(\[\s*\{[\s\S]*"leftValue"[\s\S]*\}\s*\])/, "```json\n$1\n```");
    }
  }

  const PortraitScale = ({ left, right, leftValue, rightValue, description }) => (
    <div className="mb-10 w-full">
      <div className="flex justify-between text-base sm:text-lg font-bold text-white mb-3">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div className="h-4 w-full bg-rose-800 rounded-full overflow-hidden flex shadow-inner mb-4">
        <div className="h-full bg-blue-500 transition-all duration-1000 ease-out" style={{ width: `${leftValue}%` }}></div>
        <div className="h-full bg-orange-500 transition-all duration-1000 ease-out" style={{ width: `${rightValue}%` }}></div>
      </div>
      {description && <div className="mt-4"><p className="text-sm sm:text-base text-white font-medium leading-relaxed block break-words whitespace-pre-wrap">{description}</p></div>}
    </div>
  );

  const getMarkdownComponents = (sectionTitle) => {
    let IconComponent = Sparkles;
    let iconColor = "text-white";

    if (sectionTitle.includes('РџРѕРІРµРґРµРЅС‡РµСЃРєРёРµ')) {
      IconComponent = Target;
      iconColor = "text-white";
    } else if (sectionTitle.includes('С†РµРЅРЅРѕСЃС‚РµР№')) {
      IconComponent = Heart;
      iconColor = "text-white";
    } else if (sectionTitle.includes('Р±Р°СЂСЊРµСЂС‹')) {
      IconComponent = Flame;
      iconColor = "text-white";
    }

    return {
      h1: ({node, ...props}) => (
        <h1 className="text-3xl sm:text-4xl font-black text-white text-center mb-10 mt-6 first:mt-2 uppercase drop-shadow-sm break-words" {...props} />
      ),
      h2: ({node, ...props}) => {
        let textStr = "";
        if (typeof props.children === 'string') textStr = props.children;
        else if (Array.isArray(props.children)) textStr = props.children.map(c => typeof c === 'string' ? c : '').join('');
        
        let h2Icon = null;
        if (textStr.includes('РЈСЃС‚РѕР№С‡РёРІС‹Рµ')) h2Icon = <Activity className="text-white inline mb-1 mr-3" size={28} />;
        else if (textStr.includes('РџРѕРІРµРґРµРЅС‡РµСЃРєРёРµ')) h2Icon = <Brain className="text-white inline mb-1 mr-3" size={28} />;
        else if (textStr.includes('С†РµРЅРЅРѕСЃС‚РµР№')) h2Icon = <Star className="text-white inline mb-1 mr-3" size={28} />;
        else if (textStr.includes('Р±Р°СЂСЊРµСЂС‹')) h2Icon = <ShieldAlert className="text-white inline mb-1 mr-3" size={28} />;
        else if (textStr.includes('Р›РёС‡РЅРѕСЃС‚СЊ')) h2Icon = <User className="text-white inline mb-1 mr-3" size={28} />;

        return <h2 className="text-2xl sm:text-3xl font-bold text-white mt-14 mb-8 flex items-center justify-center pb-4 break-words text-center">{h2Icon} {props.children}</h2>
      },
      p: ({node, ...props}) => <p className="text-white leading-loose mb-8 text-base sm:text-lg font-semibold text-left break-words" {...props} />,
      strong: ({node, ...props}) => (
        <strong className="text-white font-black text-lg sm:text-xl break-words" {...props}>
          <IconComponent className={`inline ${iconColor} mb-1 mr-2`} size={22} />
          {props.children}
        </strong>
      ),
      ul: ({node, ...props}) => {
        return <ul className="space-y-6 mb-10 mt-6 pl-1 w-full" {...props} />
      },
      li: ({node, ...props}) => {
        const isBarriers = sectionTitle.includes('Р±Р°СЂСЊРµСЂС‹');
        return (
          <li className={`flex items-start text-base sm:text-lg font-semibold text-white break-words w-full ${isBarriers ? ' pb-4 last:' : ''}`}>
            <IconComponent className={`shrink-0 ${iconColor} mr-3 mt-1`} size={22} />
            <span className="flex-1 block">{props.children}</span>
          </li>
        );
      },
      code: ({node, inline, className, children, ...props}) => {
        const match = /language-(\w+)/.exec(className || '')
        if (!inline && match && match[1] === 'json') {
          const jsonString = String(children).replace(/\n$/, '');
          let scalesData = [];
          try {
            scalesData = JSON.parse(jsonString);
          } catch (e) {
            return <code className={className} {...props}>{children}</code>;
          }
          return (
            <div className="my-10 px-2 sm:px-4">
              {scalesData.map((s, idx) => (
                <PortraitScale key={idx} left={s.left} right={s.right} leftValue={s.leftValue} rightValue={s.rightValue} description={s.description} />
              ))}
            </div>
          )
        }
        return <code className="bg-rose-800 text-white px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
      }
    };
  };

  const toggleCategory = (id) => {
    setOpenCategory(openCategory === id ? null : id);
  };

  const openResultModal = (test) => {
    if (test.passed) {
      setSelectedResult(test);
      WebApp.HapticFeedback.selectionChanged(); // Р›РµРіРєР°СЏ РІРёР±СЂР°С†РёСЏ РїСЂРё РѕС‚РєСЂС‹С‚РёРё
    }
  };

  return (
    <div className="flex flex-col h-full relative select-none bg-transparent">
      {/* 1. РЁРђРџРљРђ РџР РћР¤РР›РЇ (РђРІР°С‚Р°СЂ Рё Р®Р·РµСЂРЅРµР№Рј) */}
      <div className="flex items-center gap-4 p-4 sm:p-6 bg-rose-900/60 rounded-3xl mx-2 mt-2 mb-4 backdrop-blur-sm shadow-sm">
        {tgUser.photo_url ? (
          <img src={tgUser.photo_url} alt="Avatar" className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover shadow-lg" />
        ) : (
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-900/40 text-white rounded-full flex items-center justify-center font-bold text-2xl shadow-inner">
            {tgUser.first_name?.[0] || <User size={32} />}
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <h2 className="text-xl sm:text-2xl font-bold text-white truncate">{tgUser.first_name}</h2>
          <p className="text-sm sm:text-base text-white font-medium truncate">@{tgUser.username}</p>
        </div>
        {['ingenfrid', 'key_crp', 'fondlife'].includes(tgUser.username) && (
          <button 
            onClick={() => setActiveSubTab('admin')}
            className="p-2 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold rounded-xl transition-colors shadow-sm"
          >
            РђРґРјРёРЅ-РїР°РЅРµР»СЊ
          </button>
        )}
      </div>

      {activeSubTab === 'admin' && (
        <AdminPanel onBack={() => setActiveSubTab('tests')} />
      )}

      {activeSubTab === 'tests' && (
        <>
          {/* РџРћР РўР Р•Рў Р›РР§РќРћРЎРўР РљРќРћРџРљР */}
          <div className="mx-4 mb-4 flex flex-col gap-3">
            {!portraitData ? (
              <button 
                onClick={() => {
                  if (!(totalTests > 0 && passedTests === totalTests)) {
                    WebApp.showAlert("РџСЂРѕР№РґРёС‚Рµ РІСЃРµ С‚РµСЃС‚С‹, С‡С‚РѕР±С‹ СЃС„РѕСЂРјРёСЂРѕРІР°С‚СЊ РїРѕСЂС‚СЂРµС‚ Р»РёС‡РЅРѕСЃС‚Рё.");
                    return;
                  }
                  handleGeneratePortrait();
                }}
                disabled={isGeneratingPortrait}
                className={`w-full rounded-2xl p-4 text-left transition-all duration-700 flex items-center justify-between ${
                  (totalTests > 0 && passedTests === totalTests) 
                    ? "bg-rose-900/60 hover:bg-rose-800/80 active:scale-[0.98]" 
                    : "bg-rose-900/30 opacity-70"
                }`}
              >
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white mb-1">РЎС„РѕСЂРјРёСЂРѕРІР°С‚СЊ РїРѕСЂС‚СЂРµС‚</h3>
                  <p className="text-xs sm:text-sm text-white">
                    {isGeneratingPortrait ? 'Р“РµРЅРµСЂР°С†РёСЏ...' : (totalTests > 0 && passedTests === totalTests) ? 'РђРЅР°Р»РёР· РІР°С€РёС… С‚РµСЃС‚РѕРІ' : `РџСЂРѕР№РґРµРЅРѕ ${passedTests} РёР· ${totalTests} С‚РµСЃС‚РѕРІ`}
                  </p>
                </div>
                {isGeneratingPortrait ? (
                  <div className="w-6 h-6 rounded-full animate-spin"></div>
                ) : (
                  <Wand2 className={(totalTests > 0 && passedTests === totalTests) ? "text-white" : "text-white"} size={24} />
                )}
              </button>
            ) : (
              <>
                {passedTests > portraitData.tests_count && (totalTests > 0 && passedTests === totalTests) && (
                  <button 
                    onClick={handleGeneratePortrait}
                    disabled={isGeneratingPortrait}
                    className="w-full bg-rose-900/60 rounded-2xl p-4 text-left hover:bg-rose-800/80 transition-all duration-700 active:scale-[0.98] flex items-center justify-between"
                  >
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-white mb-1">РЎС„РѕСЂРјРёСЂРѕРІР°С‚СЊ Р·Р°РЅРѕРІРѕ</h3>
                      <p className="text-xs sm:text-sm text-white">{isGeneratingPortrait ? 'Р“РµРЅРµСЂР°С†РёСЏ...' : 'РћР±РЅРѕРІРёС‚СЊ РЅР° РѕСЃРЅРѕРІРµ РЅРѕРІС‹С… С‚РµСЃС‚РѕРІ'}</p>
                    </div>
                    {isGeneratingPortrait ? (
                      <div className="w-6 h-6 rounded-full animate-spin"></div>
                    ) : (
                      <Wand2 className="text-white" size={24} />
                    )}
                  </button>
                )}
                <button 
                  onClick={() => setActiveSubTab('portrait')}
                  className="w-full bg-gradient-to-r from-blue-900/30 to-blue-800/10 rounded-2xl p-4 text-left hover:bg-blue-900/40 transition-all duration-700 active:scale-[0.98] flex items-center justify-between"
                >
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">РњРѕР№ РїРѕСЂС‚СЂРµС‚ Р»РёС‡РЅРѕСЃС‚Рё</h3>
                    <p className="text-sm text-white">РћС‚РєСЂС‹С‚СЊ СЃС„РѕСЂРјРёСЂРѕРІР°РЅРЅС‹Р№ РїРѕСЂС‚СЂРµС‚</p>
                  </div>
                  <ClipboardList className="text-white" size={24} />
                </button>
              </>
            )}
          </div>

          {/* 3. РљРћРќРўР•РќРў Р’РљР›РђР”РћРљ (С‚РµРїРµСЂСЊ С‚РѕР»СЊРєРѕ СЂРµР·СѓР»СЊС‚Р°С‚С‹) */}
        <div className="flex-1 overflow-y-auto px-2 pb-6 space-y-3 animate-in fade-in duration-700 flex flex-col">
          {loading ? (
            <div className="flex justify-center items-center py-12 flex-1">
              <div className="animate-spin rounded-full h-10 w-10"></div>
            </div>
          ) : categories.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-white text-center py-12">
              <p>Р—РґРµСЃСЊ Р±СѓРґСѓС‚ РІР°С€Рё СЂРµР·СѓР»СЊС‚Р°С‚С‹ С‚РµСЃС‚РѕРІ.</p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-white px-2 mt-2 mb-2">Р РµР·СѓР»СЊС‚Р°С‚С‹ С‚РµСЃС‚РѕРІ</h2>
              {categories.map(cat => (
              <div key={cat.id} className="bg-rose-900 rounded-2xl overflow-hidden shadow-sm transition-all duration-700">
                {/* РљРЅРѕРїРєР° РєР°С‚РµРіРѕСЂРёРё (РђРєРєРѕСЂРґРµРѕРЅ) */}
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-rose-800/70 transition-colors active:bg-rose-800"
                >
                  <span className="font-semibold text-white text-left text-base sm:text-lg pr-4 leading-tight">
                    {cat.name}
                  </span>
                  {openCategory === cat.id ? (
                    <ChevronUp size={22} className="text-white shrink-0" />
                  ) : (
                    <ChevronDown size={22} className="text-white shrink-0" />
                  )}
                </button>

                {/* РЎРѕРґРµСЂР¶РёРјРѕРµ РєР°С‚РµРіРѕСЂРёРё (РЎРїРёСЃРѕРє С‚РµСЃС‚РѕРІ) */}
                {openCategory === cat.id && (
                  <div className="bg-rose-950/40 px-4 py-2">
                    {cat.tests.length === 0 ? (
                      <div className="text-white text-sm py-3 italic">Р’ СЌС‚РѕР№ РєР°С‚РµРіРѕСЂРёРё РїРѕРєР° РЅРµС‚ С‚РµСЃС‚РѕРІ.</div>
                    ) : (
                      cat.tests.map(test => (
                        <div
                          key={test.id}
                          onClick={() => openResultModal(test)}
                          className={`flex items-center justify-between py-3.5 last: 
                          ${ test.passed ? 'cursor-pointer hover:bg-rose-800/40 -mx-4 px-4 transition-colors active:bg-rose-800' : 'opacity-60 cursor-default' }`}
                        >
                          <span className="text-sm sm:text-base font-medium pr-3 text-white">
                            {test.name}
                          </span>
                          {/* РџР»Р°С€РєР° РџСЂРѕР№РґРµРЅ / РќРµ РїСЂРѕР№РґРµРЅ */}
                          {test.passed ? (
                            <span className="flex items-center gap-1.5 text-white text-[11px] sm:text-xs font-bold uppercase tracking-wider bg-emerald-500/10 px-2.5 py-1.5 rounded-lg whitespace-nowrap shrink-0">
                              <CheckCircle size={14} /> РџСЂРѕР№РґРµРЅ
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-white text-[11px] sm:text-xs font-bold uppercase tracking-wider bg-red-400/10 px-2.5 py-1.5 rounded-lg whitespace-nowrap shrink-0">
                              <XCircle size={14} /> РќРµ РїСЂРѕР№РґРµРЅ
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
            </>
          )}
        </div>
        </>
      )}

      {activeSubTab === 'portrait' && (
        <div className="flex-1 overflow-y-auto px-4 pb-6 animate-in fade-in slide-in-from-right-8 duration-500 flex flex-col">
          <button 
            onClick={() => setActiveSubTab('tests')}
            className="flex items-center gap-2 text-white hover:text-white mb-6 transition-colors self-start"
          >
            <ChevronLeft size={20} />
            <span className="font-medium">РќР°Р·Р°Рґ</span>
          </button>
          {/* Header block removed as requested */}

          {isGeneratingPortrait ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 mb-4"></div>
              <p className="text-white font-medium text-center">РџРѕСЂС‚СЂРµС‚ Р»РёС‡РЅРѕСЃС‚Рё С„РѕСЂРјРёСЂСѓРµС‚СЃСЏ...</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              {portraitData && portraitData.tests_count < totalTests && (
                <div className="mb-6 bg-rose-900/60 p-6 rounded-3xl text-center">
                  <p className="text-white text-sm mb-4 font-medium">Р”РѕР±Р°РІР»РµРЅС‹ РЅРѕРІС‹Рµ С‚РµСЃС‚С‹! РџРѕСЃР»Рµ РїСЂРѕС…РѕР¶РґРµРЅРёСЏ РІС‹ РјРѕР¶РµС‚Рµ СЃС„РѕСЂРјРёСЂРѕРІР°С‚СЊ РЅРѕРІС‹Р№ РїРѕСЂС‚СЂРµС‚ Р»РёС‡РЅРѕСЃС‚Рё</p>
                  {passedTests < totalTests ? (
                    <button disabled className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-rose-800 text-white font-bold cursor-not-allowed">
                      <Lock size={18} /> РњРѕР№ РїРѕСЂС‚СЂРµС‚ Р»РёС‡РЅРѕСЃС‚Рё
                    </button>
                  ) : (
                    <button onClick={handleGeneratePortrait} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-colors active:scale-[0.98] shadow-lg shadow-blue-900/20">
                      <ClipboardList size={18} /> РњРѕР№ РїРѕСЂС‚СЂРµС‚ Р»РёС‡РЅРѕСЃС‚Рё
                    </button>
                  )}
                </div>
              )}

              {portraitData && (
                <div className="px-1 sm:px-4 mb-4 overflow-x-hidden">
                  {markdownContent.split(/(?=^#\s)/m).map((sectionText, i) => {
                    if (!sectionText.trim()) return null;
                    const firstLine = sectionText.trim().split('\n')[0];
                    return (
                      <ReactMarkdown key={i} components={getMarkdownComponents(firstLine)}>
                        {sectionText}
                      </ReactMarkdown>
                    );
                  })}
                </div>
              )}

              {totalTests > 0 && passedTests < totalTests && !portraitData && (
                <div className="flex flex-col items-center text-center mt-auto bg-rose-900/60 p-6 rounded-3xl">
                  <p className="text-white text-sm mb-6">Р§С‚РѕР±С‹ СЃС„РѕСЂРјРёСЂРѕРІР°С‚СЊ РїРѕСЂС‚СЂРµС‚ Р»РёС‡РЅРѕСЃС‚Рё, РїСЂРѕР№РґРёС‚Рµ РІСЃРµ С‚РµСЃС‚С‹.</p>
                  <button disabled className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-rose-800 text-white font-bold cursor-not-allowed">
                    <Lock size={18} /> РњРѕР№ РїРѕСЂС‚СЂРµС‚ Р»РёС‡РЅРѕСЃС‚Рё
                  </button>
                </div>
              )}

              {totalTests > 0 && passedTests === totalTests && !portraitData && (
                <div className="mt-auto">
                  <button onClick={handleGeneratePortrait} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-colors active:scale-[0.98] shadow-lg shadow-blue-900/20">
                    <ClipboardList size={18} /> РњРѕР№ РїРѕСЂС‚СЂРµС‚ Р»РёС‡РЅРѕСЃС‚Рё
                  </button>
                </div>
              )}

              {portraitData && (
                <button 
                  onClick={handleClearPortrait}
                  className="mt-4 flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-red-900/10 text-white hover:bg-red-900/30 transition-colors font-medium text-sm"
                >
                  <Trash2 size={18} /> РћС‡РёСЃС‚РёС‚СЊ РїРѕСЂС‚СЂРµС‚ (Test)
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. Р’РЎРџР›Р«Р’РђР®Р©Р•Р• РћРљРќРћ РЎ Р Р•Р—РЈР›Р¬РўРђРўРћРњ РўР•РЎРўРђ */}
      {selectedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-rose-950/80 backdrop-blur-sm animate-in fade-in duration-700">
          {/* РћР±Р»Р°СЃС‚СЊ РєР»РёРєР° РІРѕРєСЂСѓРі РѕРєРЅР° РґР»СЏ Р·Р°РєСЂС‹С‚РёСЏ */}
          <div className="absolute inset-0" onClick={() => setSelectedResult(null)}></div>
          <div className="relative bg-rose-900 rounded-[2rem] w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-700">
            {/* Р—Р°РіРѕР»РѕРІРѕРє РјРѕРґР°Р»СЊРЅРѕРіРѕ РѕРєРЅР° */}
            <div className="p-5 sm:p-6 flex justify-between items-start">
              <div className="pr-4">
                <span className="text-white text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-1.5 block">
                  Р РµР·СѓР»СЊС‚Р°С‚ С‚РµСЃС‚РёСЂРѕРІР°РЅРёСЏ
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-white leading-tight">
                  {selectedResult.name}
                </h3>
              </div>
              <button onClick={() => setSelectedResult(null)} className="p-2 bg-rose-800/50 hover:bg-rose-800 rounded-xl text-white hover:text-white transition-colors hover: shrink-0">
                <X size={20} />
              </button>
            </div>
            {/* РўРµРєСЃС‚ СЂРµР·СѓР»СЊС‚Р°С‚Р° */}
            <div className="p-5 sm:p-6 overflow-y-auto">
              <div className="text-white text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
                {selectedResult.result_text || 'РќРµС‚ РґРµС‚Р°Р»СЊРЅРѕРіРѕ РѕРїРёСЃР°РЅРёСЏ СЂРµР·СѓР»СЊС‚Р°С‚Р°.'}
              </div>
            </div>
            {/* РќРёР¶РЅСЏСЏ РєРЅРѕРїРєР° */}
            <div className="p-4 sm:p-5 bg-rose-950/30 rounded-b-[2rem]">
              <button onClick={() => setSelectedResult(null)} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition-all active:bg-blue-700 shadow-lg shadow-blue-900/20">
                РћС‚Р»РёС‡РЅРѕ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
