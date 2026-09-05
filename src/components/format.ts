export const money = (value: number) => `₩${value.toLocaleString("ko-KR")}`;
export const number = (value: number) => value.toLocaleString("ko-KR");
export const deltaMoney = (value: number) =>
  value === 0 ? "—" : `${value > 0 ? "+" : "−"}${money(Math.abs(value))}`;
export const shortMoney = (value: number) => {
  const amount = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const label =
    amount >= 1_000_000_000_000
      ? `${(amount / 1_000_000_000_000).toFixed(1)}조`
      : amount >= 100_000_000
        ? `${(amount / 100_000_000).toFixed(1)}억`
        : amount >= 10_000
          ? `${Math.round(amount / 10_000)}만`
          : Math.round(amount).toLocaleString("ko-KR");
  return `${sign}${label}`;
};
export const timestamp = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
