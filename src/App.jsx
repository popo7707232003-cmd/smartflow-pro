import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ═══ INDICATORS ═══
function ema(d,p){if(d.length<p)return[];const k=2/(p+1);const r=[];let v=d.slice(0,p).reduce((a,b)=>a+b,0)/p;r.push(v);for(let i=p;i<d.length;i++){v=d[i]*k+v*(1-k);r.push(v)}return r}
function sma(d,p){if(d.length<p)return[];const r=[];for(let i=p-1;i<d.length;i++)r.push(d.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p);return r}
function calcRsi(c,p=14){if(c.length<p+1)return[];const g=[],l=[];for(let i=1;i<c.length;i++){const x=c[i]-c[i-1];g.push(x>0?x:0);l.push(x<0?-x:0)}let ag=g.slice(0,p).reduce((a,b)=>a+b,0)/p,al=l.slice(0,p).reduce((a,b)=>a+b,0)/p;const r=[];for(let i=p;i<g.length;i++){ag=(ag*(p-1)+g[i])/p;al=(al*(p-1)+l[i])/p;r.push(al===0?100:100-100/(1+ag/al))}return r}
function calcMacd(c){const ef=ema(c,12),es=ema(c,26);if(!ef.length||!es.length)return{h:[]};const o=26-12,ln=[];for(let i=0;i<es.length;i++)ln.push(ef[i+o]-es[i]);const sg=ema(ln,9),so=ln.length-sg.length,h=[];for(let i=0;i<sg.length;i++)h.push(ln[i+so]-sg[i]);return{h:h.slice(-30)}}
function calcBB(c,p=20){if(c.length<p)return null;const s=c.slice(-p),m=s.reduce((a,b)=>a+b,0)/p,std=Math.sqrt(s.reduce((a,b)=>a+(b-m)**2,0)/p);return{u:m+2*std,m,l:m-2*std}}
function detectDivergence(closes,rsiArr){if(closes.length<6||rsiArr.length<6)return"none";const p1=closes.slice(-6,-3),p2=closes.slice(-3),r1=rsiArr.slice(-6,-3),r2=rsiArr.slice(-3);if(Math.min(...p2)<Math.min(...p1)&&Math.min(...r2)>Math.min(...r1))return"bullish";if(Math.max(...p2)>Math.max(...p1)&&Math.max(...r2)<Math.max(...r1))return"bearish";return"none"}
function obvTrend(closes,vols,p=10){if(closes.length<p+1)return 0;let obv=0;const a=[0];for(let i=1;i<closes.length;i++){if(closes[i]>closes[i-1])obv+=(vols[i]||1);else if(closes[i]<closes[i-1])obv-=(vols[i]||1);a.push(obv)}const r=a.slice(-p);return r[0]===0?0:((r[r.length-1]-r[0])/Math.abs(r[0]||1))*100}
function volSpike(vols,p=20){if(vols.length<p+1)return false;const avg=vols.slice(-p-1,-1).reduce((a,b)=>a+b,0)/p;return vols[vols.length-1]>avg*1.5}

// SMART MONEY DETECTION (derived from price/volume/funding - no API needed)
function detectSmartMoney(closes,vols,fundingRate,lsRatio){
  const signals=[];const cur=closes[closes.length-1];
  // Volume anomaly detection
  if(vols.length>20){const avgVol=vols.slice(-21,-1).reduce((a,b)=>a+b,0)/20;const curVol=vols[vols.length-1];
    if(curVol>avgVol*2.5){const priceChg=closes.length>1?(cur-closes[closes.length-2])/closes[closes.length-2]*100:0;
      signals.push({text:priceChg>0?`異常放量上漲 (量能${(curVol/avgVol).toFixed(1)}倍) — 疑似大戶進場`:`異常放量下跌 (量能${(curVol/avgVol).toFixed(1)}倍) — 疑似大戶出貨`,signal:priceChg>0?"bullish":"bearish",type:priceChg>0?"accumulation":"distribution",importance:"high"})}}
  // Funding rate extreme = crowded positioning
  if(fundingRate!=null){if(fundingRate>0.05)signals.push({text:`資金費率極高 ${fundingRate}% — 多頭過度擁擠，反轉風險高`,signal:"bearish",type:"exchange_outflow",importance:"high"});
    else if(fundingRate<-0.03)signals.push({text:`資金費率極低 ${fundingRate}% — 空頭過度擁擠，軋空可能`,signal:"bullish",type:"accumulation",importance:"high"});
    else if(fundingRate>0.02)signals.push({text:`資金費率偏高 ${fundingRate}% — 多頭情緒濃厚`,signal:"bearish",type:"exchange_inflow",importance:"medium"});
    else if(fundingRate<-0.01)signals.push({text:`資金費率為負 ${fundingRate}% — 空頭主導`,signal:"bullish",type:"exchange_outflow",importance:"medium"})}
  // Long/short ratio extreme
  if(lsRatio!=null){if(lsRatio>2)signals.push({text:`多空比 ${lsRatio} — 散戶極度看多，聰明錢可能反向`,signal:"bearish",type:"whale_sell",importance:"high"});
    else if(lsRatio<0.6)signals.push({text:`多空比 ${lsRatio} — 散戶極度看空，聰明錢可能抄底`,signal:"bullish",type:"whale_buy",importance:"high"});
    else if(lsRatio>1.5)signals.push({text:`多空比偏高 ${lsRatio} — 多頭偏擁擠`,signal:"bearish",type:"exchange_inflow",importance:"medium"});
    else if(lsRatio<0.8)signals.push({text:`多空比偏低 ${lsRatio} — 空頭偏擁擠`,signal:"bullish",type:"exchange_outflow",importance:"medium"})}
  // Price deviation from EMA (mean reversion signal)
  if(closes.length>20){const e20=ema(closes,20);const ce20=e20[e20.length-1];const dev=((cur-ce20)/ce20)*100;
    if(dev<-3)signals.push({text:`價格偏離20均線 ${dev.toFixed(1)}% — 超賣，聰明錢可能吸籌`,signal:"bullish",type:"accumulation",importance:"medium"});
    else if(dev>3)signals.push({text:`價格偏離20均線 +${dev.toFixed(1)}% — 超買，聰明錢可能獲利了結`,signal:"bearish",type:"distribution",importance:"medium"})}
  return signals;
}

