import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ═══ DESIGN TOKENS ═══
const T={bg:"#0A0E1A",card:"#0F1425",card2:"#141A2E",border:"#1A2040",green:"#00FFA3",warn:"#FFB800",red:"#FF4D4D",blue:"#4D9FFF",purple:"#B76FFF",text:"#C8CCD8",dim:"#5A6080",white:"#F0F2F8",mono:"'JetBrains Mono',monospace"};

// ═══ INDICATORS ═══
const ema=(d,p)=>{if(d.length<p)return[];const k=2/(p+1);const r=[];let v=d.slice(0,p).reduce((a,b)=>a+b,0)/p;r.push(v);for(let i=p;i<d.length;i++){v=d[i]*k+v*(1-k);r.push(v)}return r};
const calcRsi=(c,p=14)=>{if(c.length<p+1)return[];const g=[],l=[];for(let i=1;i<c.length;i++){const x=c[i]-c[i-1];g.push(x>0?x:0);l.push(x<0?-x:0)}let ag=g.slice(0,p).reduce((a,b)=>a+b,0)/p,al=l.slice(0,p).reduce((a,b)=>a+b,0)/p;const r=[];for(let i=p;i<g.length;i++){ag=(ag*(p-1)+g[i])/p;al=(al*(p-1)+l[i])/p;r.push(al===0?100:100-100/(1+ag/al))}return r};
const calcMacd=(c)=>{const ef=ema(c,12),es=ema(c,26);if(!ef.length||!es.length)return{h:[]};const o=26-12,ln=[];for(let i=0;i<es.length;i++)ln.push(ef[i+o]-es[i]);const sg=ema(ln,9),so=ln.length-sg.length,h=[];for(let i=0;i<sg.length;i++)h.push(ln[i+so]-sg[i]);return{h}};
const calcBB=(c,p=20)=>{if(c.length<p)return null;const s=c.slice(-p),m=s.reduce((a,b)=>a+b,0)/p,std=Math.sqrt(s.reduce((a,b)=>a+(b-m)**2,0)/p);return{u:m+2*std,m,l:m-2*std}};
const calcATR_OHLC=(klines,p=14)=>{if(!klines||klines.length<p+1)return null;const trs=[];for(let i=1;i<klines.length;i++){const h=klines[i][2],l=klines[i][3],pc=klines[i-1][4];trs.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))}let atr=trs.slice(0,p).reduce((a,b)=>a+b,0)/p;for(let i=p;i<trs.length;i++)atr=(atr*(p-1)+trs[i])/p;return atr};

