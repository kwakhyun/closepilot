# 실행과 운영 가이드

## 처음 실행

Node.js 24에서 `npm ci`로 의존성을 설치한 뒤 `npm run dev`로 실행한다. 외부 DB 설정이 없으면 로컬 PGlite를 사용한다. 데이터는 `.data/closepilot`에 저장하며 Git에 포함하지 않는다. `/api/health`는 DB에서 `SELECT 1`을 실행해 연결 상태를 확인한다.

PostgreSQL을 사용할 때는 서버 환경 변수 `DATABASE_URL`을 설정한다. 공개 배포는 TLS를 사용하는 Neon의 풀링 연결 문자열로 접속한다. `.env.example`에 필요한 변수를 정리했다. 현재 서버의 DB 계정에는 초기 테이블과 트리거를 만들 권한이 필요하다. 실제 운영에서는 스키마 변경용 계정과 최소 권한의 앱 실행용 계정을 분리해야 한다.

선택형 AI 검토 메모 초안을 사용하려면 서버 전용 `OPENAI_API_KEY`를 설정한다. 기본 모델은 `gpt-5.6-luna`이며 `OPENAI_REVIEW_MODEL`로 바꿀 수 있다. 두 변수 모두 브라우저 번들에 포함하지 않는다. 키가 없거나 호출·출력 검증에 실패하면 규칙 기반 초안으로 전환되므로 대사·검토·마감 흐름은 계속 사용할 수 있다.

## 배포

새 환경에 배포할 때는 Vercel 프로젝트에 전용 Neon DB를 연결하고 production·preview 환경 변수를 확인한다. 기존 서비스의 DB를 공유하지 않는다. 이 프로젝트의 함수와 DB는 싱가포르 리전을 사용한다. 무료 플랜의 한도와 정책은 바뀔 수 있으므로 사용량을 확인한다.

현재 공개 배포는 Vercel CLI로 수행했다. GitHub Actions는 검증만 실행하며 Git push에 따른 자동 배포는 연결하지 않았다. 변경 내용을 공개하려면 해당 Vercel 프로젝트에 연결된 작업 디렉터리에서 검증을 통과한 뒤 아래 배포 명령을 실행한다. 자동 배포는 저장소 접근 권한과 웹훅 권한을 별도로 검토한 뒤 연결할 수 있다.

```bash
npm run verify
vercel deploy --prod
# 배포 뒤 실제 공개 URL에서 합성 데이터로 검사
node scripts/smoke-api.mjs https://YOUR-DOMAIN --allow-remote --report docs/evidence/api-smoke-production.json
npm run eval:review-drafts -- https://YOUR-DOMAIN --allow-remote
```

원격 smoke 검사는 대상 서버에 데모 세션 2개를 만들고 20개 검증 단계를 수행한다. 이 프로젝트가 소유한 환경에서만 실행한다. 토큰·쿠키·DB URL은 보고서에 기록하지 않는다. 세션 생성 한도에 도달하면 반복 재시도를 중단하고 한도를 확인한다.

`APP_ORIGIN`을 설정하면 해당 출처(origin)에서 보낸 변경 요청만 허용한다. 공개 주소와 preview 주소가 다를 수 있으므로 배포 환경에 맞게 설정한다. 값을 생략하면 요청의 공개 호스트 주소를 기준으로 검사한다. 자체 호스팅에서 프록시를 사용할 때는 Host 헤더를 신뢰할 수 있는지 별도로 검토한다.

## 오류별 확인 사항

| 증상                             | 확인과 조치                                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 401 NO_SESSION / SESSION_EXPIRED | 클라이언트는 같은 온보딩 프로필로 새 데모를 자동 시작하고 직전 변경 요청은 재실행하지 않는다. 복구가 실패하면 화면의 새 데모 버튼을 사용한다. |
| 403 ORIGIN_DENIED                | 브라우저 주소, APP_ORIGIN, 프록시의 Host 값이 일치하는지 확인한다. Origin 검사는 유지한다.                                                    |
| 409 VERSION_CONFLICT             | 최신 상태와 다른 요청의 처리 결과를 확인한다. 수정한 내용은 새 요청 키로 보낸다.                                                              |
| 409 IDEMPOTENCY_CONFLICT         | 같은 키에 다른 본문을 보내지 않았는지 확인한다. 최초 요청의 재시도라면 원래 키와 본문을 그대로 사용한다.                                      |
| 409 RECONCILE_REQUIRED           | 새 CSV를 반영한 뒤 대사를 다시 실행한다.                                                                                                      |
| 409 CLOSE_LOCKED                 | 확정한 자료는 수정할 수 없다. 다른 작업을 체험하려면 새 데모를 시작한다.                                                                      |
| 429 RATE_LIMITED / COMMAND_LIMIT | 세션 생성 한도와 변경 기록 수를 확인한다. 오류를 피하려고 보호 장치를 제거하지 않는다.                                                        |
| 500 INTERNAL_ERROR               | 응답 본문·헤더의 requestId로 Vercel 로그를 찾는다. errorType과 DB 연결·권한을 확인한다.                                                       |
| AI 초안이 규칙 기반으로 전환됨   | `review_draft_fallback` 로그의 requestId·errorType을 확인한다. 원본 검토 흐름과 안전장치는 유지한다.                                          |
| 상태 확인 실패                   | DB 서비스, 연결 문자열, TLS, 초기 마이그레이션 권한을 확인한다.                                                                               |

