import ReactMarkdown from 'react-markdown';
import Page from '../../components/Page';
import { PUBLIC_OFFER_TEXT } from './offer';

export default function OfferPage({ onBack }) {
  return (
    <Page title="Публичная оферта" onBack={onBack}>
      <div className="bg-rose-900/60 rounded-3xl p-5 text-[#F5E6D3] text-sm profile-markdown">
        <ReactMarkdown>{PUBLIC_OFFER_TEXT}</ReactMarkdown>
      </div>
    </Page>
  );
}
