import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { creds, registerTeam, signIn, signOut, teamCredentials } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(!creds.admin.password || !process.env.E2E_DATABASE_URL, "Set E2E_ADMIN_PASSWORD and E2E_DATABASE_URL (see README).");

const run = Date.now().toString(36);
const freeShop = `Meals ${run}`;
const paidShop = `Snacks ${run}`;
const leaderEmail = `eater.${run}@e2e.test`;
const password = `Eater-${run}-Pass1!`;
const shopPassword = `Stall-${run}-Pass1!`;
let teamLogin = "";
let shopLogin = "";

/** The innermost card whose heading is `name` (cards sit inside page sections). */
function shopCard(page: Page, name: string) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name, exact: true }) }).last();
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} — ${v.help}`)).toEqual([]);
}

test("the Admin adds shops and menus and creates the snack stall's own login", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/food/menu");
  await page.getByLabel("Shop name").first().fill(freeShop);
  await page.getByLabel("Type").first().selectOption("free");
  await page.getByLabel("Taking orders now").first().check();
  await page.getByRole("button", { name: "Add shop" }).click();
  await expect(page.getByText("Shop added.")).toBeVisible();
  let shop = shopCard(page, freeShop);
  await shop.getByLabel("Item name").fill("Lunch");
  await expect(shop.getByLabel("Limit per person (optional)")).toHaveValue("1");
  await shop.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText("Item added to the menu.")).toBeVisible();

  await page.getByLabel("Shop name").first().fill(paidShop);
  await page.getByLabel("Taking orders now").first().check();
  await page.getByRole("button", { name: "Add shop" }).click();
  shop = shopCard(page, paidShop);
  await shop.getByLabel("Item name").fill("Masala chai");
  await shop.getByLabel("Price (₹)").fill("15");
  await shop.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText("Item added to the menu.")).toBeVisible();

  shop = shopCard(page, paidShop);
  await expect(shop).toContainText("Not created yet");
  shopLogin = (await shop.getByText(/Shop login: /).innerText()).match(/[A-Z0-9]{2,10}-S\d{2,}/)![0];
  await shop.getByRole("button", { name: "Create shop login" }).click();
  await expect(page.getByText("Give these to the shop now")).toBeVisible();
  const temp = (await page.locator(".font-mono.text-lg").innerText()).trim();

  // The shop signs in with its Shop ID and must choose its own password.
  await signOut(page);
  await signIn(page, shopLogin, temp);
  await page.waitForURL(/\/change-password/);
  await page.getByLabel("New password").first().fill(shopPassword);
  await page.getByLabel("Confirm new password").fill(shopPassword);
  await page.getByRole("button", { name: "Save password" }).click();
  await page.waitForURL(/\/shop/);
  await expect(page.getByRole("heading", { name: paidShop })).toBeVisible();
  await expect(page.getByText("Open: taking orders")).toBeVisible();
});

test("a team picks a shop, sees its menu and orders; the free meal limit holds", async ({ page }) => {
  await registerTeam(page, `Food Lovers ${run}`, [["Hungry Leader", leaderEmail], ["Hungry Member", `eater2.${run}@e2e.test`]]);
  const { teamCode, code } = await teamCredentials(leaderEmail);
  teamLogin = teamCode;
  await page.goto("/activate");
  await page.getByLabel("Team ID").fill(teamCode);
  await page.getByLabel("Activation code").fill(code);
  await page.getByLabel("New password").fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Activate account" }).click();
  await page.waitForURL(/\/portal/);

  await page.goto("/portal/food");
  await expect(page.getByRole("heading", { name: "Shops" })).toBeVisible();
  await axe(page);
  await page.getByRole("link", { name: new RegExp(freeShop) }).click();
  await expect(page.getByRole("heading", { name: freeShop })).toBeVisible();
  await page.getByLabel("Who is this order for?").selectOption({ label: "Hungry Leader" });
  await page.getByRole("button", { name: "One more Lunch" }).click();
  await expect(page.getByRole("button", { name: "One more Lunch" })).toBeDisabled(); // limit 1
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText(/Order #\d{4} sent to the shop/)).toBeVisible();
  await expect(page.getByText("Waiting for the shop to accept").first()).toBeVisible();

  await page.getByRole("link", { name: new RegExp(paidShop) }).click();
  await page.getByLabel("Who is this order for?").selectOption({ label: "Hungry Leader" });
  await page.getByRole("button", { name: "One more Masala chai" }).click();
  await page.getByRole("button", { name: "One more Masala chai" }).click();
  await expect(page.getByText("2 items · ₹30 (pay at the counter)")).toBeVisible();
  await page.getByLabel("Note for the counter (optional)").fill("less sugar");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText(/Order #\d{4} sent to the shop/)).toBeVisible();

  // A second lunch for the same member is refused by the database.
  await page.getByRole("link", { name: new RegExp(freeShop) }).click();
  await page.getByLabel("Who is this order for?").selectOption({ label: "Hungry Leader" });
  await page.getByRole("button", { name: "One more Lunch" }).click();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText("Lunch is limited to 1 per person")).toBeVisible();
});

test("the shop accepts the order, marks it ready, and the team sees it", async ({ page, browser }) => {
  await signIn(page, shopLogin, shopPassword);
  await page.waitForURL(/\/shop/);
  await axe(page);
  const card = page.getByRole("article").filter({ hasText: "Hungry Leader" }).filter({ hasText: "Masala chai" });
  await expect(card).toContainText("2 × Masala chai");
  await expect(card).toContainText("Note: less sugar");
  await expect(card).toContainText("Collect ₹30");
  await card.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Order marked accepted, preparing.")).toBeVisible();

  const team = await browser.newPage();
  await signIn(team, teamLogin, password);
  await team.goto("/portal/food");
  await expect(team.getByText("Accepted, preparing").first()).toBeVisible();

  await page.getByRole("article").filter({ hasText: "Masala chai" }).getByRole("button", { name: "Mark ready" }).click();
  await expect(page.getByText("Order marked ready to collect.")).toBeVisible();
  await team.reload();
  await expect(team.getByText("Your food is ready. Show this order number at the counter.")).toBeVisible();
  await team.close();

  await page.getByRole("article").filter({ hasText: "Masala chai" }).getByRole("button", { name: "Collected" }).click();
  await expect(page.getByText("Order marked collected.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recently finished" })).toBeVisible();
});

test("the shop rejects an order with a reason the team can read", async ({ page, browser }) => {
  const team = await browser.newPage();
  await signIn(team, teamLogin, password);
  await team.goto("/portal/food");
  await team.getByRole("link", { name: new RegExp(paidShop) }).click();
  await team.getByLabel("Who is this order for?").selectOption({ label: "Hungry Member" });
  await team.getByRole("button", { name: "One more Masala chai" }).click();
  await team.getByRole("button", { name: "Place order" }).click();
  await expect(team.getByText(/sent to the shop/)).toBeVisible();

  await signIn(page, shopLogin, shopPassword);
  const card = page.getByRole("article").filter({ hasText: "Hungry Member" });
  await card.getByText("Reject", { exact: true }).click();
  await card.getByLabel("Reason for the team").fill("Milk ran out");
  await card.getByRole("button", { name: "Reject order" }).click();
  await expect(page.getByText("Order marked rejected by the shop.")).toBeVisible();

  await team.reload();
  await expect(team.getByText("Reason: Milk ran out")).toBeVisible();
  await team.close();
});

test("the shop edits its own menu price and closes; teams see both", async ({ page }) => {
  await signIn(page, shopLogin, shopPassword);
  await page.goto("/shop/menu");
  await page.getByText("Edit item or price").first().click();
  await page.getByLabel("Price (₹)").first().fill("20");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByText("Item saved.")).toBeVisible();
  await expect(page.getByText("₹20").first()).toBeVisible();
  await page.goto("/shop");
  await page.getByRole("button", { name: "Close shop" }).click();
  await expect(page.getByText("Your shop is closed to new orders.")).toBeVisible();
  // Staff pages stay closed to shop logins.
  await page.goto("/staff/food");
  await expect(page).toHaveURL(/\/shop/);

  await page.context().clearCookies();
  await signIn(page, teamLogin, password);
  await page.goto("/portal/food");
  await page.getByRole("link", { name: new RegExp(paidShop) }).click();
  await expect(page.getByText("This shop is closed right now")).toBeVisible();
  await expect(page.getByText("₹20").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Place order" })).toBeDisabled();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
