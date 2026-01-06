export const CENTS_PER_CREDIT = 100;

export function creditsToCents(credits: number) {
  return Math.round(credits * CENTS_PER_CREDIT);
}

export function centsToCredits(cents: number) {
  return cents / CENTS_PER_CREDIT;
}

export function formatCredits(cents: number) {
  const credits = centsToCredits(cents);
  return credits.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

