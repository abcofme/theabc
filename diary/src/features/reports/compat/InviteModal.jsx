import QRCode from 'react-qr-code';
import { Copy, Send } from '../../../components/ClayIcon';
import Modal from '../../../components/Modal';

const WebApp = window.Telegram.WebApp;

const INVITE_TEXT = 'Давай узнаем нашу совместимость в «Азбуке Я»';

// Личная ссылка: друг открывает её — и вы сразу появляетесь друг у друга в друзьях
export default function InviteModal({ link, onClose }) {
  const share = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(INVITE_TEXT)}`;
    WebApp.openTelegramLink(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      WebApp.showAlert('Ссылка скопирована');
    } catch {
      WebApp.showAlert(link);
    }
  };

  return (
    <Modal
      title="Пригласить друга"
      onClose={onClose}
      footer={
        <>
          <button onClick={share} className="ui-button ui-button--primary">
            <Send size={18} /> Отправить в Telegram
          </button>
          <button onClick={copy} className="ui-button ui-button--outline">
            <Copy size={18} /> Скопировать ссылку
          </button>
        </>
      }
    >
      <p className="text-sm text-[var(--ui-secondary)] leading-relaxed mb-4">
        Друг откроет ссылку — и вы появитесь друг у друга в друзьях. Совместимость откроется, когда у обоих будет портрет личности.
      </p>
      <div className="bg-[#F5E6D3] p-4 rounded-2xl w-fit mx-auto">
        <QRCode value={link} size={168} level="M" bgColor="#F5E6D3" fgColor="#2B0A0A" />
      </div>
      <p className="text-xs text-[var(--ui-muted)] text-center mt-3">QR-код — чтобы пригласить, когда вы рядом</p>
    </Modal>
  );
}
