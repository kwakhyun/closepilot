"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="fallback-page">
      <h1>화면을 불러오지 못했어요</h1>
      <p>저장된 데이터는 변경되지 않았습니다. 다시 시도해 주세요.</p>
      <button className="button primary" onClick={reset}>
        다시 시도
      </button>
    </main>
  );
}