// 10-POINT SIGNAL SCORING
function scoreSignal({closes,atr,fundingRate,fearGreed,lsRatio}){
  if(!closes||closes.length<30||!atr)return null;
  const cur=closes[closes.length-1];const rv=calcRsi(closes);const curRsi=rv.length?rv[rv.length-1]:50;
  const mc=calcMacd(closes);const curH=mc.h.length?mc.h[mc.h.length-1]:0;const prevH=mc.h.length>1?mc.h[mc.h.length-2]:0;
  const e20=ema(closes,20),e50=ema(closes,50),e200=ema(closes,Math.min(200,closes.length));
  const ce20=e20[e20.length-1]||cur,ce50=e50[e50.length-1]||cur,ce200=e200[e200.length-1]||cur;
  const bb=calcBB(closes);const vwap=closes.reduce((a,b)=>a+b,0)/closes.length;
  for(const dir of["long","short"]){
    let sc=0;const checks=[];
    const emOk=dir==="long"?ce20>ce50&&ce50>ce200:ce20<ce50&&ce50<ce200;
    if(emOk){sc++;checks.push({n:"EMA排列",p:true})}else checks.push({n:"EMA排列",p:false});
    // BOS (simplified: price breaks recent extreme)
    const hi=Math.max(...closes.slice(-20)),lo=Math.min(...closes.slice(-20));
    const bos=dir==="long"?cur>=hi*0.998:cur<=lo*1.002;
    if(bos){sc++;checks.push({n:"BOS",p:true})}else checks.push({n:"BOS",p:false});
    // ChoCH
    const choch=closes.length>10&&((dir==="long"&&closes[closes.length-1]>closes[closes.length-6]&&closes[closes.length-6]<closes[closes.length-11])||(dir==="short"&&closes[closes.length-1]<closes[closes.length-6]&&closes[closes.length-6]>closes[closes.length-11]));
    if(choch){sc++;checks.push({n:"ChoCH",p:true})}else checks.push({n:"ChoCH",p:false});
    // OB zone
    let inOB=false;for(let i=closes.length-15;i<closes.length-2;i++){if(i<0)continue;const mv=(closes[i+1]-closes[i])/closes[i]*100;if((dir==="long"&&mv>0.3)||(dir==="short"&&mv<-0.3)){const dist=Math.abs(cur-closes[i])/closes[i]*100;if(dist<0.5)inOB=true}}
    if(inOB){sc++;checks.push({n:"OB",p:true})}else checks.push({n:"OB",p:false});
    // FVG
    let hasFVG=false;for(let i=Math.max(1,closes.length-12);i<closes.length-1;i++){if(Math.abs(closes[i+1]-closes[i-1])/cur*100>0.2)hasFVG=true}
    if(hasFVG){sc++;checks.push({n:"FVG",p:true})}else checks.push({n:"FVG",p:false});
    // Liquidity sweep
    const rLow=closes.length>10?Math.min(...closes.slice(-10,-3)):cur;
    const liqSweep=dir==="long"&&closes.slice(-3).some(p=>p<rLow)&&cur>rLow;
    if(liqSweep){sc++;checks.push({n:"Liquidity",p:true})}else checks.push({n:"Liquidity",p:false});
    // RSI healthy
    const rsiOk=dir==="long"?(curRsi>=40&&curRsi<=65):(curRsi>=35&&curRsi<=60);
    if(rsiOk){sc++;checks.push({n:"RSI",p:true})}else checks.push({n:"RSI",p:false});
    // MACD
    const macdOk=dir==="long"?(curH>0&&curH>prevH):(curH<0&&curH<prevH);
    if(macdOk){sc++;checks.push({n:"MACD",p:true})}else checks.push({n:"MACD",p:false});
    // Volume momentum
    const mom=closes.length>5?Math.abs(cur-closes[closes.length-6])/closes[closes.length-6]*100:0;
    if(mom>0.3){sc++;checks.push({n:"Volume",p:true})}else checks.push({n:"Volume",p:false});
    // R:R
    const tp1=dir==="long"?cur+atr*2:cur-atr*2;const sl=dir==="long"?cur-atr*1.5:cur+atr*1.5;
    const rr=Math.abs(sl-cur)>0?+(Math.abs(tp1-cur)/Math.abs(sl-cur)).toFixed(2):0;
    if(rr>=1.3){sc++;checks.push({n:"R:R",p:true})}else checks.push({n:"R:R",p:false});
    if(sc<5)continue;if(dir==="long"&&curRsi>70)continue;if(dir==="short"&&curRsi<30)continue;if(rr<1.3)continue;
    const tp2=dir==="long"?cur+atr*3:cur-atr*3;const conf=Math.min(95,Math.max(50,sc*8+10));
    const d2=cur<1?6:cur<100?4:2;const warnings=[];
    if(dir==="long"&&curRsi>65)warnings.push(`⚠️ RSI ${curRsi.toFixed(0)} 接近超買`);
    if(dir==="short"&&curRsi<35)warnings.push(`⚠️ RSI ${curRsi.toFixed(0)} 接近超賣`);
    if(fundingRate!=null&&Math.abs(fundingRate)>0.05)warnings.push(`⚠️ 資金費率 ${fundingRate}% 極端`);
    return{direction:dir==="long"?"做多":"做空",score:sc,grade:sc>=8?"strong":sc>=5?"medium":"weak",checks,confidence:conf,rr,warnings,
      entry:+cur.toFixed(d2),tp1:+tp1.toFixed(d2),tp1Pct:+((Math.abs(tp1-cur)/cur)*100).toFixed(2),
      tp2:+tp2.toFixed(d2),tp2Pct:+((Math.abs(tp2-cur)/cur)*100).toFixed(2),
      sl:+sl.toFixed(d2),slPct:+((Math.abs(sl-cur)/cur)*100).toFixed(2),atr:+atr.toFixed(d2),
      ind:{rsi:+curRsi.toFixed(1),macdH:+curH.toFixed(d2),bbPos:bb?+((cur-bb.l)/(bb.u-bb.l)*100).toFixed(0):null,vwap:cur>vwap?"above":"below"},
      holdTime:atr/cur*100>2?"2-6h":atr/cur*100>1?"6-12h":"12-24h"}
  }
  return null;
}

// TRACKER
class Tracker{constructor(){this.trades=[];this.open=[];this.s={w:0,l:0,pnl:0}}add(sig){if(sig)this.open.push({...sig,ot:Date.now()})}update(cp){const cl=[];this.open.forEach((t,i)=>{const sym=t.symbol?.split("/")[0];const p=cp[sym];if(!p)return;let r=null;if(t.direction==="做多"){if(p>=t.tp1)r="tp1";else if(p<=t.sl)r="sl"}else{if(p<=t.tp1)r="tp1";else if(p>=t.sl)r="sl"}if(!r&&Date.now()-t.ot>25*60000)r="timeout";if(r){const ep=r==="tp1"?t.tp1:r==="sl"?t.sl:p;const pnl=t.direction==="做多"?((ep-t.entry)/t.entry*100):((t.entry-ep)/t.entry*100);cl.push({i,t:{...t,exitPrice:ep,pnl:+pnl.toFixed(3),result:r}})}});const ci=new Set();cl.forEach(({i,t})=>{ci.add(i);this.trades.push(t);if(t.pnl>0)this.s.w++;else this.s.l++;this.s.pnl+=t.pnl});this.open=this.open.filter((_,i)=>!ci.has(i))}wr(){const t=this.s.w+this.s.l;return t===0?0:+(this.s.w/t*100).toFixed(1)}pf(){const gw=this.trades.filter(t=>t.pnl>0).reduce((a,t)=>a+t.pnl,0);const gl=Math.abs(this.trades.filter(t=>t.pnl<=0).reduce((a,t)=>a+t.pnl,0));return gl===0?(gw>0?99:0):+(gw/gl).toFixed(2)}summary(){return{total:this.trades.length,openN:this.open.length,wr:this.wr(),pf:this.pf(),...this.s}}recent(n=25){return this.trades.slice(-n).reverse()}}

