export type Side = "YES" | "NO";

export function lmsrCost(b: number, qYes: number, qNo: number) {
  const a = qYes / b;
  const c = qNo / b;
  const m = Math.max(a, c);
  return b * (m + Math.log(Math.exp(a - m) + Math.exp(c - m)));
}

export function lmsrPriceYes(b: number, qYes: number, qNo: number) {
  const x = (qYes - qNo) / b;
  if (x >= 50) return 1;
  if (x <= -50) return 0;
  return 1 / (1 + Math.exp(-x));
}

export function lmsrTradeCost(
  b: number,
  qYes: number,
  qNo: number,
  side: Side,
  deltaShares: number
) {
  const before = lmsrCost(b, qYes, qNo);
  const after =
    side === "YES"
      ? lmsrCost(b, qYes + deltaShares, qNo)
      : lmsrCost(b, qYes, qNo + deltaShares);
  return after - before;
}

