# 아키텍처와 설계 결정

## 경계

`src/domain`은 금액 계산, CSV 표준화, 대사, 감사 기록의 해시를 정의하며 DB·Next.js·React에 의존하지 않는다. `src/application`은 자료 반영, 대사, 검토 승인, 마감 확정 명령에 따른 상태 변경과 검토 정책을 처리한다. `src/infrastructure`는 PostgreSQL 저장소, 세션, HTTP 요청 처리를 담당한다. Route Handler는 요청을 검증하고 처리 결과를 응답으로 변환한다.

공개 웹 앱은 Vercel에 배포하며 서버 코드는 TypeScript로 구현했다. `verifier/`의 Kotlin/JVM 모듈은 주문·정산·프로필 요율을 받는 `POST /reconcile` 대사 유스케이스와 마감 패키지를 검증하는 CLI와 `POST /verify`를 제공한다. 로컬과 CI에서는 실제 HTTP 경계를 실행한다. 공개 Vercel 배포는 JVM을 호스팅하지 않아 TypeScript 인프로세스 대사 함수를 사용한다. 클라이언트 코드는 application 계층의 타입만 `import type`으로 참조한다. `npm run check:architecture`는 이 의존성 규칙을 검사한다. 정적 import 문을 대상으로 하므로 모든 간접 의존성을 추적하는 검사는 아니다.

프런트엔드는 세션·명령 호출을 `useWorkspaceSession`에 모으고, 대시보드 조합, 내비게이션, 요약·거래 화면을 별도 컴포넌트로 나눈다. `showcase=completed`는 application 계층이 동일한 공개 명령을 순서대로 적용해 미리 완료한 합성 작업공간을 만든다. 별도 우회 상태를 주입하지 않으며 생성 후에는 일반 마감과 같은 변경 불가 규칙이 적용된다.

## 금액과 대사

- 금액은 원 단위 정수로 처리한다. 개별 금액과 합계의 절댓값은 1조 원 이하여야 하며, 입력이 안전한 정수인지 검사한다.
- 수수료율은 작업공간에 고정한 온보딩 프로필에서 읽는다. LUMIÈRE 기본 프로필은 자사몰 3.3%, 스마트스토어 3.85%, 쿠팡 8.8%(330·385·880bps), MORROW FOODS 프로필은 자사몰 2.9%, 쿠팡 7.2%로 가정한다. 모두 합성 계약 조건이며, 환불액을 뺀 금액에 적용한 뒤 주문별로 반올림한다.
- `expectedFee = floor(((gross - refund) * bps + 5000) / 10000)`.
- `expectedNet = gross - refund - expectedFee`, `delta = actualNet - expectedNet`.
- TypeScript는 `BigInt`, Kotlin은 `BigInteger`로 중간 곱셈과 합계를 계산한다.
- `actualNet`은 정산 자료의 `net`을 합산한 값으로, 화면에서는 **자료상 정산액**이라고 표시한다. 은행 입금 내역을 조회한 결과가 아니다. 차트는 이 자료를 주문일별 또는 판매 채널별로 집계한다.

온보딩 프로필은 브랜드명, 산업, 마감 기간, 채널별 요율, 사용 채널, 열 연결, 검토 규칙, 가상 진단 결과와 로드맵을 버전 스냅샷으로 보관한다. CSV 반영 때 `saveMapping=true`이면 검증한 열 연결과 자료 반영이 하나의 명령과 트랜잭션으로 저장된다. 프로필을 바꾸거나 복제할 때는 새 세션과 새 합성 데이터를 만들므로 기존 작업공간의 승인 지문과 마감 패키지는 영향을 받지 않는다. 배포 전에 생성된 6시간 세션에는 프로필 필드가 없을 수 있어 기본 LUMIÈRE 프로필로 읽고, 다음 쓰기에서 명시적으로 저장한다.

주문 키는 `(channel, orderId)`다. 서로 다른 채널에서 같은 주문번호를 사용해도 충돌하지 않는다. 같은 키의 주문이 중복되면 파일 전체를 반영하지 않는다. 서로 다른 정산번호는 분할 정산으로 보고 합산하며, 같은 채널에서 정산번호가 반복되면 중복 정산으로 표시한다. 정산 내역이 없는 주문과 연결할 주문을 찾지 못한 정산 내역도 결과에 포함한다.