const COINS=[{s:"BTC",pair:"btcusdt"},{s:"ETH",pair:"ethusdt"},{s:"SOL",pair:"solusdt"},{s:"BNB",pair:"bnbusdt"},{s:"XRP",pair:"xrpusdt"},{s:"DOGE",pair:"dogeusdt"},{s:"ADA",pair:"adausdt"},{s:"AVAX",pair:"avaxusdt"},{s:"LINK",pair:"linkusdt"},{s:"DOT",pair:"dotusdt"},{s:"SUI",pair:"suiusdt"},{s:"NEAR",pair:"nearusdt"}];
const ts=()=>new Date().toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
const fp=p=>{if(!p&&p!==0)return"—";return p<0.01?`$${p.toFixed(6)}`:p<1?`$${p.toFixed(4)}`:p<10?`$${p.toFixed(3)}`:p<1000?`$${p.toFixed(2)}`:`$${p.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`};

// ═══ UI PRIMITIVES ═══
const Spark=({data,color,w=130,h=32})=>{if(!data||data.length<2)return<div style={{width:w,height:h,background:T.card,borderRadius:4}}/>;const mn=Math.min(...data),mx=Math.max(...data),r=mx-mn||1;const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-2-((v-mn)/r)*(h-4)}`).join(" ");return<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/></svg>};
const Spin=({s=16})=><div style={{width:s,height:s,border:`2px solid ${T.border}`,borderTopColor:T.green,borderRadius:"50%",animation:"spin .6s linear infinite",display:"inline-block",verticalAlign:"middle"}}/>;
const Badge=({score,grade})=>{const bg=grade==="strong"?T.green+"22":grade==="medium"?T.warn+"22":T.red+"22";const c=grade==="strong"?T.green:grade==="medium"?T.warn:T.red;return<span style={{background:bg,color:c,padding:"3px 10px",borderRadius:5,fontSize:13,fontWeight:700,fontFamily:T.mono}}>{score}/10 {grade==="strong"?"強訊號":"普通"}</span>};
const Metric=({label,value,color})=><div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 16px",flex:1,minWidth:130}}><div style={{fontSize:12,color:T.dim,marginBottom:4}}>{label}</div><div style={{fontSize:22,fontWeight:700,color:color||T.white,fontFamily:T.mono}}>{value}</div></div>;

// POSITION CALCULATOR
const PosCalc=({entry,sl,onClose})=>{const[cap,setCap]=useState(10000);const[risk,setRisk]=useState(1);if(!entry||!sl)return null;const riskAmt=cap*risk/100;const diff=Math.abs(entry-sl);const pos=diff>0?riskAmt/diff:0;const val=pos*entry;const lev=Math.min(10,Math.ceil(val/(cap||1)));const margin=val/lev;
return<div style={{background:T.card2,border:`1px solid ${T.border}`,borderRadius:10,padding:16,marginTop:10}}>
<div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><span style={{fontSize:15,fontWeight:700,color:T.white}}>⚖️ 倉位計算器</span><button onClick={onClose} style={{background:"none",border:"none",color:T.dim,cursor:"pointer",fontSize:16}}>✕</button></div>
<div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
<div><div style={{fontSize:11,color:T.dim}}>帳戶資金 ($)</div><input value={cap} onChange={e=>setCap(+e.target.value||0)} style={{width:110,background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.white,fontSize:14,fontFamily:T.mono}}/></div>
<div><div style={{fontSize:11,color:T.dim}}>風險 %</div><input type="range" min="0.5" max="3" step="0.5" value={risk} onChange={e=>setRisk(+e.target.value)} style={{width:100}}/><span style={{color:T.warn,fontSize:13,fontFamily:T.mono,marginLeft:6}}>{risk}%</span></div>
</div>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
{[["倉位大小",pos.toFixed(pos<1?4:2),T.white],["最大虧損",`$${riskAmt.toFixed(0)}`,T.red],["建議槓桿",`${lev}x`,T.warn],["保證金",`$${margin.toFixed(0)}`,T.blue]].map(([l,v,c])=><div key={l} style={{background:T.bg,borderRadius:6,padding:"6px 8px"}}><div style={{fontSize:10,color:T.dim}}>{l}</div><div style={{fontSize:15,fontWeight:700,color:c,fontFamily:T.mono}}>{v}</div></div>)}
</div></div>};

// ═══════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════
export default function App(){
const[prices,setPrices]=useState({});const[hist,setHist]=useState(()=>{const h={};COINS.forEach(c=>h[c.s]=[]);return h});
const[atr1h,setAtr1h]=useState({});const[fg,setFg]=useState(null);const[fr,setFr]=useState({});const[lsr,setLsr]=useState({});
const[wsOk,setWsOk]=useState(false);const[signals,setSignals]=useState([]);const[alertLog,setAlertLog]=useState([]);
const[smLog,setSmLog]=useState([]);const[live,setLive]=useState(true);const[tab,setTab]=useState("dashboard");
const[sound,setSound]=useState(true);const[ts2,setTs2]=useState({});const[rt,setRt]=useState([]);const[calcId,setCalcId]=useState(null);
const hR=useRef(hist);useEffect(()=>{hR.current=hist},[hist]);const aR=useRef(atr1h);useEffect(()=>{aR.current=atr1h},[atr1h]);
const fgR=useRef(fg);useEffect(()=>{fgR.current=fg},[fg]);const frR=useRef(fr);useEffect(()=>{frR.current=fr},[fr]);
const lsrR=useRef(lsr);useEffect(()=>{lsrR.current=lsr},[lsr]);const pR=useRef(prices);useEffect(()=>{pR.current=prices},[prices]);
const tk=useRef(new Tracker());
const beep=useCallback(()=>{if(!sound)return;try{const a=new(window.AudioContext||window.webkitAudioContext)(),o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=880;g.gain.setValueAtTime(.07,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.12);o.start();o.stop(a.currentTime+.12)}catch{}},[sound]);

// WS
useEffect(()=>{if(!live)return;const streams=COINS.map(c=>`${c.pair}@ticker`).join("/");let ws;try{ws=new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);ws.onopen=()=>setWsOk(true);ws.onclose=()=>setWsOk(false);ws.onerror=()=>setWsOk(false);ws.onmessage=evt=>{try{const d=JSON.parse(evt.data);if(!d.s)return;const coin=COINS.find(c=>c.pair===d.s.toLowerCase());if(!coin)return;setPrices(p=>({...p,[coin.s]:{price:parseFloat(d.c),chg:parseFloat(d.P),high:parseFloat(d.h),low:parseFloat(d.l)}}));setHist(h=>({...h,[coin.s]:[...(h[coin.s]||[]).slice(-399),parseFloat(d.c)]}))}catch{}}}catch{setWsOk(false)}return()=>{if(ws)ws.close()}},[live]);

// 1H Klines for ATR
useEffect(()=>{if(!live)return;let a=true;const f=async()=>{for(const c of COINS){try{const r=await fetch(`https://api.binance.com/api/v3/klines?symbol=${c.s}USDT&interval=1h&limit=50`);if(!r.ok||!a)continue;const d=await r.json();const kl=d.map(k=>[k[0],+k[1],+k[2],+k[3],+k[4],+k[5]]);const v=calcATR_OHLC(kl);if(v)setAtr1h(p=>({...p,[c.s]:v}))}catch{}}};f();const t=setInterval(f,300000);return()=>{a=false;clearInterval(t)}},[live]);

