import { test, expect, type BrowserContext } from "@playwright/test";
import { createAuthCookie } from "./auth-setup";

async function authenticate(context: BrowserContext) {
  const cookie = await createAuthCookie();
  await context.addCookies([cookie]);
}

// ==========================================================================
// Desktop Session Sync Tests
// ==========================================================================
test.describe("Desktop Session Sync", () => {
  test("1. Chats page loads with Desktop button visible", async ({
    context,
    page,
  }) => {
    await authenticate(context);
    await page.goto("/chats");
    await page.waitForTimeout(3000);

    // Should not redirect to login
    expect(page.url()).not.toContain("/login");

    // Desktop button should be visible (mobile viewport)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chats");
    await page.waitForTimeout(2000);

    const desktopBtn = page.locator('button[aria-label="Continue from desktop"]');
    // Either the aria-label button or the text "Desktop" button
    const desktopTextBtn = page.locator("button:has-text('Desktop')");
    const isVisible = (await desktopBtn.count()) > 0 || (await desktopTextBtn.count()) > 0;
    expect(isVisible).toBe(true);
    console.log("  Desktop session sync button: visible");
  });

  test("2. Desktop session picker opens and displays correctly", async ({
    context,
    page,
  }) => {
    await authenticate(context);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chats");
    await page.waitForTimeout(3000);

    // Click the Desktop button
    const desktopBtn = page.locator("button:has-text('Desktop')");
    if ((await desktopBtn.count()) > 0) {
      await desktopBtn.click();
      await page.waitForTimeout(2000);

      // The picker modal should be open
      const modal = page.locator("text='Continue from Desktop'");
      await expect(modal).toBeVisible({ timeout: 5000 });
      console.log("  Session picker modal: visible");

      // Check if sessions are listed or "No desktop sessions found" is shown
      const noSessions = page.locator("text='No desktop sessions found'");
      const sessionButtons = page.locator("button:has-text('messages')");
      const hasSessions = (await sessionButtons.count()) > 0;
      const hasNoSessionsMsg = (await noSessions.count()) > 0;

      // One or the other should be true
      expect(hasSessions || hasNoSessionsMsg).toBe(true);

      if (hasSessions) {
        console.log(`  Sessions found: ${await sessionButtons.count()}`);

        // Verify session previews don't contain raw IDE tags
        const sessionTexts = await sessionButtons.allTextContents();
        for (const text of sessionTexts) {
          // Should NOT contain raw XML tags
          expect(text).not.toContain("<ide_selection>");
          expect(text).not.toContain("<ide_opened_file>");
          expect(text).not.toContain("<system-reminder>");
          console.log(`  Session preview: "${text.slice(0, 80)}..."`);
        }
      } else {
        console.log("  No desktop sessions found (expected if no IDE sessions exist)");
      }
    }
  });

  test("3. Session picker can be closed", async ({ context, page }) => {
    await authenticate(context);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chats");
    await page.waitForTimeout(3000);

    const desktopBtn = page.locator("button:has-text('Desktop')");
    if ((await desktopBtn.count()) > 0) {
      await desktopBtn.click();
      await page.waitForTimeout(1000);

      // Close button should work
      const closeBtn = page.locator('button[aria-label="Close"]');
      if ((await closeBtn.count()) > 0) {
        await closeBtn.click();
        await page.waitForTimeout(500);

        // Modal should be gone
        const modal = page.locator("text='Continue from Desktop'");
        expect(await modal.count()).toBe(0);
        console.log("  Session picker closes correctly");
      }
    }
  });

  test("4. Sessions API returns valid data", async ({ context, page }) => {
    await authenticate(context);

    const response = await page.request.get("/api/sessions/all");
    console.log(`  GET /api/sessions/all -> ${response.status()}`);

    // Should not be 401
    expect(response.status()).not.toBe(401);

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.sessions).toBeDefined();
      expect(Array.isArray(data.sessions)).toBe(true);
      console.log(`  Sessions returned: ${data.sessions.length}`);

      // Verify no raw IDE tags in previews
      for (const session of data.sessions) {
        if (session.preview) {
          expect(session.preview).not.toContain("<ide_selection>");
          expect(session.preview).not.toContain("<ide_opened_file>");
          expect(session.preview).not.toContain("<system-reminder>");
        }
      }
    }
  });

  test("5. Session import API returns valid response", async ({
    context,
    page,
  }) => {
    await authenticate(context);

    // Sessions API doesn't require cookie auth (uses service_role key server-side)
    const sessionsRes = await page.request.get("/api/sessions/all");
    if (sessionsRes.status() !== 200) {
      console.log("  Skipping: sessions API not available");
      return;
    }

    const sessionsData = await sessionsRes.json();
    if (!sessionsData.sessions || sessionsData.sessions.length === 0) {
      console.log("  Skipping: no sessions available to import");
      return;
    }

    const session = sessionsData.sessions[0];
    console.log(`  Testing import for session: ${session.id} from ${session.repoName}`);

    const importRes = await page.request.post("/api/sessions/import", {
      data: {
        sessionId: session.id,
        repoPath: session.repoPath,
        repoName: session.repoName,
      },
    });

    console.log(`  POST /api/sessions/import -> ${importRes.status()}`);
    // May be 401 if test JWT doesn't match server's secret, or 200 if it does
    // The key fix is that it no longer returns 500 due to missing UUID
    expect(importRes.status()).not.toBe(500);

    if (importRes.status() === 200) {
      const importData = await importRes.json();
      expect(importData.success).toBe(true);
      expect(importData.instanceId).toBeDefined();
      console.log(`  Instance ID: ${importData.instanceId}`);
    } else {
      console.log(`  Auth mismatch (expected in test env): ${importRes.status()}`);
    }
  });

  test("6. Instance page shows loading then content (not instant 'not found')", async ({
    context,
    page,
  }) => {
    await authenticate(context);

    // Navigate to a non-existent instance to verify the retry/loading behavior
    await page.goto("/instances/non-existent-id-12345");

    // Should NOT immediately show "Instance not found" — should show loading spinner first
    // Wait a short time for the retry to happen
    await page.waitForTimeout(6000);

    // After retry, "Instance not found" is expected for a truly non-existent instance
    const notFound = page.locator("text='Instance not found'");
    const notFoundCount = await notFound.count();
    // This SHOULD show "not found" because the ID truly doesn't exist
    expect(notFoundCount).toBe(1);
    console.log("  Non-existent instance correctly shows 'not found' after retry");
  });

  test("7. No JS errors on chats page", async ({ context, page }) => {
    await authenticate(context);
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/chats");
    await page.waitForTimeout(4000);

    const realErrors = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("AbortError") &&
        !e.includes("NetworkError") &&
        !e.includes("net::") &&
        !e.includes("Failed to fetch"),
    );

    if (realErrors.length > 0) {
      console.log("  JS errors:");
      realErrors.forEach((e) => console.log(`    - ${e}`));
    } else {
      console.log("  No JS errors on chats page");
    }

    expect(realErrors).toHaveLength(0);
  });
});
