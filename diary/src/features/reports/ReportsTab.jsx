import { useEffect, useState } from 'react';
import ReportGroupSection from './ReportGroupSection';
import ReportTypePage from './ReportTypePage';
import ReportViewPage from './ReportViewPage';
import CompatibilitySection from './compat/CompatibilitySection';
import { REPORT_GROUPS, reportTypeOf } from './reportTypes';
import { useErrorHandler } from '../../navigation/appNav';
import { api } from '../../utils/api';

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
    <div role="tablist" aria-label="Разделы отчетов" className="flex bg-rose-900/60 rounded-2xl p-1 mb-5">
      {SECTIONS.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={`flex-1 flex items-center justify-center px-1 py-2 rounded-xl text-xs leading-tight font-bold transition-colors ${
            value === id ? 'bg-[#F5E6D3] text-rose-950' : 'text-[#F5E6D3]/70'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Отчеты: «Поведенческий код», «Профориентация» и «Совместимость с друзьями».
// Ссылки из бота: ?tab=reports&report=12 — открыть отчет, ?tab=reports&section=compatibility — раздел друзей
export default function ReportsTab({ request }) {
  const handleError = useErrorHandler();
  const [section, setSection] = useState('general');
  const [reports, setReports] = useState(null);
  const [openType, setOpenType] = useState(null);
  const [viewReport, setViewReport] = useState(null);
  const [pendingReportId, setPendingReportId] = useState(null);
  const [handledRequest, setHandledRequest] = useState(null);

  useEffect(() => {
    api('/api/reports')
      .then(data => setReports(Array.isArray(data) ? data : []))
      .catch(err => {
        console.error(err);
        setReports([]);
      });
  }, []);

  if (request && request.id !== handledRequest) {
    setHandledRequest(request.id);
    setSection(SECTION_IDS.includes(request.section) ? request.section : 'general');
    setPendingReportId(request.report ? Number(request.report) : null);
  }

  const openReport = (report) => {
    setViewReport(report);
    setSection(reportTypeOf(report)?.group || 'general');
    if (report.is_read) return;
    setReports(prev => prev.map(r => (r.id === report.id ? { ...r, is_read: true } : r)));
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

  const onCreated = (report) => {
    setReports(prev => [report, ...(prev || [])]);
    setViewReport(report);
  };

  return (
    <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full pt-2 pb-6 px-1" lang="ru">
      <h1 className="text-3xl font-bold text-[#F5E6D3] px-1 mb-4">Отчеты</h1>
      <SectionSwitch value={section} onChange={setSection} />

      {section === 'compatibility' ? (
        <CompatibilitySection />
      ) : (
        <ReportGroupSection
          group={REPORT_GROUPS.find(g => g.id === section)}
          reports={reports}
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
          onCreated={onCreated}
          onBack={() => setOpenType(null)}
        />
      )}
      {viewReport && <ReportViewPage report={viewReport} onBack={() => setViewReport(null)} />}
    </div>
  );
}
