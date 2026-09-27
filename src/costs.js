
export function cigaretteCost(count, profile = {}) {
  if (!Number.isSafeInteger(count) || count < 0)
    throw Error('Ungültige Zigarettenanzahl.');

  const price = profile.packPrice;
  const size = profile.packSize;
  if (price == null || size == null) return null;

  if (!Number.isFinite(price) || price <= 0 || price > 1000 ||
      !Number.isInteger(size) || size <= 0 || size > 1000)
    throw Error('Ungültige Preisangaben.');

  return Math.round(count * Math.round(price * 100) / size);
}