function computeSignal({closes,vols,fearGreed,fundingRate,lsRatio,smartMoneyBias}){
  if(!closes||closes.length<20)return null;const cur=closes[closes.length-1];
  const rv=calcRsi(closes,14),curRsi=rv.length?rv[rv.length-1]:50;
  const mc=calcMacd(closes),curH=mc.h.length?mc.h[mc.h.length-1]:0,prevH=mc.h.length>1?mc.h[mc.h.length-2]:0;
  const e5=ema(closes,5),e20=ema(closes,20),s50=sma(closes,Math.min(50,closes.length));
  const ce5=e5.length?e5[e5.length-1]:cur,ce20=e20.length?e20[e20.length-1]:cur,cs50=s50.length?s50[s50.length-1]:cur;
  const bb=calcBB(closes,Math.min(20,closes.length));
  const div=detectDivergence(closes,rv);
  const obv=obvTrend(closes,vols||closes.map(()=>1));
  const vs=volSpike(vols||closes.map(()=>1));
  const atr=closes.length>2?closes.slice(-14).reduce((mx,_,i,a)=>i===0?0:Math.max(mx,Math.abs(a[i]-a[i-1])),0)*1.5||cur*0.02:cur*0.02;
  let sc={};
  // 1. TREND 22%
  let t=0;if(ce5>ce20)t+=30;else t-=30;if(cur>cs50)t+=20;else t-=20;t+=Math.max(-50,Math.min(50,((ce5-ce20)/ce20)*2500));sc.trend=Math.max(-100,Math.min(100,t));
  // 2. MOMENTUM 22%
  let m=0;if(curRsi<25)m+=45;else if(curRsi<35)m+=20;else if(curRsi>75)m-=45;else if(curRsi>65)m-=20;
  if(curH>0&&curH>prevH)m+=25;else if(curH<0&&curH<prevH)m-=25;
  if(div==="bullish")m+=20;else if(div==="bearish")m-=20;
  sc.momentum=Math.max(-100,Math.min(100,m));
  // 3. VOLUME 13%
  let v2=0;if(obv>5)v2+=30;else if(obv<-5)v2-=30;
  if(bb){const pos=(cur-bb.l)/(bb.u-bb.l);if(pos<0.15)v2+=35;else if(pos>0.85)v2-=35}
  if(vs){const pc=closes.length>1?cur-closes[closes.length-2]:0;v2+=pc>0?20:-20}
  sc.volume=Math.max(-100,Math.min(100,v2));
  // 4. SMART MONEY 18%
  sc.smartMoney=Math.max(-100,Math.min(100,(smartMoneyBias||0)*80));
  // 5. DERIVATIVES 10%
  let fd=0;if(fundingRate!=null){if(fundingRate>0.05)fd-=50;else if(fundingRate>0.015)fd-=25;else if(fundingRate<-0.03)fd+=50;else if(fundingRate<-0.008)fd+=25}sc.derivatives=Math.max(-100,Math.min(100,fd));
  // 6. FEAR/GREED 8%
  let fg=0;if(fearGreed!=null){if(fearGreed<15)fg+=55;else if(fearGreed<30)fg+=28;else if(fearGreed>80)fg-=55;else if(fearGreed>70)fg-=28}sc.fearGreed=fg;
  // 7. NEWS (derived from momentum+volume confluence) 7%
  let ns=0;if(vs&&curH>0&&curRsi<60)ns+=30;else if(vs&&curH<0&&curRsi>40)ns-=30;sc.news=Math.max(-100,Math.min(100,ns));
  const W={trend:.22,momentum:.22,volume:.13,smartMoney:.18,derivatives:.10,fearGreed:.08,news:.07};
  let fs=0;Object.keys(W).forEach(k=>fs+=(sc[k]||0)*W[k]);
  const agreeL=Object.values(sc).filter(s2=>s2>8).length,agreeS=Object.values(sc).filter(s2=>s2<-8).length;
  let dir=null;if(fs>=18&&agreeL>=3)dir="做多";else if(fs<=-18&&agreeS>=3)dir="做空";if(!dir)return null;
  const conf=Math.min(95,Math.max(50,Math.round(45+Math.abs(fs)*0.6)));
  const am=conf>75?2.5:2,sm2=conf>75?1.2:1.5;
  let tp,sl;if(dir==="做多"){tp=+(cur+atr*am).toFixed(cur<1?6:2);sl=+(cur-atr*sm2).toFixed(cur<1?6:2)}else{tp=+(cur-atr*am).toFixed(cur<1?6:2);sl=+(cur+atr*sm2).toFixed(cur<1?6:2)}
  const rr=Math.abs(sl-cur)>0?+(Math.abs(tp-cur)/Math.abs(sl-cur)).toFixed(2):0;if(rr<1.2)return null;
  return{direction:dir,entry:+cur.toFixed(cur<1?6:2),tp,sl,rr,confidence:conf,finalScore:+fs.toFixed(1),scores:sc,
    ind:{rsi:+curRsi.toFixed(1),macdH:+(curH).toFixed(cur<1?8:4),bbPos:bb?+((cur-bb.l)/(bb.u-bb.l)*100).toFixed(0):null,div,obv:+obv.toFixed(1)},
    dimCount:dir==="做多"?agreeL:agreeS};
}

