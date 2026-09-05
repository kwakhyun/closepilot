import { expect, test, type Page } from "@playwright/test";

async function openFirstIssue(page: Page) {
  await page.goto("/?view=transactions");
  const desktopAction = page.locator(".row-arrow").first();
  await expect(desktopAction).toBeVisible();
  await desktopAction.click();
  await expect(page.getByRole("dialog", { name: "거래 검토" })).toBeVisible();
}

test("선택한 온보딩 프로필을 마감 점검에 일관되게 표시하고 Escape로 닫는다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "자료 가져오기" }).click();
  const importDialog = page.getByRole("dialog", { name: "CSV 자료 가져오기" });
  await importDialog.getByRole("button", { name: "샘플 주문 불러오기" }).click();
  await expect(importDialog.locator(".validation-success")).toContainText("3행 검증 완료");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "온보딩 설계", exact: true }).click();
  await expect(page.getByRole("heading", { name: "브랜드 설정 라이브러리" })).toBeVisible();
  await page.getByRole("button", { name: "이 설정으로 새 데모" }).click();

  const resetDialog = page.getByRole("dialog", { name: "새 데모를 시작할까요?" });
  await expect(resetDialog).toBeVisible();
  await resetDialog.getByRole("button", { name: "새 데모 시작" }).click();
  await expect(page.getByText("MORROW FOODS 프로필로 새 데모를 시작했습니다.")).toBeVisible();

  await page.getByRole("button", { name: "자료 가져오기" }).click();
  await expect(importDialog.locator(".validation-success")).toHaveCount(0);
  await expect(importDialog.getByRole("button", { name: "자료 반영", exact: true })).toBeDisabled();
  await importDialog.getByRole("button", { name: "샘플 주문 불러오기" }).click();
  await expect(importDialog.getByLabel("주문번호", { exact: false })).toHaveValue(
    "merchant_order_no",
  );
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "마감 점검" }).first().click();
  const closeDialog = page.getByRole("dialog", { name: "마감 전 최종 확인" });
  await expect(closeDialog).toContainText("2026년 8월 · MORROW FOODS");
  await page.screenshot({
    path: "test-results/console-close.png",
    fullPage: false,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(closeDialog).toBeHidden();
});

test("거래 검토 서랍을 열고 Escape로 닫는다", async ({ page }) => {
  await openFirstIssue(page);
  const drawer = page.getByRole("dialog", { name: "거래 검토" });
  await expect(drawer.getByRole("heading", { name: "항목별 진단" })).toBeVisible();
  await expect(drawer.locator(".diagnostic-checks")).toContainText("정산번호 중복");
  await page.screenshot({
    path: "test-results/console-review.png",
    fullPage: false,
    animations: "disabled",
  });
  await drawer
    .getByRole("textbox", { name: /검토 사유/ })
    .fill("이 탭에서 저장한 합성 검토 메모입니다.");
  await drawer.getByRole("textbox", { name: /증빙 참조 정보/ }).fill("SYNTHETIC-DRAFT-1");
  await drawer.getByRole("button", { name: "임시 저장", exact: true }).click();
  await page.reload();
  await page.locator(".row-arrow").first().click();
  await drawer.getByRole("button", { name: "임시 메모 불러오기" }).click();
  await expect(drawer.getByRole("textbox", { name: /검토 사유/ })).toHaveValue(
    "이 탭에서 저장한 합성 검토 메모입니다.",
  );
  await expect(drawer.getByRole("checkbox", { name: /원본 자료와 검토 사유/ })).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await page.getByLabel("예외 유형 필터").selectOption("duplicate");
  await expect(page.locator(".transaction-table tbody tr")).toHaveCount(1);
  await page.getByLabel("최소 차이 금액").fill("1000000000000");
  await expect(page.getByText("조건에 맞는 거래가 없습니다", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "필터 초기화" }).click();
  await expect(page.locator(".transaction-table tbody tr")).toHaveCount(8);
  await verifyProfileClone(page, 1440);
});

