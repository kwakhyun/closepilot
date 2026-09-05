# 검증 현황

이 문서는 현재 코드의 검증 기준, 최근 변경의 실행 기록과 재현 방법을 담는다. 이전 개발 단계의 결과는 [검증 이력](verification-history.md)에 보존한다. 모든 수치는 합성 데이터와 검증 환경에서 얻었으며 실제 고객 성과나 운영 SLA를 뜻하지 않는다.

현재 제품 디자인은 [최신 화면 모음](screenshots.md)을 기준으로 확인한다. 아래 날짜별 실행 기록에 연결된 스크린샷은 해당 검증 시점의 화면이다. 특히 콘솔 리메이크 이전의 녹색 화면은 과거 근거로 보존하며 현재 UI를 뜻하지 않는다.

## 현재 검증 기준

| 영역             | 기준                                                        | 현재 결과                                       |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| 아키텍처         | 계층 간 금지된 의존성 0건                                   | 통과                                            |
| TypeScript       | `tsc --noEmit` 오류 0건                                     | 통과                                            |
| 정적 분석        | ESLint 오류 0건                                             | 통과                                            |
| 단위·통합 테스트 | Vitest 전체 성공                                            | 18개 파일, 186개 테스트 통과                    |
| 코드 커버리지    | statements 80%, branches 75%, functions 80%, lines 80% 이상 | 93.91%, 86.93%, 94.88%, 94.2%                   |
| 브라우저 회귀    | 핵심 사용자 흐름 전체 성공                                  | Playwright 6개 테스트 통과                      |
| 프로덕션 빌드    | Next.js 빌드 성공                                           | 통과                                            |
| 독립 검증기      | Kotlin 테스트와 마감 패키지 재계산 성공                     | 11개 테스트 실행 통과, 윤년 2월 CLI 재계산 통과 |
| 실제 HTTP 흐름   | 세션 생성부터 확정과 내보내기까지 20단계 성공               | 로컬 통과, 0.98초                               |
| 보안 의존성      | high 이상 취약점 0건                                        | 이전 검사 통과, 이번 수정에서는 미실행          |

커버리지는 `vitest.config.mts`에 명시한 `src/domain/**`, `src/application/**`, `src/infrastructure/http.ts`, `src/infrastructure/repository.ts`, `src/infrastructure/review-draft-store.ts`를 대상으로 한다. UI 컴포넌트, Next.js Route Handler와 외부 모델 어댑터는 이 수치에 포함하지 않으며 각각 Playwright, HTTP smoke, API 공급자 대역과 구조화 출력 및 규칙 기반 전환 테스트로 검증한다.

브라우저 회귀 테스트는 다음 흐름을 고정한다.

- 온보딩 프로필을 바꾼 뒤 이전 CSV 검증 결과는 제거되고 마감 화면에는 선택한 브랜드와 기간이 표시된다.
- 마감 대화상자와 거래 검토 서랍을 `Escape`로 닫을 수 있다.
- AI 초안을 검토 입력란에 적용해도 사용자 확인 전에는 승인할 수 없다.
- 느린 AI 요청을 취소하고 다시 시도할 수 있다.
- 320px과 390px 대시보드에서 첫 거래 카드 전체가 첫 화면 안에 들어오고 가로 넘침이 없다. 요약 지표는 거래 목록 아래에 배치한다.
- 샘플 주문·정산과 음수 정산을 반영하고, 재대사, 예외 9건 검토, 마감 확정과 JSON 다운로드를 UI에서 완주한다.
- 음수 막대는 영점 아래에 표시되고 표와 툴팁의 실제 합계가 일치한다. 축 범위, 음수만 있는 데이터, 0원과 월별 집계는 별도 단위 테스트로 검사한다.
- 미리 완료된 합성 예시는 명확히 표시되며 자료 반영과 재대사를 처음부터 막는다.
- 데스크톱과 390px 모바일 흐름에서 사용자 지정 열 연결을 복제한다. 복제 전 세션의 CSV 응답을 지연시켰다가 도착시켜도 새 미리보기에 반영되지 않는지 확인한다.

