import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClosePilot · 근거를 남기는 매출 마감",
  description:
    "주문·정산 자료 비교부터 예외 검토와 마감 증빙까지 연결하는 커머스 매출 마감 도구입니다. 가상 거래로 전체 과정을 체험하는 포트폴리오 데모입니다.",
  applicationName: "ClosePilot",
  robots: { index: true, follow: true },
  openGraph: {
    title: "ClosePilot · 근거를 남기는 매출 마감",
    description:
      "주문과 정산 자료를 비교하고, 차이를 확인해 마감하세요. Commerce Ops 직무 지원을 위한 포트폴리오 프로젝트입니다.",
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