test("AI 초안은 확인 전 승인할 수 없고 느린 요청은 취소하고 재시도할 수 있다", async ({ page }) => {
  await page.route("**/api/review-draft", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "ai",
        model: "e2e-grounded-draft",
        generatedAt: "2026-09-01T00:00:00.000Z",
        latencyMs: 42,
        draft: {
          summary: "저장된 주문과 정산 근거에서 정산액 차이를 확인한 검토 초안입니다.",
          note: "저장된 원본 자료와 정산 근거를 대조해 금액 차이와 처리 기준을 확인했습니다.",
          evidenceReference: "SRC-ORD-01 / SET-E2E-01",
          checks: ["원본 주문 자료를 확인했습니다.", "정산 근거 식별자를 확인했습니다."],
          citations: ["SRC-ORD-01"],
        },
        notice: "저장된 합성 근거만 사용한 테스트 초안입니다.",
      }),
    });
  });
  await openFirstIssue(page);

  await page.getByRole("button", { name: "초안 만들기" }).click();
  await page.getByRole("button", { name: "검토 사유와 증빙 참조에 적용" }).click();

  const drawer = page.getByRole("dialog", { name: "거래 검토" });
  await expect(drawer.getByRole("textbox", { name: /검토 사유/ })).toHaveValue(/저장된 원본 자료/);
  await expect(drawer.getByRole("textbox", { name: /증빙 참조 정보/ })).toHaveValue(
    "SRC-ORD-01 / SET-E2E-01",
  );
  await expect(drawer.locator('button[type="submit"].primary')).toBeDisabled();
  await page.unroute("**/api/review-draft");
  await page.route("**/api/review-draft", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await route.abort().catch(() => undefined);
  });
  await openFirstIssue(page);

  await page.getByRole("button", { name: "초안 만들기" }).click();
  await expect(page.getByRole("button", { name: "생성 취소" })).toBeVisible();
  await page.getByRole("button", { name: "생성 취소" }).click();
  await expect(
    page.getByText("초안 생성을 취소했습니다. 필요하면 다시 시도할 수 있습니다."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
});

test("모바일에서는 거래 핵심 정보가 카드로 보이고 상세 검토로 진입한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const overviewCard = page.locator(".mobile-transaction-card").first();
  await expect(overviewCard).toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const cardBounds = await overviewCard.boundingBox();
    expect(cardBounds!.y + cardBounds!.height).toBeLessThanOrEqual(844);
    const metricBounds = await page.locator(".metrics-grid").boundingBox();
    expect(metricBounds!.y).toBeGreaterThan(cardBounds!.y);
    for (const value of await page.locator(".metrics-grid .metric-value").all()) {
      expect(
        await value.evaluate((element) => element.getBoundingClientRect().height),
      ).toBeLessThan(30);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `test-results/overview-${width}.png`,
      fullPage: false,
      animations: "disabled",
    });
  }
  await page.goto("/?view=transactions");

  await expect(page.locator(".table-scroll")).toBeHidden();
  const firstCard = page.locator(".mobile-transaction-card").first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard).toContainText("예상");
  await expect(firstCard).toContainText("자료상");
  await expect(firstCard).toContainText("차이");
  await firstCard.click();
  await expect(page.getByRole("dialog", { name: "거래 검토" })).toBeVisible();
  await page.keyboard.press("Escape");
  await verifyProfileClone(page, 390);
});

