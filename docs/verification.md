# 검증 현황

이 문서는 현재 리비전의 검증 기준과 재현 방법만 담는다. 날짜별 실행 기록과 과거 수치는 [검증 이력](verification-history.md)에 보존한다. 모든 수치는 합성 데이터와 검증 환경에서 얻었으며 실제 고객 성과나 운영 SLA를 뜻하지 않는다.

## 현재 검증 기준

| 영역             | 기준                                                        | 현재 결과                      |
| ---------------- | ----------------------------------------------------------- | ------------------------------ |
| 아키텍처         | 계층 간 금지된 의존성 0건                                   | 통과                           |
| TypeScript       | `tsc --noEmit` 오류 0건                                     | 통과                           |
| 정적 분석        | ESLint 오류 0건                                             | 통과                           |
| 단위·통합 테스트 | Vitest 전체 성공                                            | 12개 파일, 121개 테스트 통과   |
| 코드 커버리지    | statements 80%, branches 75%, functions 80%, lines 80% 이상 | 91.56%, 84.86%, 92.96%, 91.95% |
| 브라우저 회귀    | 핵심 사용자 흐름 전체 성공                                  | Playwright 7개 테스트 통과     |
| 프로덕션 빌드    | Next.js 빌드 성공                                           | 통과                           |
| 독립 검증기      | Kotlin 테스트와 마감 패키지 재계산 성공                     | 10개 테스트 통과               |
| 실제 HTTP 흐름   | 세션부터 확정·내보내기까지 20단계 성공                      | 통과, 0.68초                   |
| 보안 의존성      | high 이상 취약점 0건                                        | 통과                           |

커버리지는 `vitest.config.mts`에 명시한 `src/domain/**`, `src/application/**`, `src/infrastructure/http.ts`, `src/infrastructure/repository.ts`를 대상으로 한다. UI 컴포넌트, Next.js Route Handler와 외부 모델 어댑터는 이 수치에 포함하지 않으며 각각 Playwright, HTTP smoke, 구조화 출력·fallback 테스트로 검증한다.

브라우저 회귀 테스트는 다음 흐름을 고정한다.

- 온보딩 프로필을 바꾼 뒤 마감 화면에 선택한 브랜드와 기간이 표시된다.
- 마감 대화상자와 거래 검토 서랍을 `Escape`로 닫을 수 있다.
- AI 초안을 검토 입력란에 적용해도 사용자 확인 전에는 승인할 수 없다.
- 느린 AI 요청을 취소하고 다시 시도할 수 있다.
- 390px 화면에서 거래 핵심 정보가 카드로 보이고 상세 검토로 진입한다.
- 샘플 주문·정산 반영, 재대사, 예외 8건 검토, 마감 확정과 JSON 다운로드를 UI에서 완주한다.
- 미리 완료된 합성 예시는 명확히 표시되며 자료 반영과 재대사를 처음부터 막는다.

Kotlin 테스트는 TypeScript가 생성한 `fixtures/reconciliation-contract.json`의 대표 행과 합계를 `/reconcile` HTTP 응답과 비교한다. 고정 마감 패키지는 128행, 자동 일치 120건, 검토 근거 8건, 감사 이벤트 11건을 재계산했으며 SHA-256은 `2402866290bef63d3b448df4864a5e749baafb31fe5394e0c0bbdb5adbe6c874`였다. 이는 합성 입력에 대한 무결성 검사 결과이며 서명이나 실제 거래 승인을 뜻하지 않는다.

## 재현 명령

```bash
npm ci
npm run format:check
npm run verify
npm run test:coverage
npx playwright install chromium
npm run test:e2e
./scripts/verify-kotlin.ps1
npm audit --omit=dev --audit-level=high
```

Linux와 CI에서는 Kotlin 검증기를 다음과 같이 실행한다.

```bash
cd verifier
bash gradlew test run --args='../fixtures/closed-package.json' --console=plain
```

CI는 [GitHub Actions](https://github.com/kwakhyun/closepilot/actions/workflows/verify.yml)에서 Node.js 24·PostgreSQL 17 검증과 JDK 21 Kotlin 검증을 병렬로 실행한다. 브라우저 실패 시 추적·스크린샷·동영상을, 단위 테스트 실행 시 커버리지 요약을 아티팩트로 남긴다.

## 배포 검증

공개 데모는 [closepilot-delta.vercel.app](https://closepilot-delta.vercel.app)에 배포한다. 배포 후 다음 항목을 다시 확인한다.

1. `/api/health`, 홈, 제품 가이드가 HTTP 200을 반환한다.
2. 새 세션 생성부터 CSV 반영, 대사, 예외 검토, 마감, 내보내기까지 HTTP smoke 흐름이 성공한다.
3. AI 검토 초안이 저장된 합성 근거 ID만 인용하며 실패·시간 초과 시 규칙 기반 초안으로 전환한다.
4. 데스크톱과 390px 모바일 화면에서 핵심 흐름과 키보드 동작을 확인한다.

## 검증 범위의 한계

현재 검증은 합성 거래, 로컬 PGlite, CI PostgreSQL, 관리형 PostgreSQL 배포 환경을 대상으로 한다. 실제 PG 연동, 회계 시스템 연동, 대량·장시간 부하, 장애 주입, Kubernetes 운영, 실사용자 접근성 평가는 포함하지 않는다. 성능 측정값은 개발 환경의 회귀 탐지 자료이며 처리량이나 SLA 약속으로 사용하지 않는다.
