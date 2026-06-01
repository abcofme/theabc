import React from 'react';
import { Repeat, Zap } from 'lucide-react';

export default function ReportsTab() {
  return (
    <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-2xl mx-auto w-full pt-4">
      <h2 className="text-2xl font-bold text-neutral-100 mb-6 px-2 text-center">Мой анализ</h2>
      
      <div className="flex flex-col gap-4">
        <button className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 text-left hover:bg-neutral-800/80 transition-all duration-700 active:scale-[0.98]">
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
        
        <button className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 text-left hover:bg-neutral-800/80 transition-all duration-700 active:scale-[0.98]">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-500/10 rounded-xl shrink-0 mt-1">
              <Zap className="text-amber-500" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-amber-500 mb-2 leading-tight">На какие ситуации я реагирую эффективно. А на какие нет?</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">Узнайте, насколько ваша реакция на событие эффективна.</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
