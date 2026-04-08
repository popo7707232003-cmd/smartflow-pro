import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ═══════════════════════════════════════════════════════
// CORE INDICATORS
// ═══════════════════════════════════════════════════════
function ema(d,p){if(d.length<p)return[];const k=2/(p+1);const r=[];let v=d.slice(0,p).reduce((a,b)=>a+b,0)/p;r.push(v);for(let i=p;i<d.length;i++){v=d[i]*k+v*(1-k);r.push(v)}return r}
function sma(d,p){if(d.length<p)return[];const r=[];for(let i=p-1;i<d.length;i++)r.push(d.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p);return r}
function calcRsi(c,p=14){if(c.length<p+1)return[];const g=[],l=[];for(let i=1;i<c.length;i++){const x=c[i]-c[i-1];g.push(x>0?x:0);l.push(x<0?-x:0)}let ag=g.slice(0,p).reduce((a,b)=>a+b,0)/p,al=l.slice(0,p).reduce((a,b)=>a+b,0)/p;const r=[];for(let i=p;i<g.length;i++){ag=(ag*(p-1)+g[i])/p;al=(al*(p-1)+l[i])/p;r.push(al===0?100:100-100/(1+ag/al))}return r}
function calcMacd(c){const ef=ema(c,12),es=ema(c,26);if(!ef.length||!es.length)return{h:[]};const o=26-12,ln=[];for(let i=0;i<es.length;i++)ln.push(ef[i+o]-es[i]);const sg=ema(ln,9),so=ln.length-sg.length,h=[];for(let i=0;i<sg.length;i++)h.push(ln[i+so]-sg[i]);return{h:h.slice(-30)}}
function calcBB(c,p=20){if(c.length<p)return null;const s=c.slice(-p),m=s.reduce((a,b)=>a+b,0)/p,std=Math.sqrt(s.reduce((a,b)=>a+(b-m)**2,0)/p);return{u:m+2*std,m,l:m-2*std}}
function calcATR(closes,p=14){if(closes.length<p+1)return null;const trs=[];for(let i=1;i<closes.length;i++)trs.push(Math.abs(closes[i]-closes[i-1]));if(trs.length<p)return null;let atr=trs.slice(0,p).reduce((a,b)=>a+b,0)/p;for(let i=p;i<trs.length;i++)atr=(atr*(p-1)+trs[i])/p;return atr}
function detectDivergence(c,rv){if(c.length<8||rv.length<8)return"none";const p1=c.slice(-8,-4),p2=c.slice(-4),r1=rv.slice(-8,-4),r2=rv.slice(-4);if(Math.min(...p2)<Math.min(...p1)&&Math.min(...r2)>Math.min(...r1))return"bullish";if(Math.max(...p2)>Math.max(...p1)&&Math.max(...r2)<Math.max(...r1))return"bearish";return"none"}

// ═══════════════════════════════════════════════════════
// MARKET STRUCTURE ANALYSIS (SMC/ICT)
// ═══════════════════════════════════════════════════════
function analyzeStructure(closes){
  if(closes.length<30)return{trend:"未知",swings:[],bos:false,choch:false,hhhl:0,lhll:0};
  // Find swing highs and lows (simplified pivot detection)
  const swings=[];const lookback=5;
  for(let i=lookback;i<closes.length-lookback;i++){
    const left=closes.slice(i-lookback,i),right=closes.slice(i+1,i+lookback+1);
    if(closes[i]>Math.max(...left)&&closes[i]>Math.max(...right))swings.push({type:"high",price:closes[i],idx:i});
    if(closes[i]<Math.min(...left)&&closes[i]<Math.min(...right))swings.push({type:"low",price:closes[i],idx:i});
  }
  const highs=swings.filter(s=>s.type==="high").slice(-4);
  const lows=swings.filter(s=>s.type==="low").slice(-4);
  let hhhl=0,lhll=0,bos=false,choch=false;
  // Count HH/HL vs LH/LL
  if(highs.length>=2){
    for(let i=1;i<highs.length;i++){if(highs[i].price>highs[i-1].price)hhhl++;else lhll++}}
  if(lows.length>=2){
    for(let i=1;i<lows.length;i++){if(lows[i].price>lows[i-1].price)hhhl++;else lhll++}}
  const trend=hhhl>lhll?"多頭 (HH+HL)":lhll>hhhl?"空頭 (LH+LL)":"震盪";
  // BOS: current price breaks above last swing high (bullish) or below last swing low (bearish)
  const cur=closes[closes.length-1];
  if(highs.length>0&&cur>highs[highs.length-1].price)bos=true;
  if(lows.length>0&&cur<lows[lows.length-1].price)bos=true;
  // ChoCH: trend reversal signal
  if(hhhl>0&&lhll>0){const recent=swings.slice(-3);if(recent.length>=3)choch=true}
  const lastSwingHigh=highs.length>0?highs[highs.length-1].price:null;
  const lastSwingLow=lows.length>0?lows[lows.length-1].price:null;
  return{trend,swings:swings.slice(-6),bos,choch,hhhl,lhll,lastSwingHigh,lastSwingLow};
}

// SUPPLY/DEMAND ZONE + ORDER BLOCK DETECTION
function detectZones(closes){
  if(closes.length<20)return{supplyZone:null,demandZone:null,fvg:null,liqSweep:false};
  const cur=closes[closes.length-1];
  // Find recent sharp moves to identify OB zones
  let supplyZone=null,demandZone=null,fvg=null,liqSweep=false;
  for(let i=closes.length-2;i>=Math.max(0,closes.length-20);i--){
    const move=(closes[i+1]-closes[i])/closes[i]*100;
    // Demand zone: sharp move UP, the base candle before is the OB
    if(move>0.3&&!demandZone){demandZone={high:closes[i],low:closes[i]*(1-0.002),dist:((cur-closes[i])/closes[i]*100).toFixed(2)}}
    // Supply zone: sharp move DOWN
    if(move<-0.3&&!supplyZone){supplyZone={high:closes[i]*(1+0.002),low:closes[i],dist:((closes[i]-cur)/cur*100).toFixed(2)}}
  }
  // FVG detection: gap between candle i-1 high and candle i+1 low
  for(let i=closes.length-15;i<closes.length-1;i++){
    if(i<1)continue;
    const gap=closes[i+1]-closes[i-1];
    if(Math.abs(gap)/cur*100>0.2){fvg={price:(closes[i-1]+closes[i+1])/2,filled:Math.abs(cur-((closes[i-1]+closes[i+1])/2))/cur*100<0.1,type:gap>0?"bullish":"bearish"}}
  }
  // Liquidity sweep: price briefly went below recent low then bounced back
  if(closes.length>10){
    const recentLow=Math.min(...closes.slice(-10,-3));
    const swept=closes.slice(-3).some(p=>p<recentLow);
    const recovered=cur>recentLow;
    if(swept&&recovered)liqSweep=true;
  }
  return{supplyZone,demandZone,fvg,liqSweep};
}

