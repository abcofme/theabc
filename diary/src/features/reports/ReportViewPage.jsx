import ReactMarkdown from 'react-markdown';
import { Sparkles, Target } from 'lucide-react';
import Page from '../../components/Page';
import { reportTypeOf, formatDay, periodLabel } from './reportTypes';

const markdownComponents = {
  h1: ({ children }) => <h1 className="text-2xl sm:text-3xl font-black text-[#F5E6D3] text-center mb-8 mt-4 uppercase drop-shadow-sm break-words">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl sm:text-2xl font-bold text-[#F5E6D3] mt-10 mb-6 flex items-center justify-center pb-4 break-words text-center"><Sparkles className="text-[#F5E6D3] inline mb-1 mr-3" size={24} /> {children}</h2>,
  p: ({ children }) => <p className="text-[#F5E6D3] leading-relaxed mb-6 text-base font-medium text-left break-words">{children}</p>,
  strong: ({ children }) => <strong className="text-[#F5E6D3] font-bold text-lg break-words">{children}</strong>,
  ul: ({ children }) => <ul className="space-y-4 mb-8 mt-4 pl-1 w-full">{children}</ul>,
  li: ({ children }) => (
    <li className="flex items-start text-base font-medium text-[#F5E6D3] break-words w-full">
      <Target className="shrink-0 text-[#F5E6D3] mr-3 mt-1" size={20} />
      <span className="flex-1 block">{children}</span>
    </li>
  ),
};

export default function ReportViewPage({ report, onBack }) {
  const type = reportTypeOf(report);
  return (
    <Page title={type?.shortTitle || 'Отчет'} onBack={onBack}>
      <p className="text-sm text-[#F5E6D3]/70 mb-4 px-1">
        Отчет от {formatDay(report.created_at)} · {periodLabel(report)}
      </p>
      <div className="bg-rose-900/80 rounded-3xl p-5 sm:p-8 shadow-xl">
        <ReactMarkdown components={markdownComponents}>{report.content}</ReactMarkdown>
      </div>
    </Page>
  );
}
