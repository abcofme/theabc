export function parseScales(jsonString) {
  const parsed = JSON.parse(jsonString);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.scales)) return parsed.scales;
    if (Array.isArray(parsed.data)) return parsed.data;
    return Object.values(parsed).find(value => Array.isArray(value)) || [];
  }
  return [];
}

export function scaleValue(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return 50;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 50;
}