// ═══════════════════════════════════════════════════════
// COMPREHENSIVE CONDITION CHECKER (the monitoring panel data)
// ═══════════════════════════════════════════════════════
function checkAllConditions(closes,vols,fundingRate,fearGreed,lsRatio){
  if(!closes||closes.length<20)return null;
  const cur=closes[closes.length-1];
  const e20=ema(closes,20),e50=ema(closes,50),e200=ema(closes,Math.min(200,closes.length));
  const ce20=e20.length?e20[e20.length-1]:cur,ce50=e50.length?e50[e50.length-1]:cur,ce200=e200.length?e200[e200.length-1]:cur;
  const rv=calcRsi(closes,14),curRsi=rv.length?rv[rv.length-1]:50;
  const mc=calcMacd(closes),curH=mc.h.length?mc.h[mc.h.length-1]:0;
  const bb=calcBB(closes,Math.min(20,closes.length));
  const atr=calcATR(closes,14);
  const div=detectDivergence(closes,rv);
  const structure=analyzeStructure(closes);
  const zones=detectZones(closes);
  const vwap=closes.length>0?closes.reduce((a,b)=>a+b,0)/closes.length:cur; // simplified VWAP

  // EMA Alignment
  const emaBull=ce20>ce50&&ce50>ce200;
  const emaBear=ce20<ce50&&ce50<ce200;
  const emaAlign=emaBull?"多頭排列 ✅":emaBear?"空頭排列 ✅":"未排列 ⚠️";
  const emaDir=emaBull?"long":emaBear?"short":"neutral";

  // VWAP position
  const aboveVwap=cur>vwap;

  // Volume check
  const volOk=vols&&vols.length>20?vols[vols.length-1]>vols.slice(-21,-1).reduce((a,b)=>a+b,0)/20*1.2:false;

  // Condition checklist
  const conditions={
    // Market Structure
    trend:{label:"市場結構",value:structure.trend,pass:structure.trend.includes("多頭")||structure.trend.includes("空頭"),detail:structure.bos?"BOS確認 ✅":structure.choch?"ChoCH反轉 ⚠️":"等待結構"},
    bos:{label:"BOS/ChoCH",value:structure.bos?"BOS突破":structure.choch?"ChoCH反轉":"未確認",pass:structure.bos||structure.choch},
    // Entry Zone
    demandZone:{label:"需求區(OB)",value:zones.demandZone?`距離 ${zones.demandZone.dist}%`:"未偵測到",pass:zones.demandZone&&parseFloat(zones.demandZone.dist)<0.5},
    supplyZone:{label:"供給區(OB)",value:zones.supplyZone?`距離 ${zones.supplyZone.dist}%`:"未偵測到",pass:zones.supplyZone&&parseFloat(zones.supplyZone.dist)<0.5},
    fvg:{label:"FVG跳空缺口",value:zones.fvg?`${zones.fvg.type} ${zones.fvg.filled?"已回補":"待回補"}`:"無",pass:zones.fvg&&!zones.fvg.filled},
    liqSweep:{label:"流動性掃除",value:zones.liqSweep?"已掃除 ✅":"未發生",pass:zones.liqSweep},
    // Indicators
    emaAlignment:{label:"EMA 20/50/200",value:emaAlign,pass:emaBull||emaBear},
    vwap:{label:"VWAP位置",value:aboveVwap?"價格在VWAP上方 (偏多)":"價格在VWAP下方 (偏空)",pass:true},
    rsi:{label:`RSI(14): ${curRsi.toFixed(1)}`,value:curRsi<30?"超賣 🟢":curRsi>70?"超買 🔴":curRsi<45?"偏弱":"偏強",pass:curRsi<35||curRsi>65},
    rsiDiv:{label:"RSI背離",value:div==="bullish"?"看多背離 🟢":div==="bearish"?"看空背離 🔴":"無背離",pass:div!=="none"},
    macd:{label:"MACD柱狀",value:curH>0?"正向 (多頭動能)":"負向 (空頭動能)",pass:true},
    volume:{label:"成交量",value:volOk?"放量 ✅ (有效突破)":"縮量 ⚠️ (可能假突破)",pass:volOk},
    bb:{label:"布林位置",value:bb?`${((cur-bb.l)/(bb.u-bb.l)*100).toFixed(0)}%`:"—",pass:bb&&((cur-bb.l)/(bb.u-bb.l)<0.2||(cur-bb.l)/(bb.u-bb.l)>0.8)},
    // Derivatives
    funding:{label:"資金費率",value:fundingRate!=null?`${fundingRate}%`:"無數據",pass:fundingRate!=null&&(fundingRate>0.02||fundingRate<-0.01),detail:fundingRate>0.03?"多頭擁擠(反向做空)⚠️":fundingRate<-0.02?"空頭擁擠(反向做多)🟢":"正常"},
    fearGreedIdx:{label:"恐懼貪婪",value:fearGreed!=null?`${fearGreed}`:"無數據",pass:fearGreed!=null&&(fearGreed<25||fearGreed>75),detail:fearGreed<20?"極度恐懼(抄底)🟢":fearGreed>80?"極度貪婪(謹慎)🔴":"中性"},
    longShort:{label:"多空比",value:lsRatio!=null?`${lsRatio}`:"無數據",pass:lsRatio!=null&&(lsRatio>1.8||lsRatio<0.7)},
  };

  // Determine overall direction
  let longScore=0,shortScore=0;
  if(structure.trend.includes("多頭"))longScore+=3;else if(structure.trend.includes("空頭"))shortScore+=3;
  if(emaBull)longScore+=2;else if(emaBear)shortScore+=2;
  if(aboveVwap)longScore+=1;else shortScore+=1;
  if(curRsi<35)longScore+=2;else if(curRsi>65)shortScore+=2;
  if(curH>0)longScore+=1;else shortScore+=1;
  if(div==="bullish")longScore+=2;else if(div==="bearish")shortScore+=2;
  if(zones.liqSweep)longScore+=2;
  if(zones.demandZone&&parseFloat(zones.demandZone.dist)<0.5)longScore+=1;
  if(zones.supplyZone&&parseFloat(zones.supplyZone.dist)<0.5)shortScore+=1;
  if(fundingRate!=null){if(fundingRate>0.03)shortScore+=1;if(fundingRate<-0.02)longScore+=1}
  if(fearGreed!=null){if(fearGreed<25)longScore+=1;if(fearGreed>75)shortScore+=1}

  const passCount=Object.values(conditions).filter(c=>c.pass).length;
  const totalCount=Object.keys(conditions).length;
  const direction=longScore>shortScore+2?"做多":shortScore>longScore+2?"做空":"觀望";

  // Generate signal if conditions strong enough
  let signal=null;
  if((longScore>=8||shortScore>=8)&&passCount>=6){
    const dir=longScore>shortScore?"做多":"做空";
    const conf=Math.min(95,Math.max(55,Math.round(40+Math.max(longScore,shortScore)*4)));
    const atrVal=atr||cur*0.015;
    const tp=dir==="做多"?+(cur+atrVal*2.5).toFixed(cur<1?6:2):+(cur-atrVal*2.5).toFixed(cur<1?6:2);
    const sl=dir==="做多"?+(cur-atrVal*1.5).toFixed(cur<1?6:2):+(cur+atrVal*1.5).toFixed(cur<1?6:2);
    const tp2=dir==="做多"?+(cur+atrVal*4).toFixed(cur<1?6:2):+(cur-atrVal*4).toFixed(cur<1?6:2);
    const rr=Math.abs(sl-cur)>0?+(Math.abs(tp-cur)/Math.abs(sl-cur)).toFixed(2):0;
    if(rr>=1.5){
      signal={direction:dir,entry:+cur.toFixed(cur<1?6:2),tp,tp2,sl,rr,confidence:conf,
        atr:+atrVal.toFixed(cur<1?6:4),longScore,shortScore,passCount,totalCount,
        reasons:[]};
      if(structure.trend.includes(dir==="做多"?"多頭":"空頭"))signal.reasons.push("市場結構順勢");
      if(structure.bos)signal.reasons.push("BOS突破確認");
      if(zones.liqSweep)signal.reasons.push("流動性掃除完成");
      if(div!==""&&div!=="none")signal.reasons.push(`${div}背離`);
      if(emaBull&&dir==="做多")signal.reasons.push("EMA多頭排列");
      if(emaBear&&dir==="做空")signal.reasons.push("EMA空頭排列");
      if(volOk)signal.reasons.push("放量確認");
    }
  }

  return{conditions,direction,longScore,shortScore,passCount,totalCount,signal,
    indicators:{rsi:+curRsi.toFixed(1),macdH:+(curH).toFixed(cur<1?8:2),ema20:+ce20.toFixed(cur<1?6:2),ema50:+ce50.toFixed(cur<1?6:2),ema200:+ce200.toFixed(cur<1?6:2),atr:atr?+atr.toFixed(cur<1?6:4):null,bbPos:bb?+((cur-bb.l)/(bb.u-bb.l)*100).toFixed(0):null,vwap:+vwap.toFixed(cur<1?6:2),div}};
}

