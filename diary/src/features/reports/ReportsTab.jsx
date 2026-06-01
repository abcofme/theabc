import React, { useState } from 'react';
import { Repeat, Zap, ChevronLeft, ChevronDown } from 'lucide-react';

export default function ReportsTab() {
  const [activeReport, setActiveReport] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('all');

  if (activeReport === 'repeating_events') {
    return (
      <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-8 duration-500 max-w-2xl mx-auto w-full pt-4 px-2">
        <button 
          onClick={() => setActiveReport(null)}
          className="flex items-center gap-2 text-neutral-400 hover:text-white mb-6 transition-colors self-start"
        >
          <ChevronLeft size={20} />
          <span className="font-medium">Назад</span>
        </button>
        
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 bg-blue-500/10 rounded-xl shrink-0 mt-1">
            <Repeat className="text-blue-400" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-blue-400 mb-2 leading-tight">Какие события чаще всего повторяются в моей жизни?</h2>
            <p className="text-sm text-neutral-400 leading-relaxed">Узнайте, какие ситуации в вашей жизни имеют свойство повторяться, и проанализируйте реакции на них.</p>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 mb-6">
          <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wider mb-4">Выбрать период</h3>
          <div className="relative">
            <select 
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full appearance-none bg-neutral-950 border border-neutral-800 text-white text-base rounded-xl p-4 pr-10 focus:outline-none focus:border-blue-500/50 transition-colors"
            >
              <option value="week">За последнюю неделю</option>
              <option value="month">За последний месяц</option>
              <option value="3months">За последние 3 месяца</option>
              <option value="year">За год</option>
              <option value="all">За всё время</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={20} />
          </div>
        </div>

        <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-colors active:scale-[0.98]">
          Проанализировать
        </button>
      </div>
    );
  }

  if (activeReport === 'effective_reactions') {
    return (
      <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-8 duration-500 max-w-2xl mx-auto w-full pt-4 px-2">
        <button 
          onClick={() => setActiveReport(null)}
          className="flex items-center gap-2 text-neutral-400 hover:text-white mb-6 transition-colors self-start"
        >
          <ChevronLeft size={20} />
          <span className="font-medium">Назад</span>
        </button>
        
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 bg-blue-500/10 rounded-xl shrink-0 mt-1">
            <Zap className="text-blue-400" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-blue-400 mb-2 leading-tight">На какие ситуации я реагирую эффективно. А на какие нет?</h2>
            <p className="text-sm text-neutral-400 leading-relaxed">Узнайте, насколько ваша реакция на событие эффективна.</p>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 mb-6">
          <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wider mb-4">Выбрать период</h3>
          <div className="relative">
            <select 
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full appearance-none bg-neutral-950 border border-neutral-800 text-white text-base rounded-xl p-4 pr-10 focus:outline-none focus:border-blue-500/50 transition-colors"
            >
              <option value="week">За последнюю неделю</option>
              <option value="month">За последний месяц</option>
              <option value="3months">За последние 3 месяца</option>
              <option value="year">За год</option>
              <option value="all">За всё время</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={20} />
          </div>
        </div>

        <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-colors active:scale-[0.98]">
          Проанализировать
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-2xl mx-auto w-full pt-4">
      <h2 className="text-2xl font-bold text-neutral-100 mb-6 px-2 text-center">Мой анализ</h2>
      
      <div className="flex flex-col gap-4">
        <button 
          onClick={() => setActiveReport('repeating_events')}
          className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 text-left hover:bg-neutral-800/80 transition-all duration-700 active:scale-[0.98]"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-500/10 rounded-xl shrink-0 mt-1">
              <Repeat className="text-blue-400" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-blue-400 mb-2 leading-tight">Какие события чаще всего повторяются в моей жизни?</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">Узнайте, какие ситуации в вашей жизни имеют свойство повторяться, и проанализируйте реакции на них.</p>
            </div>
          </div>
        </button>
        
        <button 
          onClick={() => setActiveReport('effective_reactions')}
          className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 text-left hover:bg-neutral-800/80 transition-all duration-700 active:scale-[0.98]"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-500/10 rounded-xl shrink-0 mt-1">
              <Zap className="text-blue-400" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-blue-400 mb-2 leading-tight">На какие ситуации я реагирую эффективно. А на какие нет?</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">Узнайте, насколько ваша реакция на событие эффективна.</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