// Funding + LS + FG
useEffect(()=>{if(!live)return;let a=true;const f=async()=>{try{for(const c of COINS){try{const r=await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${c.s}USDT`);if(r.ok&&a){const d=await r.json();if(d.lastFundingRate)setFr(p=>({...p,[c.s]:+(parseFloat(d.lastFundingRate)*100).toFixed(4)}))}}catch{}}for(const s of["BTC","ETH","SOL"]){try{const r=await fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${s}USDT&period=5m&limit=1`);if(r.ok&&a){const d=await r.json();if(d[0])setLsr(p=>({...p,[s]:+parseFloat(d[0].longShortRatio).toFixed(2)}))}}catch{}}try{const r=await fetch("https://api.alternative.me/fng/?limit=1");if(r.ok&&a){const d=await r.json();if(d.data?.[0])setFg(parseInt(d.data[0].value))}}catch{}}catch{}};f();const t=setInterval(f,60000);return()=>{a=false;clearInterval(t)}},[live]);

// SIGNAL ENGINE + SMART MONEY
useEffect(()=>{if(!live)return;const t=setInterval(()=>{
COINS.forEach(coin=>{const closes=hR.current[coin.s]||[];if(closes.length<30)return;const atr=aR.current[coin.s];if(!atr)return;
const sig=scoreSignal({closes,atr,fundingRate:frR.current[coin.s],fearGreed:fgR.current,lsRatio:lsrR.current[coin.s]});
// Smart money from funding
const funding=frR.current[coin.s];
if(funding!=null&&Math.abs(funding)>0.02){const isBear=funding>0.02;
setSmLog(prev=>{if(prev.find(p=>p.coin===coin.s&&p.time===ts()))return prev;return[{coin:coin.s,text:`${coin.s} 資金費率 ${funding}% — ${isBear?"多頭擁擠":"空頭擁擠"}`,signal:isBear?"bearish":"bullish",time:ts(),id:Date.now()+Math.random()},...prev].slice(0,150)})}
if(sig){const entry={...sig,symbol:`${coin.s}/USDT`,time:ts(),id:Date.now()+Math.random(),_ts:Date.now()};
setSignals(l=>{if(l.find(s2=>s2.symbol===entry.symbol&&(Date.now()-(s2._ts||0))<120000))return l;return[entry,...l].slice(0,80)});
tk.current.add(entry);beep();
setAlertLog(l=>[{type:"signal",level:entry.grade==="strong"?"A":"B",title:`🎯 ${entry.symbol} ${entry.direction}`,msg:`${entry.score}/10 | R:R ${entry.rr} | RSI ${entry.ind.rsi}`,time:ts(),id:Date.now()+Math.random()},...l].slice(0,300))}});
const cp={};Object.entries(pR.current).forEach(([k,v])=>{cp[k]=v.price});
tk.current.update(cp);setTs2(tk.current.summary());setRt(tk.current.recent(25));
},6000);return()=>clearInterval(t)},[live,beep]);

