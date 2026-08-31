# 검증 기록

기준일: 2026-08-31. 수치는 합성 데이터 검증 결과이며 실제 고객 성과가 아니다.

## 실행한 검사

| 경계               | 방법                           | 확인한 내용                                                |
| ------------------ | ------------------------------ | ---------------------------------------------------------- |
| Domain/Application | Vitest                         | 정수/반올림, CSV, 예외7종, 검토 fingerprint, 마감 조건     |
| HTTP               | Vitest + 실행 중 서버          | Origin, body 크기, JSON, 안전한 오류/요청ID, 세션          |
| Repository/DB      | 로컬 PGlite / CI PostgreSQL 17 | 행 잠금, 멱등성, 동시 수정, 격리, rollback, DB 불변 트리거 |
| Web 전체 흐름      | `scripts/smoke-api.mjs`        | CSV 반영 → 재대사 → 승인 → 확정 → JSON/CSV 내보내기        |
| Kotlin/JVM         | JDK21 + Gradle                 | 원본 재계산, 승인 fingerprint, 감사 해시, 변조 거부        |

TypeScript 테스트는 77개, Kotlin 테스트는 6개다. HTTP smoke는 한 시나리오를 20개 체크포인트로 검증하며 이를 별도의 20개 단위 테스트라고 부르지 않는다.

로컬 API 기록: [api-smoke-local.json](evidence/api-smoke-local.json). 기준 패키지: [closed-package.json](../fixtures/closed-package.json), 기준 합계: [baseline.json](../fixtures/baseline.json).

## GitHub Actions 실행 결과

2026-08-31, 커밋 `e9dab668427f5475df6b8107067e9c9c16ad3a0d`의 [실행 #33348712211](https://github.com/kwakhyun/closepilot/actions/runs/33348712211)에서 `web`, `kotlin` 작업 모두 `success`로 완료됐다.

- **Web / Ubuntu / Node.js 24 / PostgreSQL 17**: 포맷, 레이어 경계, 타입, lint, TypeScript 테스트 77개, 프로덕션 빌드, 고정 데이터 재생성 일치, 실행 중인 API의 20개 검증 단계를 통과했다. DB 테스트와 HTTP 흐름 모두 실제 PostgreSQL 서비스에 연결했다.
- **Kotlin / Ubuntu / JDK 21**: 테스트와 독립 패키지 재계산을 통과했다. 출력은 `128 rows, 120 matches, 8 evidence-backed reviews, 11 audit events`였다.

실행 페이지의 `web-verification` 아티팩트에는 HTTP 결과 JSON과 서버 로그, `kotlin-verification`에는 테스트 HTML 보고서가 있다. 아티팩트는 GitHub 보존 기간이 지나면 만료될 수 있으며, 아래 명령과 저장소의 고정 입력으로 재실행할 수 있다. CI 통과는 해당 입력·환경의 정확성 검증이며 운영 부하나 SLA 검증이 아니다.

## 고정 입력 재현

```bash
npm ci
npm run verify
npm run fixtures
cd verifier
bash gradlew test run --args='../fixtures/closed-package.json'
```

128행/120일치/8검토/11감사 이벤트를 포함한 기준 패키지 checksum:

```text
16713c14726c4498278c01fef4f1623c330b24dedc4756dfeb98d7d60fd5b3ab
```

## 실제 HTTP 흐름

세션 두 개를 만들고 쿠키로 구분한다. 같은 요청 키의 재시도와 다른 payload 충돌, 동시 버전 충돌, 유효/무효 CSV, 재대사 조건, 미검토 마감 거부, 승인 완료 후 잠금과 내보내기를 검증한다. 샘플 CSV 반영 뒤131건/123일치/8검토가 되는 것도 확인한다. 저장된 보고서에는 토큰을 포함하지 않는다.

## 브라우저와 공개 배포

공개 URL은 [closepilot-delta.vercel.app](https://closepilot-delta.vercel.app)이다. Vercel과 전용 Neon PostgreSQL을 연결했다. 공개 API의 20개 검증 단계를 모두 통과했으며 [실행 보고서](evidence/api-smoke-production.json)에 실제 시각과 결과를 남겼다. 이 실행의 7,977ms는 단일 검증 스크립트의 총 소요 시간이며 서비스 지연이나 처리량 벤치마크가 아니다.

공개 API에서 내려받은 패키지는 Kotlin CLI에서도 **131행 / 123일치 / 8검토 / 17감사 이벤트**로 재계산을 통과했다. 이 패키지의 checksum은 `d8ba21a305cbd18f0bd4f3a461da8f68d248d03bfe527ff4236f6f35340491f0`이다. 임시 패키지에는 합성 입력만 있으며 공개 보고서와 별도로 로컬 `.data`에 보관했다.

브라우저에서 CSV 샘플 두 개의 열 매핑·미리보기·반영, 재대사 전 마감 차단, 예외8건의 확인 체크·승인, 마감 확정과 다운로드 링크를 확인했다. 실제로 실행한 UI 흐름의 최종 상태는131행/123일치/8검토이며 원본 차액37,353원을 유지했다. 검토 가이드의 규칙 기반 표기, 차트 채널 전환, 예외 표의 다음/이전 페이지도 확인했다.

좁은 화면 검사에서 표의 접근성용 숨김 요소가 스크롤 영역 밖으로 나가 문서 너비를 늘리는 문제를 발견했다. 표 스크롤 영역을 위치 기준으로 지정해 수정했고, 390px viewport에서 문서 너비375px(스크롤바 제외)로 가로 넘침이 사라짐을 확인했다. 가이드 페이지도 같은 너비에서 확인했다. 브라우저의 캡처 파일을 `docs/evidence`에 저장한다.

## 검증하지 않은 것

화면 증빙: [대시보드](evidence/dashboard.jpg), [원본 근거와 거래 검토](evidence/review.jpg), [모바일](evidence/mobile.jpg). 공개 데모의 데스크톱 화면에서 브라우저 console 로그를 확인했을 때 반환된 항목은0개였다. 이 결과는 해당 관찰 시점의 콘솔이며 모든 미래 오류가 없다는 보장은 아니다.

실제 PG/은행 연결, 실제 고객 자료, 대량 트래픽/장기 부하, 다수 승인자, 보안 침투 테스트, 백업 복구, Docker 런타임, 법정 회계·개인정보 준수는 검증하지 않았다. 로컬 PGlite와 CI PostgreSQL 통과를 클라우드 PostgreSQL 운영 성능의 증거로 사용하지 않는다.