class Tracker{constructor(){this.trades=[];this.open=[];this.s={w:0,l:0,pnl:0}}add(sig){if(sig)this.open.push({...sig,ot:Date.now()})}update(cp){const cl=[];this.open.forEach((t,i)=>{const sym=t.symbol?.split("/")[0];const p=cp[sym];if(!p)return;let r=null;if(t.direction==="做多"){if(p>=t.tp)r="tp";else if(p<=t.sl)r="sl"}else{if(p<=t.tp)r="tp";else if(p>=t.sl)r="sl"}if(!r&&Date.now()-t.ot>20*60000)r="timeout";if(r){const ep=r==="tp"?t.tp:r==="sl"?t.sl:p;const pnl=t.direction==="做多"?((ep-t.entry)/t.entry*100):((t.entry-ep)/t.entry*100);cl.push({i,t:{...t,exitPrice:ep,pnl:+pnl.toFixed(3),result:r}})}});const ci=new Set();cl.forEach(({i,t})=>{ci.add(i);this.trades.push(t);if(t.pnl>0)this.s.w++;else this.s.l++;this.s.pnl+=t.pnl});this.open=this.open.filter((_,i)=>!ci.has(i))}wr(){const t=this.s.w+this.s.l;return t===0?0:+(this.s.w/t*100).toFixed(1)}pf(){const gw=this.trades.filter(t=>t.pnl>0).reduce((a,t)=>a+t.pnl,0);const gl=Math.abs(this.trades.filter(t=>t.pnl<=0).reduce((a,t)=>a+t.pnl,0));return gl===0?(gw>0?99:0):+(gw/gl).toFixed(2)}summary(){return{total:this.trades.length,openN:this.open.length,wr:this.wr(),pf:this.pf(),...this.s}}recent(n=20){return this.trades.slice(-n).reverse()}}

const COINS=[
  {s:"BTC",pair:"btcusdt"},{s:"ETH",pair:"ethusdt"},{s:"SOL",pair:"solusdt"},
  {s:"BNB",pair:"bnbusdt"},{s:"XRP",pair:"xrpusdt"},{s:"DOGE",pair:"dogeusdt"},
  {s:"ADA",pair:"adausdt"},{s:"AVAX",pair:"avaxusdt"},{s:"DOT",pair:"dotusdt"},
  {s:"LINK",pair:"linkusdt"},{s:"MATIC",pair:"maticusdt"},{s:"NEAR",pair:"nearusdt"},
];
const ts=()=>new Date().toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
const fp=p=>{if(!p&&p!==0)return"—";return p<1?`$${p.toFixed(5)}`:p<10?`$${p.toFixed(3)}`:p<100?`$${p.toFixed(2)}`:`$${p.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`};