Kotlin 테스트는 TypeScript가 생성한 `fixtures/reconciliation-contract.json`의 대표 행과 합계를 `/reconcile` HTTP 응답과 비교한다. 고정 마감 패키지는 128행, 자동 일치 120건, 검토 근거 8건, 감사 이벤트 11건을 재계산했으며 SHA-256은 `2402866290bef63d3b448df4864a5e749baafb31fe5394e0c0bbdb5adbe6c874`였다. 이는 합성 입력에 대한 무결성 검사 결과이며 서명이나 실제 거래 승인을 뜻하지 않는다.

## 2026-09-05 수정 검증

Node.js 24.19.0에서 전체 `npm run verify`를 실행했다. 이 작업 전용 Colima VM의 PostgreSQL 17에서 145개 테스트와 빌드가 통과했으며, 검증 후 임시 VM과 DB를 삭제했다. 저장 전 합계 초과 거부, 상태·감사·receipt 롤백, 저장된 프로필 복제와 만료·버전 충돌, AI 생성 예약의 동시성·호출량·캐시 분리·늦은 완료를 검사했다. 런타임 마이그레이션 3으로 새 저장소를 생성한 뒤 해당 테스트를 실행했다.

`npm run test:coverage`는 PGlite에서 145개 테스트가 통과했고 위 커버리지 기준을 충족했다. 초기 병렬 실행에서는 DB 초기화와 일부 테스트가 시간 초과로 실패했다. 테스트 파일 워커를 1개로 제한한 뒤 다시 검증했으며 10초 hook 제한과 30초 테스트 제한은 늘리지 않았다. 개별 테스트 안의 병렬 요청 검사는 그대로 유지한다. 최종 워커 설정에서도 PGlite 기반 `npm run verify`의 전체 검사와 빌드가 통과했다.

`CI=1 PLAYWRIGHT_PORT=3110 npm run test:e2e`는 별도 프로덕션 서버와 실행별 PGlite에서 7개가 모두 통과했다(20.2초). 실제 모델 호출은 끄고 AI 응답은 대역으로 검사했다. 저장된 열 연결을 새 브랜드에 적용한 [1440px 화면](evidence/profile-clone-1440.png)과 [390px 화면](evidence/profile-clone-390.png)을 직접 확인했고 가로 넘침 검사를 통과했다. 브라우저 저장소는 이후 HTTP smoke와 분리해 각각 실제 세션 생성 제한 안에서 실행했다.

로컬 개발 서버의 [HTTP smoke 보고서](evidence/api-smoke-fixes-20260905.json)는 20단계 통과를 기록한다. 새 AI 제한의 실제 공급자 비용이나 모델 품질은 이번에 측정하지 않았다. API 대역 테스트로 한도·실행 중 차단과 캐시 적중 시 모델을 호출하지 않는지, 실패 시 규칙 기반 초안으로 전환하는지를 검증했다.

`npm run fixtures` 재생성 후 기존 세 JSON fixture와 마이그레이션 1·2의 변경은 없고 마이그레이션 3만 추가됐다. JDK 21의 Kotlin CLI 재계산도 기존 마감 해시와 일치했다. Kotlin 소스 변경이 없어 Gradle의 테스트 작업은 `UP-TO-DATE`였으며 이번에 10개 테스트를 새로 실행한 것으로 표현하지 않는다. 기존 계산 규칙과 패키지 형식은 그대로이므로 `RULE_VERSION`을 유지했다.

이번 변경은 로컬 검증이며 아래의 기존 공개 배포 검사와 구분한다.

## 2026-09-05 화면과 조회 개선 검증