const hasData=Object.keys(prices).length>0;
const smSum=useMemo(()=>{const b=smLog.filter(s=>s.signal==="bullish").length,br=smLog.filter(s=>s.signal==="bearish").length,t=b+br;if(!t)return{pct:50,lb:"中立",c:T.dim};const pct=Math.round(b/t*100);return{pct,lb:pct>=60?"偏多":pct<=40?"偏空":"中立",c:pct>=60?T.green:pct<=40?T.red:T.warn}},[smLog]);
const tabs=[{id:"dashboard",lb:"儀表板",ic:"◉"},{id:"signals",lb:"訊號",ic:"🎯"},{id:"smart",lb:"聰明錢",ic:"💰"},{id:"alerts",lb:"警報",ic:"🔔"},{id:"perf",lb:"績效",ic:"📊"}];

return(
<div style={{fontFamily:"-apple-system,sans-serif",background:T.bg,color:T.text,minHeight:"100vh",fontSize:14}}>
<style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;600;700&display=swap');@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}*{box-sizing:border-box;margin:0;padding:0}body{background:${T.bg}}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px}input:focus{outline:1px solid ${T.green}40}`}</style>

{/* HEADER */}
<header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 20px",borderBottom:`1px solid ${T.border}`,background:T.card+"80",flexWrap:"wrap",gap:8}}>
<div style={{display:"flex",alignItems:"center",gap:10}}>
<div style={{width:34,height:34,borderRadius:7,background:`linear-gradient(135deg,${T.green},${T.blue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:700,color:"#000"}}>⚡</div>
<div><div style={{fontFamily:"'Space Grotesk'",fontWeight:700,fontSize:20,color:T.white}}>SmartFlow Pro</div>
<div style={{fontSize:12,display:"flex",gap:10,flexWrap:"wrap"}}>
<span style={{color:wsOk?T.green:T.red}}>● {wsOk?"Live":"..."}</span>
{fg!=null&&<span style={{color:fg<25?T.red:fg>70?T.green:T.warn}}>F&G {fg}</span>}
{fr.BTC!=null&&<span style={{color:Math.abs(fr.BTC)>0.01?T.red:T.dim}}>BTC FR {fr.BTC}%</span>}
{smLog.length>0&&<span style={{color:smSum.c}}>SM {smSum.lb}</span>}
</div></div></div>
<div style={{display:"flex",alignItems:"center",gap:8}}>
{ts2.total>0&&<div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:7,padding:"4px 12px",fontSize:13,fontFamily:T.mono}}>
<span style={{color:(ts2.wr||0)>=50?T.green:T.red}}>{ts2.wr}%</span><span style={{color:T.dim,margin:"0 6px"}}>|</span><span style={{color:(ts2.pf||0)>=2?T.green:T.warn}}>PF {ts2.pf}</span><span style={{color:T.dim,margin:"0 6px"}}>|</span><span style={{color:T.text}}>{ts2.total}筆</span></div>}
<button onClick={()=>setLive(!live)} style={{background:T.card,border:`1px solid ${T.border}`,color:live?T.text:T.green,borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:13,fontWeight:600}}>
<span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:live?T.green:T.red,marginRight:6,animation:live?"pulse 1.5s infinite":"none"}}/>{live?"LIVE":"OFF"}</button>
<button onClick={()=>setSound(!sound)} style={{background:T.card,border:`1px solid ${T.border}`,color:sound?T.green:T.dim,borderRadius:7,padding:"5px 8px",cursor:"pointer",fontSize:15}}>{sound?"🔔":"🔕"}</button>
</div></header>

<nav style={{display:"flex",borderBottom:`1px solid ${T.border}`,background:T.card+"60",padding:"0 16px",overflowX:"auto"}}>
{tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",borderBottom:tab===t.id?`3px solid ${T.green}`:"3px solid transparent",color:tab===t.id?T.green:T.dim,padding:"10px 16px",cursor:"pointer",fontSize:14,fontWeight:tab===t.id?700:400,whiteSpace:"nowrap"}}>{t.ic} {t.lb}
{t.id==="signals"&&signals.length>0&&<span style={{marginLeft:4,background:T.green+"20",color:T.green,padding:"1px 6px",borderRadius:4,fontSize:11}}>{signals.length}</span>}
</button>)}
</nav>

<div style={{padding:"14px 18px"}}>

{/* ═══ DASHBOARD ═══ */}
{tab==="dashboard"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
{!hasData?<div style={{textAlign:"center",padding:50}}><Spin s={28}/><div style={{color:T.dim,fontSize:16,marginTop:12}}>連線 Binance...</div></div>:<>
<div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
<Metric label="今日訊號" value={signals.length} color={T.blue}/>
<Metric label="勝率" value={`${ts2.wr||0}%`} color={(ts2.wr||0)>=50?T.green:T.red}/>
<Metric label="盈虧因子" value={ts2.pf||0} color={(ts2.pf||0)>=2?T.green:T.warn}/>
<Metric label="恐懼貪婪" value={fg!=null?fg:"—"} color={fg!=null?(fg<25?T.red:fg>70?T.green:T.warn):T.dim}/>
</div>
{/* Market bias */}
<div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
<div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:14,flex:1,minWidth:200}}>
<div style={{fontSize:13,color:T.dim,marginBottom:6}}>聰明錢共識</div>
<div style={{display:"flex",alignItems:"center",gap:10}}>
<div style={{width:48,height:48,borderRadius:"50%",background:`conic-gradient(${T.green} ${smSum.pct*3.6}deg, ${T.border} 0deg)`,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:36,height:36,borderRadius:"50%",background:T.card,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:smSum.c,fontFamily:T.mono}}>{smSum.pct}%</div></div>
<div><div style={{fontSize:18,fontWeight:700,color:smSum.c,fontFamily:"'Space Grotesk'"}}>{smSum.lb}</div><div style={{fontSize:12,color:T.dim}}>過去 4H 聰明錢方向</div></div>
</div></div>
{lsr.BTC&&<div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:14,flex:1,minWidth:150}}>
<div style={{fontSize:13,color:T.dim,marginBottom:6}}>BTC 多空比</div>
<div style={{fontSize:24,fontWeight:700,color:lsr.BTC>1.5?T.red:lsr.BTC<0.8?T.green:T.warn,fontFamily:T.mono}}>{lsr.BTC}</div>
<div style={{fontSize:12,color:T.dim}}>{lsr.BTC>1.5?"多頭擁擠":"正常"}</div></div>}
</div>
{/* Coin grid */}
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
{COINS.map(c=>{const p=prices[c.s]||{};if(!p.price)return null;const h=hist[c.s]||[],up=(p.chg||0)>=0;const rv=calcRsi(h);const curRsi=rv.length?rv[rv.length-1]:null;
return<div key={c.s} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:12,animation:"fadeUp .3s",cursor:"pointer"}} onClick={()=>setTab("signals")}>
<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
<span style={{fontWeight:700,color:T.white,fontSize:17,fontFamily:"'Space Grotesk'"}}>{c.s}</span>
<span style={{fontSize:12,fontWeight:700,color:up?T.green:T.red,fontFamily:T.mono}}>{up?"+":""}{(p.chg||0).toFixed(2)}%</span></div>
<div style={{fontSize:22,fontWeight:700,color:T.white,marginBottom:3,fontFamily:T.mono}}>{fp(p.price)}</div>
<Spark data={h.slice(-60)} color={up?T.green:T.red}/>
<div style={{display:"flex",gap:4,marginTop:6,fontSize:11,flexWrap:"wrap"}}>
{curRsi!=null&&<span style={{color:curRsi<30?T.green:curRsi>70?T.red:T.dim,background:T.bg,padding:"1px 5px",borderRadius:3,fontFamily:T.mono}}>RSI {curRsi.toFixed(0)}</span>}
{atr1h[c.s]&&<span style={{color:T.dim,background:T.bg,padding:"1px 5px",borderRadius:3,fontFamily:T.mono}}>ATR {atr1h[c.s].toFixed(p.price<1?4:0)}</span>}
{fr[c.s]!=null&&<span style={{color:Math.abs(fr[c.s])>0.01?T.red:T.dim,background:T.bg,padding:"1px 5px",borderRadius:3,fontFamily:T.mono}}>FR {fr[c.s]}%</span>}
</div></div>})}
</div></>}
</div>}

{/* ═══ SIGNALS ═══ */}
{tab==="signals"&&<div>
<div style={{fontSize:20,fontWeight:700,color:T.white,marginBottom:4,fontFamily:"'Space Grotesk'"}}>🎯 訊號引擎 — SMC/ICT 10分評分</div>
<div style={{fontSize:12,color:T.dim,marginBottom:14}}>ATR 1H止損 · RSI過濾 · R:R≥1.3 · Score≥5 · 分批止盈</div>
<div style={{display:"flex",flexDirection:"column",gap:12}}>
{signals.map(s=><div key={s.id} style={{background:T.card,border:`2px solid ${s.direction==="做多"?T.green+"40":T.red+"40"}`,borderRadius:12,padding:16,animation:"fadeUp .3s"}}>
{s.warnings?.length>0&&<div style={{background:T.warn+"12",border:`1px solid ${T.warn}30`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:13,color:T.warn}}>{s.warnings.join(" · ")}</div>}
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
<div style={{display:"flex",alignItems:"center",gap:8}}>
<span style={{fontSize:18,fontWeight:700,color:T.white,fontFamily:"'Space Grotesk'"}}>{s.symbol}</span>
<span style={{background:s.direction==="做多"?T.green:T.red,color:"#000",fontWeight:700,fontSize:13,padding:"3px 12px",borderRadius:5}}>{s.direction}</span>
<Badge score={s.score} grade={s.grade}/>
<span style={{fontSize:12,color:T.dim}}>{s.time}</span>
</div>
<div style={{textAlign:"right",fontFamily:T.mono}}>
<div style={{fontSize:14,color:T.text}}>R:R {s.rr}</div>
<div style={{fontSize:11,color:T.dim}}>ATR(1H) {s.atr} · {s.holdTime}</div>
</div></div>
{/* Entry/TP1/TP2/SL */}
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:12}}>
<div style={{background:T.bg,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:10,color:T.dim}}>Entry 入場</div><div style={{fontSize:17,fontWeight:700,color:T.white,fontFamily:T.mono}}>{fp(s.entry)}</div></div>
<div style={{background:T.bg,borderRadius:8,padding:"8px 10px",borderLeft:`3px solid ${T.green}`}}><div style={{fontSize:10,color:T.green}}>TP1 (50%平倉)</div><div style={{fontSize:17,fontWeight:700,color:T.green,fontFamily:T.mono}}>{fp(s.tp1)}</div><div style={{fontSize:11,color:T.green,fontFamily:T.mono}}>+{s.tp1Pct}%</div></div>
<div style={{background:T.bg,borderRadius:8,padding:"8px 10px",borderLeft:`3px solid #00cc82`}}><div style={{fontSize:10,color:"#00cc82"}}>TP2 (全平)</div><div style={{fontSize:17,fontWeight:700,color:"#00cc82",fontFamily:T.mono}}>{fp(s.tp2)}</div><div style={{fontSize:11,color:"#00cc82",fontFamily:T.mono}}>+{s.tp2Pct}%</div></div>
<div style={{background:T.bg,borderRadius:8,padding:"8px 10px",borderLeft:`3px solid ${T.red}`}}><div style={{fontSize:10,color:T.red}}>SL (ATR×1.5)</div><div style={{fontSize:17,fontWeight:700,color:T.red,fontFamily:T.mono}}>{fp(s.sl)}</div><div style={{fontSize:11,color:T.red,fontFamily:T.mono}}>-{s.slPct}%</div></div>
</div>
{/* Checks */}
<div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
{s.checks?.map((ch,i)=><span key={i} style={{fontSize:12,padding:"2px 7px",borderRadius:4,fontFamily:T.mono,background:ch.p?T.green+"12":T.bg,color:ch.p?T.green:T.dim,border:`1px solid ${ch.p?T.green+"25":T.border}`}}>{ch.p?"✓":"✗"} {ch.n}</span>)}
</div>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,color:T.dim,flexWrap:"wrap",gap:6}}>
<span style={{fontFamily:T.mono}}>RSI {s.ind?.rsi} · MACD {s.ind?.macdH>0?"+":""}{s.ind?.macdH} · VWAP {s.ind?.vwap}{s.ind?.bbPos!=null?` · BB ${s.ind.bbPos}%`:""}</span>
<div style={{display:"flex",gap:6}}>
<button onClick={()=>{navigator.clipboard?.writeText(`${s.symbol} ${s.direction}\nEntry: ${s.entry}\nTP1: ${s.tp1} (+${s.tp1Pct}%)\nTP2: ${s.tp2} (+${s.tp2Pct}%)\nSL: ${s.sl} (-${s.slPct}%)\nR:R: ${s.rr}`)}} style={{background:T.card2,border:`1px solid ${T.border}`,color:T.dim,borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11}}>📋 複製</button>
<button onClick={()=>setCalcId(calcId===s.id?null:s.id)} style={{background:T.blue+"18",border:`1px solid ${T.blue}30`,color:T.blue,borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11}}>⚖️ 倉位計算</button>
</div></div>
{calcId===s.id&&<PosCalc entry={s.entry} sl={s.sl} onClose={()=>setCalcId(null)}/>}
</div>)}
{signals.length===0&&<div style={{color:T.dim,textAlign:"center",padding:50}}>等待符合 ≥5/10 分的訊號...</div>}
</div></div>}

