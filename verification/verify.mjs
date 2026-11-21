import { chromium } from 'playwright';
import fs from 'node:fs';
const output=process.env.VERIFY_OUTPUT||'/tmp/emberforge-verification';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1160},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
await page.goto('http://127.0.0.1:3000/verification/');await page.waitForLoadState('networkidle');
await page.evaluate(()=>{window.loadAllWeapons();window.paint()});
await page.waitForLoadState('networkidle');
await page.evaluate(()=>window.paint());
await page.screenshot({path:output+'/emberforge-stations-v1.png',fullPage:true});
console.log(JSON.stringify({tests:await page.evaluate(()=>window.tests()),errors},null,2));if(errors.length)throw Error('Browser resource or page errors');
for(const [name,patch] of Object.entries({raised:{ringProgress:.5},fall:{hammerStrikeAnim:.27,strikesDone:3,anvilStrikeQuality:'good'},impact:{hammerStrikeAnim:.20,strikesDone:7,anvilStrikeQuality:'perfect'},recovery:{hammerStrikeAnim:.1,strikesDone:7,anvilStrikeQuality:'perfect'}})){
 const data=await page.evaluate(p=>window.scene('anvil',p).toDataURL().split(',')[1],patch);
 const fs=await import('node:fs');fs.writeFileSync(`${output}/anvil-${name}.png`,Buffer.from(data,'base64'));
}
await page.evaluate(()=>window.weaponStations());
await page.screenshot({path:output+'/painted-weapons-in-stations.png',fullPage:true});
console.log('Painted coverage',await page.evaluate(()=>window.sharedWeapons()));
await page.screenshot({path:output+'/painted-shared-weapon-icons.png',fullPage:true});
// Verify real app can load too, without touching user saves.
await page.goto('http://127.0.0.1:3000/');await page.waitForLoadState('networkidle');console.log('App title:',await page.title());
await page.screenshot({path:output+'/emberforge-app-smoke.png'});
// Cold-load regression: thumbnails must redraw when painted assets arrive.
const cold=await browser.newPage({viewport:{width:1280,height:800}});
let unblock;const gate=new Promise(resolve=>{unblock=resolve});
await cold.route('**/assets/forging-weapons/*.png',async route=>{await gate;await route.continue()});
await cold.goto('http://127.0.0.1:3000/?autostart=1',{waitUntil:'domcontentloaded'});
await cold.getByText('Tap Stations · Orders (O)',{exact:false}).waitFor();
await cold.keyboard.press('o');
const icon=cold.locator('canvas[aria-label="sword sprite"]').first();await icon.waitFor();
const before=await icon.getAttribute('width');unblock();
await cold.waitForFunction(()=>Number(document.querySelector('canvas[aria-label="sword sprite"]')?.getAttribute('width'))>80);
console.log('Cold-load thumbnail refresh',{before,after:await icon.getAttribute('width')});
await cold.screenshot({path:output+'/painted-order-thumbnail.png'});
await browser.close();