// TRACKER
class Tracker{constructor(){this.trades=[];this.open=[];this.s={w:0,l:0,pnl:0}}add(sig){if(sig)this.open.push({...sig,ot:Date.now()})}update(cp){const cl=[];this.open.forEach((t,i)=>{const sym=t.symbol?.split("/")[0];const p=cp[sym];if(!p)return;let r=null;if(t.direction==="做多"){if(p>=t.tp)r="tp1";else if(p>=t.tp2)r="tp2";else if(p<=t.sl)r="sl"}else{if(p<=t.tp)r="tp1";else if(p<=t.tp2)r="tp2";else if(p>=t.sl)r="sl"}if(!r&&Date.now()-t.ot>20*60000)r="timeout";if(r){const ep=r==="tp1"?t.tp:r==="tp2"?t.tp2:r==="sl"?t.sl:p;const pnl=t.direction==="做多"?((ep-t.entry)/t.entry*100):((t.entry-ep)/t.entry*100);cl.push({i,t:{...t,exitPrice:ep,pnl:+pnl.toFixed(3),result:r}})}});const ci=new Set();cl.forEach(({i,t})=>{ci.add(i);this.trades.push(t);if(t.pnl>0)this.s.w++;else this.s.l++;this.s.pnl+=t.pnl});this.open=this.open.filter((_,i)=>!ci.has(i))}wr(){const t=this.s.w+this.s.l;return t===0?0:+(this.s.w/t*100).toFixed(1)}pf(){const gw=this.trades.filter(t=>t.pnl>0).reduce((a,t)=>a+t.pnl,0);const gl=Math.abs(this.trades.filter(t=>t.pnl<=0).reduce((a,t)=>a+t.pnl,0));return gl===0?(gw>0?99:0):+(gw/gl).toFixed(2)}summary(){return{total:this.trades.length,openN:this.open.length,wr:this.wr(),pf:this.pf(),...this.s}}recent(n=20){return this.trades.slice(-n).reverse()}}

