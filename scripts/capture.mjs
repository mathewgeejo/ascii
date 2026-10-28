import {chromium}from'@playwright/test';
import {mkdir}from'node:fs/promises';
const base=process.argv[2]||process.env.PREVIEW_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  await mkdir('test-results',{recursive:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  page.on('pageerror',error=>console.error(error));
  await page.goto(base+'/?scene=skull&t=0');await page.waitForFunction(()=>!!window.asciiStudio);
  await page.screenshot({path:'test-results/viewer-default.png'});
  await page.locator('#return-studio').click();await page.screenshot({path:'test-results/studio-desktop.png'});
  for(const[scene,time,name]of[['skull',0,'skull-front'],['skull',2,'skull-three-quarter'],['skull',4.7,'skull-profile'],['skull',20.25,'skull-lasers'],['stingray',1.7,'ray-up'],['lilies',4.2,'lilies-full']]){
    await page.locator(`[data-preset="${scene}"]`).click();await page.evaluate(t=>window.artworkStudio.seek(t),time);
    await page.locator('#stage').screenshot({path:`test-results/${name}.png`});
  }
  await page.locator('[data-preset="skull"]').click();await page.evaluate(()=>window.artworkStudio.seek(0));
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/studio-mobile.png'});
  await page.locator('#focus-view').click();await page.screenshot({path:'test-results/viewer-mobile.png'});
  console.log('Captured the default artwork view, optional studio, presets and mobile layouts.');
}finally{await browser.close();}
