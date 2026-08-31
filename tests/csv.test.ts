import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { csvCell, importCsv, parseCsv } from "@/domain/csv";

const sample = readFileSync(new URL("../public/samples/orders.csv", import.meta.url), "utf8");
const parse = (csv: string) => importCsv(csv, "orders", undefined, "SOURCE-1", "2026-08");
describe("onboarding boundary", () => {
  it("maps Korean column names to canonical fields", () => {
    const result = parse(sample);
    expect(result.count).toBe(3);
    expect(result.orders[1]).toMatchObject({ id: "DEMO-NEW-002", channel: "naver", refund: 10000 });
  });
  it("accepts UTF-8 BOM and CRLF", () => {
    expect(parse(`\uFEFF${sample.replace(/\r?\n/g, "\r\n")}`).count).toBe(3);
  });
  it("handles quoted commas, escaped quotes and embedded newlines", () => {
    expect(parseCsv('a,b\n"x,y","a""b\nc"')).toEqual([
      ["a", "b"],
      ["x,y", 'a"b\nc'],
    ]);
  });
  it.each(["a,a\n1,2", "a,b\n1", 'a,b\n"1,2', 'a,b\n1"x,2', 'a,b\n"x"z,2', "a,b"])(
    "rejects malformed CSV: %s",
    (value) => {
      expect(() => parseCsv(value)).toThrow();
    },
  );
  it("rejects decimal money and spreadsheet formulas", () => {
    expect(() => parse(sample.replace("100000", "100000.1"))).toThrow("원 단위 정수");
    expect(() => parse(sample.replace("100000", "=1+1"))).toThrow();
  });
  it("rejects unsupported currencies encoded as amounts", () => {
    expect(() => parse(sample.replace("100000", "$100"))).toThrow();
  });
  it("rejects invalid dates and out-of-period orders", () => {
    expect(() => parse(sample.replace("2026-08-30", "2026-02-30"))).toThrow("유효한");
    expect(() => parse(sample.replace("2026-08-30", "2026-09-01"))).toThrow("현재 마감 월");
  });
  it("rejects refunds larger than the original payment", () => {
    expect(() => parse(sample.replace("100000,0", "100000,100001"))).toThrow("초과");
  });
  it("does not permit two semantic fields to share an input column", () => {
    expect(() =>
      importCsv(
        sample,
        "orders",
        {
          order_id: "주문번호",
          channel: "판매채널",
          date: "주문일자",
          gross: "결제금액",
          refund: "결제금액",
        },
        "SOURCE",
        "2026-08",
      ),
    ).toThrow("여러 필드");
  });
  it("bounds byte length and row count", () => {
    expect(() => parseCsv("x".repeat(256001))).toThrow("250KB");
    expect(() => parseCsv("a,b\n" + "1,2\n".repeat(501))).toThrow("500행");
  });
  it.each(["=SUM(A1)", "+cmd", "-1+2", "@evil", "\t=cmd", " =cmd"])(
    "neutralizes CSV formula payload %s",
    (value) => {
      expect(csvCell(value).startsWith("\"'")).toBe(true);
    },
  );
  it("escapes CSV quotes and preserves ordinary values", () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell(100)).toBe('"100"');
    expect(csvCell(-100)).toBe('"-100"');
  });
});
