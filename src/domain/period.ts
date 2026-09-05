import { z } from "zod";

export const periodSchema = z.string().regex(/^(202\d|203[0-5])-(0[1-9]|1[0-2])$/);
export function monthEnd(period: string) {
  const [year, month] = periodSchema.parse(period).split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
export function periodLabel(period: string) {
  const [year, month] = period.split("-");
  return `${year}년 ${Number(month)}월`;
}
