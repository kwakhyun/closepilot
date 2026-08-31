import {
  DomainError,
  CHANNELS,
  MAX_AMOUNT,
  type Channel,
  type Order,
  type Settlement,
} from "./model";

export type ImportKind = "orders" | "settlements";
export const IMPORT_FIELDS = {
  orders: ["order_id", "channel", "date", "gross", "refund"],
  settlements: [
    "settlement_id",
    "order_id",
    "channel",
    "gross",
    "refund",
    "fee",
    "net",
    "due_date",
    "paid_date",
  ],
} as const;
const ALIASES: Record<string, string[]> = {
  order_id: ["order_id", "주문번호", "주문id"],
  channel: ["channel", "채널", "판매채널"],
  date: ["date", "주문일", "주문일자"],
  gross: ["gross", "결제금액", "총매출"],
  refund: ["refund", "환불금액", "환불액"],
  settlement_id: ["settlement_id", "정산번호"],
  fee: ["fee", "수수료"],
  net: ["net", "정산금액", "정산액"],
  due_date: ["due_date", "입금예정일"],
  paid_date: ["paid_date", "입금일"],
};

export function parseCsv(text: string): string[][] {
  if (new TextEncoder().encode(text).length > 256_000)
    throw new DomainError("FILE_TOO_LARGE", "CSV는 250KB 이하여야 합니다.");
  const input = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    endedQuote = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        endedQuote = true;
      } else field += char;
    } else if (char === '"') {
      if (field || endedQuote)
        throw new DomainError("INVALID_CSV", "따옴표 형식이 잘못되었습니다.");
      quoted = true;
    } else if (char === "," || char === "\n") {
      row.push(field.trim());
      field = "";
      endedQuote = false;
      if (char === "\n") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else {
      if (endedQuote)
        throw new DomainError(
          "INVALID_CSV",
          "닫는 따옴표 뒤에는 쉼표 또는 줄바꿈만 올 수 있습니다.",
        );
      field += char;
    }
  }
  if (quoted) throw new DomainError("INVALID_CSV", "닫히지 않은 따옴표가 있습니다.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2)
    throw new DomainError("EMPTY_CSV", "헤더와 1개 이상의 데이터 행이 필요합니다.");
  if (rows.length > 501)
    throw new DomainError("TOO_MANY_ROWS", "한 파일에 최대 500행까지 업로드할 수 있습니다.");
  if (new Set(rows[0]).size !== rows[0].length || rows[0].some((header) => !header))
    throw new DomainError("DUPLICATE_HEADER", "CSV 헤더는 비어 있거나 중복될 수 없습니다.");
  if (rows[0].length > 40 || rows.some((entry) => entry.length !== rows[0].length))
    throw new DomainError("INVALID_COLUMNS", "모든 행의 열 개수가 일치해야 합니다(최대 40열).");
  return rows;
}
export function suggestMapping(headers: string[], kind: ImportKind): Record<string, string> {
  return Object.fromEntries(
    IMPORT_FIELDS[kind].map((field) => [
      field,
      headers.find((header) => ALIASES[field].includes(header.toLowerCase())) ?? "",
    ]),
  );
}
export function importCsv(
  text: string,
  kind: ImportKind,
  mapping: Record<string, string> | undefined,
  sourceId: string,
  period: string,
) {
  const [headers, ...rows] = parseCsv(text);
  const selected = mapping ?? suggestMapping(headers, kind);
  const required = IMPORT_FIELDS[kind].filter((field) => field !== "paid_date");
  for (const field of required)
    if (!selected[field] || !headers.includes(selected[field]))
      throw new DomainError("MISSING_MAPPING", `${field}에 연결할 열을 선택하세요.`);
  const mappedHeaders = IMPORT_FIELDS[kind].map((field) => selected[field]).filter(Boolean);
  if (new Set(mappedHeaders).size !== mappedHeaders.length)
    throw new DomainError("DUPLICATE_MAPPING", "하나의 원본 열을 여러 필드에 연결할 수 없습니다.");
  const errors: string[] = [];
  const orders: Order[] = [],
    settlements: Settlement[] = [];
  for (const [index, row] of rows.entries()) {
    const get = (field: string) => row[headers.indexOf(selected[field])] ?? "";
    try {
      const id = (field: string) => {
        const value = get(field);
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(value))
          throw new Error(`${field}: 영문·숫자·_·-로 된 1~64자 ID가 필요합니다.`);
        return value;
      };
      const amount = (field: string, signed = false) => {
        const raw = get(field);
        if (!(signed ? /^-?\d+$/ : /^\d+$/).test(raw))
          throw new Error(`${field}: 원 단위 정수가 필요합니다(쉼표·소수·수식 불가).`);
        const value = Number(raw);
        if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_AMOUNT)
          throw new Error(`${field}: 허용 금액 범위를 초과했습니다.`);
        return value;
      };
      const date = (field: string) => {
        const value = get(field);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(Date.parse(value)) ||
          new Date(value).toISOString().slice(0, 10) !== value
        )
          throw new Error(`${field}: 유효한 YYYY-MM-DD 날짜가 필요합니다.`);
        return value;
      };
      const channel = get("channel") as Channel;
      if (!CHANNELS.includes(channel))
        throw new Error("channel: d2c, naver, coupang 중 하나를 입력하세요.");
      const gross = amount("gross"),
        refund = amount("refund");
      if (refund > gross)
        throw new Error("환불액은 총액을 초과할 수 없습니다. 환불 전용 전표는 MVP 범위 밖입니다.");
      if (kind === "orders") {
        const orderDate = date("date");
        if (!orderDate.startsWith(period))
          throw new Error(`현재 마감 월(${period})의 주문만 가져올 수 있습니다.`);
        orders.push({ id: id("order_id"), channel, date: orderDate, gross, refund, sourceId });
      } else {
        settlements.push({
          id: id("settlement_id"),
          orderId: id("order_id"),
          channel,
          gross,
          refund,
          fee: amount("fee"),
          net: amount("net", true),
          dueDate: date("due_date"),
          paidDate: get("paid_date") ? date("paid_date") : null,
          sourceId,
        });
      }
    } catch (error) {
      errors.push(`${index + 2}행: ${(error as Error).message}`);
    }
  }
  if (errors.length)
    throw new DomainError(
      "INVALID_ROWS",
      errors.slice(0, 5).join("\n") + (errors.length > 5 ? `\n외 ${errors.length - 5}개 오류` : ""),
    );
  return {
    headers,
    mapping: selected,
    count: rows.length,
    orders,
    settlements,
    preview: rows
      .slice(0, 5)
      .map((row) =>
        Object.fromEntries(
          IMPORT_FIELDS[kind].map((field) => [field, row[headers.indexOf(selected[field])] ?? ""]),
        ),
      ),
  };
}

export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  // Spreadsheet formula injection: prefix even when control/whitespace characters precede a formula.
  if (typeof value !== "number" && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