{/* ═══ SMART MONEY ═══ */}
{tab==="smart"&&<div>
<div style={{fontSize:20,fontWeight:700,color:T.white,marginBottom:12,fontFamily:"'Space Grotesk'"}}>💰 聰明錢追蹤</div>
{/* Consensus */}
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8,marginBottom:16}}>
{["BTC","ETH","SOL","BNB","XRP"].map(coin=>{const coinSm=smLog.filter(s=>s.coin===coin);const b=coinSm.filter(s=>s.signal==="bullish").length,br=coinSm.filter(s=>s.signal==="bearish").length;const dir=b>br?"🟢偏多":br>b?"🔴偏空":"⚪中立";const c2=b>br?T.green:br>b?T.red:T.dim;
return<div key={coin} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:10,textAlign:"center"}}>
<div style={{fontSize:15,fontWeight:700,color:T.white}}>{coin}</div>
<div style={{fontSize:14,color:c2,fontWeight:600,marginTop:2}}>{dir}</div>
<div style={{fontSize:11,color:T.dim,fontFamily:T.mono}}>FR {fr[coin]!=null?fr[coin]+"%":"—"}</div>
</div>})}
</div>
{smLog.length>0&&<div style={{background:T.card,borderRadius:10,padding:12,marginBottom:14,display:"flex",alignItems:"center",gap:14}}>
<span style={{fontSize:14,color:T.dim}}>整體共識</span>
<div style={{flex:1,height:6,borderRadius:3,background:T.border,overflow:"hidden"}}><div style={{width:`${smSum.pct}%`,height:"100%",background:`linear-gradient(90deg,${T.red},${T.warn},${T.green})`}}/></div>
<span style={{fontSize:16,fontWeight:700,color:smSum.c,fontFamily:T.mono}}>{smSum.pct}% {smSum.lb}</span>
</div>}
<div style={{maxHeight:500,overflowY:"auto"}}>{smLog.slice(0,30).map(sm=><div key={sm.id} style={{display:"flex",gap:10,padding:12,marginBottom:6,borderRadius:8,background:T.card,border:`1px solid ${sm.signal==="bullish"?T.green+"18":T.red+"18"}`}}>
<span style={{fontSize:20}}>{sm.signal==="bullish"?"🟢":"🔴"}</span>
<div style={{flex:1}}><div style={{color:T.text,fontSize:14}}><span style={{color:T.white,fontWeight:600}}>[{sm.coin}]</span> {sm.text}</div>
<div style={{fontSize:12,color:T.dim,marginTop:2}}>{sm.signal==="bullish"?"看多":"看空"} · {sm.time}</div></div>
</div>)}
{smLog.length===0&&<div style={{color:T.dim,textAlign:"center",padding:40}}>等待數據累積...</div>}
</div></div>}

