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
          대시보드로 돌아가기
        </Link>
        <section className="guide-hero">
          <div className="guide-kicker">
            <span />
            COMMERCE OPS · PRODUCT ENGINEERING
          </div>
          <h1>
            마감 전에 남은 <em>{view.summary.issues}건,</em>
            <br />
            근거를 확인하세요.
          </h1>
          <p>
            채널마다 다른 자료와 설명이 필요한 차이를 한곳에서 확인하세요.
            <br />
            ClosePilot은 주문·정산 대사부터 검토와 마감 증빙까지 돕는
            <br className="desktop-break" /> 커머스 매출 마감 도구입니다.
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
            개인 포트폴리오 · PortOne 비공식 · 가상 브랜드와 거래 사용
          </div>
        </section>
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
              가상 K-Beauty 브랜드 LUMIÈRE는 자사몰·스마트스토어·쿠팡 자료를 내려받아 월말에
              비교합니다. 채널마다 열 이름이 다르고, 부분 환불·수수료·입금 시점을 확인해야 차이의
              원인을 설명할 수 있다고 가정했습니다.
            </p>
            <p>
              이 시나리오는 채용 공고와 공개 자료를 바탕으로 만든 <b>고객 문제 가설</b>
              입니다. 실제 고객 인터뷰는 진행하지 않았으며, 수수료율과 거래는 모두 가상입니다.
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
            <ol className="guide-instructions">
              <li>
                <b>검토할 거래를 선택하세요.</b> 정산 누락, 중복, 환불액·수수료 차이, 입금 확인이
                필요한 거래를 원본 자료와 비교합니다.
              </li>
              <li>
                <b>거래 상세에서 검토 근거를 남기세요.</b> ‘검토 예시 불러오기’로 입력을 연습할 수
                있습니다. 원본 자료를 확인한 뒤 체크하고 ‘기록하고 다음 거래 보기’를 누르면 다음
                미검토 거래로 이어집니다.
              </li>
              <li>
                <b>CSV 자료를 추가해 보세요.</b> ‘자료 가져오기’에서 주문·정산 샘플을 각각 반영한 뒤
                대사를 다시 실행합니다.
              </li>
              <li>
                <b>모든 예외 거래를 검토한 뒤 마감을 확정하세요.</b> 원본 입력, 검토 근거, 감사
                기록과 체크섬이 담긴 마감 증빙 파일(JSON)을 내려받을 수 있습니다.
              </li>
            </ol>
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
                  "Kotlin 독립 검증기",
                  "내려받은 마감 증빙의 원본 입력을 JVM에서 다시 계산합니다. 값 클래스와 sealed 타입으로 금액·예외를 표현하고, 검토 근거와 감사 기록의 해시도 검사합니다.",
                ],
                [
                  "규칙 기반 검토 가이드",
                  "규칙 기반 검토 가이드는 LLM을 호출하지 않습니다. 선택형 AI 초안은 저장된 합성 근거만 읽으며, 검토 승인은 사용자가 직접 수행합니다. 송금이나 회계 전표 생성 기능은 제공하지 않습니다.",
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
                  <li>3개 판매 채널의 주문·정산 CSV 가져오기</li>
                  <li>주문·정산 대사 및 7가지 예외 분류</li>
                  <li>검토 사유·증빙 참조 정보·이월 판단 기록</li>
                  <li>세션별 자료 저장, 감사 기록, 마감 후 수정 차단</li>
                  <li>대사 결과 CSV와 마감 증빙 JSON 다운로드</li>
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
              방문자마다 6시간 동안 이용할 수 있는 체험 환경입니다. 실제 재무 업무에 사용하거나 고객
              정보를 업로드하지 마세요. 수수료율은 데모용 가정이며, 화면의 입금일은 정산 자료에
              기록된 값입니다. 은행 계좌를 조회하지 않으며, 자료의 영구 보관도 보장하지 않습니다.
            </p>
          </div>
        </section>
        <section className="guide-cta">
          <div>
            <span className="eyebrow">BUILDING FOR THE LAST MILE</span>
            <h2>문제 정의부터 검증과 배포까지.</h2>
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
