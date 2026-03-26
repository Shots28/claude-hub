import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createAuthCookie } from "./auth-setup";

// ---------------------------------------------------------------------------
// Helper: set auth cookie on browser context (bypasses login UI)
// ---------------------------------------------------------------------------
async function authenticate(context: BrowserContext) {
  const cookie = await createAuthCookie();
  await context.addCookies([cookie]);
}

async function goToFirstInstance(page: Page): Promise<boolean> {
  await page.goto("/");
  await page.waitForTimeout(3000);

  // If we're on an instance page already, great
  if (page.url().includes("/instances/")) return true;

  // Check if there are instances
  const instanceLink = page.locator('a[href*="/instances/"]').first();
  const hasInstance = await instanceLink.isVisible({ timeout: 3000 }).catch(() => false);

  if (hasInstance) {
    await instanceLink.click();
    await page.waitForURL("**/instances/**", { timeout: 10_000 });
    return true;
  }

  // No instances available — test will need to handle this
  return false;
}

// ---------------------------------------------------------------------------
// Phase 1: Connection Reliability & Status Visibility
// ---------------------------------------------------------------------------

test.describe("Phase 1: Connection Reliability", () => {
  test("1.1 — Hub loads successfully with auth cookie", async ({ context, page }) => {
    await authenticate(context);
    await page.goto("/");
    await page.waitForTimeout(3000);

    // Should NOT be on login page
    expect(page.url()).not.toContain("/login");

    // Should see Claude Hub UI (either instance list or welcome page)
    const hubTitle = page.locator("text=Claude Hub");
    await expect(hubTitle.first()).toBeVisible({ timeout: 5_000 });
  });

  test("1.1 — Chat input exists when instance is available", async ({ context, page }) => {
    await authenticate(context);
    const hasInstance = await goToFirstInstance(page);

    if (hasInstance) {
      // Chat input should be visible
      const textarea = page.locator("textarea");
      await expect(textarea).toBeVisible({ timeout: 10_000 });

      // No old "Sent" status text (removed in Phase 1.1)
      const sentText = page.locator("span:text-is('Sent')");
      expect(await sentText.count()).toBe(0);
    } else {
      // No instances — verify welcome page shows
      const createButton = page.locator("text=Create your first instance");
      await expect(createButton).toBeVisible({ timeout: 5_000 });
    }
  });

  test("1.3 — Bridge status dot renders in instance view", async ({ context, page }) => {
    await authenticate(context);
    const hasInstance = await goToFirstInstance(page);

    if (hasInstance) {
      const statusDot = page.locator('span[title^="Bridge:"]');
      await expect(statusDot).toBeVisible({ timeout: 20_000 });
      const dotClass = await statusDot.getAttribute("class");
      expect(dotClass).toMatch(/(emerald|yellow|red|hub-text-muted)/);
    } else {
      // Skip — no instances to test bridge status on
      test.skip();
    }
  });

  test("1.4 — No spurious error banners on clean load", async ({ context, page }) => {
    await authenticate(context);
    await page.goto("/");
    await page.waitForTimeout(3000);

    // No error messages visible
    const errors = page.locator("text=/Connection lost|Failed to send/");
    expect(await errors.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 2: Push Notifications & PWA
// ---------------------------------------------------------------------------

test.describe("Phase 2: Push Notifications & PWA", () => {
  test("2.1 — Service worker is accessible and contains required handlers", async ({ page }) => {
    const response = await page.goto("/sw.js");
    expect(response?.status()).toBe(200);
    const text = await response?.text();
    expect(text).toContain("skipWaiting");
    expect(text).toContain("showNotification");
    expect(text).toContain("notificationclick");
    expect(text).toContain("clients.claim");
  });

  test("2.1 — SW is NOT blocked by auth middleware", async ({ page }) => {
    const response = await page.goto("/sw.js");
    // Should serve sw.js directly, NOT redirect to /login
    expect(response?.url()).toContain("/sw.js");
    expect(response?.url()).not.toContain("/login");
    expect(response?.status()).toBe(200);
  });

  test("2.1 — Push subscribe endpoint requires session cookie", async ({ page }) => {
    const response = await page.request.post("/api/push/subscribe", {
      data: { endpoint: "https://test.example.com", keys: { p256dh: "test", auth: "test" } },
    });
    expect(response.status()).toBe(401);
  });

  test("2.1 — Push send endpoint requires Bearer token (rejects without)", async ({ page }) => {
    const response = await page.request.post("/api/push/send", {
      data: { title: "test", body: "test" },
    });
    expect(response.status()).toBe(401);
  });

  test("2.1 — Push send endpoint rejects invalid Bearer token", async ({ page }) => {
    const response = await page.request.post("/api/push/send", {
      headers: { Authorization: "Bearer invalid-token" },
      data: { title: "test", body: "test" },
    });
    // Without PUSH_API_SECRET env var set, should reject
    expect([401, 500]).toContain(response.status());
  });

  test("2.3 — Manifest has PWA-required fields", async ({ page }) => {
    const response = await page.goto("/manifest.json");
    expect(response?.status()).toBe(200);
    const manifest = await response?.json();

    expect(manifest.id).toBeDefined();
    expect(manifest.scope).toBeDefined();
    expect(manifest.display_override).toEqual(["standalone"]);

    // Icons
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    const hasMaskable = manifest.icons.some((i: any) =>
      i.purpose?.includes("maskable"),
    );
    expect(hasMaskable).toBe(true);
  });

  test("2.3 — App icons are served with 200 status", async ({ page }) => {
    for (const path of ["/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
    }
  });

  test("2.3 — HTML has iOS PWA meta tags", async ({ page }) => {
    await page.goto("/login");

    const appleCapable = page.locator('meta[name="apple-mobile-web-app-capable"]');
    await expect(appleCapable).toHaveAttribute("content", "yes");

    const statusBar = page.locator('meta[name="apple-mobile-web-app-status-bar-style"]');
    await expect(statusBar).toHaveAttribute("content", "black-translucent");
  });
});

// ---------------------------------------------------------------------------
// Phase 3: File & Plan Viewing
// ---------------------------------------------------------------------------

test.describe("Phase 3: File & Plan Viewing", () => {
  test("3.1 — File request API exists and requires auth", async ({ page }) => {
    const response = await page.request.post("/api/instances/test-id/files", {
      data: { path: "README.md" },
    });
    expect(response.status()).toBe(401);
  });

  test("3.1 — File request API accepts authenticated requests", async ({ context, page }) => {
    await authenticate(context);
    const response = await page.request.post("/api/instances/nonexistent-id/files", {
      data: { path: "README.md" },
    });
    // Should fail with a proper error (instance not found), not 401
    // The actual status depends on implementation but should NOT be 401
    expect(response.status()).not.toBe(401);
  });

  test("3.3 — New Chat button is present when instance exists", async ({ context, page }) => {
    await authenticate(context);
    const hasInstance = await goToFirstInstance(page);

    if (hasInstance) {
      const newChatButton = page.locator('button[aria-label="New chat"]');
      await expect(newChatButton).toBeVisible({ timeout: 10_000 });
    } else {
      test.skip();
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 4: Polish
// ---------------------------------------------------------------------------

test.describe("Phase 4: Polish", () => {
  test("4.2 — Status badge visible when instance exists", async ({ context, page }) => {
    await authenticate(context);
    const hasInstance = await goToFirstInstance(page);

    if (hasInstance) {
      const heading = page.locator("h1").first();
      await expect(heading).toBeVisible({ timeout: 10_000 });
      const statusText = page.locator("text=/idle|running|queued|stopped|error/i").first();
      await expect(statusText).toBeVisible({ timeout: 5_000 });
    } else {
      test.skip();
    }
  });

  test("4.3 — Hub renders without React errors", async ({ context, page }) => {
    await authenticate(context);
    await page.goto("/");

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(3000);

    // Filter out known non-issues (ResizeObserver, etc.)
    const realErrors = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("AbortError"),
    );
    expect(realErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: Security & Middleware
// ---------------------------------------------------------------------------

test.describe("Security", () => {
  test("Login page is accessible without auth", async ({ page }) => {
    await page.goto("/login");
    expect(page.url()).toContain("/login");
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 10_000 });
  });

  test("Hub pages redirect to login when not authenticated", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/login**", { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });

  test("API endpoints return 401 without auth", async ({ page }) => {
    const endpoints = ["/api/instances", "/api/bridge/status"];
    for (const endpoint of endpoints) {
      const response = await page.request.get(endpoint);
      expect(response.status()).toBe(401);
    }
  });

  test("Static assets bypass auth", async ({ page }) => {
    const assets = ["/manifest.json", "/sw.js", "/icon-192.png"];
    for (const asset of assets) {
      const response = await page.goto(asset);
      expect(response?.status()).toBe(200);
    }
  });
});