화면 상태, 차트 표현과 조회 DTO를 개선한 뒤 Node.js 24.19.0과 PGlite에서 `npm run verify`를 실행했다. 첫 실행은 AI 저장소 테스트의 DB 초기화가 10초 hook 제한에 걸렸고, 150개가 통과하고 6개는 실행되지 않았다. 제한이나 테스트 조건을 바꾸지 않고 재실행해 16개 파일의 156개 테스트와 구조 검사, 타입 검사, ESLint, 프로덕션 빌드를 통과했다. `npm run test:coverage`도 156개 모두 통과했으며 현재 표의 커버리지를 기록했다. 화면용 `trend-data.ts`의 단위 테스트는 실행하지만 위 커버리지 집계 범위에는 포함하지 않는다.

모바일 다운로드 버튼을 정리한 뒤의 PGlite 재검증에서는 두 저장소의 초기화가 시간 초과로 실패해 135개가 통과하고 21개는 실행되지 않았다. 기존 자료와 분리한 임시 PostgreSQL 16에서는 같은 제한과 조건으로 156개 테스트(11.68초), 구조 검사, 타입 검사, ESLint와 빌드를 모두 통과했다. 검증 후 임시 컨테이너를 정리했고 해당 컨테이너가 남지 않은 것을 확인했다. 모든 화면 수정이 끝난 뒤에는 PGlite의 `npm run verify`도 156개 테스트(5.18초)와 빌드까지 통과했다. 앞선 초기화 시간의 불안정성은 실행 이력으로 남겨 둔다.

최종 `CI=1 PLAYWRIGHT_PORT=3133 npm run test:e2e`는 실행별 PGlite와 별도 프로덕션 서버에서 7개가 모두 통과했다(21.4초). [320px 대시보드](evidence/overview-improved-320.png), [390px 대시보드](evidence/overview-improved-390.png), [1440px 음수 차트](evidence/negative-chart-1440.png), [390px 음수 차트](evidence/negative-chart-390.png)를 직접 확인했다. 작은 화면의 기본 샘플 금액은 한 줄에 들어오는지 검사하며, 크기 변경 직후에는 메뉴가 화면 밖으로 이동한 것을 확인한 뒤 캡처한다. 실제 AI 호출은 끄고 기존 공급자 대역을 유지했다.

[HTTP smoke 보고서](evidence/api-smoke-presentation-20260905.json)는 개발 서버에서 20단계 통과를 기록한다(978ms). 조회 계약에 맞춰 smoke 스크립트도 수정하되, 전체 입력과 스냅샷 해시 검사는 제거하지 않고 다운로드한 패키지에 적용했다. 생성된 Playwright 보고서의 외부 JavaScript가 린트에 포함되는 문제도 발견해 `playwright-report`, `test-results`와 커버리지 산출물을 정적 검사와 포맷 검사에서 제외했다. 테스트 소스는 제외하지 않았다. `npm run format:check`와 `git diff --check`도 통과했다.

화면 조회와 패키지 다운로드는 브라우저 테스트에서 별도로 확인한다. 조회의 `close`는 `hash`, `closedAt`, `closedBy`만 포함하고, 다운로드한 패키지는 같은 해시와 전체 원본 입력 및 대사 행을 유지해야 한다. 저장 객체를 읽기 전후로 비교하는 테스트도 추가했다. 도메인 규칙, 승인 지문, SQL과 마감 패키지 형식은 바꾸지 않았으므로 규칙 버전과 Kotlin 코드는 유지했다. 이번 화면 개선에서는 Kotlin을 다시 실행하지 않았다.

128건 완료 예시의 조회 JSON은 압축 전 216,063바이트에서 115,653바이트로 46.47% 줄었다. 같은 문자열을 Node.js의 gzip으로 압축한 비교값은 21,901바이트와 12,125바이트다. 이는 로컬 직렬화 크기 비교이며 실제 네트워크 전송량, 응답 시간이나 사용자 체감 개선 측정은 아니다. [측정 조건과 결과](evidence/presentation-metrics-20260905.json)