{/* ═══ ALERTS ═══ */}
{tab==="alerts"&&<div>
<div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
<div style={{fontSize:20,fontWeight:700,color:T.white,fontFamily:"'Space Grotesk'"}}>🔔 警報中心</div>
<button onClick={()=>setAlertLog([])} style={{background:T.card,border:`1px solid ${T.border}`,color:T.dim,borderRadius:7,padding:"4px 12px",cursor:"pointer",fontSize:12}}>清除</button>
</div>
<div style={{maxHeight:550,overflowY:"auto"}}>{alertLog.map(a=>{const lc=a.level==="A"?T.red:a.level==="B"?T.warn:T.blue;
return<div key={a.id} style={{display:"flex",gap:10,padding:12,marginBottom:6,borderRadius:8,background:T.card,border:`1px solid ${lc}30`,animation:a.level==="A"?"pulse 2s 3":"none"}}>
<div style={{width:4,borderRadius:2,background:lc,flexShrink:0}}/>
<div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:T.white,fontWeight:600,fontSize:14}}>{a.title}</span><span style={{fontSize:11,color:T.dim}}>{a.time}</span></div>
<div style={{color:T.text,fontSize:13,marginTop:3}}>{a.msg}</div>
</div></div>})}
{alertLog.length===0&&<div style={{color:T.dim,textAlign:"center",padding:50}}>尚無警報</div>}
</div></div>}

