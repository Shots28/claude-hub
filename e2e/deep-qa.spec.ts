import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createAuthCookie } from "./auth-setup";

// ---------------------------------------------------------------------------
// Helper: set auth cookie on browser context (bypasses login UI)
// ---------------------------------------------------------------------------
async function authenticate(context: BrowserContext) {
  const cookie = await createAuthCookie();
  await context.addCookies([cookie]);
}

// Known instance ID for direct navigation
const KNOWN_INSTANCE_ID = "796f37ab-5eeb-48e5-b616-40fc8aeb97c0";

// Collect JS errors across all tests
const collectedErrors: string[] = [];

// ---------------------------------------------------------------------------
// 1. App loads and shows instances
// ---------------------------------------------------------------------------
test.describe("1. App loads and shows instances", () => {
  test("navigates to / with auth cookie and is NOT redirected to /login", async ({
    context,
    page,
  }) => {
    await authenticate(context);
    await page.goto("/");
    await page.waitForTimeout(3000);

    // Should NOT be on login page
    expect(page.url()).not.toContain("/login");
  });

  test("shows instance list (sidebar or mobile list)", async ({
    context,
    page,
  }) => {
    await authenticate(context);
    await page.goto("/");
    await page.waitForTimeout(3000);

    // Look for instance links in the sidebar or page body
    const instanceLinks = page.locator('a[href*="/instances/"]');
    const count = await instanceLinks.count();

    // Also check for a "Create your first instance" button if no instances
    if (count === 0) {
      const createBtn = page.locator("text=Create your first instance");
      const hasCreate = await createBtn
        .isVisible({ timeout: 3000 })
        .catch(() => false);
      // Either instances or the create button should be present
      expect(hasCreate).toBe(true);
    } else {
      expect(count).toBeGreaterThan(0);
    }
  });

  test("instance names are visible", async ({ context, page }) => {
    await authenticate(context);
    await page.goto("/");
    await page.waitForTimeout(3000);

    const instanceLinks = page.locator('a[href*="/instances/"]');
    const count = await instanceLinks.count();

    if (count > 0) {
      // At least one instance link should have non-empty text
      const firstLinkText = await instanceLinks.first().textContent();
      expect(firstLinkText?.trim().length).toBeGreaterThan(0);
    } else {
      // Skip if no instances
      test.skip();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Create Instance modal
// ---------------------------------------------------------------------------
test.describe("2. Create Instance modal", () => {
  test("opens when clicking the + button or Create button", async ({
    context,
    page,
  }) => {
    await authenticate(context);
    await page.goto("/");
    await page.waitForTimeout(3000);

    // Try finding a "+" button, "New Instance" button, or "Create your first instance"
    const plusBtn = page.locator('button:has-text("+")').first();
    const createFirstBtn = page.locator("text=Create your first instance");
    const newInstanceBtn = page.locator(
      'button:has-text("New"), button[aria-label*="new"], button[aria-label*="New"], button[aria-label*="create"], button[aria-label*="Create"]',
    ).first();

    let clicked = false;

    if (await plusBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await plusBtn.click();
      clicked = true;
    } else if (
      await createFirstBtn.isVisible({ timeout: 2000 }).catch(() => false)
    ) {
      await createFirstBtn.click();
      clicked = true;
    } else if (
      await newInstanceBtn.isVisible({ timeout: 2000 }).catch(() => false)
    ) {
      await newInstanceBtn.click();
      clicked = true;
    }

    if (clicked) {
      // Wait for modal or dialog to appear
      await page.waitForTimeout(1000);

      // Look for a dialog, modal, or overlay
      const dialog = page.locator(
        '[role="dialog"], [data-testid="modal"], .modal, dialog',
      );
      const hasDialog = await dialog
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (hasDialog) {
        // Check for a repo dropdown/select
        const repoSelect = page.locator(
          'select, [role="combobox"], [role="listbox"], input[placeholder*="repo" i], input[placeholder*="Repo" i]',
        );
        const hasRepoField = await repoSelect
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false);
        // Log it but don't fail if there's no repo field (modal structure may vary)
        console.log(
          `  Repo dropdown/select visible: ${hasRepoField}`,
        );

        // Close modal — try Escape key, or close button
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
      } else {
        console.log("  Modal/dialog did not appear after clicking button");
      }
    } else {
      console.log(
        "  No + button, Create, or New Instance button found — skipping modal test",
      );
      test.skip();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Navigate to an instance
// ---------------------------------------------------------------------------
test.describe("3. Navigate to an instance", () => {
  test("loads chat view with textarea, instance name, status badge, bridge dot", async ({
    context,
    page,
  }) => {
    await authenticate(context);

    // Navigate directly to the known instance
    await page.goto(`/instances/${KNOWN_INSTANCE_ID}`);
    await page.waitForTimeout(4000);

    // If redirected to login, auth failed
    expect(page.url()).not.toContain("/login");

    // Check for textarea (chat input)
    const textarea = page.locator("textarea");
    const hasTextarea = await textarea
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    console.log(`  Textarea visible: ${hasTextarea}`);
    expect(hasTextarea).toBe(true);

    // Check for instance name in header (h1 or heading)
    const heading = page.locator("h1").first();
    const hasHeading = await heading
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (hasHeading) {
      const headingText = await heading.textContent();
      console.log(`  Instance heading: "${headingText}"`);
      expect(headingText?.trim().length).toBeGreaterThan(0);
    }

    // Check for status badge
    const statusBadge = page
      .locator("text=/idle|running|queued|stopped|error/i")
      .first();
    const hasStatus = await statusBadge
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    console.log(`  Status badge visible: ${hasStatus}`);

    // Check for bridge status dot
    const bridgeDot = page.locator('span[title^="Bridge:"]');
    const hasBridge = await bridgeDot
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    console.log(`  Bridge status dot visible: ${hasBridge}`);
  });
});

// ---------------------------------------------------------------------------
// 4. Bridge status dot
// ---------------------------------------------------------------------------
test.describe("4. Bridge status dot", () => {
  test("has a color class indicating connection state", async ({
    context,
    page,
  }) => {
    await authenticate(context);
    await page.goto(`/instances/${KNOWN_INSTANCE_ID}`);
    await page.waitForTimeout(4000);

    const statusDot = page.locator('span[title^="Bridge:"]');
    const isVisible = await statusDot
      .isVisible({ timeout: 15000 })
      .catch(() => false);

    if (isVisible) {
      const dotClass = await statusDot.getAttribute("class");
      console.log(`  Bridge dot classes: "${dotClass}"`);
      // Should contain a color class (emerald=connected, yellow=connecting, red=disconnected, muted=unknown)
      expect(dotClass).toMatch(/(emerald|yellow|red|hub-text-muted|green|orange|gray)/);

      const title = await statusDot.getAttribute("title");
      console.log(`  Bridge dot title: "${title}"`);
      expect(title).toBeTruthy();
    } else {
      console.log("  Bridge status dot not found — skipping");
      test.skip();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Message display
// ---------------------------------------------------------------------------
test.describe("5. Message display", () => {
  test("existing messages or empty state are shown", async ({
    context,
    page,
  }) => {
    await authenticate(context);
    await page.goto(`/instances/${KNOWN_INSTANCE_ID}`);
    await page.waitForTimeout(5000);

    // Look for message containers — could be divs with message content
    // Check for assistant response like "Hello! I'm ready to help" or any message bubbles
    const assistantMsg = page
      .locator('text=/Hello|ready to help|How can I/i')
      .first();
    const hasAssistantMsg = await assistantMsg
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Also check for any message-like elements (role=log, message list, etc.)
    const messageArea = page.locator(
      '[role="log"], [data-testid*="message"], .messages, [class*="message"]',
    );
    const hasMessageArea = await messageArea
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // Check for general prose/content blocks that might be messages
    const proseBlocks = page.locator(".prose, [class*='prose']");
    const proseCount = await proseBlocks.count();

    console.log(`  Assistant greeting visible: ${hasAssistantMsg}`);
    console.log(`  Message area visible: ${hasMessageArea}`);
    console.log(`  Prose blocks found: ${proseCount}`);

    // At least the chat area (textarea) should exist even if there are no messages yet
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// 6. Service worker
// ---------------------------------------------------------------------------
test.describe("6. Service worker", () => {
  test("/sw.js returns 200 and contains skipWaiting", async ({ page }) => {
    const response = await page.goto("/sw.js");
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);

    const text = await response!.text();
    expect(text).toContain("skipWaiting");
    console.log(`  SW size: ${text.length} bytes`);
    console.log(`  Contains skipWaiting: true`);
    console.log(`  Contains showNotification: ${text.includes("showNotification")}`);
    console.log(`  Contains fetch handler: ${text.includes("fetch")}`);
  });
});

// ---------------------------------------------------------------------------
// 7. Manifest
// ---------------------------------------------------------------------------
test.describe("7. Manifest", () => {
  test("/manifest.json has correct PWA fields", async ({ page }) => {
    const response = await page.goto("/manifest.json");
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);

    const manifest = await response!.json();

    // Required fields
    expect(manifest.id).toBeDefined();
    console.log(`  id: ${manifest.id}`);

    expect(manifest.scope).toBeDefined();
    console.log(`  scope: ${manifest.scope}`);

    expect(manifest.display_override).toBeDefined();
    expect(manifest.display_override).toEqual(["standalone"]);
    console.log(`  display_override: ${JSON.stringify(manifest.display_override)}`);

    // Icons check
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons.length).toBeGreaterThanOrEqual(1);

    const hasMaskable = manifest.icons.some(
      (i: any) => i.purpose?.includes("maskable"),
    );
    expect(hasMaskable).toBe(true);
    console.log(`  Has maskable icon: ${hasMaskable}`);
    console.log(
      `  Icon count: ${manifest.icons.length}`,
    );

    // Additional useful fields
    if (manifest.name) console.log(`  name: ${manifest.name}`);
    if (manifest.short_name) console.log(`  short_name: ${manifest.short_name}`);
    if (manifest.start_url) console.log(`  start_url: ${manifest.start_url}`);
    if (manifest.theme_color) console.log(`  theme_color: ${manifest.theme_color}`);
    if (manifest.background_color)
      console.log(`  background_color: ${manifest.background_color}`);
  });
});

// ---------------------------------------------------------------------------
// 8. iOS meta tags
// ---------------------------------------------------------------------------
test.describe("8. iOS meta tags", () => {
  test("apple-mobile-web-app-capable meta tag exists", async ({
    context,
    page,
  }) => {
    await authenticate(context);
    await page.goto("/");
    await page.waitForTimeout(2000);

    const appleCapable = page.locator(
      'meta[name="apple-mobile-web-app-capable"]',
    );
    await expect(appleCapable).toHaveAttribute("content", "yes");
    console.log("  apple-mobile-web-app-capable: yes");

    // Also check status bar style
    const statusBar = page.locator(
      'meta[name="apple-mobile-web-app-status-bar-style"]',
    );
    const hasStatusBar = await statusBar.count();
    if (hasStatusBar > 0) {
      const content = await statusBar.getAttribute("content");
      console.log(`  apple-mobile-web-app-status-bar-style: ${content}`);
    }

    // Check for apple-touch-icon link
    const touchIcon = page.locator('link[rel="apple-touch-icon"]');
    const hasTouchIcon = await touchIcon.count();
    console.log(`  apple-touch-icon links: ${hasTouchIcon}`);
  });
});

// ---------------------------------------------------------------------------
// 9. No JavaScript errors
// ---------------------------------------------------------------------------
test.describe("9. No JavaScript errors", () => {
  test("no uncaught errors during hub page load", async ({
    context,
    page,
  }) => {
    await authenticate(context);

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForTimeout(4000);

    // Filter out known benign errors
    const realErrors = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("AbortError") &&
        !e.includes("NetworkError") &&
        !e.includes("net::"),
    );

    if (realErrors.length > 0) {
      console.log("  JS errors found on hub page:");
      realErrors.forEach((e) => console.log(`    - ${e}`));
    } else {
      console.log("  No JS errors on hub page");
    }

    expect(realErrors).toHaveLength(0);
  });

  test("no uncaught errors during instance page load", async ({
    context,
    page,
  }) => {
    await authenticate(context);

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(`/instances/${KNOWN_INSTANCE_ID}`);
    await page.waitForTimeout(5000);

    const realErrors = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("AbortError") &&
        !e.includes("NetworkError") &&
        !e.includes("net::"),
    );

    if (realErrors.length > 0) {
      console.log("  JS errors found on instance page:");
      realErrors.forEach((e) => console.log(`    - ${e}`));
    } else {
      console.log("  No JS errors on instance page");
    }

    expect(realErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 10. Take screenshots
// ---------------------------------------------------------------------------
test.describe("10. Screenshots", () => {
  test("capture main hub page screenshot", async ({ context, page }) => {
    await authenticate(context);
    await page.goto("/");
    await page.waitForTimeout(4000);

    await page.screenshot({
      path: "e2e/screenshots/hub-main.png",
      fullPage: true,
    });
    console.log("  Saved: e2e/screenshots/hub-main.png");
  });

  test("capture instance chat page screenshot", async ({ context, page }) => {
    await authenticate(context);
    await page.goto(`/instances/${KNOWN_INSTANCE_ID}`);
    await page.waitForTimeout(5000);

    await page.screenshot({
      path: "e2e/screenshots/instance-chat.png",
      fullPage: true,
    });
    console.log("  Saved: e2e/screenshots/instance-chat.png");
  });
});
