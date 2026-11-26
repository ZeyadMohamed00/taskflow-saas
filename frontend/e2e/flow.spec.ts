import { expect, test } from "@playwright/test";

test("register, create a project and task, move it, log out and back in", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/app/");
  await page.getByRole("button", { name: "New here? Create an account" }).click();
  await page.getByLabel("Name").fill("E2E User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();

  await page.getByLabel("Workspace name").fill("E2E Studio");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  await page.getByRole("button", { name: /^Projects/ }).first().click();
  await page.getByRole("button", { name: "+ New project" }).click();
  await page.getByRole("dialog").getByRole("textbox").first().fill("Website redesign");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("button", { name: /Website redesign/ }).click();

  await page.getByRole("button", { name: /New task/ }).click();
  await page.getByLabel("New task title").fill("Write the brief");
  await page.getByRole("button", { name: "Create task" }).click();
  const todo = page.getByRole("region", { name: "To do" });
  await expect(todo.getByText("Write the brief")).toBeVisible();

  await todo.getByRole("button", { name: /In progress/ }).click();
  await expect(page.getByRole("region", { name: "In progress" }).getByText("Write the brief")).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
});
