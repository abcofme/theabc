import { useState, useCallback } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import ClayBanner from '../../components/ClayBanner';
import Modal from '../../components/Modal';
import Spinner from '../../components/Spinner';
import PortraitProgress from './PortraitProgress';
import TestRunner from './TestRunner';
import { categoryBanners } from './categoryBanners';
import { useProfile } from '../../context/profile';
import { useErrorHandler } from '../../navigation/appNav';
import { api } from '../../utils/api';

const WebApp = window.Telegram.WebApp;

export default function TestsTab() {
  const { profile, refreshProfile } = useProfile();
  const handleError = useErrorHandler();
  const [openCategory, setOpenCategory] = useState(null);
  const [selectedResult, setSelectedResult] = useState(null); // пройденный тест — его результат в окне
  const [runningTest, setRunningTest] = useState(null);

  const categories = profile?.categories || [];

  const openTest = (test) => {
    if (test.passed) {
      setSelectedResult(test);
      WebApp.HapticFeedback?.selectionChanged();
      return;
    }
    WebApp.HapticFeedback?.impactOccurred('light');
    setRunningTest(test);
  };

  const closeTest = useCallback(() => setRunningTest(null), []);

  const retake = () => {
    const test = selectedResult;
    WebApp.showConfirm('Пройти тест заново? Текущий результат удалится. Если портрет уже сформирован, его можно будет обновить.', async (confirmed) => {
      if (!confirmed) return;
      try {
        await api(`/api/tests/${test.id}/progress`, { method: 'DELETE' });
        setSelectedResult(null);
        refreshProfile();
        setRunningTest({ ...test, passed: false });
      } catch (err) {
        handleError(err, 'Не удалось сбросить результат теста');
      }
    });
  };

  return (
    <div className="flex flex-col relative select-none bg-transparent max-w-2xl mx-auto w-full pt-2 pb-6" lang="ru">
      <h1 className="text-3xl font-bold text-[#F5E6D3] px-3 mb-4">Тесты</h1>

      {!profile ? (
        <Spinner />
      ) : categories.length === 0 ? (
        <p className="text-[#F5E6D3] text-center py-12">Нет доступных тестов.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <PortraitProgress />

          <div className="px-2 flex flex-col gap-4">
            {categories.map(cat => {
              const banner = categoryBanners[cat.name.trim()];
              const isOpen = openCategory === cat.id;
              const passed = cat.tests.filter(t => t.passed).length;
              const badge = cat.tests.length > 0 ? `${passed}/${cat.tests.length}` : undefined;
              const toggle = () => setOpenCategory(isOpen ? null : cat.id);
              return (
                <div key={cat.id}>
                  {banner ? (
                    <ClayBanner
                      id={`test-category-${cat.id}`}
                      kind="test"
                      title={cat.name}
                      description={`Символ категории — ${banner.tree}. Пройдено ${passed} из ${cat.tests.length}`}
                      image={banner.image}
                      expanded={isOpen}
                      onClick={toggle}
                      controlsId={`test-category-panel-${cat.id}`}
                      badge={badge}
                      badgeAccent={cat.tests.length > 0 && passed === cat.tests.length}
                      chevron
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={toggle}
                      aria-expanded={isOpen}
                      aria-controls={`test-category-panel-${cat.id}`}
                      id={`clay-banner-title-test-category-${cat.id}`}
                      className="w-full flex items-center justify-between gap-4 px-6 py-4 min-h-[80px] bg-rose-900 rounded-2xl text-left"
                    >
                      <span className="font-semibold text-[#F5E6D3] text-xl truncate">{cat.name}</span>
                      {badge && <span className="text-sm font-bold text-[#F5E6D3]/80 shrink-0">{badge}</span>}
                    </button>
                  )}

                  <div id={`test-category-panel-${cat.id}`} role="region" aria-labelledby={`clay-banner-title-test-category-${cat.id}`} hidden={!isOpen}>
                    {isOpen && (
                      <div className="bg-rose-900/60 rounded-[22px] mt-2.5 px-4 py-3">
                        {banner?.description && (
                          <p className="text-sm text-[#F5E6D3]/80 leading-relaxed py-2">{banner.description}</p>
                        )}
                        {banner?.note && <p className="text-xs text-[#F5E6D3]/60 leading-relaxed pb-2">{banner.note}</p>}
                        {cat.tests.length === 0 ? (
                          <p className="text-[#F5E6D3] text-sm py-3 italic">В этой категории пока нет тестов.</p>
                        ) : cat.tests.map(test => (
                          <button
                            key={test.id}
                            onClick={() => openTest(test)}
                            className="w-full flex items-center justify-between gap-3 py-3.5 -mx-4 px-4 text-left hover:bg-rose-800/40 active:bg-rose-800"
                            style={{ width: 'calc(100% + 2rem)' }}
                          >
                            <span className="text-sm sm:text-base font-medium text-[#F5E6D3] flex-1 leading-snug">{test.name}</span>
                            {test.passed ? (
                              <span className="flex items-center gap-1 text-emerald-500 text-sm font-medium shrink-0">
                                <Check size={18} strokeWidth={3} /> Результат
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5 text-[#F5E6D3] text-sm font-bold shrink-0">
                                Пройти <ChevronRight size={18} />
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedResult && (
        <Modal
          title={selectedResult.name}
          onClose={() => setSelectedResult(null)}
          footer={
            <>
              <button onClick={() => setSelectedResult(null)} className="w-full bg-emerald-800 text-[#F5E6D3] font-bold py-3.5 rounded-xl">
                Закрыть
              </button>
              <button onClick={retake} className="w-full bg-rose-800 text-[#F5E6D3] font-bold py-3 rounded-xl">
                Пройти тест заново
              </button>
            </>
          }
        >
          <p className="text-[#F5E6D3] text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
            {selectedResult.result_text || 'Нет детального описания результата.'}
          </p>
        </Modal>
      )}

      {runningTest && <TestRunner test={runningTest} onClose={closeTest} />}
    </div>
  );
}
