// Наклон телефона для эффекта глубины: углы датчика (в радианах) → сдвиг от -1 до 1 относительно
// привычного положения. Нейтраль понемногу подтягивается к текущему положению, поэтому картинки
// откликаются на движение, а при неподвижном наклоне плавно возвращаются в центр.
const RANGE = 0.35; // ~20° наклона дают полный сдвиг
const SETTLE = 0.015; // доля, на которую нейтраль догоняет телефон за один замер (~2,5 с при 25 замерах в секунду)

const clamp = value => Math.max(-1, Math.min(1, value));
// Разность углов без скачка через ±180°
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function createTiltTracker({ range = RANGE, settle = SETTLE } = {}) {
  let base = null;
  return function track(beta, gamma) {
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
    if (!base) base = { beta, gamma };
    const dy = wrap(beta - base.beta);
    const dx = wrap(gamma - base.gamma);
    base = { beta: base.beta + dy * settle, gamma: base.gamma + dx * settle };
    return { x: clamp(dx / range), y: clamp(dy / range) };
  };
}

// В альбомной ориентации оси экрана повернуты относительно осей телефона
export function toScreenAxes({ x, y }, angle = 0) {
  switch (((angle % 360) + 360) % 360) {
    case 90: return { x: y, y: -x };
    case 180: return { x: -x, y: -y };
    case 270: return { x: -y, y: x };
    default: return { x, y };
  }
}