test("주문·정산 자료 반영부터 재대사, 전건 검토, 마감 증빙 다운로드까지 완결한다", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByLabel("마감 작업 단계")).toBeVisible();
  await expect(page.locator(".transaction-table tbody tr").first()).toBeVisible();
  await expect
    .poll(async () => {
      const track = await page.locator(".sidebar-progress").boundingBox();
      const fill = await page.locator(".sidebar-progress span").boundingBox();
      return fill!.width / track!.width;
    })
    .toBeGreaterThan(0.9);
  await expect(page.locator("body")).not.toContainText(/포트원|portone/i);
  await page.screenshot({
    path: "test-results/console-overview-1440.png",
    fullPage: false,
    animations: "disabled",
  });
  await page.getByRole("button", { name: /자료 확인.*자료/ }).click();
  await expect(page.locator(".page-header h1")).toHaveText("자료 관리");
  await page.screenshot({
    path: "test-results/console-sources-1440.png",
    fullPage: false,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "마감 대시보드", exact: true }).click();

  await page.getByRole("button", { name: "자료 가져오기" }).click();
  let importDialog = page.getByRole("dialog", { name: "자료 가져오기" });
  await importDialog.getByRole("button", { name: "샘플 주문 불러오기" }).click();
  await expect(importDialog.locator(".validation-success")).toContainText("3행 검증 완료");
  await expect(importDialog.getByLabel("반영 전 영향 분석")).toContainText("128 → 131건");
  await importDialog.getByRole("button", { name: "자료 반영" }).click();
  await expect(importDialog).toBeHidden();

  await page.getByRole("button", { name: "자료 가져오기" }).click();
  importDialog = page.getByRole("dialog", { name: "자료 가져오기" });
  await importDialog.getByLabel(/채널 정산 자료/).check();
  await importDialog.getByRole("button", { name: "샘플 정산 불러오기" }).click();
  await expect(importDialog.locator(".validation-success")).toContainText("3행 검증 완료");
  await importDialog.getByRole("button", { name: "자료 반영" }).click();
  await expect(importDialog).toBeHidden();

  await page.getByRole("button", { name: "자료 가져오기" }).click();
  await importDialog.getByLabel(/채널 정산 자료/).check();
  await importDialog.locator('input[type="file"]').setInputFiles({
    name: "negative.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "settlement_id,order_id,channel,gross,refund,fee,net,due_date,paid_date\nNEGATIVE-1,ORPHAN-NEGATIVE,d2c,0,0,2000000,-2000000,2026-08-31,2026-08-31",
    ),
  });
  await expect(importDialog.locator(".validation-success")).toContainText("1행 검증 완료");
  await importDialog.getByRole("button", { name: "자료 반영", exact: true }).click();
  await expect(importDialog).toBeHidden();
  const negativeBar = page.locator('rect[data-series="actual"][data-value^="-"]').first();
  await expect(negativeBar).toHaveCount(1);
  const baseline = Number(await page.locator('[data-zero-baseline="true"]').getAttribute("y1"));
  expect(Number(await negativeBar.getAttribute("y"))).toBeCloseTo(baseline);
  expect(Number(await negativeBar.getAttribute("height"))).toBeGreaterThan(0);
  await page.locator(".chart-card").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/negative-chart-1440.png",
    fullPage: false,
    animations: "disabled",
  });
  await page.locator(".chart-data summary").click();
  await expect(page.locator(".chart-data")).toContainText("₩-1,886,000");
  await page.locator(".chart-data summary").click();
  await negativeBar.hover();
  await expect(page.locator(".chart-tooltip")).toContainText("₩-1,886,000");
  await page.mouse.move(0, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#workspace-navigation")).toHaveAttribute("aria-hidden", "true");
  await expect
    .poll(async () => {
      const bounds = await page.locator("#workspace-navigation").boundingBox();
      return bounds!.x + bounds!.width;
    })
    .toBeLessThanOrEqual(0);
  await page.locator(".chart-card").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: "test-results/negative-chart-390.png",
    fullPage: false,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole("button", { name: "대사 실행" }).click();
  await expect(
    page.getByText("대사를 완료했습니다. 최신 자료로 결과를 갱신했습니다."),
  ).toBeVisible();
  await page.getByRole("button", { name: /거래 대사/ }).click();
  await page.locator(".row-arrow").first().click();

  for (let reviewed = 1; reviewed <= 9; reviewed++) {
    const drawer = page.getByRole("dialog", { name: "거래 검토" });
    await drawer.getByRole("button", { name: "검토 예시 불러오기" }).click();
    await drawer.getByRole("checkbox", { name: /원본 자료와 검토 사유/ }).check();
    const submit = drawer.locator(".review-submit-actions .primary");
    await expect(submit).toBeEnabled();
    await submit.click();
    if (reviewed < 9) {
      await expect(drawer.getByRole("textbox", { name: /검토 사유/ })).toHaveValue("");
    } else {
      await expect(drawer.getByText(/검토 승인 완료/)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
    }
  }

  await page.getByRole("button", { name: "마감 점검" }).first().click();
  let closeDialog = page.getByRole("dialog", { name: "마감 전 최종 확인" });
  await closeDialog.getByRole("checkbox", { name: /검토 사유와 남아 있는 금액 차이/ }).check();
  await closeDialog.getByRole("button", { name: "2026년 8월 마감 확정" }).click();
  closeDialog = page.getByRole("dialog", { name: "2026년 8월 마감을 완료했습니다" });
  await expect(closeDialog).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await closeDialog.getByRole("link", { name: "마감 증빙 다운로드 (JSON)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^closepilot-2026-08-close\.json$/);
  const view = await (await page.request.get("/api/workspace")).json();
  const evidence = await (await page.request.get("/api/export?format=json")).json();
  expect(Object.keys(view.close).sort()).toEqual(["closedAt", "closedBy", "hash"]);
  expect(evidence.snapshot.hash).toBe(view.close.hash);
  expect(evidence.snapshot.inputs.orders).toHaveLength(131);
  expect(evidence.snapshot.rows).toHaveLength(view.rows.length);
  await expect(page.getByRole("button", { name: "자료 가져오기" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "대사 실행" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "감사 기록", exact: true }).click();
  await page.getByLabel("마감 증빙 JSON 선택").setInputFiles({
    name: "close.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(evidence)),
  });
  await expect(page.getByLabel("증빙 검증 결과")).toContainText("통과: 감사 연결과 마감 기록");
  await page.getByText(`거래와 검토 근거 ${view.rows.length}건`, { exact: true }).click();
  await page.getByLabel("증빙 거래 검색").fill("ORPHAN-NEGATIVE");
  await expect(
    page.locator(".feature-section").filter({ has: page.locator("#package-title") }),
  ).toContainText("₩-2,000,000");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await settleToolViewport(page, width);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.locator("#package-title").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/package-inspection-${width}.png`,
      fullPage: false,
      animations: "disabled",
    });
  }
  const corrupt = structuredClone(evidence);
  corrupt.snapshot.gross++;
  await page.getByLabel("마감 증빙 JSON 선택").setInputFiles({
    name: "corrupt.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(corrupt)),
  });
  await expect(page.getByLabel("증빙 검증 결과")).toContainText("실패: 마감 체크섬");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "온보딩 설계", exact: true }).click();
  await page.getByRole("button", { name: "정책 비교", exact: true }).click();
  await page.getByLabel("자사몰 수수료율 (%)", { exact: true }).fill("4");
  await page.getByRole("button", { name: "현재 정책과 비교" }).click();
  await expect(page.locator(".impact-summary")).toContainText("재검토 대상");
  expect((await (await page.request.get("/api/export?format=json")).json()).snapshot.hash).toBe(
    evidence.snapshot.hash,
  );
  for (const width of [1440, 320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await settleToolViewport(page, width);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.locator("#simulation-title").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/policy-simulation-${width}.png`,
      fullPage: false,
      animations: "disabled",
    });
  }
});

