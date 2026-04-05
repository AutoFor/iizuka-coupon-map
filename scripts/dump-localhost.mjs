import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const targetUrl = process.env.TARGET_URL || 'http://127.0.0.1:18080';
const outputRootDir = path.resolve(process.cwd(), 'playwright-output');
const deviceMode = process.env.DEVICE_MODE || 'both';
const captureScreenshot = process.env.CAPTURE_SCREENSHOT !== 'false';

const TEST_CATEGORY = 'グルメ・飲食';

const profiles = [
  {
    name: 'desktop',
    contextOptions: {
      viewport: { width: 1440, height: 1024 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    },
  },
  {
    name: 'mobile',
    contextOptions: {
      ...devices['iPhone 14'],
    },
  },
];

const selectedProfiles = profiles.filter((profile) => {
  if (deviceMode === 'both') return true;
  return profile.name === deviceMode;
});

if (selectedProfiles.length === 0) {
  throw new Error(`Unsupported DEVICE_MODE: ${deviceMode}`);
}

// ── カテゴリフィルターのインタラクションテスト ────────────────────────────
async function runCategoryFilterTest(page, profileName, outputDir) {
  const test = { test: `category-filter[${TEST_CATEGORY}]`, profile: profileName };

  // 初期件数を取得
  test.initialCount = await page.$eval('#count-badge', el => el.textContent.trim());

  if (profileName === 'mobile') {
    // トリガー行をタップ → シートを開く
    await page.click('#cat-trigger-row');
    await page.waitForSelector('#cat-sheet.open', { timeout: 3000 });
    test.sheetOpened = true;

    // グルメ・飲食 ボタンをタップ
    const chip = await page.$(`#cat-sheet-chips .chip[data-cat="${TEST_CATEGORY}"]`);
    if (!chip) throw new Error(`シートにカテゴリチップが見つかりません: ${TEST_CATEGORY}`);
    await chip.click();

    // シートを閉じる
    await page.click('#cat-sheet-close');
    await page.waitForSelector('#cat-sheet.open', { state: 'hidden', timeout: 3000 });
    test.sheetClosed = true;
  } else {
    // デスクトップ: filter-bar のチップを直接クリック
    const chip = await page.$(`#cat-chips .chip[data-cat="${TEST_CATEGORY}"]`);
    if (!chip) throw new Error(`カテゴリチップが見つかりません: ${TEST_CATEGORY}`);
    await chip.click();
  }

  await page.waitForTimeout(500);

  // フィルター後の件数
  test.filteredCount = await page.$eval('#count-badge', el => el.textContent.trim());

  // モバイル: トリガーラベルが更新されているか
  if (profileName === 'mobile') {
    test.triggerLabel = await page.$eval('#cat-trigger-label', el => el.textContent.trim());
    test.triggerLabelOk = test.triggerLabel === TEST_CATEGORY;
  }

  // 店舗一覧のカテゴリタグがすべて対象カテゴリか検証
  const catTags = await page.$$eval('.store-tag.cat', tags => tags.map(t => t.textContent.trim()));
  test.visibleStoreCount = catTags.length;
  test.allCatTagsMatch = catTags.length > 0 && catTags.every(t => t === TEST_CATEGORY);

  // 件数が変化したか（フィルターが効いているか）
  test.countChanged = test.filteredCount !== test.initialCount;

  test.pass =
    test.countChanged &&
    test.allCatTagsMatch &&
    (profileName !== 'mobile' || test.triggerLabelOk);

  // フィルター後スクリーンショット
  if (captureScreenshot) {
    await page.screenshot({
      path: path.join(outputDir, `screenshot-cat-filtered.png`),
      fullPage: false,
    });
    test.screenshotFiltered = 'screenshot-cat-filtered.png';
  }

  return test;
}

// ── メイン ────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const results = [];

for (const profile of selectedProfiles) {
  const outputDir = path.join(outputRootDir, profile.name);
  const context = await browser.newContext(profile.contextOptions);
  const page = await context.newPage();

  const consoleEntries = [];
  const pageErrors = [];

  page.on('console', async (msg) => {
    const values = await Promise.all(
      msg.args().map(async (arg) => {
        try {
          return await arg.jsonValue();
        } catch {
          return String(arg);
        }
      })
    );

    consoleEntries.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
      args: values,
    });
  });

  page.on('pageerror', (error) => {
    pageErrors.push({
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  });

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const assetUrls = await page.evaluate(() => ({
    stylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((node) => node.href)
      .filter(Boolean),
    scripts: Array.from(document.querySelectorAll('script[src]'))
      .map((node) => node.src)
      .filter(Boolean),
  }));

  const fetchText = async (url) => {
    try {
      const response = await fetch(url);
      return {
        url,
        ok: response.ok,
        status: response.status,
        content: await response.text(),
      };
    } catch (error) {
      return {
        url,
        ok: false,
        status: null,
        error: error instanceof Error ? error.message : String(error),
        content: '',
      };
    }
  };

  const stylesheets = await Promise.all(assetUrls.stylesheets.map(fetchText));
  const scripts = await Promise.all(assetUrls.scripts.map(fetchText));

  const html = await page.content();
  const title = await page.title();
  const finalUrl = page.url();

  await fs.mkdir(outputDir, { recursive: true });
  if (captureScreenshot) {
    await page.screenshot({
      path: path.join(outputDir, 'screenshot.png'),
      fullPage: false,
    });
  }
  await fs.writeFile(path.join(outputDir, 'page.html'), html, 'utf8');
  await fs.writeFile(path.join(outputDir, 'styles.json'), JSON.stringify(stylesheets, null, 2), 'utf8');
  await fs.writeFile(path.join(outputDir, 'scripts.json'), JSON.stringify(scripts, null, 2), 'utf8');
  await fs.writeFile(
    path.join(outputDir, 'console.json'),
    JSON.stringify({ consoleEntries, pageErrors }, null, 2),
    'utf8'
  );

  // ── インタラクションテスト実行 ──────────────────────────────────────────
  let interactionTests = [];
  try {
    const catTest = await runCategoryFilterTest(page, profile.name, outputDir);
    interactionTests.push(catTest);
  } catch (err) {
    interactionTests.push({ test: `category-filter[${TEST_CATEGORY}]`, profile: profile.name, pass: false, error: err.message });
  }
  await fs.writeFile(
    path.join(outputDir, 'interaction-tests.json'),
    JSON.stringify(interactionTests, null, 2),
    'utf8'
  );

  const summary = {
    profile: profile.name,
    targetUrl,
    finalUrl,
    title,
    viewport: page.viewportSize(),
    htmlLength: html.length,
    stylesheetCount: stylesheets.length,
    scriptCount: scripts.length,
    consoleCount: consoleEntries.length,
    pageErrorCount: pageErrors.length,
    screenshot: captureScreenshot ? 'screenshot.png' : null,
    interactionTests,
  };

  await fs.writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  results.push(summary);

  await context.close();
}

await fs.writeFile(path.join(outputRootDir, 'summary.json'), JSON.stringify(results, null, 2), 'utf8');
console.log(JSON.stringify({ outputRootDir, results }, null, 2));

await browser.close();
