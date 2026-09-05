import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./console.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://closepilot-delta.vercel.app"),
  title: "ClosePilot · 근거를 남기는 매출 마감",
  description:
    "주문·정산 자료 비교부터 예외 검토와 마감 증빙까지 연결하는 커머스 매출 마감 도구입니다. 가상 거래로 전체 과정을 체험하는 포트폴리오 데모입니다.",
  applicationName: "ClosePilot",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "ClosePilot · 근거를 남기는 매출 마감",
    description:
      "주문 자료와 판매 채널의 정산 자료를 비교하고, 예외 거래의 검토 근거와 마감 결과를 남기는 포트폴리오 프로젝트입니다.",
    type: "website",
    locale: "ko_KR",
    url: "/",
    siteName: "ClosePilot",
    images: [
      {
        url: "/console-preview.png",
        width: 1440,
        height: 900,
        alt: "ClosePilot 매출 마감 대시보드",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ClosePilot · 근거를 남기는 매출 마감",
    description: "주문·정산 자료 비교부터 예외 검토와 마감 증빙까지 연결하는 포트폴리오 데모",
    images: ["/console-preview.png"],
  },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
