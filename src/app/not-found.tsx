import Link from "next/link";
export default function NotFound() {
  return (
    <main className="fallback-page">
      <span className="eyebrow">404 · CLOSEPILOT</span>
      <h1>페이지를 찾을 수 없습니다</h1>
      <p>주소를 확인하거나 대시보드로 돌아가 주세요.</p>
      <Link href="/" className="button primary">
        대시보드로 돌아가기
      </Link>
    </main>
  );
}
