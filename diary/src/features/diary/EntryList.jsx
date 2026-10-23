import { useState, useLayoutEffect } from 'react';
import { Lock, ChevronRight } from '../../components/ClayIcon';
import EntryCard from './EntryCard';
import EntryForm from './EntryForm';
import { analysisState } from './utils';
import { useAppNav, useErrorHandler } from '../../navigation/appNav';

const WebApp = window.Telegram.WebApp;

// Одна строка вместо замка на каждой записи: почему дневник молчит и что сделать
export function AnalysisHint({ lock, onNavigate }) {
  const { navigate, openBilling } = useAppNav();
  if (!lock?.text) return null;
  const go = () => {
    onNavigate?.();
    if (lock.action === 'billing') openBilling();
    else if (lock.action === 'portrait') navigate({ tab: 'profile', page: 'portrait' });
    else navigate({ tab: lock.action });
  };
  return (
    <button
      onClick={go}
      className="w-full mt-3 flex items-center gap-2 text-left text-sm text-[var(--ui-secondary)] active:opacity-70"
    >
      <Lock size={14} className="shrink-0" />
      <span className="flex-1">{lock.text}</span>
      <ChevronRight size={16} className="shrink-0" />
    </button>
  );
}

export default function EntryList({ entries, diary, lock, savedEntryId }) {
  const [editingId, setEditingId] = useState(null);
  const handleError = useErrorHandler();

  useLayoutEffect(() => {
    if (savedEntryId) document.getElementById(`diary-entry-${savedEntryId}`)?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [savedEntryId]);

  const confirmDelete = (entry) => {
    WebApp.showConfirm('Удалить запись? Её нельзя будет восстановить.', (confirmed) => {
      if (!confirmed) return;
      diary.deleteEntry(entry.id).catch(() => WebApp.showAlert('Не удалось удалить запись.'));
    });
  };

  const retry = (entry) => {
    diary.retryAnalysis(entry.id).catch(err => handleError(err, 'Дневник сейчас не смог ответить. Попробуйте чуть позже.'));
  };

  return (
    <div className="flex flex-col gap-3">
      {entries.map(entry => editingId === entry.id ? (
        <div key={entry.id} className="ui-card">
          <EntryForm
            title="Дополни запись"
            initial={entry}
            draftKey={`edit:${entry.id}`}
            submitLabel="Отправить дневнику"
            onCancel={() => setEditingId(null)}
            onSubmit={async (event, reaction) => {
              await diary.updateEntry(entry, event, reaction);
              setEditingId(null);
            }}
          />
        </div>
      ) : (
        <EntryCard
          key={entry.id}
          entry={entry}
          analysis={analysisState(entry, diary.isPending(entry.id), lock)}
          onDelete={() => confirmDelete(entry)}
          onRetry={() => retry(entry)}
          onEdit={() => setEditingId(entry.id)}
        />
      ))}
    </div>
  );
}
