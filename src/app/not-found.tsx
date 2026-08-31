import Link from "next/link";
export default function NotFound() {
  return (
    <main className="fallback-page">
      <span className="eyebrow">404 · CLOSEPILOT</span>
      <h1>이 페이지는 비어 있어요</h1>
      <p>마감 워크스페이스에서 이어서 확인해 보세요.</p>
      <Link href="/" className="button primary">
        대시보드로 돌아가기
      </Link>
    </main>
  );
}