// ═══ CONFIG ═══
const COINS=[
  {s:"BTC",pair:"btcusdt"},{s:"ETH",pair:"ethusdt"},{s:"SOL",pair:"solusdt"},
  {s:"BNB",pair:"bnbusdt"},{s:"XRP",pair:"xrpusdt"},{s:"DOGE",pair:"dogeusdt"},
  {s:"ADA",pair:"adausdt"},{s:"AVAX",pair:"avaxusdt"},{s:"LINK",pair:"linkusdt"},
  {s:"DOT",pair:"dotusdt"},{s:"NEAR",pair:"nearusdt"},{s:"SUI",pair:"suiusdt"},
];
const ts=()=>new Date().toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
const fp=p=>{if(!p&&p!==0)return"—";return p<0.01?`$${p.toFixed(6)}`:p<1?`$${p.toFixed(4)}`:p<10?`$${p.toFixed(3)}`:p<100?`$${p.toFixed(2)}`:`$${p.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`};

// ═══ UI COMPONENTS ═══
function Spark({data,color,w=140,h=36}){if(!data||data.length<2)return<div style={{width:w,height:h,background:"#0b0b20",borderRadius:4}}/>;const mn=Math.min(...data),mx=Math.max(...data),r=mx-mn||1;const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-2-((v-mn)/r)*(h-4)}`).join(" ");return<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/></svg>}
function Spin({s=16,c="#0fa"}){return<div style={{width:s,height:s,border:`2px solid #1a1a38`,borderTopColor:c,borderRadius:"50%",animation:"spin .6s linear infinite",display:"inline-block",verticalAlign:"middle"}}/>}
function Check({pass,label,value,detail}){return<div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 0",borderBottom:"1px solid #10102a"}}>
  <span style={{fontSize:18,flexShrink:0,marginTop:1}}>{pass?"✅":"⬜"}</span>
  <div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:14,color:"#ccd",fontWeight:500}}>{label}</span><span style={{fontSize:14,color:pass?"#0fa":"#889",fontWeight:600}}>{value}</span></div>
    {detail&&<div style={{fontSize:12,color:"#556",marginTop:2}}>{detail}</div>}</div></div>}
