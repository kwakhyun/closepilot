import {
  DomainError,
  CHANNELS,
  CHANNEL_LABELS,
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
export type ImportField = (typeof IMPORT_FIELDS)[ImportKind][number];
export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  order_id: "주문번호",
  channel: "판매 채널",
  date: "주문일",
  gross: "총액(환불 전)",
  refund: "환불액",
  settlement_id: "정산번호",
  fee: "수수료",
  net: "정산액",
  due_date: "입금 예정일",
  paid_date: "자료상 입금일",
};
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
    throw new DomainError("FILE_TOO_LARGE", "250KB 이하의 CSV 파일을 선택하세요.");
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
    throw new DomainError(
      "EMPTY_CSV",
      "첫 행에 열 이름을 입력하고, 데이터 행을 1개 이상 추가하세요.",
    );
  if (rows.length > 501)
    throw new DomainError("TOO_MANY_ROWS", "한 파일에 최대 500행까지 업로드할 수 있습니다.");
  if (new Set(rows[0]).size !== rows[0].length || rows[0].some((header) => !header))
    throw new DomainError(
      "DUPLICATE_HEADER",
      "CSV의 열 이름은 빈칸 없이 입력하고, 서로 다르게 지정하세요.",
    );
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
  allowedChannels: readonly Channel[] = CHANNELS,
) {
  const [headers, ...rows] = parseCsv(text);
  const selected = mapping ?? suggestMapping(headers, kind);
  const required = IMPORT_FIELDS[kind].filter((field) => field !== "paid_date");
  for (const field of required)
    if (!selected[field] || !headers.includes(selected[field]))
      throw new DomainError(
        "MISSING_MAPPING",
        `${IMPORT_FIELD_LABELS[field]}에 연결할 원본 열을 선택하세요.`,
      );
  const mappedHeaders = IMPORT_FIELDS[kind].map((field) => selected[field]).filter(Boolean);
  if (new Set(mappedHeaders).size !== mappedHeaders.length)
    throw new DomainError("DUPLICATE_MAPPING", "각 항목에는 서로 다른 원본 열을 연결하세요.");
  const errors: string[] = [];
  const orders: Order[] = [],
    settlements: Settlement[] = [];
  for (const [index, row] of rows.entries()) {
    const get = (field: ImportField) => row[headers.indexOf(selected[field])] ?? "";
    try {
      const id = (field: ImportField) => {
        const value = get(field);
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(value))
          throw new Error(
            `${IMPORT_FIELD_LABELS[field]}: 영문, 숫자, 밑줄(_), 하이픈(-)을 사용해 1~64자로 입력하세요.`,
          );
        return value;
      };
      const amount = (field: ImportField, signed = false) => {
        const raw = get(field);
        if (!(signed ? /^-?\d+$/ : /^\d+$/).test(raw))
          throw new Error(
            `${IMPORT_FIELD_LABELS[field]}: 원 단위 정수로 입력하세요. 쉼표, 소수점, 수식은 사용할 수 없습니다.`,
          );
        const value = Number(raw);
        if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_AMOUNT)
          throw new Error(`${IMPORT_FIELD_LABELS[field]}: 금액의 절댓값은 1조 원 이하여야 합니다.`);
        return value;
      };
      const date = (field: ImportField) => {
        const value = get(field);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(Date.parse(value)) ||
          new Date(value).toISOString().slice(0, 10) !== value
        )
          throw new Error(
            `${IMPORT_FIELD_LABELS[field]}: 실제로 존재하는 날짜를 YYYY-MM-DD 형식으로 입력하세요.`,
          );
        return value;
      };
      const channel = get("channel") as Channel;
      if (!CHANNELS.includes(channel))
        throw new Error(
          "판매 채널: d2c(자사몰), naver(스마트스토어), coupang(쿠팡) 중 하나를 입력하세요.",
        );
      if (!allowedChannels.includes(channel))
        throw new Error(
          `판매 채널: 현재 온보딩 프로필에서 사용하지 않는 ${CHANNEL_LABELS[channel]} 채널입니다.`,
        );
      const gross = amount("gross"),
        refund = amount("refund");
      if (refund > gross)
        throw new Error(
          "환불액은 총액을 초과할 수 없습니다. 환불만 별도로 기록한 자료는 이 데모에서 지원하지 않습니다.",
        );
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
      errors.slice(0, 5).join("\n") +
        (errors.length > 5 ? `\n이 외에 오류 ${errors.length - 5}개가 더 있습니다.` : ""),
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

export function buildProfileSampleCsv(
  kind: ImportKind,
  mapping: Record<string, string>,
  enabledChannels: readonly Channel[],
  feeBps: Record<Channel, number>,
) {
  const channels = enabledChannels.length ? enabledChannels : ["d2c" as const];
  const orders = [
    {
      order_id: "DEMO-NEW-001",
      channel: channels[0],
      date: "2026-08-30",
      gross: 100000,
      refund: 0,
    },
    {
      order_id: "DEMO-NEW-002",
      channel: channels[1 % channels.length],
      date: "2026-08-30",
      gross: 80000,
      refund: 10000,
    },
    {
      order_id: "DEMO-NEW-003",
      channel: channels[2 % channels.length],
      date: "2026-08-31",
      gross: 125000,
      refund: 0,
    },
  ];
  const fields = IMPORT_FIELDS[kind];
  const header = fields.map((field) => mapping[field] || IMPORT_FIELD_LABELS[field]);
  const records =
    kind === "orders"
      ? orders
      : orders.map((order, index) => {
          const fee = Math.round(((order.gross - order.refund) * feeBps[order.channel]) / 10_000);
          return {
            settlement_id: `DEMO-ST-00${index + 1}`,
            order_id: order.order_id,
            channel: order.channel,
            gross: order.gross,
            refund: order.refund,
            fee,
            net: order.gross - order.refund - fee,
            due_date: "2026-08-31",
            paid_date: "2026-08-31",
          };
        });
  return [
    header.map(csvCell).join(","),
    ...records.map((record) =>
      fields.map((field) => csvCell(record[field as keyof typeof record])).join(","),
    ),
  ].join("\n");
}

export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  // Spreadsheet formula injection: prefix even when control/whitespace characters precede a formula.
  if (typeof value !== "number" && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
