# 운영 지표와 경보 기준

ClosePilot은 요청 본문, 쿠키, IP 주소를 로그에 남기지 않는다. 모든 API 응답에는 `X-Request-Id`와 `Server-Timing`을 넣고, Vercel 로그에서 집계할 수 있는 구조화 이벤트를 기록한다.

| 이벤트                        | 주요 필드                                              | 확인할 지표                                     |
| ----------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| `http_request_completed`      | requestId, operation, method, path, status, durationMs | 오류율, 경로별 p50·p95 응답 시간                |
| `workspace_command_completed` | requestId, action, replayed, durationMs                | 가져오기·대사·검토·마감 수행 시간과 재시도 비율 |
| `review_draft_generated`      | requestId, model, totalTokens, latencyMs               | AI 초안 지연 시간과 토큰 사용량                 |
| `review_draft_fallback`       | requestId, errorType, errorCode(있는 경우), latencyMs  | AI 초안의 규칙 기반 전환율과 호출 제한 사유     |

초기 운영 경보 기준으로는 5분 동안 API 5xx 비율 2% 초과, p95 1.5초 초과, 자료 가져오기 실패율 10% 초과, AI 초안 전환율 20% 초과를 제안한다. 자동 집계 대시보드와 경보 발송은 구현하지 않았다. 적용할 때는 최소 요청 수 20건을 조건으로 함께 사용하고 실제 트래픽을 확보한 뒤 임계치를 조정한다. AI 전환율은 `review-draft.generate` 요청 수를 분모로 집계하되, `AI_RATE_LIMITED`와 `AI_BUSY`로 인한 전환을 공급자 오류와 구분한다. 캐시 적중은 `review_draft_generated` 이벤트를 남기지 않으므로 생성 이벤트 수를 전체 요청 수로 사용하지 않는다.

로컬에서는 실행 중인 앱을 대상으로 다음 검사를 수행한다.

```bash
npm run benchmark -- http://127.0.0.1:3000
```

검사는 하나의 세션에서 작업공간 조회를 동시 요청 5개씩 총 30회 실행하고 오류율과 p50, p95를 출력한다. 용량, 장시간 안정성, SLA 또는 클라우드 PostgreSQL 성능을 입증하는 부하 테스트가 아니다. 원격 주소를 검사할 때는 실수로 트래픽을 발생시키지 않도록 `--allow-remote`를 명시해야 한다.
