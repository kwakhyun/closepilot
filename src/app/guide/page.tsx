import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Code2,
  Database,
  FileCheck2,
  Layers3,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { workspaceView } from "@/application/workbench";
import { seedWorkspace } from "@/domain/seed";
import "./guide.css";

export const metadata = { title: "프로젝트 가이드 · ClosePilot" };
export default function Guide() {
  const view = workspaceView(seedWorkspace("2026-08-31T09:00:00.000Z"));
  return (
    <div className="guide-page">
      <header className="guide-header">
        <Link href="/" aria-label="ClosePilot 대시보드">
          <Brand />
        </Link>
        <div>
          <span>PORTFOLIO PROJECT</span>
          <a href="https://github.com/kwakhyun/closepilot" target="_blank" rel="noreferrer">
            GitHub
            <ArrowUpRight size={14} />
          </a>
          <Link href="/" className="button primary">
            데모 체험
            <ArrowRight size={15} />
          </Link>
        </div>
      </header>
      <main className="guide-main">
        <Link href="/" className="guide-back">
          <ArrowLeft size={14} />
          워크스페이스로 돌아가기
        </Link>
        <section className="guide-hero">
          <div className="guide-kicker">
            <span />
            COMMERCE OPS · PRODUCT ENGINEERING
          </div>
          <h1>
            마감의 마지막 <em>{view.summary.issues}건</em>에<br />
            집중하는 제품.
          </h1>
          <p>
            채널마다 다른 자료, 설명되지 않는 차이, 다시 찾아야 하는 근거.
            <br />
            ClosePilot은 주문 수집부터 예외 검토와 마감 증빙까지 연결하는
            <br className="desktop-break" /> 커머스 재무 운영 워크벤치입니다.
          </p>
          <div className="guide-hero-actions">
            <Link href="/" className="button primary">
              3분 데모 시작
              <ArrowRight size={16} />
            </Link>
            <a
              href="https://github.com/kwakhyun/closepilot#readme"
              className="button secondary"
              target="_blank"
              rel="noreferrer"
            >
              설계와 검증 기록
              <ArrowUpRight size={15} />
            </a>
          </div>
          <div className="guide-disclaimer">
            개인 포트폴리오 · PortOne 비공식 · 가상 브랜드·합성 거래 사용
          </div>
        </section>
        <section className="guide-numbers">
          <div>
            <strong>
              {view.summary.total}
              <small>건</small>
            </strong>
            <span>재현 가능한 가상 주문</span>
          </div>
          <div>
            <strong>
              {view.summary.matched}
              <small>건</small>
            </strong>
            <span>원 단위까지 자동 일치</span>
          </div>
          <div>
            <strong>
              {view.summary.issues}
              <small>건</small>
            </strong>
            <span>의도적으로 삽입한 예외</span>
          </div>
          <div>
            <strong>
              3<small>개</small>
            </strong>
            <span>채널별 표준화 어댑터</span>
          </div>
        </section>
        <section className="guide-section">
          <span className="guide-section-index">01 / PROBLEM</span>
          <div className="guide-section-content">
            <h2>
              숫자를 모으는 일보다,
              <br />
              차이를 설명하는 일이 어렵습니다.
            </h2>
            <p>
              가상 K-Beauty 브랜드 LUMIÈRE는 자사몰·스마트스토어·쿠팡 자료를 내려받아 월말에
              비교합니다. 같은 주문도 채널마다 열 이름이 다르고, 부분 환불·수수료·입금 시점 때문에
              금액이 달라집니다.
            </p>
            <p>
              이 시나리오는 채용 공고와 공개 도메인 자료를 바탕으로 구성한 <b>검증 전 고객 가설</b>
              입니다. 실제 고객 인터뷰, 실제 계약 수수료, 업무 절감 성과를 주장하지 않습니다.
            </p>
            <div className="guide-question">
              <span>제품이 답하려는 질문</span>
              <blockquote>“이번 달에 어떤 차이를, 어떤 근거로, 누가 확인했나요?”</blockquote>
            </div>
          </div>
        </section>
        <section className="guide-section">
          <span className="guide-section-index">02 / WORKFLOW</span>
          <div className="guide-section-content">
            <h2>자료에서 마감까지, 끊기지 않게.</h2>
            <div className="guide-flow">
              {[
                {
                  n: "01",
                  title: "연결",
                  body: "CSV 열 매핑\n금액·날짜 검증",
                  icon: <Database size={21} />,
                },
                {
                  n: "02",
                  title: "대사",
                  body: "결정적 규칙\n원 단위 금액 비교",
                  icon: <Layers3 size={21} />,
                },
                {
                  n: "03",
                  title: "검토",
                  body: "차이의 원인 확인\n사유·증빙 기록",
                  icon: <FileCheck2 size={21} />,
                },
                {
                  n: "04",
                  title: "확정",
                  body: "불변 스냅샷\n증빙 패키지 내보내기",
                  icon: <LockKeyhole size={21} />,
                },
              ].map((step) => (
                <div key={step.n}>
                  <span>{step.n}</span>
                  {step.icon}
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              ))}
            </div>
            <ol className="guide-instructions">
              <li>
                <b>대시보드에서 차이를 선택하세요.</b> 정산 누락·중복·환불·수수료·입금 시차를 원본
                근거와 비교합니다.
              </li>
              <li>
                <b>거래 상세에서 검토 기록을 남기세요.</b> ‘데모 검토 예시’를 불러올 수 있지만, 확인
                체크와 승인은 직접 해야 합니다.
              </li>
              <li>
                <b>CSV 온보딩도 체험하세요.</b> ‘자료 업로드’에서 샘플 주문과 정산을 각각 가져온 뒤
                대사를 다시 실행합니다.
              </li>
              <li>
                <b>모든 예외를 검토한 뒤 마감을 확정하세요.</b> 체크섬, 승인 근거, 감사 기록이 담긴
                JSON 패키지를 내려받을 수 있습니다.
              </li>
            </ol>
          </div>
        </section>
        <section className="guide-section">
          <span className="guide-section-index">03 / ENGINEERING</span>
          <div className="guide-section-content">
            <h2>편리함 뒤에, 엄격한 경계.</h2>
            <div className="guide-principles">
              {[
                [
                  "정수 기반 금액",
                  "금액을 원 단위로 제한하고 수수료는 BigInt 중간 연산으로 계산합니다. 소수점·수식 입력을 거부하고 반올림 규칙을 고정했습니다.",
                ],
                [
                  "동시 요청과 재시도",
                  "PostgreSQL 행 잠금과 버전 검사로 변경 순서를 통제합니다. Idempotency-Key를 재사용한 같은 요청은 다시 적용하지 않습니다.",
                ],
                [
                  "세션 경계",
                  "방문자마다 난수 세션을 생성하고 토큰의 해시만 저장합니다. HttpOnly 쿠키로 연결하며, 변경 요청의 Origin을 검증합니다.",
                ],
                [
                  "감사 가능한 승인",
                  "승인 사유·증빙 ID·검토 시점을 이전 이벤트 해시와 연결합니다. 원본 수치를 덮어쓰지 않고 검토 판단을 별도로 저장합니다.",
                ],
                [
                  "확정 후 잠금",
                  "미검토 예외나 최신 대사 결과가 없으면 마감을 거부합니다. 확정된 상태는 애플리케이션과 데이터베이스 양쪽에서 수정할 수 없습니다.",
                ],
                [
                  "Kotlin 독립 검증기",
                  "내려받은 마감 패키지의 원본 입력을 JVM에서 다시 계산합니다. 값 클래스와 sealed 타입으로 금액·예외를 표현하고, 승인 근거와 감사 해시도 함께 검증합니다.",
                ],
                [
                  "설명과 결정의 분리",
                  "공개 데모의 검토 가이드는 결정적 규칙 기반입니다. LLM이 금액·승인·송금을 결정하지 않으며, AI 기능과 실제 동작을 혼동하지 않게 표시합니다.",
                ],
              ].map(([title, body]) => (
                <article key={title}>
                  <ShieldCheck size={18} />
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
            <div className="guide-stack">
              <Code2 size={17} />
              <span>Kotlin/JVM · TypeScript · Next.js · PostgreSQL · Vitest · Vercel</span>
            </div>
          </div>
        </section>
        <section className="guide-section">
          <span className="guide-section-index">04 / SCOPE & HONESTY</span>
          <div className="guide-section-content">
            <h2>만든 것과, 아직 만들지 않은 것.</h2>
            <div className="scope-grid">
              <article>
                <h3>
                  <Check size={17} />
                  동작하는 범위
                </h3>
                <ul>
                  <li>3개 채널의 CSV 자료 표준화와 검증</li>
                  <li>주문·정산 대사 및 7가지 예외 분류</li>
                  <li>근거를 남기는 검토 승인과 이월 판단</li>
                  <li>세션별 저장, 감사 기록, 마감 잠금</li>
                  <li>CSV 내보내기와 검증 가능한 JSON 마감 패키지</li>
                </ul>
              </article>
              <article>
                <h3>실서비스 전 필요한 작업</h3>
                <ul>
                  <li>실제 고객 인터뷰와 채널별 계약 정책 확인</li>
                  <li>기업 SSO, 검토자·승인자 분리와 권한 관리</li>
                  <li>실제 채널·PG 및 은행 입금 원장 연동</li>
                  <li>회계 계정 매핑·전표·외화·환불 전용 전표</li>
                  <li>외부 감사 저장소, 백업·복구·보안 검토</li>
                </ul>
              </article>
            </div>
            <p className="scope-footnote">
              6시간짜리 공개 샌드박스입니다. 실제 재무 운영에 사용할 수 없으며, 세션 종료 후
              데이터가 유지된다고 가정하면 안 됩니다. 수수료는 설명을 위한 가정이고, 입금 여부는
              업로드된 정산 자료의 필드만 사용합니다.
            </p>
          </div>
        </section>
        <section className="guide-cta">
          <div>
            <span className="eyebrow">BUILDING FOR THE LAST MILE</span>
            <h2>작은 차이를 끝까지 해결하는 경험.</h2>
            <p>기획 가설부터 도메인 규칙, 검증, 배포까지 저장소에 기록했습니다.</p>
          </div>
          <Link href="/" className="button primary">
            워크스페이스 열기
            <ArrowRight size={16} />
          </Link>
        </section>
        <footer className="guide-footer">
          <span>ClosePilot · by kwakhyun</span>
          <div>
            <a href="https://developers.portone.io/api/rest-v2" target="_blank" rel="noreferrer">
              PortOne 공개 API 문서
              <ArrowUpRight size={11} />
            </a>
            <a href="https://github.com/kwakhyun/closepilot" target="_blank" rel="noreferrer">
              GitHub
              <ArrowUpRight size={11} />
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
