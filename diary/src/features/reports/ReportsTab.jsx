import React, { useState, useEffect } from 'react';
import { Repeat, Zap, ChevronLeft, ChevronDown, ChevronUp, Plus, Target, Sparkles, Calendar, FileText, Star, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import bookIcon from '../../assets/book_icon.png';

const WebApp = window.Telegram.WebApp;
const API_URL = "https://friendly-various-near-across.trycloudflare.com";

export default function ReportsTab() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [openCategory, setOpenCategory] = useState(null);
  const [activeForm, setActiveForm] = useState(null);
  const [viewReport, setViewReport] = useState(null);
  
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (WebApp.initData) {
      fetch(`${API_URL}/api/reports`, {
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      })
      .then(res => res.json())
      .then(data => {
        setReports(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const handleDeleteReport = async (e, reportId) => {
    e.stopPropagation();
    if (!window.confirm("Удалить этот отчет?")) return;
    try {
      const res = await fetch(`${API_URL}/api/reports/${reportId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${WebApp.initData}` }
      });
      if (!res.ok) throw new Error("Failed to delete");
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (err) {
      console.error(err);
      WebApp.showAlert("Ошибка при удалении отчета");
    }
  };

  const reportTypes = [
    {
      id: 'repeating_events',
      title: 'Какие события чаще всего повторяются в моей жизни?',
      desc: 'Узнайте, какие ситуации в вашей жизни имеют свойство повторяться, и проанализируйте реакции на них.',
      icon: Repeat,
      color: 'text-blue-500',
      bg: 'bg-blue-600/20'
    },
    {
      id: 'effective_reactions',
      title: 'На какие ситуации я реагирую эффективно, а на какие нет?',
      desc: 'Узнайте, насколько ваша реакция на событие эффективна.',
      icon: Zap,
      color: 'text-blue-500',
      bg: 'bg-blue-600/20'
    }
  ];

  const handleGenerate = async (type) => {
    if (selectedPeriod === 'custom' && !customStart) {
      WebApp.showAlert("Пожалуйста, укажите начальную дату.");
      return;
    }
    
    setIsGenerating(true);
    try {
      const payload = {
        report_type: type,
        period: selectedPeriod,
        start_date: selectedPeriod === 'custom' ? customStart : null,
        end_date: selectedPeriod === 'custom' && customEnd ? customEnd : null
      };
      
      const res = await fetch(`${API_URL}/api/reports/generate`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WebApp.initData}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Ошибка генерации");
      
      setReports(prev => [data, ...prev]);
      setActiveForm(null);
      setViewReport(data);
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch (e) {
      WebApp.showAlert(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const getMarkdownComponents = () => ({
    h1: ({node, ...props}) => <h1 className="text-2xl sm:text-3xl font-black text-[#F5E6D3] text-center mb-8 mt-4 uppercase drop-shadow-sm break-words" {...props} />,
    h2: ({node, ...props}) => <h2 className="text-xl sm:text-2xl font-bold text-[#F5E6D3] mt-10 mb-6 flex items-center justify-center pb-4 break-words text-center"><Sparkles className="text-[#F5E6D3] inline mb-1 mr-3" size={24} /> {props.children}</h2>,
    p: ({node, ...props}) => <p className="text-[#F5E6D3] leading-relaxed mb-6 text-base font-medium text-left break-words" {...props} />,
    strong: ({node, ...props}) => <strong className="text-[#F5E6D3] font-bold text-lg break-words" {...props} />,
    ul: ({node, ...props}) => <ul className="space-y-4 mb-8 mt-4 pl-1 w-full" {...props} />,
    li: ({node, ...props}) => (
      <li className="flex items-start text-base font-medium text-[#F5E6D3] break-words w-full">
        <Target className="shrink-0 text-[#F5E6D3] mr-3 mt-1" size={20} />
        <span className="flex-1 block">{props.children}</span>
      </li>
    ),
  });

  if (viewReport) {
    return (
      <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-8 duration-300 max-w-2xl mx-auto w-full pt-4 px-2 pb-safe">
        <button 
          onClick={() => setViewReport(null)}
          className="flex items-center gap-2 text-[#F5E6D3] hover:text-[#F5E6D3] mb-6 transition-colors self-start"
        >
          <ChevronLeft size={20} />
          <span className="font-medium">Назад</span>
        </button>
        
        <div className="bg-rose-900/80 rounded-3xl p-5 sm:p-8 mb-6 shadow-xl backdrop-blur-sm">
          <div className="flex items-center gap-2 text-[#F5E6D3] mb-6 pb-4">
            <Calendar size={16} />
            <span className="text-sm font-medium">Отчет от {new Date(viewReport.created_at).toLocaleDateString('ru-RU')}</span>
          </div>
          <ReactMarkdown components={getMarkdownComponents()}>
            {viewReport.content}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  if (activeForm) {
    const rType = reportTypes.find(r => r.id === activeForm);
    return (
      <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-8 duration-300 max-w-2xl mx-auto w-full pt-4 px-2">
        <button 
          onClick={() => setActiveForm(null)}
          className="flex items-center gap-2 text-[#F5E6D3] hover:text-[#F5E6D3] mb-6 transition-colors self-start"
        >
          <ChevronLeft size={20} />
          <span className="font-medium">Назад</span>
        </button>
        
        <div className="flex items-start gap-4 mb-6">
          <div className={`p-3 rounded-xl shrink-0 mt-1 ${rType.bg}`}>
            <rType.icon className={rType.color} size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-2 leading-tight text-[#F5E6D3]">{rType.title}</h2>
            <p className="text-sm text-[#F5E6D3] leading-relaxed">{rType.desc}</p>
          </div>
        </div>

        <div className="bg-rose-900 rounded-2xl p-5 mb-6">
          <h3 className="text-sm font-bold text-[#F5E6D3] uppercase tracking-wider mb-4">Выбрать период</h3>
          <div className="relative mb-4">
            <select 
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full appearance-none bg-rose-950 text-[#F5E6D3] text-base rounded-xl p-4 pr-10 focus:outline-none focus: transition-colors"
            >
              <option value="week">За последнюю неделю</option>
              <option value="month">За последний месяц</option>
              <option value="3months">За последние 3 месяца</option>
              <option value="year">За год</option>
              <option value="all">За всё время</option>
              <option value="custom">Указать свой период</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-[#F5E6D3] pointer-events-none" size={20} />
          </div>
          
          {selectedPeriod === 'custom' && (
            <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div>
                <label className="text-xs text-[#F5E6D3] uppercase tracking-wider mb-1 block">От:</label>
                <input 
                  type="date" 
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full bg-rose-950 text-[#F5E6D3] text-base rounded-xl p-3 focus:outline-none focus:"
                />
              </div>
              <div>
                <label className="text-xs text-[#F5E6D3] uppercase tracking-wider mb-1 block">До (необязательно):</label>
                <input 
                  type="date" 
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full bg-rose-950 text-[#F5E6D3] text-base rounded-xl p-3 focus:outline-none focus:"
                />
              </div>
            </div>
          )}
        </div>

        <button 
          onClick={() => handleGenerate(activeForm)}
          disabled={isGenerating}
          className="w-full bg-blue-600 disabled:bg-blue-900/50 hover:bg-blue-500 text-[#F5E6D3] font-bold py-4 rounded-2xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <><div className="w-5 h-5 rounded-full animate-spin"></div> Анализ ИИ...</>
          ) : (
            'Проанализировать'
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-2xl mx-auto w-full pt-4 pb-20 overflow-y-scroll">
      <div className="flex justify-center mb-2">
        <img src={bookIcon} alt="Поведенческий код" className="w-24 h-24 object-contain" />
      </div>
      <h2 className="text-2xl font-bold text-[#F5E6D3] mb-2 px-4 text-center">Поведенческий код</h2>
      
      <p className="text-sm text-[#F5E6D3] text-center px-4 mb-8 leading-relaxed">
        Здесь собраны отчеты, которые позволяют вам исследовать себя на основании ваших результатов тестирований, портрета личности, ежедневных записях о событиях и реакциях в дневнике, составить полную Азбуку Я.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-2">
          {reportTypes.map(rtype => {
            const typeReports = reports.filter(r => 
              r.title === rtype.title || 
              (rtype.id === 'repeating_events' && r.title.includes('Повторяющиеся')) || 
              (rtype.id === 'effective_reactions' && r.title.includes('эффективно'))
            );
            const isOpen = openCategory === rtype.id;
            
            return (
              <div key={rtype.id} className="bg-rose-900/80 rounded-2xl overflow-hidden transition-all duration-300">
                <button 
                  onClick={() => setOpenCategory(isOpen ? null : rtype.id)}
                  className="w-full p-5 text-left hover:bg-rose-800/80 transition-all flex items-start gap-4"
                >
                  <div className={`p-3 rounded-xl shrink-0 mt-1 ${rtype.bg}`}>
                    <rtype.icon className={rtype.color} size={24} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold mb-2 leading-tight text-[#F5E6D3]">{rtype.title}</h3>
                    <p className="text-sm text-[#F5E6D3] leading-relaxed">{rtype.desc}</p>
                  </div>
                  <div className="mt-2 text-[#F5E6D3]">
                    {isOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                  </div>
                </button>
                
                {isOpen && (
                  <div className="p-5 bg-rose-950/50 flex flex-col gap-3 animate-slide-down">
                    <button 
                      onClick={() => setActiveForm(rtype.id)}
                      className="w-full py-3 bg-rose-800 hover:bg-rose-700 text-[#F5E6D3] font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                      <Plus size={18} />
                      Сформировать новый отчет
                    </button>
                    
                    {typeReports.length > 0 ? (
                      <div className="mt-4 flex flex-col gap-2">
                        <span className="text-xs font-bold text-[#F5E6D3] uppercase tracking-wider mb-2">История отчетов</span>
                        {typeReports.map(r => (
                          <div key={r.id} className="relative group w-full">
                            <button
                              onClick={() => setViewReport(r)}
                              className="w-full text-left bg-rose-900 py-4 pl-4 pr-12 rounded-xl hover:bg-rose-800/80 transition-colors flex items-center justify-between"
                            >
                              <div className="flex items-center gap-3">
                                <FileText className="text-[#F5E6D3] transition-colors" size={20} />
                                <div>
                                  <div className="text-[#F5E6D3] font-medium mb-1">Отчет от {new Date(r.created_at).toLocaleDateString('ru-RU')}</div>
                                  <div className="text-xs text-[#F5E6D3]">
                                    {r.period_start ? `${new Date(r.period_start).toLocaleDateString('ru-RU')} - ` : ''} 
                                    {r.period_end ? new Date(r.period_end).toLocaleDateString('ru-RU') : 'За все время'}
                                  </div>
                                </div>
                              </div>
                            <ChevronLeft className="text-[#F5E6D3] rotate-180" size={16} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteReport(e, r.id)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-[#F5E6D3]/60 hover:text-[#F5E6D3] hover:bg-red-500/20 rounded-xl transition-colors active:scale-95"
                            title="Удалить отчет"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[#F5E6D3] text-center mt-4">Вы еще не формировали этот тип отчета.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-10 mb-8 mx-4 p-5 bg-blue-600 rounded-2xl text-center shadow-md">
        <p className="text-sm font-medium text-[#F5E6D3] leading-relaxed">
          Команда проекта «Азбука Я» регулярно добавляет новые отчеты.<br/>Следите за обновлениями!
        </p>
        <div className="flex items-center justify-center gap-2 mt-4 text-[#F5E6D3]/70">
          <Star size={12} className="animate-pulse" />
          <Star size={16} className="animate-pulse delay-75" />
          <Star size={12} className="animate-pulse delay-150" />
        </div>
      </div>
    </div>
  );
}
