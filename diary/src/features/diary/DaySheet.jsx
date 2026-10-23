import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Plus } from 'lucide-react';
import Page from '../../components/Page';
import EntryList, { AnalysisHint } from './EntryList';
import EntryForm from './EntryForm';

// Прошлый день: его записи и возможность дописать то, что не успел
export default function DaySheet({ day, entries, diary, lock, onNavigate, onClose }) {
  const date = parseISO(day);
  const [composing, setComposing] = useState(false);
  const [savedEntryId, setSavedEntryId] = useState(null);

  const add = async (event, reaction) => {
    const id = await diary.addEntry(day, event, reaction);
    setSavedEntryId(id);
    setComposing(false);
  };

  return (
    <Page title={format(date, 'd MMMM yyyy, EEEEEE', { locale: ru })} onBack={onClose}>
      <div className="mb-4">
        {entries.length === 0 || composing ? <div className="ui-card">
          <EntryForm draftKey={`new:${day}`} title="Что произошло в этот день?" onSubmit={add} onCancel={entries.length > 0 ? () => setComposing(false) : undefined} />
        </div> : <button type="button" onClick={() => setComposing(true)} className="ui-button ui-button--primary"><Plus size={20} /> Записать событие</button>}
      </div>
      {entries.length > 0 ? (
        <section>
          <EntryList entries={entries} diary={diary} lock={lock} savedEntryId={savedEntryId} />
          <AnalysisHint lock={lock} onNavigate={onNavigate} />
        </section>
      ) : (
        <p className="text-[#F5E6D3]/70 text-center py-6">В этот день записей нет</p>
      )}

    </Page>
  );
}
