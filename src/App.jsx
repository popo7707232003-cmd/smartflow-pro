import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ═══ INDICATORS ═══
function ema(d,p){if(d.length<p)return[];const k=2/(p+1);const r=[];let v=d.slice(0,p).reduce((a,b)=>a+b,0)/p;r.push(v);for(let i=p;i<d.length;i++){v=d[i]*k+v*(1-k);r.push(v)}return r}
function sma(d,p){if(d.length<p)return[];const r=[];for(let i=p-1;i<d.length;i++)r.push(d.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p);return r}
function calcRsi(c,p=14){if(c.length<p+1)return[];const g=[],l=[];for(let i=1;i<c.length;i++){const d=c[i]-c[i-1];g.push(d>0?d:0);l.push(d<0?-d:0)}let ag=g.slice(0,p).reduce((a,b)=>a+b,0)/p,al=l.slice(0,p).reduce((a,b)=>a+b,0)/p;const r=[];for(let i=p;i<g.length;i++){ag=(ag*(p-1)+g[i])/p;al=(al*(p-1)+l[i])/p;r.push(al===0?100:100-100/(1+ag/al))}return r}
function calcMacd(c){const ef=ema(c,12),es=ema(c,26);if(!ef.length||!es.length)return{h:[]};const o=26-12,ln=[];for(let i=0;i<es.length;i++)ln.push(ef[i+o]-es[i]);const sg=ema(ln,9),so=ln.length-sg.length,h=[];for(let i=0;i<sg.length;i++)h.push(ln[i+so]-sg[i]);return{h:h.slice(-20)}}
function calcBB(c,p=20){if(c.length<p)return null;const s=c.slice(-p),m=s.reduce((a,b)=>a+b,0)/p,std=Math.sqrt(s.reduce((a,b)=>a+(b-m)**2,0)/p);return{u:m+2*std,m,l:m-2*std}}
function calcStochRsi(c,p=14){const r=calcRsi(c,p);if(r.length<p)return null;const s=r.slice(-p),mn=Math.min(...s),mx=Math.max(...s);return mx===mn?50:((r[r.length-1]-mn)/(mx-mn))*100}

// ═══ 10-DIM SIGNAL ENGINE ═══
function computeSignal({closes,fearGreed,fundingRate,smartMoneyBias,newsSentiment,liquidationBias,longShortRatio,stablecoinChg,exchangeReserveChg}){
  if(!closes||closes.length<30)return null;
  const cur=closes[closes.length-1];
  const rv=calcRsi(closes,14),curRsi=rv.length?rv[rv.length-1]:50;
  const mc=calcMacd(closes),curH=mc.h.length?mc.h[mc.h.length-1]:0,prevH=mc.h.length>1?mc.h[mc.h.length-2]:0;
  const e5=ema(closes,5),e20=ema(closes,20),s50=sma(closes,Math.min(50,closes.length));
  const ce5=e5.length?e5[e5.length-1]:cur,ce20=e20.length?e20[e20.length-1]:cur,cs50=s50.length?s50[s50.length-1]:cur;
  const bb=calcBB(closes,Math.min(20,closes.length));
  const stRsi=calcStochRsi(closes,14);
  const atr=closes.slice(-14).reduce((mx,_,i,a)=>i===0?0:Math.max(mx,Math.abs(a[i]-a[i-1])),0)*1.5||cur*0.015;
  let sc={};
  let t=0;if(ce5>ce20)t+=30;else t-=30;if(cur>cs50)t+=20;else t-=20;t+=Math.max(-50,Math.min(50,((ce5-ce20)/ce20)*2000));sc.trend=Math.max(-100,Math.min(100,t));
  let m=0;if(curRsi<20)m+=45;else if(curRsi<30)m+=25;else if(curRsi>80)m-=45;else if(curRsi>70)m-=25;if(curH>0&&curH>prevH)m+=25;else if(curH<0&&curH<prevH)m-=25;if(stRsi!==null){if(stRsi<15)m+=20;else if(stRsi>85)m-=20}sc.momentum=Math.max(-100,Math.min(100,m));
  let v=0;if(bb){const pos=(cur-bb.l)/(bb.u-bb.l);if(pos<0.12)v+=45;else if(pos<0.25)v+=20;else if(pos>0.88)v-=45;else if(pos>0.75)v-=20}sc.volume=Math.max(-100,Math.min(100,v));
  sc.smartMoney=Math.max(-100,Math.min(100,(smartMoneyBias||0)*85));
  let d=0;if(fundingRate!=null){if(fundingRate>0.08)d-=50;else if(fundingRate>0.03)d-=25;else if(fundingRate<-0.05)d+=50;else if(fundingRate<-0.02)d+=25}sc.derivatives=Math.max(-100,Math.min(100,d));
  let fg=0;if(fearGreed!=null){if(fearGreed<10)fg+=60;else if(fearGreed<25)fg+=30;else if(fearGreed>85)fg-=60;else if(fearGreed>75)fg-=30}sc.fearGreed=fg;
  sc.news=Math.max(-100,Math.min(100,(newsSentiment||0)*60));
  let lq=0;if(liquidationBias!=null){if(liquidationBias>0.3)lq+=35;else if(liquidationBias<-0.3)lq-=35}sc.liquidation=Math.max(-100,Math.min(100,lq));
  let ls=0;if(longShortRatio!=null){if(longShortRatio>2.5)ls-=40;else if(longShortRatio>1.8)ls-=20;else if(longShortRatio<0.5)ls+=40;else if(longShortRatio<0.7)ls+=20}sc.longShort=Math.max(-100,Math.min(100,ls));
  let mc2=0;if(stablecoinChg!=null&&stablecoinChg>2)mc2+=20;if(stablecoinChg!=null&&stablecoinChg<-2)mc2-=20;if(exchangeReserveChg!=null&&exchangeReserveChg<-1)mc2+=20;if(exchangeReserveChg!=null&&exchangeReserveChg>1)mc2-=20;sc.macro=Math.max(-100,Math.min(100,mc2));
  const W={trend:.18,momentum:.18,volume:.10,smartMoney:.15,derivatives:.08,fearGreed:.07,news:.05,liquidation:.08,longShort:.06,macro:.05};
  let fs=0;Object.keys(W).forEach(k=>fs+=(sc[k]||0)*W[k]);
  const agreeL=Object.values(sc).filter(s=>s>8).length,agreeS=Object.values(sc).filter(s=>s<-8).length;
  let dir=null;if(fs>=22&&agreeL>=4)dir="做多";else if(fs<=-22&&agreeS>=4)dir="做空";if(!dir)return null;
  const conf=Math.min(95,Math.max(50,Math.round(48+Math.abs(fs)*0.55)));
  const am=conf>78?2.8:conf>65?2.2:1.8,sm2=conf>78?1.1:conf>65?1.3:1.5;
  let tp2,sl2;
  if(dir==="做多"){tp2=+(cur+atr*am).toFixed(cur<1?6:2);sl2=+(cur-atr*sm2).toFixed(cur<1?6:2)}else{tp2=+(cur-atr*am).toFixed(cur<1?6:2);sl2=+(cur+atr*sm2).toFixed(cur<1?6:2)}
  const rr=Math.abs(sl2-cur)>0?+(Math.abs(tp2-cur)/Math.abs(sl2-cur)).toFixed(2):0;if(rr<1.3)return null;
  return{direction:dir,entry:+cur.toFixed(cur<1?6:2),tp:tp2,sl:sl2,rr,confidence:conf,finalScore:+fs.toFixed(1),scores:sc,ind:{rsi:+curRsi.toFixed(1),macdH:+(curH).toFixed(cur<1?8:4),bbPos:bb?+((cur-bb.l)/(bb.u-bb.l)*100).toFixed(0):null,stRsi:stRsi?+stRsi.toFixed(0):null},dimCount:dir==="做多"?agreeL:agreeS};
}