function Spark({data,color,w=150,h=40}){if(!data||data.length<2)return<div style={{width:w,height:h,background:"#0b0b1e",borderRadius:4}}/>;const mn=Math.min(...data),mx=Math.max(...data),r=mx-mn||1;const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-2-((v-mn)/r)*(h-4)}`).join(" ");return<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/></svg>}
function Spin({s=16,c="#0fa"}){return<div style={{width:s,height:s,border:`2px solid #1a1a35`,borderTopColor:c,borderRadius:"50%",animation:"spin .6s linear infinite",display:"inline-block",verticalAlign:"middle"}}/>}
function DimBar({v,label}){const col=v>10?"#0fa":v<-10?"#f45":"#fc6";return<div style={{marginBottom:5}}><div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:2}}><span style={{color:"#667"}}>{label}</span><span style={{color:col,fontWeight:600}}>{v>0?"+":""}{v}</span></div><div style={{height:5,borderRadius:3,background:"#0e0e22",position:"relative",overflow:"hidden"}}><div style={{position:"absolute",left:v>=0?"50%":"auto",right:v<0?"50%":"auto",width:`${Math.min(Math.abs(v)/100*50,50)}%`,height:"100%",background:col,borderRadius:3,transition:"all .4s"}}/></div></div>}
function Popup({alert:a,onClose}){if(!a)return null;return<div style={{position:"fixed",top:16,right:16,zIndex:9999,background:"#0d0d20f0",border:"1px solid #0fa40",borderRadius:14,padding:"16px 20px",maxWidth:420,boxShadow:"0 8px 40px #0008",animation:"slideIn .3s",backdropFilter:"blur(12px)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{color:"#0fa",fontWeight:700,fontSize:16}}>🎯 進場訊號</span><button onClick={onClose} style={{background:"none",border:"none",color:"#445",cursor:"pointer",fontSize:18}}>✕</button></div><div style={{color:"#bbc",fontSize:14,lineHeight:1.7,whiteSpace:"pre-line"}}>{a.content}</div></div>}
const tl={whale_buy:"🐋 鯨魚買入",whale_sell:"🐋 鯨魚賣出",exchange_inflow:"📥 流入交易所",exchange_outflow:"📤 流出交易所",accumulation:"📦 大戶吸籌",distribution:"📤 大戶出貨"};
const tc={whale_buy:"#0fa",whale_sell:"#f45",exchange_inflow:"#f45",exchange_outflow:"#0fa",accumulation:"#0fa",distribution:"#f45"};

export default function App(){
  const[prices,setPrices]=useState({});const[hist,setHist]=useState(()=>{const h={};COINS.forEach(c=>h[c.s]=[]);return h});
  const[vols,setVols]=useState(()=>{const v={};COINS.forEach(c=>v[c.s]=[]);return v});
  const[fg,setFg]=useState(null);const[fr,setFr]=useState({});const[lsr,setLsr]=useState({});
  const[wsOk,setWsOk]=useState(false);const[smLog,setSmLog]=useState([]);
  const[signals,setSignals]=useState([]);const[alertLog,setAlertLog]=useState([]);
  const[popup,setPopup]=useState(null);const[live,setLive]=useState(true);
  const[tab,setTab]=useState("overview");const[sound,setSound]=useState(true);
  const[ts2,setTs2]=useState({});const[rt,setRt]=useState([]);
  const wsRef=useRef(null);const popT=useRef(null);
  const hR=useRef(hist);useEffect(()=>{hR.current=hist},[hist]);
  const vR=useRef(vols);useEffect(()=>{vR.current=vols},[vols]);
  const fgR=useRef(fg);useEffect(()=>{fgR.current=fg},[fg]);
  const frR=useRef(fr);useEffect(()=>{frR.current=fr},[fr]);
  const lsrR=useRef(lsr);useEffect(()=>{lsrR.current=lsr},[lsr]);
  const pR=useRef(prices);useEffect(()=>{pR.current=prices},[prices]);
  const tk=useRef(new Tracker());
  const beep=useCallback(()=>{if(!sound)return;try{const a=new(window.AudioContext||window.webkitAudioContext)(),o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=880;g.gain.setValueAtTime(.08,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.15);o.start();o.stop(a.currentTime+.15)}catch{}},[sound]);
  const flash=useCallback(a=>{setPopup(a);if(popT.current)clearTimeout(popT.current);popT.current=setTimeout(()=>setPopup(null),5000)},[]);

  // 1) BINANCE WS
  useEffect(()=>{if(!live){if(wsRef.current){wsRef.current.close();setWsOk(false)}return}const streams=COINS.map(c=>`${c.pair}@ticker`).join("/");let ws;try{ws=new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);wsRef.current=ws;ws.onopen=()=>setWsOk(true);ws.onclose=()=>setWsOk(false);ws.onerror=()=>setWsOk(false);ws.onmessage=evt=>{try{const d=JSON.parse(evt.data);if(!d.s)return;const coin=COINS.find(c=>c.pair===d.s.toLowerCase());if(!coin)return;const price=parseFloat(d.c);setPrices(p=>({...p,[coin.s]:{price,chg:parseFloat(d.P),high:parseFloat(d.h),low:parseFloat(d.l),vol:parseFloat(d.v),qvol:parseFloat(d.q)}}));setHist(h=>({...h,[coin.s]:[...(h[coin.s]||[]).slice(-299),price]}));setVols(v=>({...v,[coin.s]:[...(v[coin.s]||[]).slice(-299),parseFloat(d.q)]}))}catch{}}}catch{setWsOk(false)}return()=>{if(ws)ws.close()}},[live]);

  // 2) FUNDING RATES
  useEffect(()=>{if(!live)return;let act=true;const f=async()=>{try{for(const coin of COINS){const r=await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${coin.s}USDT`);if(!r.ok||!act)continue;const d=await r.json();if(d.lastFundingRate)setFr(p=>({...p,[coin.s]:+(parseFloat(d.lastFundingRate)*100).toFixed(4)}))}}catch{}};f();const t=setInterval(f,60000);return()=>{act=false;clearInterval(t)}},[live]);

  // 3) LONG/SHORT
  useEffect(()=>{if(!live)return;let act=true;const f=async()=>{try{for(const sym of["BTC","ETH","SOL"]){const r=await fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${sym}USDT&period=5m&limit=1`);if(!r.ok||!act)continue;const d=await r.json();if(d[0])setLsr(p=>({...p,[sym]:+parseFloat(d[0].longShortRatio).toFixed(2)}))}}catch{}};f();const t=setInterval(f,60000);return()=>{act=false;clearInterval(t)}},[live]);

  // 4) FEAR & GREED
  useEffect(()=>{if(!live)return;let act=true;const f=async()=>{try{const r=await fetch("https://api.alternative.me/fng/?limit=1");if(!r.ok||!act)return;const d=await r.json();if(d.data?.[0])setFg(parseInt(d.data[0].value))}catch{}};f();const t=setInterval(f,300000);return()=>{act=false;clearInterval(t)}},[live]);

  // 5) SMART MONEY DETECTION + SIGNAL ENGINE
  useEffect(()=>{if(!live)return;const t=setInterval(()=>{
    const allSm=[];
    COINS.forEach(coin=>{
      const closes=hR.current[coin.s]||[];const volArr=vR.current[coin.s]||[];if(closes.length<15)return;
      // Smart money detection
      const smSignals=detectSmartMoney(closes,volArr,frR.current[coin.s],lsrR.current[coin.s]);
      smSignals.forEach(sm=>{allSm.push({...sm,coin:coin.s,time:ts(),id:Date.now()+Math.random()})});
      // Compute smart money bias for signals
      const coinSm=smSignals;const smB=coinSm.filter(s=>s.signal==="bullish").length,smBr=coinSm.filter(s=>s.signal==="bearish").length;
      const smBias=(smB+smBr)>0?(smB-smBr)/(smB+smBr):0;
      const sig=computeSignal({closes,vols:volArr,fearGreed:fgR.current,fundingRate:frR.current[coin.s],lsRatio:lsrR.current[coin.s],smartMoneyBias:smBias});
      if(sig){
        const entry={...sig,symbol:`${coin.s}/USDT`,time:ts(),id:Date.now()+Math.random(),_ts:Date.now()};
        setSignals(l=>{if(l.find(s2=>s2.symbol===entry.symbol&&(Date.now()-(s2._ts||0))<90000))return l;return[entry,...l].slice(0,80)});
        tk.current.add(entry);
        const al={type:"entry",content:`${entry.symbol} ${entry.direction} | 信心 ${entry.confidence}%\n入場 $${entry.entry} → 止盈 $${entry.tp} / 止損 $${entry.sl}\nR:R ${entry.rr} | ${entry.dimCount}/7維 | 分數 ${entry.finalScore}\nRSI ${entry.ind.rsi} | MACD ${entry.ind.macdH>0?"+":""}${entry.ind.macdH}${entry.ind.div!=="none"?` | ${entry.ind.div}背離`:""}`,time:ts(),id:Date.now()+Math.random()};
        setAlertLog(l=>[al,...l].slice(0,300));flash(al);beep();
      }
    });
    // Update smart money log (deduplicate by text similarity)
    if(allSm.length>0)setSmLog(prev=>{const fresh=allSm.filter(n=>!prev.some(p2=>p2.text===n.text&&p2.coin===n.coin));return[...fresh,...prev].slice(0,200)});
    const cp={};Object.entries(pR.current).forEach(([k,v2])=>{cp[k]=v2.price});
    tk.current.update(cp);setTs2(tk.current.summary());setRt(tk.current.recent(20));
  },6000);return()=>clearInterval(t)},[live,beep,flash]);

  const smSum=useMemo(()=>{const b=smLog.filter(s=>s.signal==="bullish").length,br=smLog.filter(s=>s.signal==="bearish").length,t=b+br;if(t===0)return{pct:50,lb:"—",c:"#667"};const pct=Math.round((b/t)*100);return{pct,lb:pct>=60?"偏多":pct<=40?"偏空":"中性",c:pct>=60?"#0fa":pct<=40?"#f45":"#fc6"}},[smLog]);
  const hasData=Object.keys(prices).length>0;
  const tabs=[{id:"overview",lb:"總覽"},{id:"smartmoney",lb:"💰 聰明錢"},{id:"signals",lb:"🎯 訊號"},{id:"perf",lb:"📊 績效"},{id:"alerts",lb:"🔔 警報"}];

  return(
    <div style={{fontFamily:"-apple-system,'Segoe UI',sans-serif",background:"#060614",color:"#9098a8",minHeight:"100vh",fontSize:14}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');@keyframes slideIn{from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}*{box-sizing:border-box;margin:0;padding:0}body{background:#060614}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#1e1e40;border-radius:2px}`}</style>
      <Popup alert={popup} onClose={()=>setPopup(null)}/>

      <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 24px",borderBottom:"1px solid #12122e",background:"linear-gradient(180deg,#0b0b20,#060614)",flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:8,background:"linear-gradient(135deg,#0fa,#08f)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,color:"#000"}}>⚡</div>
          <div>
            <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,fontSize:22,color:"#f0f2f8"}}>SmartFlow Pro</div>
            <div style={{fontSize:13,display:"flex",gap:12,marginTop:2,flexWrap:"wrap"}}>
              <span style={{color:wsOk?"#0fa":"#f45"}}>● {wsOk?"Binance 即時連線":"連線中..."}</span>
              {fg!=null&&<span style={{color:fg<25?"#f45":fg>70?"#0fa":"#fc6"}}>恐懼貪婪 {fg}</span>}
              {fr.BTC!=null&&<span style={{color:Math.abs(fr.BTC)>0.01?(fr.BTC>0?"#f45":"#0fa"):"#667"}}>BTC FR {fr.BTC}%</span>}
              {lsr.BTC&&<span style={{color:lsr.BTC>1.5?"#f45":lsr.BTC<0.8?"#0fa":"#667"}}>多空比 {lsr.BTC}</span>}
              {smLog.length>0&&<span style={{color:smSum.c}}>聰明錢 {smSum.lb}</span>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {ts2.total>0&&<div style={{background:"#0b0b22",border:"1px solid #18183a",borderRadius:8,padding:"6px 14px",fontSize:14}}>
            <span style={{color:(ts2.wr||0)>=50?"#0fa":"#f45",fontWeight:700}}>勝率 {ts2.wr}%</span>
            <span style={{color:"#334",margin:"0 8px"}}>|</span><span style={{color:"#889"}}>{ts2.total}筆</span>
            <span style={{color:"#334",margin:"0 8px"}}>|</span><span style={{color:(ts2.pf||0)>=1.5?"#0fa":"#fc6"}}>PF {ts2.pf}</span>
          </div>}
          <button onClick={()=>setLive(!live)} style={{background:live?"#0b0b22":"#0fa10",border:`1px solid ${live?"#18183a":"#0fa30"}`,color:live?"#889":"#0fa",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:14,fontWeight:600}}>
            <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:live?"#0fa":"#f45",marginRight:8,animation:live?"pulse 1.5s infinite":"none"}}/>{live?"LIVE":"OFF"}
          </button>
          <button onClick={()=>setSound(!sound)} style={{background:"#0b0b22",border:"1px solid #18183a",color:sound?"#0fa":"#334",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:16}}>{sound?"🔔":"🔕"}</button>
        </div>
      </header>

      <nav style={{display:"flex",borderBottom:"1px solid #12122e",background:"#08081a",padding:"0 20px",overflowX:"auto"}}>
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",borderBottom:tab===t.id?"3px solid #0fa":"3px solid transparent",color:tab===t.id?"#0fa":"#445",padding:"12px 18px",cursor:"pointer",fontSize:15,fontWeight:tab===t.id?700:400,whiteSpace:"nowrap"}}>{t.lb}
          {t.id==="signals"&&signals.length>0&&<span style={{marginLeft:6,background:"#0fa18",color:"#0fa",padding:"2px 8px",borderRadius:5,fontSize:12,fontWeight:700}}>{signals.length}</span>}
          {t.id==="smartmoney"&&smLog.length>0&&<span style={{marginLeft:6,background:"#08f18",color:"#08f",padding:"2px 8px",borderRadius:5,fontSize:12}}>{smLog.length}</span>}
        </button>)}
      </nav>

      <div style={{padding:"16px 20px"}}>
        {/* OVERVIEW */}
        {tab==="overview"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
          {!hasData&&<div style={{textAlign:"center",padding:60}}><Spin s={32}/><div style={{color:"#667",fontSize:18,marginTop:16}}>連線 Binance 中...</div></div>}
          {hasData&&<>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))",gap:12}}>
              {COINS.map(c=>{const p=prices[c.s]||{},h=hist[c.s]||[],up=(p.chg||0)>=0;
                const rv=calcRsi(h,14),curRsi=rv.length?rv[rv.length-1]:null;
                const mc2=calcMacd(h),curMH=mc2.h.length?mc2.h[mc2.h.length-1]:null;
                const bb=calcBB(h,Math.min(20,h.length)),bbP=bb&&h.length?((h[h.length-1]-bb.l)/(bb.u-bb.l)*100):null;
                const e5v=ema(h,5),e20v=ema(h,20);
                const trend=e5v.length&&e20v.length?(e5v[e5v.length-1]>e20v[e20v.length-1]?"▲ 上升趨勢":"▼ 下降趨勢"):null;
                if(!p.price)return null;
                return<div key={c.s} style={{background:"#0b0b22",border:"1px solid #14143a",borderRadius:12,padding:16,animation:"fadeUp .3s"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontWeight:700,color:"#f0f2f8",fontSize:20,fontFamily:"'Space Grotesk'"}}>{c.s}</span>
                    <span style={{fontSize:14,fontWeight:700,color:up?"#0fa":"#f45",background:up?"#0fa12":"#f4512",padding:"3px 10px",borderRadius:6}}>{up?"+":""}{(p.chg||0).toFixed(2)}%</span>
                  </div>
                  <div style={{fontSize:28,fontWeight:700,color:"#f8f9ff",marginBottom:6,fontFamily:"'Space Grotesk'"}}>{fp(p.price)}</div>
                  <div style={{fontSize:12,color:"#445",marginBottom:8}}>H {fp(p.high)} · L {fp(p.low)}</div>
                  <Spark data={h.slice(-80)} color={up?"#0fa":"#f45"}/>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:10}}>
                    {curRsi!=null&&<div style={{background:"#0a0a1e",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                      <div style={{fontSize:11,color:"#556"}}>RSI</div>
                      <div style={{fontSize:18,fontWeight:700,color:curRsi<30?"#0fa":curRsi>70?"#f45":"#bbc"}}>{curRsi.toFixed(0)}</div>
                    </div>}
                    {curMH!=null&&<div style={{background:"#0a0a1e",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                      <div style={{fontSize:11,color:"#556"}}>MACD</div>
                      <div style={{fontSize:18,fontWeight:700,color:curMH>0?"#0fa":"#f45"}}>{curMH>0?"+":""}{curMH.toFixed(p.price<1?5:1)}</div>
                    </div>}
                    {bbP!=null&&<div style={{background:"#0a0a1e",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                      <div style={{fontSize:11,color:"#556"}}>BB</div>
                      <div style={{fontSize:18,fontWeight:700,color:bbP<20?"#0fa":bbP>80?"#f45":"#bbc"}}>{bbP.toFixed(0)}%</div>
                    </div>}
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:8,fontSize:12,flexWrap:"wrap"}}>
                    {trend&&<span style={{color:trend.includes("上升")?"#0fa":"#f45",background:"#0a0a1e",padding:"3px 8px",borderRadius:5}}>{trend}</span>}
                    {fr[c.s]!=null&&<span style={{color:fr[c.s]>0.01?"#f45":fr[c.s]<-0.005?"#0fa":"#667",background:"#0a0a1e",padding:"3px 8px",borderRadius:5}}>FR {fr[c.s]}%</span>}
                  </div>
                </div>})}
            </div>
            {/* LATEST SIGNALS */}
            {signals.length>0&&<div style={{background:"#0b0b22",border:"1px solid #14143a",borderRadius:12,padding:18}}>
              <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,color:"#f0f2f8",marginBottom:12,fontSize:18}}>🎯 最新進場訊號</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))",gap:10}}>
                {signals.slice(0,4).map(s=><div key={s.id} style={{padding:14,borderRadius:10,background:"#0a0a1e",border:`2px solid ${s.direction==="做多"?"#0fa25":"#f4525"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:18,fontWeight:700,color:"#f0f2f8"}}>{s.symbol}</span>
                      <span style={{background:s.direction==="做多"?"#0fa":"#f45",color:"#000",fontWeight:700,fontSize:14,padding:"4px 12px",borderRadius:6}}>{s.direction}</span>
                    </div>
                    <span style={{fontSize:15,fontWeight:600,color:"#bbc"}}>{s.confidence}%</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    {[["入場",s.entry,"#f0f2f8"],["止盈 TP",s.tp,"#0fa"],["止損 SL",s.sl,"#f45"]].map(([l,v2,c])=><div key={l} style={{background:"#08081a",borderRadius:6,padding:"8px 10px"}}><div style={{fontSize:11,color:"#445"}}>{l}</div><div style={{fontSize:17,fontWeight:700,color:c}}>{fp(v2)}</div></div>)}
                  </div>
                  <div style={{fontSize:13,color:"#667",marginTop:8}}>R:R {s.rr} · RSI {s.ind.rsi} · MACD {s.ind.macdH>0?"+":""}{s.ind.macdH}{s.ind.div!=="none"?` · ${s.ind.div}背離`:""}<span style={{float:"right",color:"#334"}}>{s.time}</span></div>
                </div>)}
              </div>
            </div>}
          </>}
        </div>}

        {/* SMART MONEY */}
        {tab==="smartmoney"&&<div style={{background:"#0b0b22",border:"1px solid #14143a",borderRadius:12,padding:20}}>
          <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,color:"#f0f2f8",fontSize:22,marginBottom:6}}>💰 聰明錢監控系統</div>
          <div style={{fontSize:14,color:"#556",marginBottom:16}}>基於資金費率極值、多空比失衡、異常放量、均線偏離度自動偵測大戶動向</div>
          {smLog.length>0&&<div style={{background:"#0a0a1e",borderRadius:10,padding:14,marginBottom:16,display:"flex",alignItems:"center",gap:16}}>
            <span style={{fontSize:15,color:"#778"}}>整體聰明錢方向</span>
            <div style={{flex:1,height:8,borderRadius:4,background:"#15153a",overflow:"hidden"}}><div style={{width:`${smSum.pct}%`,height:"100%",background:`linear-gradient(90deg,#f45,#fc6,#0fa)`,borderRadius:4}}/></div>
            <span style={{fontSize:18,fontWeight:700,color:smSum.c,fontFamily:"'Space Grotesk'"}}>{smSum.pct}% {smSum.lb}</span>
          </div>}
          <div style={{maxHeight:500,overflowY:"auto"}}>
            {smLog.slice(0,30).map(sm=><div key={sm.id} style={{display:"flex",gap:12,padding:14,marginBottom:8,borderRadius:10,background:sm.importance==="high"?(sm.signal==="bullish"?"#0fa08":"#f4508"):"#0a0a1e",border:`1px solid ${sm.importance==="high"?(sm.signal==="bullish"?"#0fa20":"#f4520"):"#12122e"}`,animation:"fadeUp .3s"}}>
              <div style={{minWidth:36,height:36,borderRadius:8,background:(tc[sm.type]||"#556")+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{sm.signal==="bullish"?"🟢":"🔴"}</div>
              <div style={{flex:1}}>
                <div style={{color:"#ccd",fontSize:15,lineHeight:1.5,marginBottom:4}}><span style={{color:"#f0f2f8",fontWeight:600}}>[{sm.coin}]</span> {sm.text}</div>
                <div style={{display:"flex",gap:8,fontSize:13,flexWrap:"wrap"}}>
                  <span style={{color:tc[sm.type]||"#556",fontWeight:600}}>{tl[sm.type]||sm.type}</span>
                  <span style={{color:sm.signal==="bullish"?"#0fa":"#f45",fontWeight:600}}>{sm.signal==="bullish"?"📈 看多":"📉 看空"}</span>
                  <span style={{color:sm.importance==="high"?"#fc6":"#445"}}>{sm.importance==="high"?"⚠ 重要":"一般"}</span>
                  <span style={{color:"#334"}}>{sm.time}</span>
                </div>
              </div>
            </div>)}
            {smLog.length===0&&<div style={{color:"#334",textAlign:"center",padding:40,fontSize:16}}>等待價格數據累積中，約 1 分鐘後開始偵測...</div>}
          </div>
        </div>}

        {/* SIGNALS */}
        {tab==="signals"&&<div style={{background:"#0b0b22",border:"1px solid #14143a",borderRadius:12,padding:20}}>
          <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,color:"#f0f2f8",fontSize:22,marginBottom:4}}>🎯 7 維交叉驗證訊號引擎</div>
          <div style={{fontSize:14,color:"#556",marginBottom:16}}>趨勢22% · 動量22% · 量能13% · 聰明錢18% · 衍生品10% · 恐懼貪婪8% · 消息面7% | 需 ≥3維同向 + R:R ≥ 1.2</div>
          <div style={{maxHeight:550,overflowY:"auto",display:"flex",flexDirection:"column",gap:10}}>
            {signals.map(s=><div key={s.id} style={{padding:16,borderRadius:10,background:"#0a0a1e",border:`2px solid ${s.direction==="做多"?"#0fa22":"#f4522"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:20,fontWeight:700,color:"#f0f2f8",fontFamily:"'Space Grotesk'"}}>{s.symbol}</span>
                  <span style={{background:s.direction==="做多"?"#0fa":"#f45",color:"#000",fontWeight:700,fontSize:14,padding:"4px 14px",borderRadius:6}}>{s.direction}</span>
                  <span style={{fontSize:14,color:"#667"}}>{s.dimCount}/7維 · 分數 {s.finalScore}</span>
                </div>
                <div style={{background:`conic-gradient(${s.confidence>=70?"#0fa":"#fc6"} ${s.confidence*3.6}deg, #18183a 0deg)`,width:40,height:40,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:30,height:30,borderRadius:"50%",background:"#0a0a1e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#f0f2f8"}}>{s.confidence}</div></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:12}}>
                {[["入場",s.entry,"#f0f2f8"],["止盈 TP",s.tp,"#0fa"],["止損 SL",s.sl,"#f45"],["R:R",s.rr,"#fc6"]].map(([l,v2,c])=><div key={l} style={{background:"#08081a",borderRadius:6,padding:"8px 10px"}}><div style={{fontSize:11,color:"#445"}}>{l}</div><div style={{fontSize:17,fontWeight:700,color:c}}>{typeof v2==="number"&&l!=="R:R"?fp(v2):v2}</div></div>)}
              </div>
              {s.scores&&<div style={{marginBottom:8}}><DimBar v={Math.round(s.scores.trend)} label="趨勢 (EMA5/20+SMA50)"/><DimBar v={Math.round(s.scores.momentum)} label="動量 (RSI+MACD+背離)"/><DimBar v={Math.round(s.scores.volume)} label="量能 (OBV+BB+量能放大)"/><DimBar v={Math.round(s.scores.smartMoney)} label="聰明錢 (資金流+大戶)"/><DimBar v={Math.round(s.scores.derivatives||0)} label="衍生品 (資金費率反向)"/><DimBar v={Math.round(s.scores.fearGreed||0)} label="恐懼貪婪 (反向指標)"/><DimBar v={Math.round(s.scores.news||0)} label="消息面 (量價共振)"/></div>}
              <div style={{fontSize:13,color:"#667"}}>RSI {s.ind.rsi} · MACD {s.ind.macdH>0?"+":""}{s.ind.macdH} · OBV趨勢 {s.ind.obv>0?"+":""}{s.ind.obv}{s.ind.bbPos!=null?` · BB ${s.ind.bbPos}%`:""}{s.ind.div!=="none"?` · ⚡${s.ind.div}背離`:""}<span style={{float:"right",color:"#334"}}>{s.time}</span></div>
            </div>)}
            {signals.length===0&&<div style={{color:"#334",textAlign:"center",padding:50,fontSize:16}}>累積價格數據中，約 1-2 分鐘後產生第一筆訊號</div>}
          </div>
        </div>}

        {/* PERFORMANCE */}
        {tab==="perf"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))",gap:10}}>
            {[["勝率",`${ts2.wr||0}%`,(ts2.wr||0)>=50?"#0fa":"#f45"],["總交易",`${ts2.total||0}`,"#f0f2f8"],["勝 / 負",`${ts2.w||0} / ${ts2.l||0}`,"#bbc"],["利潤因子",`${ts2.pf||0}`,(ts2.pf||0)>=1.5?"#0fa":"#fc6"],["總 PnL",`${(ts2.pnl||0).toFixed(2)}%`,(ts2.pnl||0)>=0?"#0fa":"#f45"],["持倉中",`${ts2.openN||0}`,"#08f"]].map(([l,v2,c])=>
              <div key={l} style={{background:"#0b0b22",border:"1px solid #14143a",borderRadius:10,padding:14}}><div style={{fontSize:13,color:"#556",marginBottom:4}}>{l}</div><div style={{fontSize:26,fontWeight:700,color:c,fontFamily:"'Space Grotesk'"}}>{v2}</div></div>)}
          </div>
          <div style={{background:"#0b0b22",border:"1px solid #14143a",borderRadius:12,padding:18}}>
            <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,color:"#f0f2f8",marginBottom:12,fontSize:18}}>📋 交易紀錄</div>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:650}}>
              <thead><tr style={{borderBottom:"2px solid #14143a"}}>{["幣種","方向","入場","出場","PnL","R:R","結果","信心度"].map(h=><th key={h} style={{textAlign:"left",padding:"10px 8px",color:"#556",fontSize:13}}>{h}</th>)}</tr></thead>
              <tbody>{rt.map((t2,i)=><tr key={i} style={{borderBottom:"1px solid #10102a"}}>
                <td style={{padding:"10px 8px",color:"#f0f2f8",fontSize:14,fontWeight:600}}>{t2.symbol}</td>
                <td style={{padding:"10px 8px",color:t2.direction==="做多"?"#0fa":"#f45",fontSize:14,fontWeight:600}}>{t2.direction}</td>
                <td style={{padding:"10px 8px",color:"#889",fontSize:14}}>{fp(t2.entry)}</td>
                <td style={{padding:"10px 8px",color:"#889",fontSize:14}}>{fp(t2.exitPrice)}</td>
                <td style={{padding:"10px 8px",color:t2.pnl>=0?"#0fa":"#f45",fontSize:15,fontWeight:700}}>{t2.pnl>=0?"+":""}{t2.pnl}%</td>
                <td style={{padding:"10px 8px",color:"#fc6",fontSize:14}}>{t2.rr}</td>
                <td style={{padding:"10px 8px"}}><span style={{padding:"4px 10px",borderRadius:5,fontSize:13,fontWeight:600,background:t2.result==="tp"?"#0fa15":"#f4515",color:t2.result==="tp"?"#0fa":t2.result==="sl"?"#f45":"#fc6"}}>{t2.result==="tp"?"✓ 止盈":t2.result==="sl"?"✗ 止損":"⏱ 超時"}</span></td>
                <td style={{padding:"10px 8px",color:"#667",fontSize:13}}>{t2.confidence}%</td>
              </tr>)}</tbody></table>
              {rt.length===0&&<div style={{color:"#334",textAlign:"center",padding:40,fontSize:15}}>訊號產生後會自動追蹤每筆交易結果</div>}
            </div>
          </div>
        </div>}

        {/* ALERTS */}
        {tab==="alerts"&&<div style={{background:"#0b0b22",border:"1px solid #14143a",borderRadius:12,padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,color:"#f0f2f8",fontSize:22}}>🔔 所有警報</div>
            <button onClick={()=>setAlertLog([])} style={{background:"#0a0a1e",border:"1px solid #18183a",color:"#556",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:13}}>清除全部</button>
          </div>
          <div style={{maxHeight:550,overflowY:"auto"}}>{alertLog.map(a=><div key={a.id} style={{display:"flex",gap:10,padding:"12px 0",borderBottom:"1px solid #10102a"}}><div style={{width:4,borderRadius:2,background:"#0fa",flexShrink:0}}/><div><div style={{color:"#bbc",fontSize:14,whiteSpace:"pre-line",lineHeight:1.7}}>{a.content}</div><div style={{color:"#334",fontSize:12,marginTop:3}}>{a.time}</div></div></div>)}
            {alertLog.length===0&&<div style={{color:"#334",textAlign:"center",padding:50,fontSize:16}}>尚無警報</div>}
          </div>
        </div>}
      </div>
      <footer style={{textAlign:"center",padding:"14px 0",color:"#12122e",fontSize:12,borderTop:"1px solid #10102a"}}>SmartFlow Pro v9 · Binance WebSocket · Binance Futures API · 7-Dimension Signal Engine · 12 Coins</footer>
    </div>
  );
}
