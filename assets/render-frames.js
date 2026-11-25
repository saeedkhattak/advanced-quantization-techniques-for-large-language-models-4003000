const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1080},deviceScaleFactor:2});
await p.goto('file://'+process.argv[2]);await p.waitForTimeout(500);
const N=360;for(let i=0;i<N;i++){await p.evaluate(t=>render(t),i*12/N);await p.screenshot({path:`frames/f${String(i).padStart(4,'0')}.png`});}
await b.close();})();