## 2026-09-05 커밋 전 문서 점검

README와 설계, 운영, 시연 문서를 현재 코드와 대조했다. 마이그레이션 3의 누락된 설명, 저장소의 application 호출 방향, AI 단계별 출력 한도, 호출 제한 로그와 캐시 집계 기준을 정리했다. 웹 앱의 Docker 빌드 및 Compose 실행은 미검증으로 유지하고, 테스트용 PostgreSQL 컨테이너 실행과 구분했다. 과거 검증 수치와 마감 패키지는 변경하지 않았다.

문서 교정 후 Node.js 24.19.0과 PGlite에서 `npm run verify`를 다시 실행해 51개 모듈의 계층 검사, 타입 검사, ESLint, 16개 파일의 156개 테스트(4.25초)와 프로덕션 빌드를 통과했다. `npm run format:check`와 `git diff --check`도 통과했다. README와 문서 13개에서 상대 경로 파일 링크 45개의 대상이 존재하고, 두 OpenAPI YAML 문서의 내부 참조 64개가 해석되는 것을 확인했다. 외부 URL 전체의 응답 상태나 OpenAPI 스키마 전체의 규격 적합성을 검사한 결과는 아니다. 브라우저, HTTP smoke와 Kotlin 결과는 위 실행 기록을 따르며 이번 문서 교정에서 다시 실행하지 않았다.

## 2026-09-05 기능 확장 검증

문서 수정 후 `npm run format:check`와 `git diff --check`를 통과했다. 두 OpenAPI 문서의 내부 참조 79개와 로컬 문서 링크 48개의 대상을 확인했다. 전체 OpenAPI 규격 적합성이나 외부 링크 응답 검사는 아니다. 새 월별 fixture는 기존 생성 JSON과 같은 방식으로 포맷 검사에서 제외하고 생성 스크립트의 출력을 유지한다. 테스트와 Kotlin 재계산 검사에서는 제외하지 않는다.

최종 재검증에서도 `npm run verify`의 186개 테스트(6.70초)와 빌드가 통과했고, Playwright 6개는 21.2초에 통과했다. [320px 정책 비교](evidence/policy-simulation-320.png), [390px 증빙 조회](evidence/package-inspection-390.png), [월 변경 후 CSV 영향 분석](evidence/monthly-import.png)을 직접 확인했다. 모바일 캡처는 메뉴의 화면 밖 이동이 끝난 뒤 수행하며 가로 넘침을 검사했다. 기존 로컬 서버의 `/api/health` 응답도 정상임을 확인했다.

CSV 영향 분석, 탭별 임시 메모, 복수 진단, 증빙 조회, 수수료 비교와 월 선택을 추가했다. Node.js 24.19.0과 PGlite에서 `npm run verify`로 63개 모듈의 계층 검사, 타입 검사, ESLint, 18개 파일의 186개 테스트(4.97초)와 프로덕션 빌드를 통과했다. `npm run test:coverage`도 186개 테스트를 통과했으며 현재 표에 이 실행의 수치를 기록했다. 이전 절의 156개 테스트와 커버리지는 해당 시점의 결과다.

추가 테스트는 미리보기와 시뮬레이션의 비변경성, 승인 무효화 예상, CSV 행별 오류, 메모의 격리와 만료, 변조 패키지 거부, 윤년과 월말 입력을 다룬다. 신규 API의 Origin 거부, 세션 만료, 버전 충돌과 증빙 본문 크기 제한도 검사했다. SQL과 실제 계산 규칙, 패키지 형식은 바꾸지 않았다. 기존 8월 fixture의 해시와 내용은 유지했으며 `RULE_VERSION`도 유지했다.

`npm run fixtures`는 윤년 2월 검증용 `fixtures/monthly-closed-package.json`을 추가했다. JDK 21에서 Kotlin 테스트 11개를 실제 실행하고 같은 파일을 CLI로 재계산해 통과했다(19초). 128행, 자동 일치 120건과 검토 8건이며 해시는 `f2726f9559afe11f15146b777194084822d29d3e499577f9aa05e55efdfac9ca`다.