네트워크 연결 실패나 일부 5xx 오류가 발생하면 **같은 요청 키와 본문**으로 재시도한다. 응답을 받지 못했어도 서버에서는 처리가 끝났을 수 있으므로, 새 키로 같은 명령을 곧바로 다시 보내지 않는다.

모든 API 응답의 `Server-Timing`과 구조화 로그로 오류율·p95·명령 수행 시간·AI 전환율을 집계한다. 지표 정의와 초기 경보 기준은 [운영 관측 기준](observability.md)을 따른다.

## 배포 되돌리기와 데이터 보관

첫 배포에서 Next.js 16.3의 standalone 출력과 Vercel 어댑터를 함께 사용할 때 서버 추적 파일을 찾지 못하는 오류가 발생했다. 현재는 Vercel의 함수 패키징을 사용하도록 해당 환경에서 `output`을 생략하고, 로컬·Docker 빌드에는 standalone을 유지한다. 추적 파일을 임의로 만들거나 검증을 끄는 방식은 사용하지 않는다. [같은 문제의 Next.js 이슈](https://github.com/vercel/next.js/issues/96646)

배포 후 장애가 발생하면 Vercel에서 이전 정상 배포로 되돌린다. DB도 변경했다면 이전 앱과의 호환성을 먼저 확인한다. 현재 마이그레이션은 초기 스키마 생성과 JSONB 객체 제약 추가의 2개이며, 스키마를 자동으로 되돌리는 기능은 없다. 스키마 변경은 이전 앱과도 호환되는 확장부터 적용한다.

데모는 자료의 영구 보관이나 복구를 보장하지 않는다. 세션 만료 시각에 맞춘 즉시 삭제 작업과 백업 복구 훈련도 구현·검증하지 않았다. 실제 도입 시에는 Neon 프로젝트의 백업·복구 정책을 확인하고 별도 환경에서 복구 시험을 실행해야 한다.

## 컨테이너

`Dockerfile`은 Next.js standalone 빌드 결과를 root가 아닌 사용자로 실행한다. `compose.yaml`은 로컬 PostgreSQL과 웹 서비스를 함께 실행하며 DB 포트를 외부에 공개하지 않는다. 포함된 DB 비밀번호는 로컬 예제이므로 운영 서버에 사용하면 안 된다. 이 개발 환경에는 Docker가 없어 컨테이너가 실제로 실행되는지는 검증하지 않았다.

## Kotlin

JDK 21과 Gradle Wrapper를 사용한다. Wrapper와 배포 ZIP의 공식 체크섬을 확인했고, 배포 ZIP의 체크섬은 `verifier/gradle/wrapper/gradle-wrapper.properties`에 고정했다. Windows의 한글 경로에서 발생하는 classpath 문제는 `scripts/verify-kotlin.ps1`에서 영문·숫자만 포함된 임시 빌드 경로를 사용해 피한다. 실행 후 임시 파일이 남을 수 있으므로 필요하면 별도로 정리한다.

`bash gradlew run --args='--server 8081'`은 `127.0.0.1`에만 바인딩되는 Kotlin 대사·검증 REST 경계를 연다. `POST /reconcile`은 `krw-net-v1.1.0` 규칙 버전, 채널별 `feeBps`, 주문·정산 입력을 받아 행별 분류와 합계를 반환한다. `POST /verify`는 최대 5MB의 JSON 마감 패키지를 받고 CLI와 같은 독립 재계산 함수를 호출한다. 요청·응답 형식은 [Kotlin OpenAPI 계약](kotlin-openapi.yaml)에 고정했다.

이 서버는 로컬·CI 계약 검증용이며 인증·TLS·외부 공개 운영을 제공하지 않는다. 공개 Vercel 데모는 Kotlin 서비스를 호출하지 않고 TypeScript 인프로세스 엔진을 사용한다. Kotlin 런타임을 별도 컨테이너로 배포하려면 인증, TLS, 타임아웃, 재시도, 관측, 네트워크 정책을 먼저 추가해야 한다.
