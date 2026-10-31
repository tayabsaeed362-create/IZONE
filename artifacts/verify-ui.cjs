const { chromium } = require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error') errors.push(m.text())});
 await page.goto('http://localhost:3000',{waitUntil:'networkidle'});
 await page.screenshot({path:'artifacts/dashboard-desktop.png',fullPage:true});
 console.log('desktop',await page.title(), await page.locator('body').innerText());
 console.log('css',await page.locator('.metrics-grid').evaluate(e=>({display:getComputedStyle(e).display,columns:getComputedStyle(e).gridTemplateColumns,overflow:document.documentElement.scrollWidth>innerWidth})), 'errors',errors);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/dashboard-mobile.png',fullPage:true});
 console.log('mobile overflow',await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();console.log('menu',await page.locator('.app-sidebar').evaluate(e=>e.getBoundingClientRect().x));
 await page.getByRole('button',{name:'Close navigation',exact:true}).last().click();
 await page.getByRole('button',{name:'This month',exact:true}).click();await page.waitForTimeout(1200);console.log('period',await page.getByRole('button',{name:'This month',exact:true}).getAttribute('aria-pressed'));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