별도 프로덕션 서버와 실행별 PGlite의 Playwright 6개가 통과했다. 기존 AI 적용과 취소 검사를 한 세션으로 합쳐 보호 조건은 유지하면서 월 전환 시나리오를 추가했다. 첫 실행의 실패는 존재하지 않는 테스트 선택자였으며 수정했다. 그 실행의 재시도는 시간당 세션 제한에 걸렸다. 제한을 바꾸지 않고 새 실행용 저장소에서 전체 흐름을 재검증했다. 실제 AI 호출, PostgreSQL 재실행과 공개 배포 검증은 이번 기능 확장에서 수행하지 않았다.

## 2026-09-05 콘솔 리메이크 검증

화면 전체의 녹색 계열을 흰색, 중립 회색과 파란색 주요 동작으로 바꾸고 마감 단계별 이동, 설정 보기 분리, 제품 가이드와 공유 이미지를 정리했다. 외부 서비스명이나 로고는 화면에 추가하지 않았다. 이번 디자인 변경에서는 API, SQL, 계산 규칙, 승인 fingerprint와 기존 마감 fixture를 바꾸지 않았다. 앞서 구현한 기능 확장 변경은 그대로 유지했다.

`npm run verify`에서 64개 모듈의 계층 검사, 타입 검사, ESLint, 18개 파일의 186개 테스트(5.60초)와 프로덕션 빌드를 통과했다. 공유 이미지 메타데이터 수정 후 빌드도 다시 통과했다. `npm run format:check`와 `git diff --check`를 통과했다.

최종 Playwright 6개 테스트가 별도 프로덕션 서버와 실행별 PGlite에서 통과했다(21.9초). 첫 디자인 검사에서는 320px에서 금액이 두 줄로 나뉘어 실패했으며 글자 크기를 조정했다. 테스트의 한 줄 표시 조건이나 금액은 바꾸지 않았다. 320px과 390px에서 가로 넘침, 첫 거래 카드의 위치, 설정 보기 전환, CSV 반영, AI 확인 조건, 검토 승인, 마감과 월 전환을 검사했다. 제품 가이드 이미지 로딩과 외부 서비스명 미노출도 검사했다.

[데스크톱 콘솔](../public/console-preview.png), [320px 거래 화면](evidence/console-overview-320.png), [자료 관리](evidence/console-sources-1440.png), [검토 서랍](evidence/console-review.png), [마감 점검](evidence/console-close.png), [320px 정책 비교](evidence/console-policy-320.png)와 [390px 가이드](evidence/console-guide-390.png)를 직접 확인했다. 캡처에서는 유한 애니메이션을 완료해 화면 전환 도중의 상태를 남기지 않는다. 접근성 전체 적합성이나 실제 사용자 사용성 평가를 수행한 결과는 아니다.

이번 디자인 변경에서 Kotlin, PostgreSQL, 실제 AI 호출과 공개 배포 검증은 다시 수행하지 않았다. 해당 결과는 앞선 실행 기록과 구분한다.

## 2026-09-05 문서 이미지 정합성 검증

[현재 제품 화면 목록](screenshots.md)에 화면 9장의 크기, 합성 브랜드와 작업 상태를 기록했다. 기존 검증 기록의 과거 이미지는 보존하고 현재 화면과 구분했다. README와 제품 가이드의 원본은 `public/console-preview.png`로 통일했으며, 가이드의 정적 import로 생성된 이미지가 원본과 바이트 단위로 일치함을 확인했다.

