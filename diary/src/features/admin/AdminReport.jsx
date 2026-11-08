export function AdminRow({ label, value, hint }) {
  return (
    <div className="admin-row">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <b>{value}</b>
    </div>
  );
}

export function AdminSection({ title, children }) {
  return (
    <section className="ui-card flex flex-col gap-1">
      <h3 className="text-lg font-bold text-[var(--ui-text)] mb-2">{title}</h3>
      {children}
    </section>
  );
}
