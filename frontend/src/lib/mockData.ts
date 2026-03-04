import type { PricePoint, AllocationPoint, VaultEvent } from "./types";

export function generatePriceHistory(
  currentPrice: number,
  lowerBound: number,
  upperBound: number,
  days = 7
): PricePoint[] {
  const points: PricePoint[] = [];
  const midPrice = (lowerBound + upperBound) / 2;
  const range = upperBound - lowerBound;
  const now = Date.now();

  for (let i = days * 24; i >= 0; i--) {
    const t = now - i * 3600000;
    const date = new Date(t);
    const time = date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit" });

    // Create a random walk that crosses bounds a few times
    const noise = Math.sin(i * 0.15) * range * 0.4 + Math.cos(i * 0.07) * range * 0.3;
    const drift = (currentPrice - midPrice) * (1 - i / (days * 24));
    const price = midPrice + noise + drift + (Math.random() - 0.5) * range * 0.05;

    points.push({
      time,
      price: Math.round(price),
      lower: lowerBound,
      upper: upperBound,
    });
  }

  // Ensure last point is exact current price
  if (points.length > 0) {
    points[points.length - 1].price = currentPrice;
  }

  return points;
}

export function generateAllocationHistory(
  currentEkubo: number,
  currentVesu: number,
  currentBuffer: number,
  days = 7
): AllocationPoint[] {
  const points: AllocationPoint[] = [];
  const now = Date.now();

  for (let i = days * 24; i >= 0; i--) {
    const t = now - i * 3600000;
    const date = new Date(t);
    const time = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    // Simulate state changes: mostly in Ekubo, occasionally in Vesu
    const cycle = Math.sin(i * 0.08);
    const inEkubo = cycle > -0.3;

    if (inEkubo) {
      points.push({ time, ekubo: 50, vesu: 40, buffer: 10 });
    } else {
      points.push({ time, ekubo: 0, vesu: 90, buffer: 10 });
    }
  }

  // Last point uses real values
  if (points.length > 0) {
    points[points.length - 1] = {
      time: points[points.length - 1].time,
      ekubo: currentEkubo,
      vesu: currentVesu,
      buffer: currentBuffer,
    };
  }

  // Reduce to daily points
  const daily = points.filter((_, i) => i % 24 === 0 || i === points.length - 1);
  return daily;
}

export function generateMockEvents(): VaultEvent[] {
  const now = Date.now();
  return [
    {
      id: "1",
      type: "Deposit",
      timestamp: now - 3600000 * 2,
      txHash: "0x0abc123...def",
      data: { amount: "500000", user: "0x00f08...7ad1" },
    },
    {
      id: "2",
      type: "StateChanged",
      timestamp: now - 3600000 * 12,
      txHash: "0x0def456...789",
      data: { from: "VesuLending", to: "EkuboActive" },
    },
    {
      id: "3",
      type: "RebalanceExecuted",
      timestamp: now - 3600000 * 12,
      txHash: "0x0789abc...012",
      data: { btcPrice: "8245000000000", newState: "EkuboActive" },
    },
    {
      id: "4",
      type: "AllocationChanged",
      timestamp: now - 3600000 * 24,
      txHash: "0x0345def...678",
      data: { ekuboBps: "5000", vesuBps: "4000" },
    },
    {
      id: "5",
      type: "Deposit",
      timestamp: now - 3600000 * 48,
      txHash: "0x0678abc...345",
      data: { amount: "1000000", user: "0x00f08...7ad1" },
    },
    {
      id: "6",
      type: "StateChanged",
      timestamp: now - 3600000 * 72,
      txHash: "0x0901def...234",
      data: { from: "EkuboActive", to: "VesuLending" },
    },
  ];
}
