import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClosePilot · 근거 있는 매출 마감",
  description:
    "주문·정산 대사에서 예외 검토와 마감 증빙까지. Commerce Ops를 위한 근거 중심 매출 마감 워크벤치. 합성 데이터 포트폴리오 데모입니다.",
  applicationName: "ClosePilot",
  robots: { index: true, follow: true },
  openGraph: {
    title: "ClosePilot — 근거 있는 매출 마감",
    description: "흩어진 매출을 연결하고, 확신 있게 마감하세요. Commerce Ops 포트폴리오 프로젝트.",
    type: "website",
    locale: "ko_KR",
  },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#173f35" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
