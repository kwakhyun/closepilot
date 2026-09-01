import { expect, test, type Page } from "@playwright/test";

async function openFirstIssue(page: Page) {
  await page.goto("/?view=transactions");
  const desktopAction = page.locator(".row-arrow").first();
  await expect(desktopAction).toBeVisible();
  await desktopAction.click();
  await expect(page.getByRole("dialog", { name: "거래 검토" })).toBeVisible();
}

test("선택한 온보딩 프로필을 마감 점검에 일관되게 표시하고 Escape로 닫는다", async ({ page }) => {
  await page.goto("/?view=onboarding");
  await expect(page.getByRole("heading", { name: "브랜드 설정 라이브러리" })).toBeVisible();
  await page.getByRole("button", { name: "이 설정으로 새 데모" }).click();

  const resetDialog = page.getByRole("dialog", { name: "새 데모를 시작할까요?" });
  await expect(resetDialog).toBeVisible();
  await resetDialog.getByRole("button", { name: "새 데모 시작" }).click();
  await expect(page.getByText("MORROW FOODS 프로필로 새 데모를 시작했습니다.")).toBeVisible();

  await page.getByRole("button", { name: "마감 점검" }).first().click();
  const closeDialog = page.getByRole("dialog", { name: "마감 전 최종 확인" });
  await expect(closeDialog).toContainText("2026년 8월 · MORROW FOODS");
  await page.keyboard.press("Escape");
  await expect(closeDialog).toBeHidden();
});

test("거래 검토 서랍을 열고 Escape로 닫는다", async ({ page }) => {
  await openFirstIssue(page);
  const drawer = page.getByRole("dialog", { name: "거래 검토" });
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("AI 초안을 입력란에 적용해도 사용자 확인 전에는 검토를 승인할 수 없다", async ({ page }) => {
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
});

test("느린 AI 초안 생성을 취소하고 다시 시도할 수 있다", async ({ page }) => {
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
  await page.goto("/?view=transactions");

  await expect(page.locator(".table-scroll")).toBeHidden();
  const firstCard = page.locator(".mobile-transaction-card").first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard).toContainText("예상");
  await expect(firstCard).toContainText("자료상");
  await expect(firstCard).toContainText("차이");
  await firstCard.click();
  await expect(page.getByRole("dialog", { name: "거래 검토" })).toBeVisible();
});
