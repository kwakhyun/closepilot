import Link from "next/link";
import Image from "next/image";
import consolePreview from "../../../public/console-preview.png";
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

export const metadata = { title: "제품 가이드 · ClosePilot" };
export default function Guide() {
  const view = workspaceView(seedWorkspace("2026-08-31T09:00:00.000Z"));
  return (
    <div className="guide-page">
      <header className="guide-header">
        <Link href="/" aria-label="ClosePilot 대시보드">
          <Brand />
        </Link>
        <div>
          <span>제품 가이드</span>
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
          대시보드로 돌아가기
        </Link>
        <section className="guide-hero">
          <div className="guide-kicker">
            <span />
            매출 관리 / 제품 가이드
          </div>
          <h1>ClosePilot 제품 가이드</h1>
          <p>
            주문과 정산 자료를 비교하고, 예외 거래의 검토 근거와 마감 증빙을 관리합니다. 합성
            데이터로 자료 반영부터 마감 확정까지 확인할 수 있습니다.
          </p>
          <div className="guide-hero-actions">
            <Link href="/?view=transactions" className="button primary">
              90초 핵심 데모
              <ArrowRight size={16} />
            </Link>
            <Link href="/?showcase=completed" className="button secondary">
              완료된 결과 보기
              <ArrowRight size={15} />
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
            개인 포트폴리오 · 가상 브랜드와 거래 사용 · 실제 결제 없음
          </div>
        </section>
        <Image
          className="guide-product-image"
          src={consolePreview}
          alt="ClosePilot의 매출 마감 단계, 거래 지표와 대사 목록"
          sizes="(max-width: 800px) 100vw, 1008px"
        />
        <section className="guide-numbers">
          <div>
            <strong>
              {view.summary.total}
              <small>건</small>
            </strong>
            <span>직접 만든 가상 주문</span>
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
            <span>검토를 연습할 예외 거래</span>
          </div>
          <div>
            <strong>
              3<small>개</small>
            </strong>
            <span>대사 대상 판매 채널</span>
          </div>
        </section>
        <section className="guide-section">
          <span className="guide-section-index">01 / PROBLEM</span>
          <div className="guide-section-content">
            <h2>
              숫자를 모으고,
              <br />
              차이의 이유까지 확인합니다.
            </h2>
            <p>
              가상 K-Beauty 브랜드 LUMIÈRE와 K-Food 브랜드 MORROW FOODS는 서로 다른 채널의 자료를
              월말에 비교합니다. 브랜드마다 열 이름과 수수료 정책이 다르고, 부분 환불·수수료·입금
              시점을 확인해야 차이의 원인을 설명할 수 있다고 가정했습니다.
            </p>
            <p>
              이 시나리오는 공개 자료를 바탕으로 만든 <b>고객 문제 가설</b>입니다. 실제 고객
              인터뷰는 진행하지 않았으며, 수수료율과 거래는 모두 가상입니다.
            </p>
            <div className="guide-question">
              <span>제품이 답하려는 질문</span>
              <blockquote>“어떤 거래에 차이가 있고, 어떤 근거로 검토했나요?”</blockquote>
            </div>
          </div>
        </section>
        <section className="guide-section">
          <span className="guide-section-index">02 / WORKFLOW</span>
          <div className="guide-section-content">
            <h2>자료 가져오기부터 마감 확정까지.</h2>
            <div className="guide-flow">
              {[
                {
                  n: "01",
                  title: "자료 가져오기",
                  body: "CSV 열 연결\n금액·날짜 검증",
                  icon: <Database size={21} />,
                },
                {
                  n: "02",
                  title: "대사",
                  body: "주문·정산 비교\n차이 유형 분류",
                  icon: <Layers3 size={21} />,
                },
                {
                  n: "03",
                  title: "검토",
                  body: "차이의 원인 확인\n검토 근거 기록",
                  icon: <FileCheck2 size={21} />,
                },
                {
                  n: "04",
                  title: "확정",
                  body: "마감 결과 잠금\n마감 증빙 다운로드",
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
            <p>
              처음 보는 검토자는 아래 세 단계만 따라가도 핵심 설계와 완료 결과를 확인할 수 있습니다.
              자료 반영부터 마감까지 직접 실행하는 전체 흐름은 별도 시연 문서에 남겼습니다.
            </p>
            <ol className="guide-instructions">
              <li>
                <b>확인할 거래에서 `LM-2608045`를 여세요.</b> 중복된 정산 두 행과 원본 금액을
                비교하고, 자동 계산 결과를 승인으로 덮어쓰지 않는지 확인합니다.
              </li>
              <li>
                <b>검토 예시를 불러와 한 건만 기록하세요.</b> 사유와 증빙 참조, 사용자 확인이 모두
                있어야 승인되며 다음 미검토 거래로 이어집니다.
              </li>
              <li>
                <b>완료된 결과 보기로 이동하세요.</b> 미리 완료된 합성 예시에서 읽기 전용 상태, 검토
                기록, 감사 이력과 마감 증빙 JSON을 확인합니다.
              </li>
            </ol>
            <p>
              <Link href="/?showcase=completed">완료된 합성 예시 열기</Link>
              {" · "}
              <a href="https://github.com/kwakhyun/closepilot/blob/main/docs/demo-script.md">
                전체 시연 순서 보기
              </a>
            </p>
          </div>
        </section>
        <section className="guide-section">
          <span className="guide-section-index">03 / ENGINEERING</span>
          <div className="guide-section-content">
            <h2>마감 결과를 지키는 설계.</h2>
            <div className="guide-principles">
              {[
                [
                  "원 단위 금액 계산",
                  "금액은 원 단위 정수로 처리합니다. 수수료 계산에는 BigInt를 사용해 정밀도 손실을 막고, 반올림 규칙을 일정하게 적용합니다.",
                ],
                [
                  "동시 요청과 재시도",
                  "PostgreSQL 행 잠금과 버전 검사로 동시에 들어온 변경 요청을 처리합니다. 같은 요청 키로 재시도해도 명령은 한 번만 적용합니다.",
                ],
                [
                  "방문자별 데이터 분리",
                  "방문자마다 별도의 데모 세션을 만들고 DB에는 세션 토큰의 해시만 저장합니다. HttpOnly 쿠키를 사용하며, 자료 변경 요청이 허용된 사이트에서 왔는지 검사합니다.",
                ],
                [
                  "근거가 남는 검토",
                  "검토 사유, 증빙 참조 정보, 검토 시각을 기록합니다. 원본 금액은 바꾸지 않으며, 감사 기록은 이전 기록의 해시와 연결합니다.",
                ],
                [
                  "확정 후 잠금",
                  "미검토 거래가 남아 있거나 최신 자료로 대사를 실행하지 않았다면 마감을 확정할 수 없습니다. 확정 후 변경은 애플리케이션과 DB에서 모두 차단합니다.",
                ],
                [
                  "Kotlin 대사 REST와 독립 검증",
                  "프로필별 요율과 주문·정산 입력을 POST /reconcile에서 계산합니다. 같은 JVM 도메인 함수로 마감 증빙을 다시 계산하고, 검토 근거와 감사 기록의 해시도 검사합니다. 공개 Vercel 데모는 TypeScript 엔진을 사용합니다.",
                ],
                [
                  "규칙 기반 검토 가이드",
                  "규칙 기반 검토 가이드는 LLM을 호출하지 않습니다. AI 검토 초안은 사용자가 요청할 때만 저장된 합성 근거를 읽으며, 검토 승인은 사용자가 직접 수행합니다. 송금이나 회계 전표 생성 기능은 제공하지 않습니다.",
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
            <h2>구현 범위와 남은 과제.</h2>
            <div className="scope-grid">
              <article>
                <h3>
                  <Check size={17} />
                  구현한 기능
                </h3>
                <ul>
                  <li>두 가상 브랜드의 버전형 온보딩 프로필과 설정 복제</li>
                  <li>CSV 열 연결 저장과 프로필별 채널·수수료 정책</li>
                  <li>3개 판매 채널의 주문·정산 CSV 가져오기</li>
                  <li>주문·정산 대사 및 7가지 예외 분류</li>
                  <li>검토 사유·증빙 참조 정보·이월 판단 기록</li>
                  <li>세션별 자료 저장, 감사 기록, 마감 후 수정 차단</li>
                  <li>대사 결과 CSV와 마감 증빙 JSON 다운로드</li>
                  <li>CSV 영향 분석, 검토 메모 임시 저장과 항목별 진단</li>
                  <li>읽기 전용 증빙 검사, 수수료 비교와 월별 합성 작업</li>
                </ul>
              </article>
              <article>
                <h3>실제 도입 전에 필요한 작업</h3>
                <ul>
                  <li>실제 고객 인터뷰와 채널별 계약 정책 확인</li>
                  <li>기업 SSO, 검토자·승인자 분리와 권한 관리</li>
                  <li>판매 채널·PG·은행 입금 내역 연동</li>
                  <li>회계 계정 연결, 전표 생성, 외화·환불 전용 자료 처리</li>
                  <li>외부 감사 저장소, 백업·복구·보안 검토</li>
                </ul>
              </article>
            </div>
            <p className="scope-footnote">
              작업 세션은 6시간이며, 새 작업은 같은 브라우저의 보관함에서 30일간 다시 열 수
              있습니다. 실제 재무 업무에 사용하거나 고객 정보를 업로드하지 마세요. 수수료율은 데모용
              가정이며, 화면의 입금일은 정산 자료에 기록된 값입니다. 은행 계좌를 조회하지 않으며,
              자료의 영구 보관도 보장하지 않습니다.
            </p>
          </div>
        </section>
        <section className="guide-cta">
          <div>
            <span className="eyebrow">문제 가설에서 검증 가능한 데모까지</span>
            <h2>문제 정의부터 구현, 검증, 배포까지.</h2>
            <p>고객 문제 가설, 도메인 설계, 검증 결과와 운영 방법을 저장소에 기록했습니다.</p>
          </div>
          <Link href="/" className="button primary">
            대시보드 열기
            <ArrowRight size={16} />
          </Link>
        </section>
        <footer className="guide-footer">
          <span>ClosePilot · by kwakhyun</span>
          <div>
            <a
              href="https://www.postgresql.org/docs/17/explicit-locking.html"
              target="_blank"
              rel="noreferrer"
            >
              PostgreSQL 행 잠금 문서
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
