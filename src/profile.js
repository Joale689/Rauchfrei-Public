
export function validateProfile(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw Error('Ungültige Profilangaben.');

  const mode = input.mode ?? 'observe';
  if (!['observe', 'reduce', 'quit-date', 'smoke-free'].includes(mode))
    throw Error('Unbekannter Aufhörweg.');

  function text(key, max) {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value.length > max)
      throw Error(`Das Feld ${key} ist ungültig oder zu lang.`);
    return value.trim();
  }

  const quitDate = text('quitDate', 10);
  if (quitDate) {
    const parsed = new Date(quitDate + 'T00:00:00.000Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(quitDate) ||
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== quitDate)
      throw Error('Bitte ein gültiges Datum wählen.');
  }

  function number(key, max, integer) {
    const value = input[key] ?? null;
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) ||
        value <= 0 || value > max || (integer && !Number.isInteger(value)))
      throw Error('Bitte Packungspreis und Packungsgröße prüfen.');
    return value;
  }

  return {
    mode,
    quitDate,
    reasons: text('reasons', 2000),
    triggers: text('triggers', 1000),
    aids: text('aids', 500),
    packPrice: number('packPrice', 1000, false),
    packSize: number('packSize', 1000, true)
  };
}
