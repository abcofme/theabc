export default function Switch({ checked, label, onClick, disabled = false }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onClick} disabled={disabled} className="ui-switch">
    <span className="ui-switch__track" aria-hidden="true"><span className="ui-switch__thumb" /></span>
  </button>;
}
