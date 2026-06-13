import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  console.log('[1] 打开 Render 登录页面...');
  await page.goto('https://dashboard.render.com/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: '/workspace/render-login.png' });
  console.log('截图: /workspace/render-login.png');

  // 查找 GitHub 登录按钮
  console.log('[2] 查找 GitHub 登录按钮...');
  const githubBtn = page.locator('a:has-text("GitHub"), button:has-text("GitHub"), [href*="github"]').first();
  await githubBtn.waitFor({ timeout: 10000 });
  await githubBtn.click();
  console.log('点击了 GitHub 登录按钮');

  // 等待跳转到 GitHub 登录页
  console.log('[3] 等待跳转到 GitHub...');
  await page.waitForURL('**github.com**', { timeout: 15000 });
  await page.screenshot({ path: '/workspace/github-login.png' });
  console.log('截图: /workspace/github-login.png');

  // 填写 GitHub 账号
  console.log('[4] 填写 GitHub 账号...');
  const loginField = page.locator('#login_field, input[name="login"]');
  await loginField.waitFor({ timeout: 10000 });
  await loginField.fill('2930545825@qq.com');

  // 填写密码
  const passwordField = page.locator('#password, input[name="password"]');
  await passwordField.fill('qw195674');

  // 点击登录
  const signInBtn = page.locator('input[type="submit"][value="Sign in"], button[type="submit"]:has-text("Sign in")').first();
  await signInBtn.click();
  console.log('点击了 GitHub 登录');

  // 等待跳转
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/workspace/github-after-login.png' });
  console.log('截图: /workspace/github-after-login.png');

  // 检查是否需要授权
  const currentUrl = page.url();
  console.log('当前 URL:', currentUrl);

  if (currentUrl.includes('login/oauth/authorize') || currentUrl.includes('authorize')) {
    console.log('[5] 需要授权 Render 访问 GitHub...');
    const authorizeBtn = page.locator('button[type="submit"]:has-text("Authorize"), input[type="submit"][value="Authorize"]').first();
    await authorizeBtn.waitFor({ timeout: 10000 });
    await authorizeBtn.click();
    console.log('点击了授权按钮');
    await page.waitForTimeout(5000);
  }

  await page.screenshot({ path: '/workspace/render-after-auth.png' });
  console.log('截图: /workspace/render-after-auth.png');
  console.log('当前 URL:', page.url());

  // 检查是否已登录 Render dashboard
  if (page.url().includes('dashboard.render.com')) {
    console.log('[6] 已登录 Render Dashboard!');

    // 点击 New 按钮创建新服务
    console.log('[7] 查找 New 按钮...');
    const newBtn = page.locator('button:has-text("New"), a:has-text("New")').first();
    await newBtn.waitFor({ timeout: 10000 });
    await newBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/workspace/render-new.png' });
    console.log('截图: /workspace/render-new.png');

    // 选择 Blueprint
    console.log('[8] 选择 Blueprint...');
    const blueprintBtn = page.locator('a:has-text("Blueprint"), div:has-text("Blueprint")').first();
    await blueprintBtn.waitFor({ timeout: 10000 });
    await blueprintBtn.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/workspace/render-blueprint.png' });
    console.log('截图: /workspace/render-blueprint.png');

    // 选择仓库
    console.log('[9] 查找并选择 yuyouapp 仓库...');
    const repoItem = page.locator('label:has-text("yuyouapp"), div:has-text("yuyouapp")').first();
    await repoItem.waitFor({ timeout: 15000 });
    await repoItem.click();
    await page.waitForTimeout(2000);

    // 查找 Continue 按钮
    const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Apply")').first();
    await continueBtn.waitFor({ timeout: 10000 });
    await continueBtn.click();
    console.log('点击了 Continue');

    await page.waitForTimeout(10000);
    await page.screenshot({ path: '/workspace/render-deploy.png' });
    console.log('截图: /workspace/render-deploy.png');
    console.log('当前 URL:', page.url());

    // 检查是否有 Apply 按钮
    const applyBtn = page.locator('button:has-text("Apply"), button:has-text("Deploy")').first();
    if (await applyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[10] 点击 Apply/Deploy 按钮...');
      await applyBtn.click();
      await page.waitForTimeout(5000);
      await page.screenshot({ path: '/workspace/render-deploying.png' });
      console.log('截图: /workspace/render-deploying.png');
    }
  }

  console.log('完成！');
  await browser.close();
})().catch(async (err) => {
  console.error('错误:', err.message);
  // 尝试截图保存错误状态
  try {
    // browser might still be open
  } catch {}
  process.exit(1);
});
