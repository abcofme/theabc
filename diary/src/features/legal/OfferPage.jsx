import ResultContent from '../../components/ResultContent';
import Page from '../../components/Page';
import { PUBLIC_OFFER_TEXT } from './offer';

export default function OfferPage({ onBack }) {
  return (
    <Page title="Публичная оферта" onBack={onBack}>
      <ResultContent content={PUBLIC_OFFER_TEXT} />
    </Page>
  );
}