// ═══ TRACKER ═══
class Tracker{constructor(){this.trades=[];this.open=[];this.s={w:0,l:0,pnl:0}}
add(sig){if(sig)this.open.push({...sig,ot:Date.now()})}
update(cp){const cl=[];this.open.forEach((t,i)=>{const sym=t.symbol?.split("/")[0];const p=cp[sym];if(!p)return;let r=null;if(t.direction==="做多"){if(p>=t.tp)r="tp";else if(p<=t.sl)r="sl"}else{if(p<=t.tp)r="tp";else if(p>=t.sl)r="sl"}if(!r&&Date.now()-t.ot>30*60000)r="timeout";if(r){const ep=r==="tp"?t.tp:r==="sl"?t.sl:p;const pnl=t.direction==="做多"?((ep-t.entry)/t.entry*100):((t.entry-ep)/t.entry*100);cl.push({i,t:{...t,exitPrice:ep,pnl:+pnl.toFixed(3),result:r}})}});const ci=new Set();cl.forEach(({i,t})=>{ci.add(i);this.trades.push(t);if(t.pnl>0)this.s.w++;else this.s.l++;this.s.pnl+=t.pnl});this.open=this.open.filter((_,i)=>!ci.has(i))}
wr(){const t=this.s.w+this.s.l;return t===0?0:+(this.s.w/t*100).toFixed(1)}
pf(){const gw=this.trades.filter(t=>t.pnl>0).reduce((a,t)=>a+t.pnl,0);const gl=Math.abs(this.trades.filter(t=>t.pnl<=0).reduce((a,t)=>a+t.pnl,0));return gl===0?(gw>0?99:0):+(gw/gl).toFixed(2)}
summary(){return{total:this.trades.length,openN:this.open.length,wr:this.wr(),pf:this.pf(),...this.s}}
recent(n=15){return this.trades.slice(-n).reverse()}}

// ═══ CONFIG ═══
const COINS=[
  {symbol:"BTC",pair:"btcusdt",cgId:"bitcoin"},
  {symbol:"ETH",pair:"ethusdt",cgId:"ethereum"},
  {symbol:"SOL",pair:"solusdt",cgId:"solana"},
  {symbol:"BNB",pair:"bnbusdt",cgId:"binancecoin"},
  {symbol:"XRP",pair:"xrpusdt",cgId:"ripple"},
  {symbol:"DOGE",pair:"dogeusdt",cgId:"dogecoin"},
];
const ts=()=>new Date().toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
const loadK=k=>{try{return localStorage.getItem(k)||""}catch{return""}};
const saveK=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};

// ═══ AI HELPER (needs key) ═══
async function aiQ(key,prompt){
  if(!key)return null;
  try{const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1500,tools:[{type:"web_search_20250305",name:"web_search"}],messages:[{role:"user",content:prompt}]})});if(!r.ok)return null;const d=await r.json();return d.content?.map(b=>b.type==="text"?b.text:"").join("").trim()||null}catch{return null}}
function pJ(t){if(!t)return null;const c=t.replace(/```json|```/g,"").trim();const m=c.match(/[\[{][\s\S]*[\]}]/);if(m){try{return JSON.parse(m[0])}catch{}}return null}