대표 유형의 우선순위는 **중복 정산 → 주문 미확인 → 정산 누락 → 환불액 차이 → 총액 차이 → 수수료 차이 → 정산액 차이 → 입금 확인 필요 → 일치**다. 총액과 정산액의 차이는 모두 `amount` 유형에 해당한다. 여러 조건이 겹쳐도 대표 유형 하나만 표시하므로 연결된 정산 내역을 함께 확인해야 한다. `timing`은 입금일이 없거나 마감 기준일 이후인 경우이며, 화면에서는 **입금 확인 필요**로 표시한다.

## 상태와 승인

```mermaid
stateDiagram-v2
  [*] --> review: 고정 샘플 / 초기 대사
  review --> open: CSV 반영
  open --> open: CSV 추가 반영
  open --> review: 재대사
  review --> review: 예외 검토 / 재대사
  review --> closed: 미검토 0건 / 최신 대사 / 감사 기록 검증
  closed --> [*]: 조회와 다운로드만 가능
```

검토 기록은 대사 결과의 식별 해시(SHA-256 fingerprint)와 연결한다. 자료가 바뀌어 결과가 달라지면 기존 승인은 유효하지 않다. 입금 확인이 필요한 거래에는 `carry_forward`(이월 검토 승인), 중복 정산에는 `exclude_duplicate`(중복 확인 승인), 나머지에는 `accepted_variance`(차이 검토 승인)만 허용한다. 승인은 검토 판단을 기록하는 기능이며 원본 금액이나 정산 행을 변경하지 않는다.

v1의 대사 결과에 포함된 `explanation` 문자열은 fingerprint 계산에도 사용된다. 문구를 고친다는 이유로 이 값을 바꾸면 기존 승인이 무효화될 수 있다. 따라서 화면과 검토 가이드의 설명은 `src/domain/review-copy.ts`에서 별도로 구성하고, 저장된 대사 결과·감사 기록·마감 증빙은 유지한다. 감사 화면의 처리 유형도 표시할 때만 한글로 바꾼다. [용어와 문구 기준](copy-guide.md)

## 트랜잭션과 멱등성

```mermaid
sequenceDiagram
  participant UI
  participant API
  participant DB as PostgreSQL
  UI->>API: command + expectedVersion + Idempotency-Key
  API->>API: Origin / session / Zod 검증
  API->>DB: BEGIN; SELECT workspace FOR UPDATE
  API->>DB: 기존 receipt 조회
  alt 같은 key와 payload
    DB-->>API: 최신 workspace; 재적용 없음
  else 신규 명령
    API->>API: 버전 / 도메인 불변식 검사
    API->>DB: 상태 + 이벤트 + receipt 저장
  end
  API->>DB: COMMIT
  API-->>UI: workspace + Idempotency-Replayed
```

같은 요청 키에 다른 본문을 보내면 HTTP 409를 반환한다. 키와 본문이 모두 같은 재시도에는 명령을 다시 적용하지 않고 **최신 작업 상태**를 반환한다. 최초 응답을 그대로 돌려주면 클라이언트가 오래된 상태로 되돌아갈 수 있기 때문이다. `expectedVersion`이 현재 버전과 다를 때도 409를 반환해 다른 변경을 덮어쓰지 않도록 한다. 프런트엔드는 최신 상태를 조회하고 충돌 안내를 표시한다.

## 저장 모델

| 테이블                         | 역할                                                           |
| ------------------------------ | -------------------------------------------------------------- |
| `closepilot_workspaces`        | 세션 해시 기본 키, JSONB 마감 데이터, 버전, 상태, 만료 시각    |
| `closepilot_receipts`          | 중복 요청 확인용 처리 이력: 세션·요청 키, 요청 해시, 적용 버전 |
| `closepilot_audit_events`      | 세션·순번별 감사 이벤트 사본                                   |
| `closepilot_rate_limits`       | IP별 시간당 세션 생성 수와 전체 일일 생성 수 제한              |
| `closepilot_schema_migrations` | 런타임 마이그레이션 버전                                       |

