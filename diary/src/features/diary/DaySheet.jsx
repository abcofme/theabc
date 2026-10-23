import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import Page from '../../components/Page';
import EntryList, { AnalysisHint } from './EntryList';
import EntryForm from './EntryForm';

// Прошлый день: его записи и возможность дописать то, что не успел
export default function DaySheet({ day, entries, diary, lock, onNavigate, onClose }) {
  const date = parseISO(day);

  return (
    <Page title={format(date, 'd MMMM yyyy, EEEEEE', { locale: ru })} onBack={onClose}>
      {entries.length > 0 ? (
        <section className="bg-rose-900/80 rounded-3xl p-4">
          <EntryList entries={entries} diary={diary} lock={lock} />
          <AnalysisHint lock={lock} onNavigate={onNavigate} />
        </section>
      ) : (
        <p className="text-[#F5E6D3]/70 text-center py-6">В этот день записей нет</p>
      )}

      <div className="mt-6 bg-rose-900/80 rounded-3xl p-4">
        <EntryForm title="Что произошло в этот день?" onSubmit={(event, reaction) => diary.addEntry(day, event, reaction)} />
      </div>
    </Page>
  );
}
