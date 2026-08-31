# 실행과 운영 가이드

## 처음 실행

Node.js 24에서 `npm ci && npm run dev`를 실행한다. 외부 DB 설정이 없으면 로컬 PGlite에 저장한다. 로컬 데이터는 `.data/closepilot`에 있으며 git에 포함되지 않는다. `/api/health`는 DB에 `SELECT 1`을 실행해 연결 상태를 확인한다.

PostgreSQL을 사용할 때 `DATABASE_URL`을 서버 환경에 설정한다. 프로덕션은 Neon의 pooled TLS 연결 문자열을 사용한다. `.env.example`은 필수/선택 변수를 설명한다. 서버 DB role에는 이 데모의 초기 테이블·트리거 생성 권한이 필요하다. 실제 운영에서는 별도 migration role과 최소 권한 runtime role로 분리할 대상이다.

## 배포

Vercel 프로젝트에 새 Neon DB를 연결하고 production/preview 환경 변수를 확인한다. 기존 서비스 DB를 공유하지 않는다. 이 프로젝트의 함수/DB 리전은 Singapore다. 무료 플랜을 사용하지만 플랫폼 정책과 할당량은 변경될 수 있으므로 사용량을 확인한다.

현재 공개 배포는 Vercel CLI로 수행했다. GitHub Actions는 검증을 실행하며, Git push에 따른 Vercel 자동 배포는 연결하지 않았다. 따라서 변경 내용을 공개하려면 검증 통과 후 아래 배포 명령을 실행해야 한다. Git 자동 연결은 저장소 접근·웹훅 권한을 별도로 검토한 뒤 추가할 수 있다.

```bash
npm run verify
vercel deploy --prod
# 배포 뒤 실제 공개 URL에서 합성 데이터로 검사
node scripts/smoke-api.mjs https://YOUR-DOMAIN --allow-remote --report docs/evidence/api-smoke-production.json
```

원격 smoke는 대상에 2개 데모 세션을 만들고 약 20개 검증 단계를 수행한다. 이 포트폴리오 소유의 환경에서만 실행한다. 토큰/쿠키/DB URL은 보고서에 기록하지 않는다. 세션 제한에 걸리면 무작정 재시도하지 않고 한도를 확인한다.

`APP_ORIGIN`을 설정하면 정확히 그 origin의 변경 요청만 허용한다. Vercel alias/preview가 다를 수 있으므로 배포 환경에 맞게 관리한다. 설정하지 않으면 요청의 public host를 사용한다. 프록시 앞에 자체 호스팅할 때는 Host 헤더 신뢰 경계를 별도로 검토한다.

## 흔한 장애

| 증상                             | 확인과 조치                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| 401 NO_SESSION / SESSION_EXPIRED | 쿠키와 6시간 만료 확인. 필요한 파일을 먼저 다운로드하고 새 데모 생성                  |
| 403 ORIGIN_DENIED                | 브라우저 주소, APP_ORIGIN, 프록시 Host 일치 확인. Origin 검사를 끄지 않음             |
| 409 VERSION_CONFLICT             | 최신 상태 재조회. 결과를 확인하고 새 요청 키로 명령 작성                              |
| 409 IDEMPOTENCY_CONFLICT         | 같은 키에 다른 payload를 보내지 않았는지 확인                                         |
| 409 RECONCILE_REQUIRED           | 새 CSV 반영 후 재대사                                                                 |
| 409 CLOSE_LOCKED                 | 확정된 월은 변경 불가. 새 데모에서 작업                                               |
| 429 RATE_LIMITED / COMMAND_LIMIT | 세션 생성/명령 한도 확인. 보호 장치를 제거하지 않음                                   |
| 500 INTERNAL_ERROR               | 응답 body/header의 requestId로 Vercel 로그 검색. 로그의 errorType과 DB 연결/권한 확인 |
| health unavailable               | DB 서비스, 연결 문자열, TLS, 초기 migration 권한 확인                                 |

클라이언트는 네트워크 실패나 일부 5xx에서 **같은 요청 키**로 재시도한다. 응답을 못 받았다고 새로운 키로 같은 업무를 곧바로 반복하지 않는다.

## 되돌리기와 보관

Next.js 16.3과 Vercel 어댑터를 함께 사용할 때 standalone 패키징이 서버 추적 파일을 찾지 못하는 오류를 실제 첫 배포에서 재현했다. Vercel에서는 자체 함수 패키징을 사용하도록 `output`을 생략하고 로컬/Docker에서만 standalone을 유지한다. 추적 파일을 가짜로 만들거나 검증을 끄지 않는다. [동일 문제의 Next.js 이슈](https://github.com/vercel/next.js/issues/96646)

배포 장애는 Vercel의 이전 정상 배포로 되돌린다. DB 변경이 있으면 호환성을 먼저 확인한다. 현재 migration은 초기 스키마와 JSONB 객체 제약 추가의 2개이며 자동 역마이그레이션은 없다. 스키마 변경은 이전 앱과 호환되는 확장부터 수행해야 한다.

데모는 고객 데이터의 영구 보관/복구를 보장하지 않는다. 정확한 TTL 삭제 작업이나 백업 복구 훈련을 운영한 적도 없다. 실제 도입에서는 Neon 프로젝트의 백업/복구 정책을 확인하고 별도 환경에서 복구 시험을 실행한다.

## 컨테이너

`Dockerfile`은 Next standalone 결과를 비root 사용자로 실행한다. `compose.yaml`은 로컬 전용 PostgreSQL과 웹을 묶고 DB 포트를 외부에 노출하지 않는다. 포함된 DB 비밀번호는 로컬 샘플 값으로 실서버에 사용하면 안 된다. Docker가 없는 개발 환경에서 작성되어 컨테이너 실행 성공은 검증 결과에 포함하지 않았다.

## Kotlin

JDK 21과 Gradle Wrapper를 사용한다. Wrapper/배포 ZIP의 공식 checksum을 확인한 뒤 포함했다. `verifier/gradle/wrapper/gradle-wrapper.properties`에 distribution checksum이 고정되어 있다. Windows의 비ASCII 저장 경로 문제는 `scripts/verify-kotlin.ps1`에서 임시 ASCII 빌드 경로로 처리한다. 이 임시 경로의 정리는 OS의 임시 파일 정책에 맡긴다.