{/* ═══ PERFORMANCE ═══ */}
{tab==="perf"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
{[["勝率",`${ts2.wr||0}%`,(ts2.wr||0)>=50?T.green:T.red],["總交易",ts2.total||0,T.white],["勝/負",`${ts2.w||0}/${ts2.l||0}`,T.text],["盈虧因子",ts2.pf||0,(ts2.pf||0)>=2?T.green:T.warn],["總PnL",`${(ts2.pnl||0).toFixed(2)}%`,(ts2.pnl||0)>=0?T.green:T.red],["持倉中",ts2.openN||0,T.blue]].map(([l,v,c])=>
<Metric key={l} label={l} value={v} color={c}/>)}
</div>
{/* PnL curve (text-based mini chart) */}
{rt.length>0&&<div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
<div style={{fontSize:15,fontWeight:700,color:T.white,marginBottom:8}}>📈 累計損益</div>
{(()=>{let cum=0;const pts=rt.map(t=>{cum+=t.pnl;return cum}).reverse();return<Spark data={pts} color={cum>=0?T.green:T.red} w={300} h={50}/>})()}
</div>}
<div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:14}}>
<div style={{fontSize:15,fontWeight:700,color:T.white,marginBottom:10}}>📋 交易紀錄</div>
<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:650}}>
<thead><tr style={{borderBottom:`2px solid ${T.border}`}}>{["幣種","方向","入場","出場","PnL","R:R","結果","分數"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 6px",color:T.dim,fontSize:12}}>{h}</th>)}</tr></thead>
<tbody>{rt.map((t,i)=><tr key={i} style={{borderBottom:`1px solid ${T.border}`}}>
<td style={{padding:"8px 6px",color:T.white,fontWeight:600,fontSize:13}}>{t.symbol}</td>
<td style={{padding:"8px 6px",color:t.direction==="做多"?T.green:T.red,fontWeight:600}}>{t.direction}</td>
<td style={{padding:"8px 6px",color:T.dim,fontFamily:T.mono,fontSize:13}}>{fp(t.entry)}</td>
<td style={{padding:"8px 6px",color:T.dim,fontFamily:T.mono,fontSize:13}}>{fp(t.exitPrice)}</td>
<td style={{padding:"8px 6px",color:t.pnl>=0?T.green:T.red,fontWeight:700,fontFamily:T.mono}}>{t.pnl>=0?"+":""}{t.pnl}%</td>
<td style={{padding:"8px 6px",color:T.warn,fontFamily:T.mono}}>{t.rr}</td>
<td style={{padding:"8px 6px"}}><span style={{padding:"3px 8px",borderRadius:4,fontSize:12,fontWeight:600,background:t.result?.includes("tp")?T.green+"15":T.red+"15",color:t.result?.includes("tp")?T.green:T.red}}>{t.result?.includes("tp")?"✓止盈":"✗止損"}</span></td>
<td style={{padding:"8px 6px",color:T.dim,fontFamily:T.mono}}>{t.score}/10</td>
</tr>)}</tbody></table>
{rt.length===0&&<div style={{color:T.dim,textAlign:"center",padding:30}}>尚無交易紀錄</div>}
</div></div>
</div>}

</div>
<footer style={{textAlign:"center",padding:"12px",color:T.border,fontSize:11,borderTop:`1px solid ${T.border}`}}>SmartFlow Pro · Binance Live · 1H ATR · 10-Point ICT/SMC · Position Calculator</footer>
</div>);
}
