"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="fallback-page">
      <h1>화면을 불러오지 못했습니다</h1>
      <p>다시 시도한 뒤 최신 처리 결과를 확인해 주세요.</p>
      <button className="button primary" onClick={reset}>
        다시 시도
      </button>
    </main>
  );
}
