import { useEffect, useState } from 'react';
import { ChevronRight, FileText, Trash2 } from 'lucide-react';
import Spinner from '../../components/Spinner';
import ReportBanner from './ReportBanner';
import ReportFormPage from './ReportFormPage';
import ReportViewPage from './ReportViewPage';
import { REPORT_GROUPS, reportTypeOf } from './reportTypes';
import { useProfile } from '../../context/profile';
import { useAppNav, useErrorHandler } from '../../navigation/appNav';
import { api } from '../../utils/api';

const WebApp = window.Telegram.WebApp;

const formatDate = (iso) => new Date(iso).toLocaleDateString('ru-RU');

export default function ReportsTab({ request }) {
  const { profile, isPremium } = useProfile();
  const { navigate, openBilling } = useAppNav();
  const handleError = useErrorHandler();
  const [reports, setReports] = useState(null);
  const [openCategory, setOpenCategory] = useState(null);
  const [formType, setFormType] = useState(null);
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

  // Ссылка из бота «Отчет готов»: ?tab=reports&report=12
  if (request && request.id !== handledRequest) {
    setHandledRequest(request.id);
    setPendingReportId(request.report ? Number(request.report) : null);
  }

  const openReport = (report) => {
    setViewReport(report);
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
    setFormType(null);
    setViewReport(report);
  };

  const careerTestsPassed = profile?.categories?.find(c => c.name === 'Профориентация')?.tests.some(t => t.passed);
  const canAfford = isPremium || (profile && profile.balance >= profile.prices.report);

  return (
    <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full pt-4 pb-6" lang="ru">
      <h2 className="text-2xl font-bold text-[#F5E6D3] mb-2 px-4 text-center">Поведенческий код</h2>
      <p className="text-sm text-[#F5E6D3]/75 text-center px-4 mb-7 leading-relaxed">
        Замечай повторения, понимай свои реакции и находи опору в записях дневника.
      </p>

      {!reports ? <Spinner /> : (
        <div className="flex flex-col gap-8 px-2">
          {REPORT_GROUPS.map(group => (
            <div key={group.id} className="flex flex-col gap-4">
              {group.title && (
                <div className="px-1 mt-1">
                  <h2 className="text-lg font-bold text-[#F5E6D3] mb-1">{group.title}</h2>
                  {group.desc && <p className="text-xs text-[#F5E6D3]/70 leading-relaxed">{group.desc}</p>}
                </div>
              )}
              {group.items.map(type => {
                const typeReports = reports.filter(r => reportTypeOf(r)?.id === type.id);
                const isOpen = openCategory === type.id;
                const needsCareerTests = group.id === 'career' && !careerTestsPassed;

                return (
                  <div key={type.id}>
                    <ReportBanner
                      report={type}
                      expanded={isOpen}
                      onClick={() => setOpenCategory(isOpen ? null : type.id)}
                      hasNew={typeReports.some(r => r.is_read === false)}
                    />
                    <div id={`report-panel-${type.id}`} role="region" aria-labelledby={`clay-banner-title-report-${type.id}`} hidden={!isOpen}>
                      {isOpen && (
                        <div className="report-details p-5 bg-rose-900/60 flex flex-col gap-3">
                          <p className="text-sm text-[#F5E6D3]/80 leading-relaxed">{type.subtitle}</p>

                          {needsCareerTests ? (
                            <>
                              <p className="text-sm text-[#F5E6D3]/80">Отчет строится по тестам профориентации — сначала пройди их.</p>
                              <button onClick={() => navigate({ tab: 'tests' })} className="w-full py-3 bg-rose-800 text-[#F5E6D3] font-bold rounded-xl">
                                К тестам
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => setFormType(type)}
                                className="w-full py-3 bg-rose-800 hover:bg-rose-700 text-[#F5E6D3] font-bold rounded-xl"
                              >
                                Сформировать новый отчет
                              </button>
                              {!canAfford && (
                                <button onClick={openBilling} className="text-xs text-[#F5E6D3]/70 text-center underline underline-offset-2">
                                  Баланс расходуется по мере использования и сейчас закончился — пополнить или оформить Premium
                                </button>
                              )}
                            </>
                          )}

                          {typeReports.length > 0 ? (
                            <div className="mt-4 flex flex-col gap-2">
                              <span className="text-xs font-bold text-[#F5E6D3] uppercase tracking-wider mb-1">История отчетов</span>
                              {typeReports.map(r => (
                                <div key={r.id} className="flex items-stretch gap-1 bg-rose-900 rounded-xl">
                                  <button onClick={() => openReport(r)} className="flex-1 min-w-0 flex items-center gap-3 py-3.5 pl-4 text-left">
                                    <FileText className="text-[#F5E6D3] shrink-0" size={20} />
                                    <div className="min-w-0 flex-1">
                                      <div className="text-[#F5E6D3] font-medium">Отчет от {formatDate(r.created_at)}</div>
                                      <div className="text-xs text-[#F5E6D3]/70 mt-0.5">
                                        {r.period_start ? `${formatDate(r.period_start)} — ${formatDate(r.period_end)}` : 'За все время'}
                                      </div>
                                      {r.is_read === false && (
                                        <span className="inline-block mt-1.5 text-[10px] font-bold text-rose-950 bg-[#e5c398] px-2 py-0.5 rounded-full">Новый</span>
                                      )}
                                    </div>
                                    <ChevronRight className="text-[#F5E6D3]/60 shrink-0" size={18} />
                                  </button>
                                  <button
                                    onClick={() => deleteReport(r)}
                                    aria-label="Удалить отчет"
                                    className="px-3 text-[#F5E6D3]/60 hover:text-[#F5E6D3] rounded-r-xl active:scale-95"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-[#F5E6D3]/70 text-center mt-2">Этот отчет ты еще не формировал(а).</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {formType && <ReportFormPage type={formType} onBack={() => setFormType(null)} onCreated={onCreated} />}
      {viewReport && <ReportViewPage report={viewReport} onBack={() => setViewReport(null)} />}
    </div>
  );
}