`npm run verify`에서 계층 검사, 타입 검사, ESLint, 186개 테스트(4.35초)와 프로덕션 빌드를 통과했다. 캡처 범위를 조정한 뒤 Playwright 6개 테스트도 통과했다(19.3초). 월별 CSV 영향과 모바일 증빙 조회를 포함한 새 캡처를 직접 확인했다. `npm run fixtures`를 실행했으며 기존 기본 fixture는 변경되지 않았다. README와 문서 14개 파일의 로컬 링크 67개에 대상 파일이 존재하고, 현재 이미지 9장의 실제 크기가 설명과 일치한다. Kotlin, PostgreSQL, 실제 AI 호출과 공개 배포 흐름은 이번 이미지 정리에서 다시 검사하지 않았다.

## 재현 명령

```bash
npm ci
npm run format:check
npm run verify
npm run test:coverage
npx playwright install chromium
npm run test:e2e
npm audit --omit=dev --audit-level=high
```

macOS, Linux와 CI에서는 JDK 21로 Kotlin 검증기를 다음과 같이 실행한다. Windows에서는 PowerShell에서 `./scripts/verify-kotlin.ps1`을 실행한다.

```bash
cd verifier
bash gradlew test run --args='../fixtures/closed-package.json' --console=plain
```

CI는 [GitHub Actions](https://github.com/kwakhyun/closepilot/actions/workflows/verify.yml)에서 Node.js 24와 PostgreSQL 17 검증, JDK 21 Kotlin 검증을 병렬로 실행한다. 브라우저 테스트가 실패하면 추적 파일, 스크린샷, 동영상을 남기고 단위 테스트 실행 시에는 커버리지 요약을 아티팩트로 남긴다.

## 배포 검증

공개 데모는 [closepilot-delta.vercel.app](https://closepilot-delta.vercel.app)에 배포한다. 배포 후 다음 항목을 다시 확인한다.

1. `/api/health`, 홈, 제품 가이드가 HTTP 200을 반환한다.
2. 새 세션 생성부터 CSV 반영, 대사, 예외 검토, 마감, 내보내기까지 HTTP smoke 흐름이 성공한다.
3. AI 검토 초안이 저장된 합성 근거 ID만 인용하며, 호출에 실패하거나 시간이 초과되면 규칙 기반 초안으로 전환한다.
4. 데스크톱과 390px 모바일 화면에서 핵심 흐름과 키보드 동작을 확인한다.

Vercel Git 연동은 `main` 브랜치의 푸시를 프로덕션에 자동 배포한다. GitHub Actions는 별도로 검증을 실행하며 배포를 승인하는 게이트는 아니다. 2026-09-04에 문서와 표시 문구를 교정한 커밋 `204adf8`은 Vercel 배포 `dpl_5ihBVp4TrPBygLk8CU6Frbp5uFxh`로 자동 반영됐고 `READY` 상태를 확인했다. 같은 커밋의 [GitHub Actions #33836685653](https://github.com/kwakhyun/closepilot/actions/runs/33836685653)에서는 PostgreSQL 17 Web 작업과 JDK 21 Kotlin 작업이 모두 성공했다.

[HTTP smoke 보고서](evidence/api-smoke-production-20260904.json)의 20단계 검사와 실제 AI 응답을 요구한 합성 평가 5건은 직전 기능 커밋 `993bcc7`의 공개 배포에서 실행했다. 이후 `204adf8`에서는 API와 도메인 규칙을 바꾸지 않고 문서, 제품 가이드와 공유 메타데이터만 교정했다. 따라서 두 실행의 대상과 범위를 같은 최신 검증으로 합쳐 표현하지 않는다.

## 검증 범위의 한계

현재 검증은 합성 거래, 로컬 PGlite, CI PostgreSQL, 관리형 PostgreSQL 배포 환경을 대상으로 한다. 실제 PG 연동, 회계 시스템 연동, 대규모 또는 장시간 부하, 장애 주입, Kubernetes 운영, 실사용자 접근성 평가는 포함하지 않는다. 성능 측정값은 개발 환경의 회귀 탐지 자료이며 처리량이나 SLA 약속으로 사용하지 않는다.
