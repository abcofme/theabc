import { useCallback, useEffect, useRef, useState } from 'react';
import ReportsCatalog from './ReportsCatalog';
import ReportTypePage from './ReportTypePage';
import ReportViewPage from './ReportViewPage';
import CompatibilitySection from './compat/CompatibilitySection';
import { reportTypeOf } from './reportTypes';
import { useErrorHandler } from '../../navigation/appNav';
import { api } from '../../utils/api';
import ClayText from '../../components/ClayText';
import ScreenState from '../../components/ScreenState';

const WebApp = window.Telegram.WebApp;

// Два раздела: отчеты по дневнику («Поведенческий код» и «Профориентация») и совместимость с друзьями
const SECTIONS = [
  ['mine', 'Обо мне'],
  ['compatibility', 'С друзьями'],
];

function SectionSwitch({ value, onChange }) {
  return (
    <div role="tablist" aria-label="Разделы отчетов" className="ui-segmented">
      {SECTIONS.map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={value === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// Ссылки из бота: ?tab=reports&report=12 — открыть отчет, ?tab=reports&section=compatibility — раздел друзей.
// Прежние разделы general и career ведут в «Обо мне», career — сразу к своей группе
export default function ReportsTab({ request, active }) {
  const handleError = useErrorHandler();
  const [section, setSection] = useState('mine');
  const [reports, setReports] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [jobs, setJobs] = useState({});
  const [openType, setOpenType] = useState(null);
  const [viewReport, setViewReport] = useState(null);
  const [pendingReportId, setPendingReportId] = useState(null);
  const [handledRequest, setHandledRequest] = useState(null);

  const activeRef = useRef(active);
  const openTypeRef = useRef(openType);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { openTypeRef.current = openType; }, [openType]);
  const loadReports = useCallback(() => {
    return api('/api/reports')
      .then(data => { setReports(Array.isArray(data) ? data : []); setLoadError(false); })
      .catch(() => setLoadError(true));
  }, []);
  useEffect(() => { loadReports(); }, [loadReports]);

  if (request && request.id !== handledRequest) {
    setHandledRequest(request.id);
    setSection(request.section === 'compatibility' ? 'compatibility' : 'mine');
    setPendingReportId(request.report ? Number(request.report) : null);
  }

  useEffect(() => {
    if (request?.section === 'career') document.getElementById('reports-group-career')?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [request?.id, request?.section, reports]);

  const openReport = (report) => {
    setViewReport(report);
    setSection('mine');
    if (report.is_read) return;
    setReports(prev => (prev || []).map(r => (r.id === report.id ? { ...r, is_read: true } : r)));
    api(`/api/reports/${report.id}/read`, { method: 'POST' }).catch(console.error);
  };

  if (pendingReportId && reports) {
    const report = reports.find(r => r.id === pendingReportId);
    setPendingReportId(null);
    if (report) openReport(report);
  }

  const deleteReport = (report) => {
    WebApp.showConfirm('Удалить этот отчет?', async (confirmed) => {
      if (!confirmed) return;
      try {
        await api(`/api/reports/${report.id}`, { method: 'DELETE' });
        setReports(prev => prev.filter(r => r.id !== report.id));
        setViewReport(current => (current?.id === report.id ? null : current));
      } catch (err) {
        handleError(err, 'Не удалось удалить отчет');
      }
    });
  };

  // «Обновить отчет» ведет к форме нового отчета того же вида
  const updateReport = (report) => {
    setViewReport(null);
    setOpenType(reportTypeOf(report));
  };

  const onCreated = (report, typeId) => {
    const unread = { ...report, is_read: false };
    setReports(prev => [unread, ...(prev || []).filter(r => r.id !== report.id)]);
    if (activeRef.current && openTypeRef.current?.id === typeId) openReport(unread);
  };

  return (
    <div className="app-screen ui-stack" lang="ru">
      <h1 className="screen-title"><ClayText text="Отчеты" /></h1>
      <SectionSwitch value={section} onChange={setSection} />

      {section === 'compatibility' ? (
        <CompatibilitySection />
      ) : loadError ? (
        <ScreenState error title="Не удалось загрузить отчеты" onRetry={loadReports} />
      ) : (
        <ReportsCatalog
          reports={reports}
          jobs={jobs}
          active={active && section === 'mine'}
          onOpenType={setOpenType}
          onOpenReport={openReport}
        />
      )}

      {openType && (
        <ReportTypePage
          type={openType}
          reports={(reports || []).filter(r => reportTypeOf(r)?.id === openType.id)}
          onOpenReport={openReport}
          isGenerating={!!jobs[openType.id]}
          onGeneratingChange={(generating) => setJobs(prev => ({ ...prev, [openType.id]: generating }))}
          onCreated={(report) => onCreated(report, openType.id)}
          onBack={() => setOpenType(null)}
        />
      )}
      {viewReport && (
        <ReportViewPage
          report={viewReport}
          onBack={() => setViewReport(null)}
          onUpdate={() => updateReport(viewReport)}
          onDelete={() => deleteReport(viewReport)}
        />
      )}
    </div>
  );
}
