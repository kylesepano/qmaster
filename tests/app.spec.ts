import { expect, test } from "@playwright/test";

test("unconfigured workspace explains setup and all main routes load", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/Qmaster/);
  await expect(
    page.getByRole("heading", { name: "Let’s get the games going." }),
  ).toBeVisible();
  await expect(
    page.getByText("Your workspace is ready to connect."),
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
    ["/settings", "Settings & setup"],
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
  await page.goto("/dashboard");
  await page.screenshot({
    path: "test-results/qmaster-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Players", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your players" }),
  ).toBeVisible();
  for (const url of [
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
test("setup checklist lists both credentials and manual organizer requirements", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(
    page.getByText("VITE_SUPABASE_URL=", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("VITE_SUPABASE_PUBLISHABLE_KEY=", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create the organizer login" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What you enter on game day" }),
  ).toBeVisible();
});