test("완료된 합성 예시는 읽기 전용이며 다음 월 정책과 이월 근거를 검토할 수 있다", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const prepared = await page.request.post("/api/session", {
    headers: { Origin: baseURL! },
    data: { showcase: "completed", period: "2024-01" },
  });
  expect(prepared.ok()).toBe(true);
  await page.goto("/");
  await expect(page.getByText("미리 완료된 합성 마감 예시입니다.")).toBeVisible();
  await expect(page.getByText("마감 완료")).toBeVisible();
  await expect(page.getByRole("button", { name: "자료 가져오기" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "대사 실행" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "마감 증빙 내려받기" })).toBeVisible();
  const before = await (await page.request.get("/api/workspace")).json();
  await page.getByRole("button", { name: "온보딩 설계", exact: true }).click();
  await page.getByRole("button", { name: "월별 작업", exact: true }).click();
  await page.getByLabel("마감 월", { exact: true }).fill("2024-02");
  await page.getByRole("button", { name: "이 월로 새 작업 시작" }).click();
  const dialog = page.getByRole("dialog", { name: "새 월의 작업을 시작할까요?" });
  await expect(dialog.getByRole("link", { name: "현재 마감 증빙 다운로드" })).toBeVisible();
  await dialog.getByRole("button", { name: "새 월 작업 시작" }).click();
  await expect(page.locator(".page-header")).toContainText("2024년 2월");
  const current = await (await page.request.get("/api/workspace")).json();
  expect(current.period).toBe("2024-02");
  expect(current.asOf).toBe("2024-02-29");
  expect(current.profile.id).toBe(before.profile.id);
  expect(current.close).toBeNull();
  expect(current.draftScope).not.toBe(before.draftScope);
  await page.getByRole("button", { name: "자료 가져오기" }).click();
  await page.getByRole("button", { name: "샘플 주문 불러오기" }).click();
  await expect(page.locator(".validation-success")).toContainText("3행 검증 완료");
  await expect(page.locator(".preview-table")).toContainText("2024-02-29");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator(".preview-table").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/monthly-import.png",
    fullPage: false,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "자료 반영", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "CSV 자료 가져오기" })).toBeHidden();
  const saved = await (await page.request.get("/api/workspace")).json();
  expect(saved.orders).toHaveLength(131);
  await page.getByRole("button", { name: "온보딩 설계", exact: true }).click();
  await page.getByRole("button", { name: "월별 작업", exact: true }).click();
  await expect(page.locator(".workspace-library li")).toHaveCount(2);
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await settleToolViewport(page, width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("heading", { name: "월별 작업 보관함" }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/workspace-library-${width}.png`,
      animations: "disabled",
    });
  }
  await page
    .locator(".workspace-library li")
    .filter({ hasText: "2024-01" })
    .getByRole("button", { name: "작업 열기" })
    .click();
  await expect(page.locator(".page-header")).toContainText("2024년 1월");
  expect((await (await page.request.get("/api/workspace")).json()).close).toEqual(before.close);
  await page.context().clearCookies({ name: "closepilot_session" });
  await page.reload();
  await expect(page.getByText("미리 완료된 합성 마감 예시입니다.")).toBeVisible();
  await expect(page.locator(".page-header")).toContainText("2024년 1월");
  expect((await (await page.request.get("/api/workspace")).json()).close).toEqual(before.close);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "온보딩 설계", exact: true }).click();
  await page.getByRole("button", { name: "월별 작업", exact: true }).click();
  await page
    .locator(".workspace-library li")
    .filter({ hasText: "2024-02" })
    .getByRole("button", { name: "작업 열기" })
    .click();
  await expect(page.locator(".page-header")).toContainText("2024년 2월");
  const restored = await (await page.request.get("/api/workspace")).json();
  expect(restored.orders).toEqual(saved.orders);
  expect(restored.version).toBe(saved.version);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "자료 가져오기" }).click();
  await page.getByLabel("CSV 파일 선택").setInputFiles({
    name: "changed.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "주문번호,판매채널,주문일자,changed,환불금액\nANOTHER,d2c,2024-02-01,1000,0",
    ),
  });
  const templates = page.getByLabel("저장된 열 연결 선택");
  await expect(templates.locator("option")).toHaveCount(2);
  await templates.selectOption({ index: 1 });
  await expect(page.getByText(/필수 열이 변경되어 적용할 수 없습니다/)).toBeVisible();
  await expect(page.getByRole("button", { name: "열 연결 적용", exact: true })).toBeDisabled();
  await page.getByLabel("CSV 파일 선택").setInputFiles({
    name: "compatible.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "주문번호,판매채널,주문일자,결제금액,환불금액\nANOTHER,d2c,2024-02-01,1000,0",
    ),
  });
  await expect(page.locator(".validation-success")).toBeVisible();
  await page.getByLabel("저장된 열 연결 선택").selectOption({ index: 1 });
  await page.getByRole("button", { name: "열 연결 적용", exact: true }).click();
  await expect(page.locator(".validation-success")).toContainText("1행 검증 완료");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "온보딩 설계", exact: true }).click();
  await page.getByRole("button", { name: "정책 비교", exact: true }).click();
  await page.getByLabel("자사몰 수수료율 (%)", { exact: true }).fill("4");
  await page.getByRole("button", { name: "현재 정책과 비교", exact: true }).click();
  await expect(page.getByRole("button", { name: "이 월의 정책 적용" })).toBeDisabled();
  await page
    .getByLabel("정책 변경 사유", { exact: true })
    .fill("합성 계약의 월별 요율 변경 영향을 확인했습니다.");
  await page.getByLabel("정책 근거 참조", { exact: true }).fill("SYNTHETIC-CONTRACT-202402");
  await page.getByRole("checkbox", { name: /월 전체 적용과 재검토/ }).check();
  await page.getByRole("button", { name: "이 월의 정책 적용" }).click();
  await expect(
    page.getByText("월별 정책을 적용했습니다. 대사를 다시 실행한 뒤 변경된 거래를 검토하세요."),
  ).toBeVisible();
  const policyApplied = await (await page.request.get("/api/workspace")).json();
  expect(policyApplied.profile.policy.feeBps.d2c).toBe(400);
  expect(policyApplied.lastRunAt).toBeNull();
  await page.getByText("정책 변경 이력 1건", { exact: true }).click();
  await page.screenshot({
    path: "test-results/policy-applied-1280.png",
    animations: "disabled",
    fullPage: true,
  });
  const prior = before.rows.find((row: { kind: string }) => row.kind === "timing");
  await page.getByRole("button", { name: "자료 가져오기", exact: true }).click();
  const followImport = page.getByRole("dialog", { name: "CSV 자료 가져오기" });
  await followImport.getByRole("button", { name: "파일 또는 자료 유형 바꾸기" }).click();
  await followImport.getByLabel(/채널 정산 자료/).check();
  await followImport.getByLabel("CSV 파일 선택").setInputFiles({
    name: "followup.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `settlement_id,order_id,channel,gross,refund,fee,net,due_date,paid_date\nFOLLOW-E2E,${prior.orderId},${prior.channel},${prior.gross},${prior.refund},${prior.actualFee},${prior.actualNet},2024-02-01,2024-02-01`,
    ),
  });
  await expect(followImport.locator(".validation-success")).toContainText("1행 검증 완료");
  await followImport.getByRole("button", { name: "자료 반영", exact: true }).click();
  await expect(followImport).toBeHidden();
  await page.getByRole("button", { name: "대사 실행", exact: true }).click();
  await expect(
    page.getByText("대사를 완료했습니다. 최신 자료로 결과를 갱신했습니다."),
  ).toBeVisible();
  await page.getByRole("button", { name: "감사 기록", exact: true }).click();
  const followup = page.locator(".followup-item").filter({ hasText: prior.orderId });
  await followup.locator("summary").click();
  await followup.getByRole("checkbox", { name: /FOLLOW-E2E/ }).check();
  await followup.getByRole("combobox").selectOption("evidence_reviewed");
  await followup
    .getByLabel("후속 검토 사유", { exact: true })
    .fill("이번 달 합성 정산 자료와 이전 마감 근거를 대조했습니다.");
  await followup.getByLabel("후속 증빙 참조", { exact: true }).fill("SYNTHETIC-FOLLOWUP-E2E");
  await expect(followup.getByRole("button", { name: "후속 검토 기록" })).toBeDisabled();
  await followup.getByRole("checkbox", { name: /선택한 근거와 검토 사유/ }).check();
  await followup.getByRole("button", { name: "후속 검토 기록" }).click();
  await expect(followup.locator("summary")).toContainText("근거 검토 기록됨");
  await followup.locator("summary").click();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await settleToolViewport(page, width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await followup.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/followup-reviewed-${width}.png`,
      animations: "disabled",
      fullPage: false,
    });
  }
  await page.goto("/guide");
  await expect(
    page.getByRole("heading", { name: "ClosePilot 제품 가이드", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".guide-product-image")
        .evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".guide-product-image").evaluate(async (element) => {
      const image = element as HTMLImageElement;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await image.decode();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `test-results/console-guide-${width}.png`,
      fullPage: false,
      animations: "disabled",
    });
  }
  await expect(page.locator("body")).not.toContainText(/포트원|portone/i);
});

