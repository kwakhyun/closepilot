export const money = (value: number) => `₩${value.toLocaleString("ko-KR")}`;
export const number = (value: number) => value.toLocaleString("ko-KR");
export const deltaMoney = (value: number) =>
  value === 0 ? "—" : `${value > 0 ? "+" : "−"}${money(Math.abs(value))}`;
export const shortMoney = (value: number) =>
  value >= 100_000_000
    ? `${(value / 100_000_000).toFixed(1)}억`
    : `${Math.round(value / 10_000)}만`;
export const timestamp = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
