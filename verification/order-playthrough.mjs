import {chromium} from 'playwright';
import fs from 'node:fs';
const output=process.env.VERIFY_OUTPUT||'/tmp/emberforge-verification';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[],missing=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push({url:r.url(),status:r.status()})});
await page.goto('http://127.0.0.1:3000/verification/');await page.waitForLoadState('networkidle');
fs.mkdirSync('/tmp/emberforge-video',{recursive:true});
for(let i=0;i<140;i++){
 const data=await page.evaluate(i=>window.animationFrame(i),i);
 fs.writeFileSync(`/tmp/emberforge-video/${String(i).padStart(4,'0')}.png`,Buffer.from(data,'base64'));
}
await page.clock.install();
await page.goto('http://127.0.0.1:3000/?autostart=1');await page.waitForLoadState('networkidle');
await page.keyboard.press('o');await page.clock.runFor(100);
console.log('Orders visible',await page.getByRole('button',{name:'Begin Forging',exact:true}).count());
await page.getByRole('button',{name:'Begin Forging',exact:true}).click();await page.clock.runFor(100);
await page.getByRole('button',{name:'Skip Tutorial',exact:true}).click();await page.clock.runFor(100);
console.log('Started',await page.locator('body').innerText());
await page.keyboard.down('Space');await page.clock.runFor(2500);await page.keyboard.up('Space');
await page.screenshot({path:output+'/live-furnace.png'});
await page.clock.runFor(13000);
console.log('After furnace',(await page.locator('body').innerText()).slice(0,450));
await page.screenshot({path:output+'/live-anvil-raised.png'});
for(let i=0;i<8;i++){
 await page.clock.runFor(1100);await page.keyboard.press('Space');await page.clock.runFor(120);
 if(i===0)await page.screenshot({path:output+'/live-anvil-impact.png'});
 await page.clock.runFor(240);
}
console.log('After anvil',(await page.locator('body').innerText()).slice(0,450));
await page.clock.runFor(2000);await page.screenshot({path:output+'/live-grindstone.png'});
await page.clock.runFor(14500);
console.log('After grind',(await page.locator('body').innerText()).slice(0,450));
await page.keyboard.down('Space');await page.clock.runFor(1000);await page.screenshot({path:output+'/live-quench.png'});await page.clock.runFor(800);await page.keyboard.up('Space');await page.clock.runFor(250);
console.log('After quench',(await page.locator('body').innerText()).slice(0,600));
await page.screenshot({path:output+'/live-delivery.png'});
const delivered=await page.getByRole('button',{name:/Collect .*Return to Forge/}).count();
console.log(JSON.stringify({errors,missing,delivered},null,2));if(errors.length||missing.length)throw Error('Browser errors or missing assets');if(!delivered)throw Error('Full order did not reach delivery');
await browser.close();