// ═══ UI COMPONENTS ═══
function Spark({data,color,w=110,h=26}){if(!data||data.length<2)return<div style={{width:w,height:h,background:"#080812",borderRadius:3}}/>;const mn=Math.min(...data),mx=Math.max(...data),r=mx-mn||1;const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-2-((v-mn)/r)*(h-4)}`).join(" ");return<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/></svg>}
function Spin({s=12,c="#0ff"}){return<div style={{width:s,height:s,border:`2px solid #151525`,borderTopColor:c,borderRadius:"50%",animation:"spin .6s linear infinite",display:"inline-block",verticalAlign:"middle"}}/>}
function DimBar({v,label}){const col=v>12?"#0fa":v<-12?"#f45":"#fc6";return<div style={{marginBottom:3}}><div style={{display:"flex",justifyContent:"space-between",fontSize:8}}><span style={{color:"#445"}}>{label}</span><span style={{color:col,fontWeight:600}}>{v>0?"+":""}{v}</span></div><div style={{height:3,borderRadius:2,background:"#0c0c18",position:"relative",overflow:"hidden"}}><div style={{position:"absolute",left:v>=0?"50%":"auto",right:v<0?"50%":"auto",width:`${Math.min(Math.abs(v)/100*50,50)}%`,height:"100%",background:col,borderRadius:2,transition:"all .4s"}}/></div></div>}
function Popup({alert:a,onClose}){if(!a)return null;const cl={news:"#fc6",entry:"#0fa",smartmoney:"#0bd"};return<div style={{position:"fixed",top:12,right:12,zIndex:9999,background:"#0a0a16f0",border:`1px solid ${cl[a.type]||"#333"}40`,borderRadius:10,padding:"11px 15px",maxWidth:370,boxShadow:`0 8px 32px ${cl[a.type]||"#000"}22`,animation:"slideIn .3s",backdropFilter:"blur(12px)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}><span style={{color:cl[a.type],fontWeight:700,fontSize:11.5}}>{a.type==="entry"?"🎯 訊號":a.type==="smartmoney"?"💰 聰明錢":"📰 消息"}</span><button onClick={onClose} style={{background:"none",border:"none",color:"#334",cursor:"pointer",fontSize:14}}>✕</button></div><div style={{color:"#99a",fontSize:11,lineHeight:1.6,whiteSpace:"pre-line"}}>{a.content}</div></div>}

// ═══════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════
export default function App(){
  const[prices,setPrices]=useState({});
  const[hist,setHist]=useState(()=>{const h={};COINS.forEach(c=>h[c.symbol]=[]);return h});
  const[fg,setFg]=useState(null);
  const[fr,setFr]=useState({});
  const[mktExtra,setMktExtra]=useState({});
  const[newsLog,setNewsLog]=useState([]);
  const[smLog,setSmLog]=useState([]);
  const[signals,setSignals]=useState([]);
  const[alertLog,setAlertLog]=useState([]);
  const[popup,setPopup]=useState(null);
  const[live,setLive]=useState(true);
  const[tab,setTab]=useState("overview");
  const[sound,setSound]=useState(true);
  const[wsOk,setWsOk]=useState(false);
  const[cgOk,setCgOk]=useState(false);
  const[showSettings,setShowSettings]=useState(false);
  const[apiKey,setApiKey]=useState(()=>loadK("sf_key"));
  const[aiOk,setAiOk]=useState(false);
  const[smLoad,setSmLoad]=useState(false);
  const[newsLoad,setNewsLoad]=useState(false);
  const[ts2,setTs2]=useState({});
  const[rt,setRt]=useState([]);

  const wsRef=useRef(null);const popT=useRef(null);
  const hR=useRef(hist);useEffect(()=>{hR.current=hist},[hist]);
  const smR=useRef(smLog);useEffect(()=>{smR.current=smLog},[smLog]);
  const fgR=useRef(fg);useEffect(()=>{fgR.current=fg},[fg]);
  const frR=useRef(fr);useEffect(()=>{frR.current=fr},[fr]);
  const meR=useRef(mktExtra);useEffect(()=>{meR.current=mktExtra},[mktExtra]);
  const pR=useRef(prices);useEffect(()=>{pR.current=prices},[prices]);
  const tk=useRef(new Tracker());
  useEffect(()=>{saveK("sf_key",apiKey)},[apiKey]);

  const beep=useCallback(()=>{if(!sound)return;try{const a=new(window.AudioContext||window.webkitAudioContext)(),o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=932;o.type="sine";g.gain.setValueAtTime(.06,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.12);o.start();o.stop(a.currentTime+.12)}catch{}},[sound]);
  const flash=useCallback(a=>{setPopup(a);if(popT.current)clearTimeout(popT.current);popT.current=setTimeout(()=>setPopup(null),4500)},[]);

  // ═══════════════════════════════════════
  // 1) BINANCE WEBSOCKET — 即時價格（免費）
  // ═══════════════════════════════════════
  useEffect(()=>{
    if(!live){if(wsRef.current){wsRef.current.close();wsRef.current=null;setWsOk(false)}return}
    const streams=COINS.map(c=>`${c.pair}@ticker`).join("/");
    let ws;
    try{
      ws=new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);
      wsRef.current=ws;
      ws.onopen=()=>setWsOk(true);
      ws.onclose=()=>setWsOk(false);
      ws.onerror=()=>setWsOk(false);
      ws.onmessage=(evt)=>{try{
        const d=JSON.parse(evt.data);if(!d.s)return;
        const coin=COINS.find(c=>c.pair===d.s.toLowerCase());if(!coin)return;
        const price=parseFloat(d.c),chg=parseFloat(d.P),high=parseFloat(d.h),low=parseFloat(d.l),vol=parseFloat(d.v);
        setPrices(p=>({...p,[coin.symbol]:{price,chg,high,low,vol}}));
        setHist(h=>({...h,[coin.symbol]:[...(h[coin.symbol]||[]).slice(-199),price]}));
      }catch{}}
    }catch{setWsOk(false)}
    return()=>{if(ws)ws.close()};
  },[live]);

  // ═══════════════════════════════════════
  // 2) COINGECKO — 市場數據備援（免費）
  // ═══════════════════════════════════════
  useEffect(()=>{
    if(!live)return;let act=true;
    const f=async()=>{try{
      const ids=COINS.map(c=>c.cgId).join(",");
      const r=await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc`);
      if(!r.ok||!act)return;const d=await r.json();
      d.forEach(item=>{const coin=COINS.find(c=>c.cgId===item.id);if(!coin)return;
        // Only use CG if no WS data
        setPrices(p=>{if(!p[coin.symbol]?.price)return{...p,[coin.symbol]:{price:item.current_price,chg:item.price_change_percentage_24h,high:item.high_24h,low:item.low_24h,vol:item.total_volume}};return p});
        setHist(h=>{if((h[coin.symbol]||[]).length===0)return{...h,[coin.symbol]:[item.current_price]};return h});
      });setCgOk(true);
    }catch{if(act)setCgOk(false)}};
    f();const t=setInterval(f,60000);return()=>{act=false;clearInterval(t)};
  },[live]);

  // ═══════════════════════════════════════
  // 3) FEAR & GREED — Alternative.me（免費）
  // ═══════════════════════════════════════
  useEffect(()=>{
    if(!live)return;let act=true;
    const f=async()=>{try{
      const r=await fetch("https://api.alternative.me/fng/?limit=1");
      if(!r.ok||!act)return;const d=await r.json();
      if(d.data&&d.data[0])setFg(parseInt(d.data[0].value));
    }catch{}};
    f();const t=setInterval(f,300000);return()=>{act=false;clearInterval(t)};
  },[live]);

  // ═══════════════════════════════════════
  // 4) AI: SMART MONEY + MARKET EXTRAS（需要 Key）
  // ═══════════════════════════════════════
  useEffect(()=>{
    if(!live||!apiKey)return;let act=true;
    const f=async()=>{
      setSmLoad(true);
      const txt=await aiQ(apiKey,`Search for: 1) Latest crypto whale movements, smart money flows, exchange inflows/outflows, institutional activity (8 items). 2) BTC perpetual funding rate. 3) BTC long/short ratio. 4) 24h liquidation data (long vs short %). 5) Stablecoin supply 7d change %. 6) BTC exchange reserve 7d change %. Return JSON: {"smart_money":[{"text":"繁體中文","type":"whale_buy|whale_sell|exchange_inflow|exchange_outflow|accumulation|distribution","coin":"BTC","amount":"$50M","signal":"bullish|bearish","importance":"high|medium|low"}],"funding":{"BTC":0.01,"ETH":0.005},"long_short_ratio":1.5,"liq_long_pct":65,"stablecoin_7d_chg":1.2,"exchange_reserve_7d_chg":-0.5} All text in Traditional Chinese. JSON ONLY.`);
      if(!act)return;const d=pJ(txt);
      if(d){
        if(d.funding)setFr(d.funding);
        setMktExtra(prev=>({...prev,lsRatio:d.long_short_ratio,liqLongPct:d.liq_long_pct,stableChg:d.stablecoin_7d_chg,exResChg:d.exchange_reserve_7d_chg}));
        if(d.smart_money&&Array.isArray(d.smart_money)){
          const items=d.smart_money.map((r,i)=>({id:Date.now()+i,text:r.text,type:r.type,coin:r.coin,amount:r.amount,signal:r.signal,importance:r.importance,time:ts()}));
          setSmLog(prev=>{const fresh=items.filter(n=>!prev.some(p=>p.text===n.text));fresh.forEach(sm=>{if(sm.importance==="high"){const al={type:"smartmoney",content:`💰 ${sm.text}\n${sm.coin} ${sm.amount} — ${sm.signal==="bullish"?"🟢看多":"🔴看空"}`,time:ts(),id:Date.now()+Math.random()};setAlertLog(l=>[al,...l].slice(0,200));flash(al);beep()}});return[...fresh,...prev].slice(0,100)});
        }
        setAiOk(true);
      }
      setSmLoad(false);
    };
    f();const t=setInterval(f,90000);return()=>{act=false;clearInterval(t)};
  },[live,apiKey,beep,flash]);

  // ═══════════════════════════════════════
  // 5) AI: NEWS（需要 Key）
  // ═══════════════════════════════════════
  useEffect(()=>{
    if(!live||!apiKey)return;let act=true;
    const f=async()=>{
      setNewsLoad(true);
      const txt=await aiQ(apiKey,`Search latest important crypto news past 24h affecting BTC ETH SOL BNB XRP DOGE. Return ONLY JSON array of 8 items: [{"text":"繁體中文標題","impact":"bullish|bearish","severity":"high|medium|low","coins":["BTC"]}] Traditional Chinese. JSON array ONLY.`);
      if(!act)return;const d=pJ(txt);
      if(d&&Array.isArray(d)){
        const items=d.map((r,i)=>({id:Date.now()+i+500,text:r.text,impact:r.impact,severity:r.severity,coins:r.coins,time:ts()}));
        setNewsLog(prev=>{const fresh=items.filter(n=>!prev.some(p=>p.text===n.text));if(fresh.length&&fresh[0].severity==="high"){const al={type:"news",content:`${fresh[0].impact==="bullish"?"🟢":"🔴"} ${fresh[0].text}`,time:ts(),id:Date.now()};setAlertLog(l=>[al,...l].slice(0,200));flash(al);beep()}return[...fresh,...prev].slice(0,100)});
      }
      setNewsLoad(false);
    };
    setTimeout(f,5000);const t=setInterval(f,120000);return()=>{act=false;clearInterval(t)};
  },[live,apiKey,beep,flash]);

  // ═══ SIGNAL ENGINE ═══
  useEffect(()=>{
    if(!live)return;
    const t=setInterval(()=>{
      COINS.forEach(coin=>{
        const closes=hR.current[coin.symbol]||[];if(closes.length<30)return;
        const smI=smR.current.filter(s=>s.coin===coin.symbol);const smB=smI.filter(s=>s.signal==="bullish").length,smBr=smI.filter(s=>s.signal==="bearish").length;
        const smBias=(smB+smBr)>0?(smB-smBr)/(smB+smBr):0;
        const allB=smR.current.filter(s=>s.signal==="bullish").length,allBr=smR.current.filter(s=>s.signal==="bearish").length;
        const nSent=(allB+allBr)>0?(allB-allBr)/(allB+allBr):0;
        const me=meR.current;
        const liqBias=me.liqLongPct!=null?(me.liqLongPct>60?-((me.liqLongPct-50)/50):((50-me.liqLongPct)/50)):null;
        const sig=computeSignal({closes,fearGreed:fgR.current,fundingRate:frR.current[coin.symbol],smartMoneyBias:smBias,newsSentiment:nSent,liquidationBias:liqBias,longShortRatio:me.lsRatio,stablecoinChg:me.stableChg,exchangeReserveChg:me.exResChg});
        if(sig){
          const entry={...sig,symbol:`${coin.symbol}/USDT`,time:ts(),id:Date.now()+Math.random(),_ts:Date.now()};
          setSignals(l=>{if(l.find(s=>s.symbol===entry.symbol&&(Date.now()-(s._ts||0))<120000))return l;return[entry,...l].slice(0,60)});
          tk.current.add(entry);
          const al={type:"entry",content:`🎯 ${entry.symbol} ${entry.direction} | 信心${entry.confidence}%\n$${entry.entry} → TP $${entry.tp} / SL $${entry.sl}\nR:R ${entry.rr} | ${entry.dimCount}/10維`,time:ts(),id:Date.now()+Math.random()};
          setAlertLog(l=>[al,...l].slice(0,200));flash(al);beep();
        }
      });
      const cp={};Object.entries(pR.current).forEach(([k,v])=>{cp[k]=v.price});
      tk.current.update(cp);setTs2(tk.current.summary());setRt(tk.current.recent(15));
    },8000);
    return()=>clearInterval(t);
  },[live,beep,flash]);

  // ═══ HELPERS ═══
  const fp=p=>{if(!p&&p!==0)return"—";return p<1?`$${p.toFixed(5)}`:p<100?`$${p.toFixed(2)}`:`$${p.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`};
  const fn=n=>{if(!n)return"—";if(n>=1e9)return`$${(n/1e9).toFixed(1)}B`;if(n>=1e6)return`$${(n/1e6).toFixed(0)}M`;return n};
  const smSum=useMemo(()=>{const b=smLog.filter(s=>s.signal==="bullish").length,br=smLog.filter(s=>s.signal==="bearish").length,t=b+br;if(t===0)return{pct:50,lb:"—",c:"#556"};const pct=Math.round((b/t)*100);return{pct,lb:pct>=60?"偏多":pct<=40?"偏空":"中性",c:pct>=60?"#0fa":pct<=40?"#f45":"#fc6"}},[smLog]);
  const tl={whale_buy:"🐋買入",whale_sell:"🐋賣出",exchange_inflow:"📥流入",exchange_outflow:"📤流出",accumulation:"📦吸籌",distribution:"📤出貨"};
  const tc2={whale_buy:"#0fa",whale_sell:"#f45",exchange_inflow:"#f45",exchange_outflow:"#0fa",accumulation:"#0fa",distribution:"#f45"};
  const tabs=[{id:"overview",lb:"總覽",ic:"◉"},{id:"smartmoney",lb:"聰明錢",ic:"💰"},{id:"signals",lb:"訊號",ic:"🎯"},{id:"perf",lb:"績效",ic:"📊"},{id:"news",lb:"消息",ic:"📰"},{id:"alerts",lb:"警報",ic:"🔔"}];
  const me=mktExtra;
  const dataOk=wsOk||cgOk;

  return(
    <div style={{fontFamily:"'DM Mono','JetBrains Mono',monospace",background:"#05050d",color:"#8890a0",minHeight:"100vh",fontSize:11}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Instrument+Sans:wght@400;600;700&display=swap');@keyframes slideIn{from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}*{box-sizing:border-box;margin:0;padding:0}body{background:#05050d}::-webkit-scrollbar{width:2px}::-webkit-scrollbar-thumb{background:#1a1a30;border-radius:1px}input:focus{outline:1px solid #0fa3}`}</style>
      <Popup alert={popup} onClose={()=>setPopup(null)}/>

      <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 14px",borderBottom:"1px solid #0c0c1a",background:"#08080f",flexWrap:"wrap",gap:5}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:26,height:26,borderRadius:5,background:"linear-gradient(135deg,#0fa,#08f)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#000"}}>⚡</div>
          <div>
            <div style={{fontFamily:"'Instrument Sans'",fontWeight:700,fontSize:14,color:"#e8eaf0"}}>SmartFlow Pro</div>
            <div style={{fontSize:7.5,letterSpacing:1.5,display:"flex",gap:8}}>
              <span style={{color:wsOk?"#0fa":cgOk?"#fc6":"#f45"}}>● {wsOk?"Binance Live":cgOk?"CoinGecko":"連線中..."}</span>
              {fg!=null&&<span style={{color:fg<25?"#f45":fg>70?"#0fa":"#fc6"}}>F&G {fg}</span>}
              {apiKey&&<span style={{color:aiOk?"#0bd":"#334"}}>● AI{aiOk?" ✓":""}</span>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
          {ts2.total>0&&<div style={{background:"#080812",border:"1px solid #12122a",borderRadius:4,padding:"2px 6px",fontSize:8}}><span style={{color:(ts2.wr||0)>=50?"#0fa":"#f45"}}>{ts2.wr}%</span><span style={{color:"#223"}}> · </span><span style={{color:"#556"}}>{ts2.total}筆</span></div>}
          {smLog.length>0&&<div style={{display:"flex",alignItems:"center",gap:3,background:"#080812",border:"1px solid #12122a",borderRadius:4,padding:"2px 6px"}}><span style={{fontSize:7.5,color:"#445"}}>SM</span><div style={{width:24,height:3,borderRadius:2,background:"#12122a",overflow:"hidden"}}><div style={{width:`${smSum.pct}%`,height:"100%",background:smSum.c}}/></div><span style={{fontSize:7.5,color:smSum.c}}>{smSum.lb}</span></div>}
          <button onClick={()=>setLive(!live)} style={{background:live?"#080812":"#0fa08",border:`1px solid ${live?"#12122a":"#0fa20"}`,color:live?"#556":"#0fa",borderRadius:4,padding:"2px 7px",cursor:"pointer",fontSize:9,fontFamily:"inherit"}}><span style={{display:"inline-block",width:5,height:5,borderRadius:"50%",background:live?"#0fa":"#f45",marginRight:3,animation:live?"pulse 1.5s infinite":"none"}}/>{live?"LIVE":"OFF"}</button>
          <button onClick={()=>setSound(!sound)} style={{background:"#080812",border:"1px solid #12122a",color:sound?"#0fa":"#223",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:10}}>{sound?"🔔":"🔕"}</button>
          <button onClick={()=>setShowSettings(!showSettings)} style={{background:showSettings?"#0fa08":"#080812",border:`1px solid ${showSettings?"#0fa20":"#12122a"}`,color:showSettings?"#0fa":"#334",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:10}}>⚙</button>
        </div>
      </header>

      {showSettings&&<div style={{background:"#070710",borderBottom:"1px solid #0c0c1a",padding:"10px 14px",animation:"fadeUp .2s"}}>
        <div style={{maxWidth:450}}>
          <label style={{fontSize:8,color:"#445",display:"block",marginBottom:3}}>Anthropic API Key（啟用 AI 聰明錢 + 消息 + 資金費率 + 清算數據）</label>
          <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value.trim())} placeholder="sk-ant-... → console.anthropic.com 免費申請" style={{width:"100%",background:"#05050d",border:"1px solid #12122a",borderRadius:5,padding:"7px 9px",color:"#aab",fontSize:11,fontFamily:"inherit"}}/>
          <div style={{fontSize:7.5,color:"#223",marginTop:5}}>價格由 Binance WebSocket 免費即時取得 · F&G 由 Alternative.me 免費取得 · AI 功能需 Key · Key 只存你的瀏覽器</div>
        </div>
      </div>}

      {me.lsRatio&&<div style={{display:"flex",gap:0,borderBottom:"1px solid #0a0a18",background:"#070710",padding:"4px 14px",overflowX:"auto",fontSize:9}}>
        {me.lsRatio&&<div style={{padding:"0 10px",borderRight:"1px solid #0c0c1a",color:me.lsRatio>1.5?"#f45":me.lsRatio<0.7?"#0fa":"#556"}}>多空比 {me.lsRatio}</div>}
        {me.liqLongPct!=null&&<div style={{padding:"0 10px",borderRight:"1px solid #0c0c1a",color:me.liqLongPct>60?"#f45":"#0fa"}}>清算 多{me.liqLongPct}%/空{100-me.liqLongPct}%</div>}
        {me.stableChg!=null&&<div style={{padding:"0 10px",borderRight:"1px solid #0c0c1a",color:me.stableChg>0?"#0fa":"#f45"}}>穩定幣 {me.stableChg>0?"+":""}{me.stableChg}%</div>}
        {me.exResChg!=null&&<div style={{padding:"0 10px",color:me.exResChg<0?"#0fa":"#f45"}}>交易所存量 {me.exResChg>0?"+":""}{me.exResChg}%</div>}
      </div>}

      <nav style={{display:"flex",borderBottom:"1px solid #0a0a18",background:"#06060e",padding:"0 10px",overflowX:"auto"}}>
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",borderBottom:tab===t.id?"2px solid #0fa":"2px solid transparent",color:tab===t.id?"#0fa":"#2a2a40",padding:"8px 10px",cursor:"pointer",fontSize:10.5,fontFamily:"inherit",whiteSpace:"nowrap"}}>{t.ic} {t.lb}</button>)}
      </nav>

      <div style={{padding:"10px 12px"}}>
        {tab==="overview"&&<div style={{display:"flex",flexDirection:"column",gap:9}}>
          {!dataOk?<div style={{textAlign:"center",padding:36}}><Spin s={22}/><div style={{color:"#445",fontSize:12,marginTop:10,fontFamily:"'Instrument Sans'"}}>連線 Binance 中...</div></div>:
          <><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(170px, 1fr))",gap:7}}>
            {COINS.map(c=>{const p=prices[c.symbol]||{},h=hist[c.symbol]||[],up=(p.chg||0)>=0;
              const rv=calcRsi(h,14),curRsi=rv.length?rv[rv.length-1]:null;
              const bb=calcBB(h,Math.min(20,h.length)),bbP=bb&&h.length?((h[h.length-1]-bb.l)/(bb.u-bb.l)*100):null;
              return<div key={c.symbol} style={{background:"#080812",border:"1px solid #0f0f20",borderRadius:7,padding:10,animation:"fadeUp .3s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                  <span style={{fontWeight:600,color:"#e0e4ee",fontSize:13.5,fontFamily:"'Instrument Sans'"}}>{c.symbol}</span>
                  <span style={{fontSize:9,fontWeight:600,color:up?"#0fa":"#f45"}}>{up?"+":""}{(p.chg||0).toFixed(2)}%</span>
                </div>
                <div style={{fontSize:17,fontWeight:700,color:"#f0f2f8",marginBottom:3,fontFamily:"'Instrument Sans'"}}>{fp(p.price)}</div>
                <Spark data={h} color={up?"#0fa":"#f45"}/>
                <div style={{display:"flex",gap:5,marginTop:5,fontSize:7.5,flexWrap:"wrap"}}>
                  {curRsi!=null&&<span style={{color:curRsi<30?"#0fa":curRsi>70?"#f45":"#334",background:"#0a0a16",padding:"0 3px",borderRadius:2}}>RSI {curRsi.toFixed(0)}</span>}
                  {bbP!=null&&<span style={{color:bbP<20?"#0fa":bbP>80?"#f45":"#334",background:"#0a0a16",padding:"0 3px",borderRadius:2}}>BB {bbP.toFixed(0)}%</span>}
                  {fr[c.symbol]!=null&&<span style={{color:fr[c.symbol]>0.02?"#f45":"#334",background:"#0a0a16",padding:"0 3px",borderRadius:2}}>FR {fr[c.symbol]}%</span>}
                </div>
              </div>})}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
            <div style={{background:"#080812",border:"1px solid #0f0f20",borderRadius:7,padding:10}}>
              <div style={{fontFamily:"'Instrument Sans'",fontWeight:700,color:"#e0e4ee",marginBottom:7,fontSize:11.5}}>💰 聰明錢 {smLoad&&<Spin s={8} c="#0bd"/>}{!apiKey&&<span style={{fontSize:8,color:"#334",fontWeight:400}}> ⚙ 填Key啟用</span>}</div>
              <div style={{maxHeight:160,overflowY:"auto"}}>{smLog.slice(0,5).map(sm=><div key={sm.id} style={{padding:"4px 0",borderBottom:"1px solid #0a0a16",fontSize:10.5}}><div style={{color:"#99a",lineHeight:1.4}}>{sm.text}</div><div style={{fontSize:7.5,marginTop:1}}><span style={{color:tc2[sm.type]||"#445"}}>{tl[sm.type]||sm.type}</span>{sm.amount&&<span style={{color:"#fc6",marginLeft:4}}>{sm.amount}</span>}</div></div>)}
                {smLog.length===0&&<div style={{color:"#151525",textAlign:"center",padding:14,fontSize:9}}>{apiKey?(smLoad?"搜尋中...":"等待數據"):"填入 API Key 後啟用"}</div>}
              </div>
            </div>
            <div style={{background:"#080812",border:"1px solid #0f0f20",borderRadius:7,padding:10}}>
              <div style={{fontFamily:"'Instrument Sans'",fontWeight:700,color:"#e0e4ee",marginBottom:7,fontSize:11.5}}>🎯 最新訊號</div>
              <div style={{maxHeight:160,overflowY:"auto"}}>{signals.slice(0,4).map(s=><div key={s.id} style={{padding:6,marginBottom:4,borderRadius:5,background:s.direction==="做多"?"#0fa05":"#f4505",border:`1px solid ${s.direction==="做多"?"#0fa10":"#f4510"}`}}><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:600,color:"#e0e4ee",fontSize:11}}>{s.symbol}</span><span style={{color:s.direction==="做多"?"#0fa":"#f45",fontWeight:700,fontSize:9}}>{s.direction} {s.confidence}%</span></div><div style={{fontSize:8.5,color:"#556",marginTop:1}}>入{fp(s.entry)} TP{fp(s.tp)} SL{fp(s.sl)} R:R{s.rr}</div></div>)}
                {signals.length===0&&<div style={{color:"#151525",textAlign:"center",padding:14,fontSize:9}}>累積30+數據點後出訊號</div>}
              </div>
            </div>
          </div></>}
        </div>}

        {tab==="smartmoney"&&<div style={{background:"#080812",border:"1px solid #0f0f20",borderRadius:8,padding:13}}>
          <div style={{fontFamily:"'Instrument Sans'",fontWeight:700,color:"#e0e4ee",fontSize:13,marginBottom:10}}>💰 聰明錢監控 {smLoad&&<Spin c="#0bd"/>}</div>
          {!apiKey&&<div style={{background:"#06060e",borderRadius:6,padding:12,textAlign:"center",marginBottom:10,color:"#445",fontSize:11}}>在 ⚙ 設定填入 Anthropic API Key 後啟用（console.anthropic.com 免費申請）</div>}
          {smLog.length>0&&<div style={{background:"#06060e",borderRadius:6,padding:9,marginBottom:10,display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:9,color:"#556"}}>方向</span><div style={{flex:1,height:5,borderRadius:3,background:"#12122a",overflow:"hidden"}}><div style={{width:`${smSum.pct}%`,height:"100%",background:`linear-gradient(90deg,#f45,#fc6,#0fa)`}}/></div><span style={{fontSize:12,fontWeight:700,color:smSum.c,fontFamily:"'Instrument Sans'"}}>{smSum.pct}% {smSum.lb}</span></div>}
          <div style={{maxHeight:380,overflowY:"auto"}}>{smLog.map(sm=><div key={sm.id} style={{display:"flex",gap:7,padding:9,marginBottom:4,borderRadius:6,border:`1px solid ${sm.importance==="high"?(sm.signal==="bullish"?"#0fa12":"#f4512"):"#0a0a16"}`}}><div style={{minWidth:24,height:24,borderRadius:4,background:(tc2[sm.type]||"#445")+"10",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11}}>{sm.signal==="bullish"?"🟢":"🔴"}</div><div style={{flex:1}}><div style={{color:"#aab",fontSize:11,lineHeight:1.4}}>{sm.text}</div><div style={{display:"flex",gap:4,fontSize:7.5,marginTop:2}}><span style={{color:tc2[sm.type]||"#445"}}>{tl[sm.type]||sm.type}</span>{sm.coin&&<span style={{color:"#86f"}}>{sm.coin}</span>}{sm.amount&&<span style={{color:"#fc6"}}>{sm.amount}</span>}</div></div></div>)}</div>
        </div>}

        {tab==="signals"&&<div style={{background:"#080812",border:"1px solid #0f0f20",borderRadius:8,padding:13}}>
          <div style={{fontFamily:"'Instrument Sans'",fontWeight:700,color:"#e0e4ee",fontSize:13,marginBottom:2}}>🎯 10 維交叉驗證</div>
          <div style={{fontSize:7.5,color:"#334",marginBottom:10}}>趨勢·動量·量能·聰明錢·衍生品·F&G·消息·清算·多空·宏觀 | ≥4維+R:R≥1.3</div>
          <div style={{maxHeight:400,overflowY:"auto",display:"flex",flexDirection:"column",gap:6}}>{signals.map(s=><div key={s.id} style={{padding:11,borderRadius:7,background:"#06060e",border:`1px solid ${s.direction==="做多"?"#0fa18":"#f4518"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:14,fontWeight:700,color:"#e8eaf0",fontFamily:"'Instrument Sans'"}}>{s.symbol}</span><span style={{background:s.direction==="做多"?"#0fa":"#f45",color:"#000",fontWeight:700,fontSize:8.5,padding:"2px 6px",borderRadius:3}}>{s.direction}</span><span style={{fontSize:7.5,color:"#334"}}>{s.dimCount}/10維</span></div>
              <div style={{background:`conic-gradient(${s.confidence>=75?"#0fa":"#fc6"} ${s.confidence*3.6}deg, #12122a 0deg)`,width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:19,height:19,borderRadius:"50%",background:"#06060e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7.5,fontWeight:700,color:"#e0e4ee"}}>{s.confidence}</div></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:4,marginBottom:6}}>{[["進場",s.entry,"#e0e4ee"],["止盈",s.tp,"#0fa"],["止損",s.sl,"#f45"],["R:R",s.rr,"#fc6"]].map(([l,v,c])=><div key={l} style={{background:"#05050d",borderRadius:4,padding:"4px 5px"}}><div style={{fontSize:6.5,color:"#2a2a40"}}>{l}</div><div style={{fontSize:10,fontWeight:700,color:c}}>{typeof v==="number"&&l!=="R:R"?fp(v):v}</div></div>)}</div>
            {s.scores&&<div style={{marginBottom:4}}><DimBar v={Math.round(s.scores.trend)} label="趨勢"/><DimBar v={Math.round(s.scores.momentum)} label="動量"/><DimBar v={Math.round(s.scores.volume)} label="量能"/><DimBar v={Math.round(s.scores.smartMoney)} label="聰明錢"/><DimBar v={Math.round(s.scores.derivatives||0)} label="資金費率"/><DimBar v={Math.round(s.scores.fearGreed||0)} label="F&G"/><DimBar v={Math.round(s.scores.liquidation||0)} label="清算"/><DimBar v={Math.round(s.scores.longShort||0)} label="多空比"/><DimBar v={Math.round(s.scores.macro||0)} label="宏觀"/><DimBar v={Math.round(s.scores.news||0)} label="消息"/></div>}
          </div>)}{signals.length===0&&<div style={{color:"#151525",textAlign:"center",padding:30}}>需累積30+數據點</div>}</div>
        </div>}

        {tab==="perf"&&<div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(115px, 1fr))",gap:6}}>{[["勝率",`${ts2.wr||0}%`,(ts2.wr||0)>=50?"#0fa":"#f45"],["交易",`${ts2.total||0}`,"#e0e4ee"],["勝/負",`${ts2.w||0}/${ts2.l||0}`,"#99a"],["利潤因子",`${ts2.pf||0}`,(ts2.pf||0)>=1.5?"#0fa":"#fc6"],["總PnL",`${(ts2.pnl||0).toFixed(2)}%`,(ts2.pnl||0)>=0?"#0fa":"#f45"],["持倉",`${ts2.openN||0}`,"#0bd"]].map(([l,v,c])=><div key={l} style={{background:"#080812",border:"1px solid #0f0f20",borderRadius:6,padding:9}}><div style={{fontSize:7.5,color:"#334",marginBottom:2}}>{l}</div><div style={{fontSize:15,fontWeight:700,color:c,fontFamily:"'Instrument Sans'"}}>{v}</div></div>)}</div>
          <div style={{background:"#080812",border:"1px solid #0f0f20",borderRadius:7,padding:11}}>
            <div style={{fontFamily:"'Instrument Sans'",fontWeight:700,color:"#e0e4ee",marginBottom:7,fontSize:12}}>📋 紀錄</div>
            <div style={{maxHeight:300,overflowY:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr style={{borderBottom:"1px solid #0f0f20"}}>{["幣","方向","入","出","PnL","R:R","結果"].map(h=><th key={h} style={{textAlign:"left",padding:"5px 3px",color:"#2a2a40",fontSize:7.5}}>{h}</th>)}</tr></thead>
              <tbody>{rt.map((t,i)=><tr key={i} style={{borderBottom:"1px solid #0a0a16"}}><td style={{padding:"5px 3px",color:"#e0e4ee",fontSize:10}}>{t.symbol}</td><td style={{padding:"5px 3px",color:t.direction==="做多"?"#0fa":"#f45",fontSize:10}}>{t.direction}</td><td style={{padding:"5px 3px",color:"#556",fontSize:9}}>{fp(t.entry)}</td><td style={{padding:"5px 3px",color:"#556",fontSize:9}}>{fp(t.exitPrice)}</td><td style={{padding:"5px 3px",color:t.pnl>=0?"#0fa":"#f45",fontSize:10,fontWeight:600}}>{t.pnl>=0?"+":""}{t.pnl}%</td><td style={{padding:"5px 3px",color:"#fc6",fontSize:9}}>{t.rr}</td><td style={{padding:"5px 3px",fontSize:8}}><span style={{padding:"1px 4px",borderRadius:2,background:t.result==="tp"?"#0fa10":"#f4510",color:t.result==="tp"?"#0fa":t.result==="sl"?"#f45":"#fc6"}}>{t.result==="tp"?"✓":"✗"}</span></td></tr>)}</tbody></table>
              {rt.length===0&&<div style={{color:"#151525",textAlign:"center",padding:20}}>尚無交易</div>}</div>
          </div>
        </div>}

        {tab==="news"&&<div style={{background:"#080812",border:"1px solid #0f0f20",borderRadius:8,padding:13}}>
          <div style={{fontFamily:"'Instrument Sans'",fontWeight:700,color:"#e0e4ee",fontSize:13,marginBottom:10}}>📰 消息面 {newsLoad&&<Spin c="#fc6"/>}</div>
          {!apiKey&&<div style={{background:"#06060e",borderRadius:6,padding:12,textAlign:"center",marginBottom:10,color:"#445",fontSize:11}}>填入 API Key 啟用 AI 新聞監控</div>}
          <div style={{maxHeight:380,overflowY:"auto"}}>{newsLog.map(n=><div key={n.id} style={{display:"flex",gap:7,padding:9,marginBottom:4,borderRadius:6,border:`1px solid ${n.severity==="high"?(n.impact==="bullish"?"#0fa10":"#f4510"):"#0a0a16"}`}}><span style={{fontSize:13}}>{n.impact==="bullish"?"📈":"📉"}</span><div style={{flex:1}}><div style={{color:"#aab",fontSize:11,lineHeight:1.5}}>{n.text}</div><div style={{display:"flex",gap:4,fontSize:7.5,marginTop:2}}><span style={{color:n.impact==="bullish"?"#0fa":"#f45"}}>{n.impact==="bullish"?"利多":"利空"}</span>{n.coins?.length>0&&<span style={{color:"#86f"}}>{n.coins.join(",")}</span>}</div></div></div>)}</div>
        </div>}

        {tab==="alerts"&&<div style={{background:"#080812",border:"1px solid #0f0f20",borderRadius:8,padding:13}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><div style={{fontFamily:"'Instrument Sans'",fontWeight:700,color:"#e0e4ee",fontSize:13}}>🔔 警報</div><button onClick={()=>setAlertLog([])} style={{background:"#06060e",border:"1px solid #12122a",color:"#2a2a40",borderRadius:4,padding:"2px 7px",cursor:"pointer",fontSize:7.5,fontFamily:"inherit"}}>清除</button></div>
          <div style={{maxHeight:380,overflowY:"auto"}}>{alertLog.map(a=>{const cl={news:"#fc6",entry:"#0fa",smartmoney:"#0bd"};return<div key={a.id} style={{display:"flex",gap:5,padding:"6px 0",borderBottom:"1px solid #0a0a16"}}><div style={{width:2,borderRadius:1,background:cl[a.type]||"#334",flexShrink:0}}/><div><div style={{color:"#88a",fontSize:10,whiteSpace:"pre-line",lineHeight:1.5}}>{a.content}</div></div></div>})}</div>
        </div>}
      </div>
      <footer style={{textAlign:"center",padding:"8px 0",color:"#0c0c1a",fontSize:7,borderTop:"1px solid #0a0a16"}}>SmartFlow Pro v7 · Binance WebSocket · CoinGecko · Alternative.me · Claude AI</footer>
    </div>
  );
}
