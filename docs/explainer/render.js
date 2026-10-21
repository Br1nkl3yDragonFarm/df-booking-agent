const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto('http://localhost:8081/scenes.html?s=0');await p.waitForTimeout(1500);const N=await p.evaluate(()=>window.SCENES);
for(let i=0;i<N;i++){await p.goto('http://localhost:8081/scenes.html?s='+i);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(600);await p.screenshot({path:`${process.argv[2]}/s${String(i).padStart(2,'0')}.png`});}
console.log(N);await b.close();})();