function Popup({alert:a,onClose}){if(!a)return null;return<div style={{position:"fixed",top:16,right:16,zIndex:9999,background:"#0d0d22f0",border:"2px solid #0fa40",borderRadius:14,padding:"16px 20px",maxWidth:440,boxShadow:"0 8px 40px #0005",animation:"slideIn .3s",backdropFilter:"blur(12px)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{color:"#0fa",fontWeight:700,fontSize:16}}>🎯 進場訊號</span><button onClick={onClose} style={{background:"none",border:"none",color:"#445",cursor:"pointer",fontSize:18}}>✕</button></div><div style={{color:"#bbc",fontSize:14,lineHeight:1.7,whiteSpace:"pre-line"}}>{a.content}</div></div>}

// ═══════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════
export default function App(){
  const[prices,setPrices]=useState({});const[hist,setHist]=useState(()=>{const h={};COINS.forEach(c=>h[c.s]=[]);return h});
  const[vols,setVols]=useState(()=>{const v={};COINS.forEach(c=>v[c.s]=[]);return v});
  const[fg,setFg]=useState(null);const[fr,setFr]=useState({});const[lsr,setLsr]=useState({});
  const[wsOk,setWsOk]=useState(false);const[signals,setSignals]=useState([]);const[alertLog,setAlertLog]=useState([]);
  const[popup,setPopup]=useState(null);const[live,setLive]=useState(true);const[tab,setTab]=useState("monitor");
  const[sound,setSound]=useState(true);const[ts2,setTs2]=useState({});const[rt,setRt]=useState([]);
  const[monitorData,setMonitorData]=useState({});const[selectedCoin,setSelectedCoin]=useState("BTC");
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

  // BINANCE WS
  useEffect(()=>{if(!live){if(wsRef.current){wsRef.current.close();setWsOk(false)}return}const streams=COINS.map(c=>`${c.pair}@ticker`).join("/");let ws;try{ws=new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);wsRef.current=ws;ws.onopen=()=>setWsOk(true);ws.onclose=()=>setWsOk(false);ws.onerror=()=>setWsOk(false);ws.onmessage=evt=>{try{const d=JSON.parse(evt.data);if(!d.s)return;const coin=COINS.find(c=>c.pair===d.s.toLowerCase());if(!coin)return;setPrices(p=>({...p,[coin.s]:{price:parseFloat(d.c),chg:parseFloat(d.P),high:parseFloat(d.h),low:parseFloat(d.l),vol:parseFloat(d.v),qvol:parseFloat(d.q)}}));setHist(h=>({...h,[coin.s]:[...(h[coin.s]||[]).slice(-399),parseFloat(d.c)]}));setVols(v=>({...v,[coin.s]:[...(v[coin.s]||[]).slice(-399),parseFloat(d.q)]}))}catch{}}}catch{setWsOk(false)}return()=>{if(ws)ws.close()}},[live]);

  // FUNDING RATES
  useEffect(()=>{if(!live)return;let a=true;const f=async()=>{try{for(const c of COINS){const r=await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${c.s}USDT`);if(!r.ok||!a)continue;const d=await r.json();if(d.lastFundingRate)setFr(p=>({...p,[c.s]:+(parseFloat(d.lastFundingRate)*100).toFixed(4)}))}}catch{}};f();const t=setInterval(f,60000);return()=>{a=false;clearInterval(t)}},[live]);

  // LONG/SHORT
  useEffect(()=>{if(!live)return;let a=true;const f=async()=>{try{for(const sym of["BTC","ETH","SOL"]){const r=await fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${sym}USDT&period=5m&limit=1`);if(!r.ok||!a)continue;const d=await r.json();if(d[0])setLsr(p=>({...p,[sym]:+parseFloat(d[0].longShortRatio).toFixed(2)}))}}catch{}};f();const t=setInterval(f,60000);return()=>{a=false;clearInterval(t)}},[live]);

  // FEAR & GREED
  useEffect(()=>{if(!live)return;let a=true;const f=async()=>{try{const r=await fetch("https://api.alternative.me/fng/?limit=1");if(!r.ok||!a)return;const d=await r.json();if(d.data?.[0])setFg(parseInt(d.data[0].value))}catch{}};f();const t=setInterval(f,300000);return()=>{a=false;clearInterval(t)}},[live]);

  // MONITOR + SIGNAL ENGINE (every 5s)
  useEffect(()=>{if(!live)return;const t=setInterval(()=>{
    const md={};
    COINS.forEach(coin=>{
      const closes=hR.current[coin.s]||[];const volArr=vR.current[coin.s]||[];
      const result=checkAllConditions(closes,volArr,frR.current[coin.s],fgR.current,lsrR.current[coin.s]);
      if(result)md[coin.s]=result;
      if(result?.signal){
        const sig=result.signal;
        const entry={...sig,symbol:`${coin.s}/USDT`,time:ts(),id:Date.now()+Math.random(),_ts:Date.now(),ind:result.indicators};
        setSignals(l=>{if(l.find(s2=>s2.symbol===entry.symbol&&(Date.now()-(s2._ts||0))<120000))return l;return[entry,...l].slice(0,80)});
        tk.current.add(entry);
        const al={type:"entry",content:`${entry.symbol} ${entry.direction} | 信心 ${entry.confidence}%\n入場 $${entry.entry}\n止盈1 $${entry.tp} (平倉50%+移動止損至成本)\n止盈2 $${entry.tp2} (平倉剩餘)\n止損 $${entry.sl} (ATR×1.5)\nR:R ${entry.rr} | 條件 ${entry.passCount}/${entry.totalCount}\n📋 ${entry.reasons.join(" · ")}`,time:ts(),id:Date.now()+Math.random()};
        setAlertLog(l=>[al,...l].slice(0,300));flash(al);beep();
      }
    });
    setMonitorData(md);
    const cp={};Object.entries(pR.current).forEach(([k,v2])=>{cp[k]=v2.price});
    tk.current.update(cp);setTs2(tk.current.summary());setRt(tk.current.recent(20));
  },5000);return()=>clearInterval(t)},[live,beep,flash]);

  const hasData=Object.keys(prices).length>0;
  const md=monitorData[selectedCoin];
  const tabs=[{id:"monitor",lb:"🔍 監控區"},{id:"overview",lb:"📈 行情"},{id:"signals",lb:"🎯 訊號"},{id:"perf",lb:"📊 績效"},{id:"alerts",lb:"🔔 警報"}];

  return(
    <div style={{fontFamily:"-apple-system,'Segoe UI',sans-serif",background:"#060616",color:"#9098a8",minHeight:"100vh",fontSize:14}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');@keyframes slideIn{from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}*{box-sizing:border-box;margin:0;padding:0}body{background:#060616}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#1e1e40;border-radius:2px}`}</style>
      <Popup alert={popup} onClose={()=>setPopup(null)}/>

      {/* HEADER */}
      <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 24px",borderBottom:"1px solid #12122e",background:"linear-gradient(180deg,#0b0b22,#060616)",flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:8,background:"linear-gradient(135deg,#0fa,#08f)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,color:"#000"}}>⚡</div>
          <div>
            <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,fontSize:22,color:"#f0f2f8"}}>SmartFlow Pro</div>
            <div style={{fontSize:13,display:"flex",gap:12,flexWrap:"wrap"}}>
              <span style={{color:wsOk?"#0fa":"#f45"}}>● {wsOk?"Binance Live":"連線中"}</span>
              {fg!=null&&<span style={{color:fg<25?"#f45":fg>70?"#0fa":"#fc6"}}>F&G {fg}</span>}
              {fr.BTC!=null&&<span style={{color:fr.BTC>0.01?"#f45":"#889"}}>BTC FR {fr.BTC}%</span>}
              {lsr.BTC&&<span style={{color:lsr.BTC>1.5?"#f45":"#889"}}>多空 {lsr.BTC}</span>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {ts2.total>0&&<div style={{background:"#0b0b22",border:"1px solid #18183a",borderRadius:8,padding:"6px 14px",fontSize:14}}>
            <span style={{color:(ts2.wr||0)>=50?"#0fa":"#f45",fontWeight:700}}>勝率 {ts2.wr}%</span>
            <span style={{color:"#334",margin:"0 8px"}}>|</span><span style={{color:(ts2.pf||0)>=2?"#0fa":"#889"}}>PF {ts2.pf}</span>
            <span style={{color:"#334",margin:"0 8px"}}>|</span><span style={{color:"#889"}}>{ts2.total}筆</span>
          </div>}
          <button onClick={()=>setLive(!live)} style={{background:live?"#0b0b22":"#0fa10",border:`1px solid ${live?"#18183a":"#0fa30"}`,color:live?"#889":"#0fa",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:14,fontWeight:600}}>
            <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:live?"#0fa":"#f45",marginRight:8,animation:live?"pulse 1.5s infinite":"none"}}/>{live?"LIVE":"OFF"}
          </button>
          <button onClick={()=>setSound(!sound)} style={{background:"#0b0b22",border:"1px solid #18183a",color:sound?"#0fa":"#334",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:16}}>{sound?"🔔":"🔕"}</button>
        </div>
      </header>

      <nav style={{display:"flex",borderBottom:"1px solid #12122e",background:"#08081c",padding:"0 20px",overflowX:"auto"}}>
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",borderBottom:tab===t.id?"3px solid #0fa":"3px solid transparent",color:tab===t.id?"#0fa":"#445",padding:"12px 18px",cursor:"pointer",fontSize:15,fontWeight:tab===t.id?700:400,whiteSpace:"nowrap"}}>{t.lb}
          {t.id==="signals"&&signals.length>0&&<span style={{marginLeft:6,background:"#0fa18",color:"#0fa",padding:"2px 8px",borderRadius:5,fontSize:12,fontWeight:700}}>{signals.length}</span>}
        </button>)}
      </nav>

      <div style={{padding:"16px 20px"}}>

        {/* ═══ MONITOR ═══ */}
        {tab==="monitor"&&<div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          {/* Coin selector */}
          <div style={{width:200,flexShrink:0}}>
            <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,color:"#f0f2f8",fontSize:16,marginBottom:10}}>選擇幣種</div>
            {COINS.map(c=>{const p=prices[c.s]||{};const m=monitorData[c.s];const dir=m?.direction;
              return<button key={c.s} onClick={()=>setSelectedCoin(c.s)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",padding:"10px 12px",marginBottom:6,borderRadius:8,border:selectedCoin===c.s?"2px solid #0fa":"1px solid #14143a",background:selectedCoin===c.s?"#0b0b22":"#0a0a1e",cursor:"pointer",textAlign:"left"}}>
                <div><div style={{fontSize:16,fontWeight:700,color:"#f0f2f8"}}>{c.s}</div><div style={{fontSize:12,color:"#556"}}>{fp(p.price)}</div></div>
                {dir&&<span style={{fontSize:11,fontWeight:600,color:dir==="做多"?"#0fa":dir==="做空"?"#f45":"#556",background:dir==="做多"?"#0fa12":dir==="做空"?"#f4512":"transparent",padding:"2px 6px",borderRadius:4}}>{dir}</span>}
              </button>})}
          </div>

          {/* Condition panel */}
          <div style={{flex:1,minWidth:300}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,color:"#f0f2f8",fontSize:20}}>{selectedCoin}/USDT 進場條件監控</div>
              {md&&<div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:14,color:"#889"}}>通過 {md.passCount}/{md.totalCount}</span>
                <span style={{fontSize:16,fontWeight:700,color:md.direction==="做多"?"#0fa":md.direction==="做空"?"#f45":"#889",background:md.direction==="做多"?"#0fa12":md.direction==="做空"?"#f4512":"#0a0a1e",padding:"4px 14px",borderRadius:6}}>{md.direction} (多{md.longScore} / 空{md.shortScore})</span>
              </div>}
            </div>

            {!md?<div style={{color:"#334",textAlign:"center",padding:40}}>累積數據中... 約 30 秒</div>:
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              {/* Section 1: Market Structure */}
              <div style={{background:"#0b0b22",border:"1px solid #14143a",borderRadius:10,padding:16}}>
                <div style={{fontSize:15,fontWeight:700,color:"#f0f2f8",marginBottom:10,borderBottom:"1px solid #14143a",paddingBottom:8}}>📊 一、市場結構</div>
                <Check {...md.conditions.trend} detail={md.conditions.trend.detail}/>
                <Check {...md.conditions.bos}/>
              </div>

              {/* Section 2: Entry Zone */}
              <div style={{background:"#0b0b22",border:"1px solid #14143a",borderRadius:10,padding:16}}>
                <div style={{fontSize:15,fontWeight:700,color:"#f0f2f8",marginBottom:10,borderBottom:"1px solid #14143a",paddingBottom:8}}>🎯 二、進場區域</div>
                <Check {...md.conditions.demandZone}/>
                <Check {...md.conditions.supplyZone}/>
                <Check {...md.conditions.fvg}/>
                <Check {...md.conditions.liqSweep}/>
              </div>

              {/* Section 3: Indicators */}
              <div style={{background:"#0b0b22",border:"1px solid #14143a",borderRadius:10,padding:16}}>
                <div style={{fontSize:15,fontWeight:700,color:"#f0f2f8",marginBottom:10,borderBottom:"1px solid #14143a",paddingBottom:8}}>📈 三、技術指標</div>
                <Check {...md.conditions.emaAlignment}/>
                <Check {...md.conditions.vwap}/>
                <Check {...md.conditions.rsi}/>
                <Check {...md.conditions.rsiDiv}/>
                <Check {...md.conditions.macd}/>
                <Check {...md.conditions.volume}/>
                <Check {...md.conditions.bb} label={`布林帶位置: ${md.conditions.bb.value}%`}/>
                {md.indicators.atr&&<div style={{padding:"8px 0",fontSize:13,color:"#667"}}>ATR(14): {md.indicators.atr} · 建議止損: ATR×1.5 = {(md.indicators.atr*1.5).toFixed(prices[selectedCoin]?.price<1?6:2)}</div>}
              </div>

              {/* Section 4: Derivatives */}
              <div style={{background:"#0b0b22",border:"1px solid #14143a",borderRadius:10,padding:16}}>
                <div style={{fontSize:15,fontWeight:700,color:"#f0f2f8",marginBottom:10,borderBottom:"1px solid #14143a",paddingBottom:8}}>💹 四、衍生品 & 情緒</div>
                <Check {...md.conditions.funding} detail={md.conditions.funding.detail}/>
                <Check {...md.conditions.fearGreedIdx} detail={md.conditions.fearGreedIdx.detail}/>
                <Check {...md.conditions.longShort}/>
              </div>

              {/* Signal card if exists */}
              {md.signal&&<div style={{gridColumn:"span 2",background:md.signal.direction==="做多"?"#0fa08":"#f4508",border:`2px solid ${md.signal.direction==="做多"?"#0fa30":"#f4530"}`,borderRadius:12,padding:20}}>
                <div style={{fontSize:20,fontWeight:700,color:"#f0f2f8",marginBottom:12,fontFamily:"'Space Grotesk'"}}>
                  🎯 {selectedCoin}/USDT {md.signal.direction} 訊號 — 信心 {md.signal.confidence}%
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:14}}>
                  <div style={{background:"#0a0a1e",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:11,color:"#556"}}>入場</div><div style={{fontSize:20,fontWeight:700,color:"#f0f2f8"}}>{fp(md.signal.entry)}</div></div>
                  <div style={{background:"#0a0a1e",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:11,color:"#556"}}>止盈1 (50%平倉)</div><div style={{fontSize:20,fontWeight:700,color:"#0fa"}}>{fp(md.signal.tp)}</div></div>
                  <div style={{background:"#0a0a1e",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:11,color:"#556"}}>止盈2 (全平)</div><div style={{fontSize:20,fontWeight:700,color:"#0fa"}}>{fp(md.signal.tp2)}</div></div>
                  <div style={{background:"#0a0a1e",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:11,color:"#556"}}>止損 (ATR×1.5)</div><div style={{fontSize:20,fontWeight:700,color:"#f45"}}>{fp(md.signal.sl)}</div></div>
                </div>
                <div style={{fontSize:14,color:"#bbc",lineHeight:1.8}}>
                  <div>📋 進場理由：{md.signal.reasons.join(" · ")}</div>
                  <div>📐 R:R {md.signal.rr} · 條件通過 {md.signal.passCount}/{md.signal.totalCount}</div>
                  <div>⚖️ 風控：單筆風險 ≤ 帳戶 1-2% · 止盈1平倉50%後移止損至成本</div>
                </div>
              </div>}
            </div>}
          </div>
        </div>}

        {/* ═══ OVERVIEW ═══ */}
        {tab==="overview"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))",gap:12}}>
          {!hasData&&<div style={{gridColumn:"span 4",textAlign:"center",padding:60}}><Spin s={32}/><div style={{color:"#667",fontSize:18,marginTop:16}}>連線 Binance 中...</div></div>}
          {COINS.map(c=>{const p=prices[c.s]||{};if(!p.price)return null;const h=hist[c.s]||[],up=(p.chg||0)>=0;
            const rv=calcRsi(h,14),curRsi=rv.length?rv[rv.length-1]:null;
            const mc2=calcMacd(h),curMH=mc2.h.length?mc2.h[mc2.h.length-1]:null;
            const bb=calcBB(h,Math.min(20,h.length)),bbP=bb&&h.length?((h[h.length-1]-bb.l)/(bb.u-bb.l)*100):null;
            const e5v=ema(h,5),e20v=ema(h,20);
            const trend=e5v.length&&e20v.length?(e5v[e5v.length-1]>e20v[e20v.length-1]?"▲ 上升":"▼ 下降"):null;
            const m=monitorData[c.s];
            return<div key={c.s} onClick={()=>{setSelectedCoin(c.s);setTab("monitor")}} style={{background:"#0b0b22",border:"1px solid #14143a",borderRadius:12,padding:16,cursor:"pointer",animation:"fadeUp .3s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontWeight:700,color:"#f0f2f8",fontSize:20,fontFamily:"'Space Grotesk'"}}>{c.s}</span>
                <span style={{fontSize:14,fontWeight:700,color:up?"#0fa":"#f45"}}>{up?"+":""}{(p.chg||0).toFixed(2)}%</span>
              </div>
              <div style={{fontSize:28,fontWeight:700,color:"#f8f9ff",marginBottom:6,fontFamily:"'Space Grotesk'"}}>{fp(p.price)}</div>
              <Spark data={h.slice(-80)} color={up?"#0fa":"#f45"}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:10}}>
                {curRsi!=null&&<div style={{background:"#0a0a1e",borderRadius:6,padding:"6px",textAlign:"center"}}><div style={{fontSize:10,color:"#556"}}>RSI</div><div style={{fontSize:17,fontWeight:700,color:curRsi<30?"#0fa":curRsi>70?"#f45":"#bbc"}}>{curRsi.toFixed(0)}</div></div>}
                {curMH!=null&&<div style={{background:"#0a0a1e",borderRadius:6,padding:"6px",textAlign:"center"}}><div style={{fontSize:10,color:"#556"}}>MACD</div><div style={{fontSize:17,fontWeight:700,color:curMH>0?"#0fa":"#f45"}}>{curMH>0?"+":""}{curMH.toFixed(1)}</div></div>}
                {bbP!=null&&<div style={{background:"#0a0a1e",borderRadius:6,padding:"6px",textAlign:"center"}}><div style={{fontSize:10,color:"#556"}}>BB</div><div style={{fontSize:17,fontWeight:700,color:bbP<20?"#0fa":bbP>80?"#f45":"#bbc"}}>{bbP.toFixed(0)}%</div></div>}
              </div>
              <div style={{display:"flex",gap:6,marginTop:8,fontSize:12,flexWrap:"wrap"}}>
                {trend&&<span style={{color:trend.includes("上升")?"#0fa":"#f45",background:"#0a0a1e",padding:"3px 8px",borderRadius:5}}>{trend}</span>}
                {m?.direction&&m.direction!=="觀望"&&<span style={{color:m.direction==="做多"?"#0fa":"#f45",background:m.direction==="做多"?"#0fa10":"#f4510",padding:"3px 8px",borderRadius:5,fontWeight:600}}>建議{m.direction}</span>}
                {fr[c.s]!=null&&<span style={{color:"#667",background:"#0a0a1e",padding:"3px 8px",borderRadius:5}}>FR {fr[c.s]}%</span>}
              </div>
            </div>})}
        </div>}

        {/* ═══ SIGNALS ═══ */}
        {tab==="signals"&&<div style={{background:"#0b0b22",border:"1px solid #14143a",borderRadius:12,padding:20}}>
          <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,color:"#f0f2f8",fontSize:22,marginBottom:4}}>🎯 進場訊號（SMC/ICT 框架）</div>
          <div style={{fontSize:14,color:"#556",marginBottom:16}}>市場結構 → 供需區/OB → 流動性掃除 → 指標驗證 → ATR止損 → 分批止盈</div>
          <div style={{maxHeight:550,overflowY:"auto",display:"flex",flexDirection:"column",gap:10}}>
            {signals.map(s=><div key={s.id} style={{padding:18,borderRadius:10,background:"#0a0a1e",border:`2px solid ${s.direction==="做多"?"#0fa25":"#f4525"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:20,fontWeight:700,color:"#f0f2f8",fontFamily:"'Space Grotesk'"}}>{s.symbol}</span>
                  <span style={{background:s.direction==="做多"?"#0fa":"#f45",color:"#000",fontWeight:700,fontSize:14,padding:"4px 14px",borderRadius:6}}>{s.direction}</span>
                  <span style={{fontSize:13,color:"#667"}}>{s.passCount}/{s.totalCount}條件 · 多{s.longScore}/空{s.shortScore}</span>
                </div>
                <div style={{background:`conic-gradient(${s.confidence>=70?"#0fa":"#fc6"} ${s.confidence*3.6}deg, #18183a 0deg)`,width:42,height:42,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:32,height:32,borderRadius:"50%",background:"#0a0a1e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#f0f2f8"}}>{s.confidence}</div></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:12}}>
                {[["入場",s.entry,"#f0f2f8"],["止盈1 (50%)",s.tp,"#0fa"],["止盈2 (全平)",s.tp2,"#0fa"],["止損 (ATR×1.5)",s.sl,"#f45"]].map(([l,v2,c])=><div key={l} style={{background:"#08081a",borderRadius:6,padding:"8px 10px"}}><div style={{fontSize:10,color:"#445"}}>{l}</div><div style={{fontSize:17,fontWeight:700,color:c}}>{fp(v2)}</div></div>)}
              </div>
              <div style={{fontSize:14,color:"#889",lineHeight:1.6}}>
                R:R {s.rr} · RSI {s.ind?.rsi} · MACD {s.ind?.macdH>0?"+":""}{s.ind?.macdH}{s.ind?.div!=="none"?` · ${s.ind.div}背離`:""}
                {s.reasons?.length>0&&<div style={{marginTop:4,color:"#0fa"}}>📋 {s.reasons.join(" · ")}</div>}
                <span style={{float:"right",color:"#334"}}>{s.time}</span>
              </div>
            </div>)}
            {signals.length===0&&<div style={{color:"#334",textAlign:"center",padding:50,fontSize:16}}>等待符合 SMC/ICT 框架條件的高品質訊號...</div>}
          </div>
        </div>}

        {/* ═══ PERFORMANCE ═══ */}
        {tab==="perf"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))",gap:10}}>
            {[["勝率",`${ts2.wr||0}%`,(ts2.wr||0)>=50?"#0fa":"#f45"],["總交易",`${ts2.total||0}`,"#f0f2f8"],["勝/負",`${ts2.w||0}/${ts2.l||0}`,"#bbc"],["盈虧因子",`${ts2.pf||0}`,(ts2.pf||0)>=2?"#0fa":"#fc6"],["總PnL",`${(ts2.pnl||0).toFixed(2)}%`,(ts2.pnl||0)>=0?"#0fa":"#f45"],["持倉中",`${ts2.openN||0}`,"#08f"]].map(([l,v2,c])=>
              <div key={l} style={{background:"#0b0b22",border:"1px solid #14143a",borderRadius:10,padding:14}}><div style={{fontSize:13,color:"#556",marginBottom:4}}>{l}</div><div style={{fontSize:26,fontWeight:700,color:c,fontFamily:"'Space Grotesk'"}}>{v2}</div></div>)}
          </div>
          <div style={{background:"#0b0b22",border:"1px solid #14143a",borderRadius:12,padding:18}}>
            <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,color:"#f0f2f8",marginBottom:12,fontSize:18}}>📋 交易紀錄</div>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
              <thead><tr style={{borderBottom:"2px solid #14143a"}}>{["幣種","方向","入場","出場","PnL","R:R","結果","信心"].map(h=><th key={h} style={{textAlign:"left",padding:"10px 8px",color:"#556",fontSize:13}}>{h}</th>)}</tr></thead>
              <tbody>{rt.map((t2,i)=><tr key={i} style={{borderBottom:"1px solid #10102a"}}>
                <td style={{padding:"10px 8px",color:"#f0f2f8",fontSize:14,fontWeight:600}}>{t2.symbol}</td>
                <td style={{padding:"10px 8px",color:t2.direction==="做多"?"#0fa":"#f45",fontSize:14,fontWeight:600}}>{t2.direction}</td>
                <td style={{padding:"10px 8px",color:"#889"}}>{fp(t2.entry)}</td>
                <td style={{padding:"10px 8px",color:"#889"}}>{fp(t2.exitPrice)}</td>
                <td style={{padding:"10px 8px",color:t2.pnl>=0?"#0fa":"#f45",fontSize:15,fontWeight:700}}>{t2.pnl>=0?"+":""}{t2.pnl}%</td>
                <td style={{padding:"10px 8px",color:"#fc6"}}>{t2.rr}</td>
                <td style={{padding:"10px 8px"}}><span style={{padding:"4px 10px",borderRadius:5,fontSize:13,fontWeight:600,background:t2.result?.includes("tp")?"#0fa15":"#f4515",color:t2.result?.includes("tp")?"#0fa":"#f45"}}>{t2.result?.includes("tp")?"✓ 止盈":t2.result==="sl"?"✗ 止損":"⏱ 超時"}</span></td>
                <td style={{padding:"10px 8px",color:"#667"}}>{t2.confidence}%</td>
              </tr>)}</tbody></table>
              {rt.length===0&&<div style={{color:"#334",textAlign:"center",padding:40}}>尚無交易紀錄</div>}
            </div>
          </div>
        </div>}

        {/* ═══ ALERTS ═══ */}
        {tab==="alerts"&&<div style={{background:"#0b0b22",border:"1px solid #14143a",borderRadius:12,padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,color:"#f0f2f8",fontSize:22}}>🔔 警報紀錄</div>
            <button onClick={()=>setAlertLog([])} style={{background:"#0a0a1e",border:"1px solid #18183a",color:"#556",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:13}}>清除</button>
          </div>
          <div style={{maxHeight:550,overflowY:"auto"}}>{alertLog.map(a=><div key={a.id} style={{display:"flex",gap:10,padding:"12px 0",borderBottom:"1px solid #10102a"}}><div style={{width:4,borderRadius:2,background:"#0fa",flexShrink:0}}/><div><div style={{color:"#bbc",fontSize:14,whiteSpace:"pre-line",lineHeight:1.7}}>{a.content}</div><div style={{color:"#334",fontSize:12,marginTop:3}}>{a.time}</div></div></div>)}
            {alertLog.length===0&&<div style={{color:"#334",textAlign:"center",padding:50}}>尚無警報</div>}
          </div>
        </div>}
      </div>
      <footer style={{textAlign:"center",padding:"14px",color:"#12122e",fontSize:12,borderTop:"1px solid #10102a"}}>SmartFlow Pro v10 · ICT/SMC Framework · Binance WebSocket · 12 Coins · 分批止盈 · ATR風控</footer>
    </div>
  );
}
