const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const out = process.argv[2];
const A = 'Timothy Chance and Rasta Country';
const d = n => { const x = new Date(); x.setDate(x.getDate()+n); return x.toISOString().slice(0,10); };
const leads = [
 {id:'l1',name:'Exit/In',venue:'Exit/In',city:'Nashville, TN',type:'Bar / Club',artist:A,status:'booked',contactName:'Sam Ortiz',contactEmail:'sam@exitin.example',eventDate:d(19),value:'800',deposit:'400',depositPaid:true,dateAdded:d(-20)},
 {id:'l2',name:'Terrapin Brewing',city:'Athens, GA',type:'Brewery / Winery',artist:A,status:'interested',contactName:'Jess Lane',contactEmail:'jess@terrapin.example',followUp:d(0),dateAdded:d(-9)},
 {id:'l3',name:'Smith\'s Olde Bar',city:'Atlanta, GA',type:'Bar / Club',artist:A,status:'contacted',contactName:'Booking Team',contactEmail:'book@smiths.example',followUp:d(2),dateAdded:d(-6)},
 {id:'l4',name:'Red Clay Music Fest',city:'Chattanooga, TN',type:'Festival',artist:A,status:'followup',contactName:'Dana Price',contactEmail:'dana@redclay.example',followUp:d(-1),dateAdded:d(-14)},
 {id:'l5',name:'Asheville Music Hall',city:'Asheville, NC',type:'Bar / Club',artist:A,status:'new',contactEmail:'talent@amh.example',followUp:d(1),dateAdded:d(-1)},
 {id:'l6',name:'MTSU Student Events',city:'Murfreesboro, TN',type:'College',artist:A,status:'booked',contactName:'Kim Reyes',contactEmail:'kim@mtsu.example',eventDate:d(33),value:'1500',deposit:'750',dateAdded:d(-30)},
 {id:'l7',name:'Wilson County Fair',city:'Lebanon, TN',type:'Fair / City Event',artist:A,status:'passed',dateAdded:d(-40)},
];
const sync=[{id:'s1',name:'Lone Star Lot (Netflix)',category:'TV',contact:'M. Alvarez',email:'mus@example.com',status:'pitched',dateAdded:d(-3)},{id:'s2',name:'Truck ad — agency brief',category:'Advertising',status:'new',dateAdded:d(-1)}];
const brands=[{id:'b1',name:'Yeti Coolers',category:'Outdoor',status:'new',dateAdded:d(-2)},{id:'b2',name:'Local Brewery Co.',category:'Drinks',status:'contacted',dateAdded:d(-5)}];
(async()=>{
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1.2});
  await ctx.addInitScript(([l,s,br])=>{
    localStorage.setItem('df_leads',JSON.stringify(l));
    localStorage.setItem('df_sync_leads',JSON.stringify(s));
    localStorage.setItem('df_brand_leads',JSON.stringify(br));
    localStorage.setItem('df_crm_passcode_asked','1');
    sessionStorage.setItem('df_hub_auth','true');
    window.prompt=()=>null;
  },[leads,sync,brands]);
  const page = await ctx.newPage();
  page.on('dialog',d=>d.dismiss());
  const shot = async(url,name,fn)=>{ await page.goto('http://localhost:8080/'+url); await page.waitForTimeout(1500); if(fn) await fn(); await page.waitForTimeout(700); await page.screenshot({path:`${out}/${name}.png`}); console.log(name); };
  await shot('hub.html','hub', async()=>{ await page.evaluate(()=>{const g=document.getElementById('gate'); if(g) g.style.display='none'; document.getElementById('hub')?.classList.add('show'); try{loadStats();renderToday&&renderToday()}catch(e){}}); });
  await shot('dashboard.html','overview');
  for (const p of ['finder','composer','crm','calendar','booked']) await shot('dashboard.html','dash-'+p, async()=>{ await page.evaluate(p=>showPage(p),p); });
  for (const u of ['sync','brands','epk-edit','fan-list','report','captions','automations','shows']) await shot(u+'.html',u);
  await b.close();
})();