async function settleToolViewport(page: Page, width: number) {
  const dismiss = page.getByRole("button", { name: "알림 닫기" });
  if (await dismiss.isVisible()) await dismiss.click();
  if (width <= 800) {
    await expect(page.locator("#workspace-navigation")).toHaveAttribute("aria-hidden", "true");
    await expect
      .poll(async () => {
        const bounds = await page.locator("#workspace-navigation").boundingBox();
        return bounds!.x + bounds!.width;
      })
      .toBeLessThanOrEqual(0);
  }
}

async function verifyProfileClone(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/?view=onboarding");
  await expect(page.getByRole("heading", { name: "브랜드 설정 라이브러리" })).toBeVisible();
  const workspace = await (await page.request.get("/api/workspace")).json();
  const mapping = {
    order_id: "custom_order_id",
    channel: "channel",
    date: "date",
    gross: "gross",
    refund: "refund",
  };
  const imported = await page.request.post("/api/commands", {
    headers: {
      Origin: new URL(page.url()).origin,
      "Idempotency-Key": `clone-e2e-${width}-mapping`,
    },
    data: {
      action: "import",
      expectedVersion: workspace.version,
      kind: "orders",
      filename: "custom.csv",
      saveMapping: true,
      mapping,
      csv: "custom_order_id,channel,date,gross,refund\nCOPY-NEW,d2c,2026-08-01,10000,0",
    },
  });
  expect(imported.ok()).toBeTruthy();
  await page.reload();
  // Keep an old-session response pending while the profile clone creates a new session.
  let releasePreview = () => {};
  const released = new Promise<void>((resolve) => {
    releasePreview = resolve;
  });
  page.once("close", releasePreview);
  let previewCaptured = () => {};
  const captured = new Promise<void>((resolve) => {
    previewCaptured = resolve;
  });
  await page.route(
    "**/api/imports/preview",
    async (route) => {
      const response = await route.fetch();
      previewCaptured();
      await released;
      await route.fulfill({ response }).catch(() => undefined);
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "자료 가져오기" }).click();
  await page.getByRole("button", { name: "샘플 주문 불러오기" }).click();
  await captured;
  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "새 가상 브랜드 이름" }).fill(`COPY ${width}`);
  await page.getByRole("button", { name: "설정 복제", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "현재 설정을 복제할까요?" });
  await dialog.getByRole("button", { name: "설정 복제 후 시작" }).click();
  await expect(page.getByText(`COPY ${width} 프로필로 새 데모를 시작했습니다.`)).toBeVisible();
  const copied = await (await page.request.get("/api/workspace")).json();
  expect(copied.profile.mappings.orders).toEqual(mapping);
  expect(copied.orders).toHaveLength(128);
  expect(copied.version).toBe(1);
  expect(copied.resolutions).toEqual({});
  await page.getByRole("button", { name: "자료 가져오기" }).click();
  const importDialog = page.getByRole("dialog", { name: "CSV 자료 가져오기" });
  releasePreview();
  await page.unrouteAll({ behavior: "wait" });
  await expect(importDialog.locator(".validation-success")).toHaveCount(0);
  await expect(importDialog.getByRole("button", { name: "자료 반영", exact: true })).toBeDisabled();
  await importDialog.getByRole("button", { name: "샘플 주문 불러오기" }).click();
  await expect(importDialog.getByLabel("주문번호", { exact: false })).toHaveValue(
    "custom_order_id",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.screenshot({
    path: `test-results/profile-clone-${width}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
