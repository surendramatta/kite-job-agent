import fs from "fs";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AgentBrowser = any;

export const BROWSER_HELP =
  "Chromium could not start. In development run `npx playwright install chromium`; in production use the provided Docker image.";

export async function launchBrowser(): Promise<AgentBrowser | null> {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    console.error("[browser] Playwright import failed", error);
    return null;
  }

  const common = {
    headless: process.env.KITE_BROWSER_HEADED !== "1",
    timeout: 45_000,
    args: process.platform === "linux"
      ? ["--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox"]
      : [],
  };

  const configured = process.env.KITE_CHROMIUM_PATH;
  const candidates = [
    configured,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter((p): p is string => Boolean(p && fs.existsSync(p)));

  try {
    return await chromium.launch(common);
  } catch (managedError) {
    console.error("[browser] managed Chromium failed", managedError);
  }

  for (const executablePath of candidates) {
    try {
      return await chromium.launch({ ...common, executablePath });
    } catch (error) {
      console.error(`[browser] failed with ${executablePath}`, error);
    }
  }
  return null;
}
