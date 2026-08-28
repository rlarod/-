const fs=require("fs"),path=require("path");
const {JSDOM,VirtualConsole}=require("jsdom");
const REPO=process.env.REPO||path.resolve(".");
const read=(r)=>fs.readFileSync(path.join(REPO,r),"utf8");
function boot(ratioFn){
  const vc=new VirtualConsole();
  const dom=new JSDOM(read("index.html"),{runScripts:"outside-only",pretendToBeVisual:true,url:"https://example.test/",virtualConsole:vc});
  const win=dom.window;
  const st=win.document.createElement("style");
  st.textContent=read("css/order-pressure-unknown.css");
  win.document.head.appendChild(st);
  win.eval("window.App = window.App || {};");
  win.App.OrderPressureBar={getRatio:ratioFn};
  win.eval(read("js/market-war-power-bar.js"));
  win.App.MarketWarPowerBar.init();
  return win;
}
const 잠깐=()=>new Promise(r=>setTimeout(r,0));
(async()=>{
  let buy=0.70;
  const win=boot(()=>({buy:buy,sell:1-buy}));
  const d=win.document;
  await 잠깐();
  const c0=win.App.MarketWarPowerBar.getCounters();
  const N=300;
  const t0=Date.now();
  for(let i=0;i<N;i++){
    /* 체결이 하나 올 때마다 원본이 막대를 덮는다 */
    d.getElementById("mw-power-buy").style.width=(40+ (i%10)) + "%";
    d.getElementById("mw-power-sell").style.width=(60- (i%10)) + "%";
    d.getElementById("mw-buy-pct").textContent=(40+(i%10))+"%";
    d.getElementById("mw-sell-pct").textContent=(60-(i%10))+"%";
    await 잠깐();
  }
  await 잠깐(); await 잠깐();
  const c1=win.App.MarketWarPowerBar.getCounters();
  console.log("체결(덮은 횟수) N =",N,"  걸린 "+(Date.now()-t0)+"ms");
  console.log("observerHits 증가 =",c1.observerHits-c0.observerHits);
  console.log("rewrites     증가 =",c1.rewrites-c0.rewrites);
  console.log("writes       증가 =",c1.writes-c0.writes);
  win.App.MarketWarPowerBar.stop(); win.close(); process.exit(0);
})();
