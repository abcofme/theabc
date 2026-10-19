import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { X } from 'lucide-react';
import EntryList, { AnalysisHint } from './EntryList';
import EntryForm from './EntryForm';

// Прошлый день: его записи и возможность дописать то, что не успел
export default function DaySheet({ day, entries, diary, lock, onSwitchTab, onClose }) {
  const date = parseISO(day);

  return (
    <div className="fixed inset-0 z-[55] bg-rose-950 flex flex-col">
      <div className="flex-1 w-full max-w-2xl mx-auto p-4 flex flex-col overflow-y-auto">
        <div className="flex justify-between items-start mb-6 pt-4">
          <div className="min-w-0">
            <h3 className="text-3xl font-bold text-[#F5E6D3] truncate">{format(date, 'd MMMM yyyy', { locale: ru })}</h3>
            <p className="text-sm text-[#F5E6D3]/70 mt-1 uppercase tracking-wider font-medium">{format(date, 'EEEE', { locale: ru })}</p>
          </div>
          <button onClick={onClose} aria-label="Закрыть" className="p-2 bg-rose-900 rounded-xl text-[#F5E6D3] shrink-0 ml-4">
            <X size={24} />
          </button>
        </div>

        {entries.length > 0 ? (
          <section className="bg-rose-900/80 rounded-3xl p-4">
            <EntryList entries={entries} diary={diary} lock={lock} />
            <AnalysisHint lock={lock} onSwitchTab={onSwitchTab} />
          </section>
        ) : (
          <p className="text-[#F5E6D3]/70 text-center py-6">В этот день записей нет</p>
        )}

        <div className="mt-6 mb-safe pb-4 bg-rose-900/80 rounded-3xl p-4">
          <EntryForm title="Что произошло в этот день?" onSubmit={(event, reaction) => diary.addEntry(day, event, reaction)} />
        </div>
      </div>
    </div>
  );
}
