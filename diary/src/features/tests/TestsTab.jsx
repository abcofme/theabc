import { useState, useEffect, useCallback } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import ClayBanner from '../../components/ClayBanner';
import ClayText from '../../components/ClayText';
import Modal from '../../components/Modal';
import Spinner from '../../components/Spinner';
import PortraitProgress from './PortraitProgress';
import TestRunner from './TestRunner';
import { categoryBanners } from './categoryBanners';
import { readTestProgress, clearTestProgress } from './testProgress';
import { useProfile } from '../../context/profile';
import { useErrorHandler } from '../../navigation/appNav';
import { api } from '../../utils/api';

const WebApp = window.Telegram.WebApp;

export default function TestsTab({ request }) {
  const { profile, refreshProfile } = useProfile();
  const handleError = useErrorHandler();
  const [openCategory, setOpenCategory] = useState(null);
  const [selectedResult, setSelectedResult] = useState(null);
  const [runningTest, setRunningTest] = useState(null);
  const [handledRequest, setHandledRequest] = useState(null);
  const [, updateProgress] = useState(0);
  const categories = profile?.categories || [];
  useEffect(() => {
    const update = () => updateProgress(value => value + 1);
    window.addEventListener('test-progress:changed', update);
    return () => window.removeEventListener('test-progress:changed', update);
  }, []);
  if (request && request.id !== handledRequest) {
    setHandledRequest(request.id);
    if (request.category) setOpenCategory(categories.find(c => c.name === request.category || c.id === request.category)?.id || null);
  }
  const requestedCategoryId = categories.find(category => category.name === request?.category || category.id === request?.category)?.id;
  useEffect(() => {
    if (request?.category && requestedCategoryId) document.getElementById(`test-category-panel-${requestedCategoryId}`)?.parentElement?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [request?.id, request?.category, requestedCategoryId]);
  const categoryOf = id => categories.find(c => c.tests.some(t => t.id === id));
  const remaining = categories.filter(c => c.name !== 'Профориентация').flatMap(c => c.tests).filter(test => !test.passed);
  const nextTest = remaining.find(test => readTestProgress(test.id).index > 0) || remaining[0];
  const openTest = test => {
    if (test.passed) { setSelectedResult(test); WebApp.HapticFeedback?.selectionChanged(); }
    else { WebApp.HapticFeedback?.impactOccurred('light'); setRunningTest(test); }
  };
  const closeTest = useCallback(() => setRunningTest(null), []);
  const retake = () => {
    const test = selectedResult;
    WebApp.showConfirm('Пройти тест заново? Текущий результат удалится. Если портрет уже сформирован, его можно будет обновить.', async confirmed => {
      if (!confirmed) return;
      try {
        await api(`/api/tests/${test.id}/progress`, { method: 'DELETE' });
        clearTestProgress(test.id);
        setSelectedResult(null);
        refreshProfile();
        setRunningTest({ ...test, passed: false });
      } catch (err) { handleError(err, 'Не удалось сбросить результат теста'); }
    });
  };
  return (
    <div className="app-screen ui-stack" lang="ru">
      <h1 className="screen-title"><ClayText text="Тесты" /></h1>
      {!profile ? <Spinner /> : categories.length === 0 ? <p className="ui-secondary py-8">Нет доступных тестов.</p> : <>
        <PortraitProgress nextTest={nextTest} onContinue={() => openTest(nextTest)} />
        <div className="flex flex-col gap-4">
          {categories.map(cat => {
            const banner = categoryBanners[cat.name.trim()];
            const isOpen = openCategory === cat.id;
            const passed = cat.tests.filter(test => test.passed).length;
            const toggle = () => setOpenCategory(isOpen ? null : cat.id);
            return <section key={cat.id} className={banner ? 'clay-group' : undefined}>
              {banner ? <ClayBanner id={`test-category-${cat.id}`} kind="test" title={cat.name} image={banner.image} expanded={isOpen} onClick={toggle} controlsId={`test-category-panel-${cat.id}`} badge={cat.tests.length ? `Пройдено ${passed} из ${cat.tests.length}` : undefined} badgeAccent={cat.tests.length > 0 && passed === cat.tests.length} chevron /> : <button type="button" onClick={toggle} aria-expanded={isOpen} aria-controls={`test-category-panel-${cat.id}`} id={`clay-banner-title-test-category-${cat.id}`} className="ui-card w-full flex items-center justify-between gap-3 text-left"><span className="text-lg font-semibold">{cat.name}</span><span className="ui-muted">{passed}/{cat.tests.length}</span></button>}
              <div id={`test-category-panel-${cat.id}`} role="region" aria-labelledby={`clay-banner-title-test-category-${cat.id}`} hidden={!isOpen}>
                {isOpen && <div className={banner ? 'clay-group__body' : 'px-1 pt-2'}>
                  {cat.tests.length === 0 ? <p className="ui-secondary py-4">В этой категории пока нет тестов.</p> : cat.tests.map(test => {
                    const saved = readTestProgress(test.id);
                    return <button type="button" key={test.id} onClick={() => openTest(test)} className="ui-row">
                      <span className="flex-1 min-w-0"><span className="font-medium leading-6 block">{test.name}</span>{!test.passed && saved.index > 0 && <span className="ui-muted block mt-1">{saved.total ? `Пройдено ${saved.index} из ${saved.total} вопросов` : 'Есть сохраненный прогресс'}</span>}</span>
                      <span className="flex items-center gap-1 text-sm font-semibold shrink-0">{test.passed ? <><Check size={20} className="text-[#7BA887]" /> Результат</> : <>{saved.index > 0 ? 'Продолжить' : 'Пройти'}<ChevronRight size={20} /></>}</span>
                    </button>;
                  })}
                </div>}
              </div>
            </section>;
          })}
        </div>
      </>}
      {selectedResult && <Modal title={selectedResult.name} onClose={() => setSelectedResult(null)} footer={<>
        {nextTest && <button type="button" onClick={() => { setSelectedResult(null); openTest(nextTest); }} className="ui-button ui-button--primary">Продолжить тесты</button>}
        <button type="button" onClick={retake} className="ui-button ui-button--outline">Пройти тест заново</button>
        <button type="button" onClick={() => setSelectedResult(null)} className="ui-button ui-button--quiet">Закрыть</button>
      </>}><p className="text-base leading-[26px] whitespace-pre-wrap">{selectedResult.result_text || 'Нет детального описания результата.'}</p></Modal>}
      {runningTest && <TestRunner key={runningTest.id} test={runningTest} image={categoryBanners[categoryOf(runningTest.id)?.name.trim()]?.image} onClose={closeTest} />}
    </div>
  );
}
