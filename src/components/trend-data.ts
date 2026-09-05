import { CHANNEL_LABELS, type Channel } from "@/domain/model";
import type { ReviewedRow } from "@/application/workbench";

export interface TrendValue {
  label: string;
  expected: number;
  actual: number;
}

export function aggregateTrend(
  rows: readonly Pick<ReviewedRow, "date" | "channel" | "expectedNet" | "actualNet">[],
  period: string,
  channels: readonly Channel[],
) {
  const [year, month] = period.split("-").map(Number);
  const daily = Array.from({ length: new Date(Date.UTC(year, month, 0)).getUTCDate() }, (_, i) => ({
    label: `${i + 1}일`,
    expected: 0,
    actual: 0,
  }));
  const dates = new Map(
    daily.map((value, i) => [`${period}-${String(i + 1).padStart(2, "0")}`, value]),
  );
  const channel = channels.map((id) => ({ label: CHANNEL_LABELS[id], expected: 0, actual: 0 }));
  const byChannel = new Map(channels.map((id, i) => [id, channel[i]]));
  for (const row of rows) {
    for (const bucket of [dates.get(row.date), byChannel.get(row.channel)]) {
      if (!bucket) continue;
      bucket.expected += row.expectedNet;
      bucket.actual += row.actualNet;
    }
  }
  return { daily, channel };
}

export function createTrendScale(values: readonly TrendValue[]) {
  const amounts = values.flatMap((value) => [value.expected, value.actual]);
  const low = Math.min(0, ...amounts) * 1.1;
  const high = Math.max(0, ...amounts) * 1.1;
  const target = Math.max(1, (high - low) / 4);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = ([1, 2, 5, 10].find((n) => n * magnitude >= target) ?? 10) * magnitude;
  const minimum = Math.floor(low / step) * step;
  const maximum = Math.max(minimum + step, Math.ceil(high / step) * step);
  const ticks = Array.from(
    { length: Math.round((maximum - minimum) / step) + 1 },
    (_, i) => minimum + i * step,
  );
  return { minimum, maximum, ticks };
}

export function trendY(
  value: number,
  scale: ReturnType<typeof createTrendScale>,
  height: number,
  top: number,
) {
  return top + ((scale.maximum - value) / (scale.maximum - scale.minimum)) * height;
}

export function trendBar(
  value: number,
  scale: ReturnType<typeof createTrendScale>,
  height: number,
  top: number,
) {
  const zero = trendY(0, scale, height, top);
  const end = trendY(value, scale, height, top);
  return { y: Math.min(zero, end), height: Math.abs(end - zero) };
}