한 세션의 마감 데이터를 하나의 일관성 단위(aggregate)로 묶어 JSONB에 저장한다. 이 방식은 한 번의 변경을 원자적으로 처리하고 결과를 재현하기 쉽지만, 주문 500건·정산 1,000행·파일 12개·감사 이벤트 100개라는 제한을 전제로 한다. 변경할 때 전체 데이터를 다시 쓰고 세션별 행 잠금을 사용하므로 대량 거래나 여러 사용자의 동시 편집에는 적합하지 않다. 규모가 커지면 거래 테이블을 정규화하고 조회용 요약 데이터와 작업 큐를 분리해야 한다.

공개 배포는 Neon PostgreSQL을 사용하고, 로컬에서는 PostgreSQL 기반 내장 DB인 PGlite를 기본으로 사용한다. 파일을 저장할 디렉터리가 없으면 먼저 생성한다. Vercel에 `DATABASE_URL`이 설정되지 않았을 때는 오류를 반환한다. 마이그레이션의 중복 실행은 트랜잭션 범위 advisory lock과 버전 테이블로 제어한다. SQL은 [스키마](../migrations/001_initial.sql)를 참고한다.

## 감사와 독립 검증

JSONB 매개변수에는 JavaScript 객체를 전달하고 직렬화는 PostgreSQL 드라이버에 맡긴다. 공개 배포를 검사하면서 PGlite와 Postgres.js의 입력 처리 차이로 JSON이 두 번 직렬화되는 문제를 발견해 수정했다. 마이그레이션 2는 JSON 객체 형식과 필수 필드 제약을 추가한다. `NOT VALID`를 사용해 기존 행 전체를 소급 검사하지 않고 이후 쓰기에 제약을 적용했다. 따라서 과거의 모든 행을 검증했다는 의미는 아니다.

각 이벤트는 이전 이벤트의 해시를 포함한다. DB 트리거는 감사 기록과 마감이 확정된 작업 데이터의 `UPDATE`를 거부하지만, 만료된 세션을 정리하기 위한 `DELETE`는 허용한다. 테이블을 관리할 권한이 있으면 트리거를 변경하거나 기록 전체를 다시 만들 수 있다. 외부 전자서명, 공증, 변경이 불가능한 별도 보관소는 제공하지 않는다.

마감 증빙 JSON에는 표준 형식의 입력, 온보딩 프로필과 채널별 요율, 마감 기준일(`asOf`), 규칙 버전, 대사 결과, 유효한 검토 승인, 자료 체크섬(`digest`), 마감 해시, 감사 기록을 포함한다. 업로드한 CSV의 체크섬은 BOM과 줄바꿈을 정규화한 내용으로 계산한다. 초기 샘플의 체크섬은 생성한 표준 레코드로 계산하며 원본 CSV 파일의 바이트를 뜻하지 않는다. 원본 파일 자체는 저장하지 않는다.

Kotlin 대사 서비스는 같은 규칙 버전과 프로필 요율로 입력을 독립적으로 재계산한다. `/reconcile`은 행별 금액, 분류, 합계를 반환하고 `/verify`는 검토 승인이나 감사 기록이 맞지 않을 때 실패한다. 외부 계약의 정확성이나 증빙의 진위까지 보장하지는 않는다. 두 언어에 계산 규칙이 있으므로 `RULE_VERSION`을 변경할 때는 TypeScript와 Kotlin 구현, 고정 검증 데이터, [Kotlin OpenAPI 계약](kotlin-openapi.yaml)을 함께 갱신하고 반례 테스트를 추가해야 한다.

`fixtures/reconciliation-contract.json`은 TypeScript 대사 엔진이 만든 대표 행별 결과를 Kotlin `/reconcile` HTTP 테스트의 기대값으로 사용한다. 일치, 누락, 중복, 환불, 수수료, 입금 시점 유형과 합계를 한 계약으로 비교해 두 구현의 규칙 버전 또는 직렬화가 어긋나면 CI에서 실패한다. 이 고정 계약은 실제 채널 정책의 정확성을 증명하지 않으며, 합성 입력에 대한 언어 간 동등성만 검사한다.
