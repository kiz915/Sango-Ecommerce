const { chromium } = require('playwright');
const path = require('path');
const os = require('os');

(async () => {
  console.log('[Playwright] Starting browser with visible GUI...');
  
  // Use a clean profile so Chrome doesn't conflict with any active instances
  const profileDir = path.join(os.tmpdir(), 'playwright-auth-profile');
  
  let browser;
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      channel: 'chrome',
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled']
    });
  } catch (err) {
    console.log('[Playwright] Fallback to bundled chromium:', err.message);
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled']
    });
  }

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  console.log('[Playwright] Step 1: Navigating to Supabase URL Configuration...');
  await page.goto('https://supabase.com/dashboard/project/hyecifzfswwrhsyrrxmw/auth/url-configuration');

  console.log('[Playwright] Browser is open on your screen.');
  console.log('[Playwright] If prompted to log in to Supabase or Google, please log in.');
  console.log('[Playwright] Script will automatically monitor and update the URLs as soon as authenticated.');

  let configuredSupabase = false;

  const monitorInterval = setInterval(async () => {
    try {
      const url = page.url();
      
      // If we are on the URL configuration page and logged in
      if (url.includes('/auth/url-configuration') && !url.includes('/login') && !url.includes('/sign-in') && !configuredSupabase) {
        console.log('[Playwright] Detected active Supabase session on URL Configuration page!');
        
        // Wait for page inputs to load
        await page.waitForTimeout(2000);

        // Fill Site URL
        const siteUrlInput = await page.$('input[placeholder*="http"], input[name*="site_url"], input[id*="site-url"]');
        if (siteUrlInput) {
          console.log('[Playwright] Setting Site URL to https://sango-storefront-production.up.railway.app');
          await siteUrlInput.click();
          await siteUrlInput.fill('');
          await siteUrlInput.type('https://sango-storefront-production.up.railway.app');
        }

        // Add redirect URL
        const addUrlBtn = await page.$('button:has-text("Add URL"), button:has-text("Add url")');
        if (addUrlBtn) {
          console.log('[Playwright] Clicking Add URL button...');
          await addUrlBtn.click();
          await page.waitForTimeout(500);
          const redirectInput = await page.$('input[placeholder*="localhost"], input[placeholder*="example.com"]');
          if (redirectInput) {
            await redirectInput.fill('https://sango-storefront-production.up.railway.app/**');
          }
        }

        // Save button
        const saveBtn = await page.$('button:has-text("Save changes"), button:has-text("Save")');
        if (saveBtn) {
          console.log('[Playwright] Saving Supabase URL changes...');
          await saveBtn.click();
          configuredSupabase = true;
          console.log('[Playwright] Successfully saved Supabase URL configuration!');

          // Now navigate to Google Cloud Console or Providers page in Supabase
          console.log('[Playwright] Step 2: Navigating to Google Auth Provider page in Supabase...');
          await page.waitForTimeout(3000);
          await page.goto('https://supabase.com/dashboard/project/hyecifzfswwrhsyrrxmw/auth/providers');
        }
      }
    } catch (err) {
      // Loop continues
    }
  }, 2000);

  // Keep open for up to 15 minutes
  await new Promise(resolve => setTimeout(resolve, 900000));
  clearInterval(monitorInterval);
  await context.close();
})();
