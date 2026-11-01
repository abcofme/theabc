import Modal from '../../components/Modal';
import { FromBrowser } from './InstallPage';

// Окно при первом входе с телефона в браузере (когда показывать — offerTiming.js)
export default function InstallOffer({ onClose }) {
  return (
    <Modal
      title="Установи «Азбуку Я» на телефон"
      onClose={onClose}
      footer={<button type="button" onClick={onClose} className="ui-button ui-button--quiet">Не сейчас</button>}
    >
      <p className="ui-secondary mb-4">Дневник будет открываться с главного экрана в одно касание, как обычное приложение. Позже это можно сделать в профиле.</p>
      <FromBrowser card={false} />
    </Modal>
  );
}
