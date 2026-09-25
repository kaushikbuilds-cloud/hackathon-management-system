import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { FORM_SLUG, creds, signIn, teamCredentials } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(!creds.admin.password || !process.env.E2E_DATABASE_URL, "Set E2E_ADMIN_PASSWORD and E2E_DATABASE_URL (see README).");

const run = Date.now().toString(36);
const freeShop = `Meals ${run}`;
const paidShop = `Snacks ${run}`;
const leaderEmail = `eater.${run}@e2e.test`;
const password = `Eater-${run}-Pass1!`;
const phoneBase = String(Date.now()).slice(-7);
let loginId = ""; // the team signs in with its Team ID

/** The innermost card whose heading is `name` (cards sit inside page sections). */
function shopCard(page: Page, name: string) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name, exact: true }) }).last();
}

test("the Admin sets up a free meals counter and a paid snack stall", async ({ page }) => {
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
});

test("a participant orders food and cannot exceed the free meal limit", async ({ page }) => {
  await page.goto(`/register/${FORM_SLUG}`);
  await page.getByLabel("Team name").fill(`Food Lovers ${run}`);
  await page.getByLabel("College / institution").fill("Food College");
  for (const [i, name, email] of [[0, "Hungry Leader", leaderEmail], [1, "Hungry Member", `eater2.${run}@e2e.test`]] as const) {
    const card = page.locator("section").filter({ has: page.getByRole("heading", { name: new RegExp(`^Member ${i + 1}`) }) });
    await card.getByLabel("Full name").fill(name);
    await card.getByLabel("Email").fill(email);
    await card.getByLabel("Phone number").fill(`+91 7${phoneBase}${i}${run.length % 10}`);
    await card.getByLabel("Department").fill("Mech");
    await card.getByLabel("Academic year").fill("1st Year");
  }
  const track = page.getByLabel(/Which track/);
  if (await track.count()) await track.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Submit registration" }).click();
  await expect(page.getByText("Registration received!")).toBeVisible();

  const { teamCode, code } = await teamCredentials(leaderEmail);
  loginId = teamCode;
  await page.goto("/activate");
  await page.getByLabel("Team ID").fill(teamCode);
  await page.getByLabel("Activation code").fill(code);
  await page.getByLabel("New password").fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Activate account" }).click();
  await page.waitForURL(/\/portal/);

  await page.goto("/portal/food");
  const meals = shopCard(page, freeShop);
  await expect(meals.getByRole("button", { name: "One more Lunch" })).toBeVisible();
  await meals.getByLabel("Who is this order for?").selectOption({ label: "Hungry Leader" });
  await meals.getByRole("button", { name: "One more Lunch" }).click();
  await expect(meals.getByRole("button", { name: "One more Lunch" })).toBeDisabled(); // limit 1
  await meals.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText(/Order #\d{4} placed/)).toBeVisible();

  const snacks = shopCard(page, paidShop);
  await snacks.getByLabel("Who is this order for?").selectOption({ label: "Hungry Leader" });
  await snacks.getByRole("button", { name: "One more Masala chai" }).click();
  await snacks.getByRole("button", { name: "One more Masala chai" }).click();
  await expect(snacks.getByText("2 items · ₹30 (pay at the counter)")).toBeVisible();
  await snacks.getByLabel("Note for the counter (optional)").fill("less sugar");
  await snacks.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText(/Order #\d{4} placed/)).toBeVisible();
  await expect(page.getByText("Pay ₹30 when you collect")).toBeVisible();

  // A second lunch for the same member is refused by the database; a teammate still gets theirs.
  await meals.getByLabel("Who is this order for?").selectOption({ label: "Hungry Leader" });
  await meals.getByRole("button", { name: "One more Lunch" }).click();
  await meals.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText("Lunch is limited to 1 per person")).toBeVisible();
  await meals.getByLabel("Who is this order for?").selectOption({ label: "Hungry Member" });
  await meals.getByRole("button", { name: "One more Lunch" }).click();
  await meals.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText(/Order #\d{4} placed/)).toBeVisible();
  await expect(page.getByText("For Hungry Member")).toBeVisible();
});

test("the counter moves the order along and the participant sees it is ready", async ({ page, browser }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/food");
  await page.getByRole("link", { name: paidShop, exact: true }).click();
  await page.waitForURL(/\/staff\/food\?shop=/);
  const card = page.getByRole("article").filter({ hasText: "Hungry Leader" });
  await expect(card).toContainText("2 × Masala chai");
  await expect(card).toContainText("Note: less sugar");
  await expect(card).toContainText("Collect ₹30");
  await card.getByRole("button", { name: "Start preparing" }).click();
  await expect(page.getByText("Order marked preparing.")).toBeVisible();
  await page.getByRole("article").filter({ hasText: "Hungry Leader" }).getByRole("button", { name: "Mark ready" }).click();
  await expect(page.getByText("Order marked ready to collect.")).toBeVisible();

  const participant = await browser.newPage();
  await signIn(participant, loginId, password);
  await participant.goto("/portal/food");
  await expect(participant.getByText("Your food is ready. Show this order number at the counter.")).toBeVisible();
  await participant.close();

  await page.getByRole("article").filter({ hasText: "Hungry Leader" }).getByRole("button", { name: "Collected" }).click();
  await expect(page.getByText("Order marked collected.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recently finished" })).toBeVisible();
});

test("closing a counter hides it from participants", async ({ page }) => {
  await signIn(page, creds.admin.email, creds.admin.password);
  await page.goto("/staff/food");
  await page.getByRole("link", { name: freeShop, exact: true }).click();
  await page.waitForURL(/\/staff\/food\?shop=/);
  await page.locator("form").filter({ hasText: freeShop }).getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("The counter stopped taking new orders.")).toBeVisible();
  await page.context().clearCookies();
  await signIn(page, loginId, password);
  await page.goto("/portal/food");
  await expect(page.getByRole("heading", { name: freeShop, exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: paidShop, exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} — ${v.help}`)).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
