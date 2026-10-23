export default function GenerationProgress({ text = 'Генерация…' }) {
  return (
    <div className="generation-progress" role="status" aria-live="polite">
      <p className="font-semibold">{text}</p>
      <div className="generation-progress__track" aria-hidden="true"><span /></div>
      <p className="ui-secondary">Это может занять пару минут.</p>
    </div>
  );
}
