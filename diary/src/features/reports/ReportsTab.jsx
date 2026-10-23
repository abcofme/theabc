import { useCallback, useEffect, useRef, useState } from 'react';
import ReportGroupSection from './ReportGroupSection';
import ReportTypePage from './ReportTypePage';
import ReportViewPage from './ReportViewPage';
import CompatibilitySection from './compat/CompatibilitySection';
import { REPORT_GROUPS, reportTypeOf } from './reportTypes';
import { useErrorHandler } from '../../navigation/appNav';
import { api } from '../../utils/api';
import ScreenState from '../../components/ScreenState';

const WebApp = window.Telegram.WebApp;

// Три раздела: два вида отчетов по дневнику и совместимость с друзьями
const SECTIONS = [
  ['general', 'Поведенческий код'],
  ['career', 'Профориентация'],
  ['compatibility', 'Совместимость'],
];
const SECTION_IDS = SECTIONS.map(([id]) => id);

function SectionSwitch({ value, onChange }) {
  return (
    <div role="tablist" aria-label="Разделы отчетов" className="ui-segmented">
      {SECTIONS.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}

        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Отчеты: «Поведенческий код», «Профориентация» и «Совместимость с друзьями».
// Ссылки из бота: ?tab=reports&report=12 — открыть отчет, ?tab=reports&section=compatibility — раздел друзей
export default function ReportsTab({ request, active }) {
  const handleError = useErrorHandler();
  const [section, setSection] = useState('general');
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
    setSection(SECTION_IDS.includes(request.section) ? request.section : 'general');
    setPendingReportId(request.report ? Number(request.report) : null);
  }

  const openReport = (report) => {
    setViewReport(report);
    setSection(reportTypeOf(report)?.group || 'general');
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
      } catch (err) {
        handleError(err, 'Не удалось удалить отчет');
      }
    });
  };

  const onCreated = (report, typeId) => {
    const unread = { ...report, is_read: false };
    setReports(prev => [unread, ...(prev || []).filter(r => r.id !== report.id)]);
    if (activeRef.current && openTypeRef.current?.id === typeId) openReport(unread);
  };

  return (
    <div className="app-screen ui-stack" lang="ru">
      <h1 className="screen-title">Отчеты</h1>
      <SectionSwitch value={section} onChange={setSection} />

      {loadError && section !== 'compatibility' ? <ScreenState error title="Не удалось загрузить отчеты" onRetry={loadReports} /> : section === 'compatibility' ? (
        <CompatibilitySection />
      ) : (
        <ReportGroupSection
          group={REPORT_GROUPS.find(g => g.id === section)}
          reports={reports}
          jobs={jobs}
          onOpenType={setOpenType}
          onOpenReport={openReport}
        />
      )}

      {openType && (
        <ReportTypePage
          type={openType}
          reports={(reports || []).filter(r => reportTypeOf(r)?.id === openType.id)}
          onOpenReport={openReport}
          onDelete={deleteReport}
          isGenerating={!!jobs[openType.id]}
          onGeneratingChange={(generating) => setJobs(prev => ({ ...prev, [openType.id]: generating }))}
          onCreated={(report) => onCreated(report, openType.id)}
          onBack={() => setOpenType(null)}
        />
      )}
      {viewReport && <ReportViewPage report={viewReport} onBack={() => setViewReport(null)} />}
    </div>
  );
}
