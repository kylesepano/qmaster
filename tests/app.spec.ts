import { expect, test } from "@playwright/test";

test("home opens public tournaments and main routes load without a setup guide", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/Qmaster/);
  await expect(
    page.getByRole("heading", { name: "Tournaments", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Admin login", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/qmaster-desktop.png",
    fullPage: true,
  });
  for (const [url, heading] of [
    ["/players", "Your players"],
    ["/queue", "Queue sessions"],
    ["/tournaments", "Your tournaments"],
    ["/tournaments/new", "Let’s build your tournament."],
    ["/matches", "Match center"],
    ["/settings", "Settings"],
    ["/login", "Back in the game."],
  ]) {
    await page.goto(url);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});
test("mobile navigation works and pages fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.screenshot({
    path: "test-results/qmaster-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Public navigation" })
    .getByRole("link", { name: "Queue sessions", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Queue sessions", exact: true }),
  ).toBeVisible();
  for (const url of [
    "/",
    "/?view=sessions",
    "/public/players",
    "/dashboard",
    "/players",
    "/queue",
    "/tournaments",
    "/tournaments/new",
    "/matches",
    "/settings",
    "/login",
  ]) {
    await page.goto(url);
    await expect(page.getByRole("heading").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      url,
    ).toBe(true);
  }
});
test("settings keeps reset controls and removes the five-step setup guide", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Connect Qmaster in five steps" }),
  ).toHaveCount(0);
  await expect(page.locator(".setup-steps")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Clear test data" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What you enter on game day" }),
  ).toBeVisible();
});
