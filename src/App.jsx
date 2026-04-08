import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ═══ INDICATORS ═══
function ema(d,p){if(d.length<p)return[];const k=2/(p+1);const r=[];let v=d.slice(0,p).reduce((a,b)=>a+b,0)/p;r.push(v);for(let i=p;i<d.length;i++){v=d[i]*k+v*(1-k);r.push(v)}return r}
function sma(d,p){if(d.length<p)return[];const r=[];for(let i=p-1;i<d.length;i++)r.push(d.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p);return r}
function calcRsi(c,p=14){if(c.length<p+1)return[];const g=[],l=[];for(let i=1;i<c.length;i++){const d2=c[i]-c[i-1];g.push(d2>0?d2:0);l.push(d2<0?-d2:0)}let ag=g.slice(0,p).reduce((a,b)=>a+b,0)/p,al=l.slice(0,p).reduce((a,b)=>a+b,0)/p;const r=[];for(let i=p;i<g.length;i++){ag=(ag*(p-1)+g[i])/p;al=(al*(p-1)+l[i])/p;r.push(al===0?100:100-100/(1+ag/al))}return r}
function calcMacd(c){const ef=ema(c,12),es=ema(c,26);if(!ef.length||!es.length)return{h:[],line:[],sig:[]};const o=26-12,ln=[];for(let i=0;i<es.length;i++)ln.push(ef[i+o]-es[i]);const sg=ema(ln,9),so=ln.length-sg.length,h=[];for(let i=0;i<sg.length;i++)h.push(ln[i+so]-sg[i]);return{h:h.slice(-30),line:ln.slice(-30),sig:sg.slice(-30)}}
function calcBB(c,p=20){if(c.length<p)return null;const s=c.slice(-p),m=s.reduce((a,b)=>a+b,0)/p,std=Math.sqrt(s.reduce((a,b)=>a+(b-m)**2,0)/p);return{u:m+2*std,m,l:m-2*std,bw:std*4/m*100}}

function computeSignal({closes,fearGreed,fundingRate,longShortRatio}){
  if(!closes||closes.length<20)return null;
  const cur=closes[closes.length-1];
  const rv=calcRsi(closes,14),curRsi=rv.length?rv[rv.length-1]:50;
  const mc=calcMacd(closes),curH=mc.h.length?mc.h[mc.h.length-1]:0,prevH=mc.h.length>1?mc.h[mc.h.length-2]:0;
  const e5=ema(closes,5),e20=ema(closes,20);
  const ce5=e5.length?e5[e5.length-1]:cur,ce20=e20.length?e20[e20.length-1]:cur;
  const bb=calcBB(closes,Math.min(20,closes.length));
  const atr=closes.length>2?closes.slice(-14).reduce((mx,_,i,a)=>i===0?0:Math.max(mx,Math.abs(a[i]-a[i-1])),0)*1.5||cur*0.02:cur*0.02;
  let sc={};
  // TREND 25%
  let t=0;if(ce5>ce20)t+=35;else t-=35;t+=Math.max(-65,Math.min(65,((ce5-ce20)/ce20)*3000));sc.trend=Math.max(-100,Math.min(100,t));
  // MOMENTUM 25%
  let m=0;if(curRsi<25)m+=50;else if(curRsi<35)m+=25;else if(curRsi>75)m-=50;else if(curRsi>65)m-=25;
  if(curH>0&&curH>prevH)m+=30;else if(curH<0&&curH<prevH)m-=30;sc.momentum=Math.max(-100,Math.min(100,m));
  // VOLATILITY 15%
  let v=0;if(bb){const pos=(cur-bb.l)/(bb.u-bb.l);if(pos<0.15)v+=50;else if(pos<0.3)v+=20;else if(pos>0.85)v-=50;else if(pos>0.7)v-=20}sc.volatility=Math.max(-100,Math.min(100,v));
  // FUNDING 15%
  let fd=0;if(fundingRate!=null){if(fundingRate>0.05)fd-=60;else if(fundingRate>0.01)fd-=25;else if(fundingRate<-0.03)fd+=60;else if(fundingRate<-0.005)fd+=25}sc.funding=Math.max(-100,Math.min(100,fd));
  // FEAR/GREED 10%
  let fg=0;if(fearGreed!=null){if(fearGreed<15)fg+=60;else if(fearGreed<30)fg+=30;else if(fearGreed>80)fg-=60;else if(fearGreed>70)fg-=30}sc.fearGreed=fg;
  // LONG/SHORT 10%
  let ls=0;if(longShortRatio!=null){if(longShortRatio>2)ls-=50;else if(longShortRatio>1.5)ls-=25;else if(longShortRatio<0.6)ls+=50;else if(longShortRatio<0.8)ls+=25}sc.longShort=Math.max(-100,Math.min(100,ls));

  const W={trend:.25,momentum:.25,volatility:.15,funding:.15,fearGreed:.10,longShort:.10};
  let fs=0;Object.keys(W).forEach(k=>fs+=(sc[k]||0)*W[k]);
  const agreeL=Object.values(sc).filter(s=>s>5).length,agreeS=Object.values(sc).filter(s=>s<-5).length;
  let dir=null;if(fs>=18&&agreeL>=3)dir="做多";else if(fs<=-18&&agreeS>=3)dir="做空";if(!dir)return null;
  const conf=Math.min(95,Math.max(50,Math.round(45+Math.abs(fs)*0.6)));
  const am=conf>75?2.5:2,sm2=conf>75?1.2:1.5;
  let tp,sl;if(dir==="做多"){tp=+(cur+atr*am).toFixed(cur<1?6:2);sl=+(cur-atr*sm2).toFixed(cur<1?6:2)}else{tp=+(cur-atr*am).toFixed(cur<1?6:2);sl=+(cur+atr*sm2).toFixed(cur<1?6:2)}
  const rr=Math.abs(sl-cur)>0?+(Math.abs(tp-cur)/Math.abs(sl-cur)).toFixed(2):0;if(rr<1.2)return null;
  return{direction:dir,entry:+cur.toFixed(cur<1?6:2),tp,sl,rr,confidence:conf,finalScore:+fs.toFixed(1),scores:sc,ind:{rsi:+curRsi.toFixed(1),macdH:+(curH).toFixed(cur<1?8:4),bbPos:bb?+((cur-bb.l)/(bb.u-bb.l)*100).toFixed(0):null,ema5:+ce5.toFixed(cur<1?6:2),ema20:+ce20.toFixed(cur<1?6:2),atr:+atr.toFixed(cur<1?6:2)},dimCount:dir==="做多"?agreeL:agreeS};
}

class Tracker{constructor(){this.trades=[];this.open=[];this.s={w:0,l:0,pnl:0}}add(sig){if(sig)this.open.push({...sig,ot:Date.now()})}update(cp){const cl=[];this.open.forEach((t,i)=>{const sym=t.symbol?.split("/")[0];const p=cp[sym];if(!p)return;let r=null;if(t.direction==="做多"){if(p>=t.tp)r="tp";else if(p<=t.sl)r="sl"}else{if(p<=t.tp)r="tp";else if(p>=t.sl)r="sl"}if(!r&&Date.now()-t.ot>20*60000)r="timeout";if(r){const ep=r==="tp"?t.tp:r==="sl"?t.sl:p;const pnl=t.direction==="做多"?((ep-t.entry)/t.entry*100):((t.entry-ep)/t.entry*100);cl.push({i,t:{...t,exitPrice:ep,pnl:+pnl.toFixed(3),result:r}})}});const ci=new Set();cl.forEach(({i,t})=>{ci.add(i);this.trades.push(t);if(t.pnl>0)this.s.w++;else this.s.l++;this.s.pnl+=t.pnl});this.open=this.open.filter((_,i)=>!ci.has(i))}wr(){const t=this.s.w+this.s.l;return t===0?0:+(this.s.w/t*100).toFixed(1)}pf(){const gw=this.trades.filter(t=>t.pnl>0).reduce((a,t)=>a+t.pnl,0);const gl=Math.abs(this.trades.filter(t=>t.pnl<=0).reduce((a,t)=>a+t.pnl,0));return gl===0?(gw>0?99:0):+(gw/gl).toFixed(2)}summary(){return{total:this.trades.length,openN:this.open.length,wr:this.wr(),pf:this.pf(),...this.s}}recent(n=20){return this.trades.slice(-n).reverse()}}

const COINS=[{s:"BTC",pair:"btcusdt"},{s:"ETH",pair:"ethusdt"},{s:"SOL",pair:"solusdt"},{s:"BNB",pair:"bnbusdt"},{s:"XRP",pair:"xrpusdt"},{s:"DOGE",pair:"dogeusdt"}];
const ts=()=>new Date().toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",second:"2-digit"});

function Spark({data,color,w=140,h=36}){if(!data||data.length<2)return<div style={{width:w,height:h,background:"#0a0a16",borderRadius:4}}/>;const mn=Math.min(...data),mx=Math.max(...data),r=mx-mn||1;const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-2-((v-mn)/r)*(h-4)}`).join(" ");return<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block"}}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/></svg>}
function Spin({s=14,c="#0fa"}){return<div style={{width:s,height:s,border:`2px solid #1a1a30`,borderTopColor:c,borderRadius:"50%",animation:"spin .6s linear infinite",display:"inline-block",verticalAlign:"middle"}}/>}
function DimBar({v,label}){const col=v>10?"#0fa":v<-10?"#f45":"#fc6";return<div style={{marginBottom:4}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:1}}><span style={{color:"#667"}}>{label}</span><span style={{color:col,fontWeight:600}}>{v>0?"+":""}{v}</span></div><div style={{height:4,borderRadius:2,background:"#0e0e1e",position:"relative",overflow:"hidden"}}><div style={{position:"absolute",left:v>=0?"50%":"auto",right:v<0?"50%":"auto",width:`${Math.min(Math.abs(v)/100*50,50)}%`,height:"100%",background:col,borderRadius:2}}/></div></div>}
function Popup({alert:a,onClose}){if(!a)return null;const cl={entry:"#0fa",news:"#fc6"};return<div style={{position:"fixed",top:16,right:16,zIndex:9999,background:"#0c0c1af0",border:`1px solid ${cl[a.type]||"#333"}50`,borderRadius:12,padding:"14px 18px",maxWidth:400,boxShadow:`0 8px 40px #0008`,animation:"slideIn .3s",backdropFilter:"blur(12px)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><span style={{color:cl[a.type]||"#aaa",fontWeight:700,fontSize:14}}>🎯 進場訊號</span><button onClick={onClose} style={{background:"none",border:"none",color:"#445",cursor:"pointer",fontSize:16}}>✕</button></div><div style={{color:"#aab",fontSize:13,lineHeight:1.7,whiteSpace:"pre-line"}}>{a.content}</div></div>}

export default function App(){
  const[prices,setPrices]=useState({});
  const[hist,setHist]=useState(()=>{const h={};COINS.forEach(c=>h[c.s]=[]);return h});
  const[fg,setFg]=useState(null);
  const[fr,setFr]=useState({});
  const[lsRatios,setLsRatios]=useState({});
  const[wsOk,setWsOk]=useState(false);
  const[signals,setSignals]=useState([]);
  const[alertLog,setAlertLog]=useState([]);
  const[popup,setPopup]=useState(null);
  const[live,setLive]=useState(true);
  const[tab,setTab]=useState("overview");
  const[sound,setSound]=useState(true);
  const[ts2,setTs2]=useState({});
  const[rt,setRt]=useState([]);

  const wsRef=useRef(null);const popT=useRef(null);
  const hR=useRef(hist);useEffect(()=>{hR.current=hist},[hist]);
  const fgR=useRef(fg);useEffect(()=>{fgR.current=fg},[fg]);
  const frR=useRef(fr);useEffect(()=>{frR.current=fr},[fr]);
  const lsR=useRef(lsRatios);useEffect(()=>{lsR.current=lsRatios},[lsRatios]);
  const pR=useRef(prices);useEffect(()=>{pR.current=prices},[prices]);
  const tk=useRef(new Tracker());

  const beep=useCallback(()=>{if(!sound)return;try{const a=new(window.AudioContext||window.webkitAudioContext)(),o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=880;o.type="sine";g.gain.setValueAtTime(.08,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.15);o.start();o.stop(a.currentTime+.15)}catch{}},[sound]);
  const flash=useCallback(a=>{setPopup(a);if(popT.current)clearTimeout(popT.current);popT.current=setTimeout(()=>setPopup(null),5000)},[]);

  // 1) BINANCE WEBSOCKET
  useEffect(()=>{if(!live){if(wsRef.current){wsRef.current.close();setWsOk(false)}return}const streams=COINS.map(c=>`${c.pair}@ticker`).join("/");let ws;try{ws=new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);wsRef.current=ws;ws.onopen=()=>setWsOk(true);ws.onclose=()=>setWsOk(false);ws.onerror=()=>setWsOk(false);ws.onmessage=evt=>{try{const d=JSON.parse(evt.data);if(!d.s)return;const coin=COINS.find(c=>c.pair===d.s.toLowerCase());if(!coin)return;setPrices(p=>({...p,[coin.s]:{price:parseFloat(d.c),chg:parseFloat(d.P),high:parseFloat(d.h),low:parseFloat(d.l),vol:parseFloat(d.v),qvol:parseFloat(d.q)}}));setHist(h=>({...h,[coin.s]:[...(h[coin.s]||[]).slice(-299),parseFloat(d.c)]}))}catch{}}}catch{setWsOk(false)}return()=>{if(ws)ws.close()}},[live]);

  // 2) BINANCE FUNDING RATES (free REST)
  useEffect(()=>{if(!live)return;let act=true;const f=async()=>{try{for(const coin of COINS){const r=await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${coin.s}USDT`);if(!r.ok||!act)continue;const d=await r.json();if(d.lastFundingRate)setFr(prev=>({...prev,[coin.s]:+(parseFloat(d.lastFundingRate)*100).toFixed(4)}))}
  }catch{}};f();const t=setInterval(f,60000);return()=>{act=false;clearInterval(t)}},[live]);

  // 3) BINANCE LONG/SHORT RATIO (free REST)
  useEffect(()=>{if(!live)return;let act=true;const f=async()=>{try{for(const sym of["BTC","ETH"]){const r=await fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${sym}USDT&period=5m&limit=1`);if(!r.ok||!act)continue;const d=await r.json();if(d[0])setLsRatios(prev=>({...prev,[sym]:+parseFloat(d[0].longShortRatio).toFixed(2)}))}
  }catch{}};f();const t=setInterval(f,60000);return()=>{act=false;clearInterval(t)}},[live]);

  // 4) FEAR & GREED
  useEffect(()=>{if(!live)return;let act=true;const f=async()=>{try{const r=await fetch("https://api.alternative.me/fng/?limit=1");if(!r.ok||!act)return;const d=await r.json();if(d.data?.[0])setFg(parseInt(d.data[0].value))}catch{}};f();const t=setInterval(f,300000);return()=>{act=false;clearInterval(t)}},[live]);

  // 5) SIGNAL ENGINE
  useEffect(()=>{if(!live)return;const t=setInterval(()=>{
    COINS.forEach(coin=>{
      const closes=hR.current[coin.s]||[];if(closes.length<20)return;
      const sig=computeSignal({closes,fearGreed:fgR.current,fundingRate:frR.current[coin.s],longShortRatio:lsR.current[coin.s]});
      if(sig){
        const entry={...sig,symbol:`${coin.s}/USDT`,time:ts(),id:Date.now()+Math.random(),_ts:Date.now()};
        setSignals(l=>{if(l.find(s2=>s2.symbol===entry.symbol&&(Date.now()-(s2._ts||0))<90000))return l;return[entry,...l].slice(0,80)});
        tk.current.add(entry);
        const al={type:"entry",content:`${entry.symbol} ${entry.direction}\n信心 ${entry.confidence}% | R:R ${entry.rr}\n入場 $${entry.entry}\n止盈 $${entry.tp} | 止損 $${entry.sl}\nRSI ${entry.ind.rsi} | MACD ${entry.ind.macdH>0?"+":""}${entry.ind.macdH}`,time:ts(),id:Date.now()+Math.random()};
        setAlertLog(l=>[al,...l].slice(0,300));flash(al);beep();
      }
    });
    const cp={};Object.entries(pR.current).forEach(([k,v])=>{cp[k]=v.price});
    tk.current.update(cp);setTs2(tk.current.summary());setRt(tk.current.recent(20));
  },6000);return()=>clearInterval(t)},[live,beep,flash]);

  const fp=p=>{if(!p&&p!==0)return"—";return p<1?`$${p.toFixed(5)}`:p<100?`$${p.toFixed(2)}`:`$${p.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`};
  const tabs=[{id:"overview",lb:"總覽",ic:"◉"},{id:"signals",lb:"進場訊號",ic:"🎯"},{id:"perf",lb:"績效追蹤",ic:"📊"},{id:"alerts",lb:"警報紀錄",ic:"🔔"}];
  const hasData=Object.keys(prices).length>0;

  return(
    <div style={{fontFamily:"'Segoe UI','Helvetica Neue',sans-serif",background:"#05050d",color:"#9098a8",minHeight:"100vh",fontSize:13}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');@keyframes slideIn{from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}*{box-sizing:border-box;margin:0;padding:0}body{background:#05050d}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#1e1e3a;border-radius:2px}`}</style>
      <Popup alert={popup} onClose={()=>setPopup(null)}/>

      {/* HEADER */}
      <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 20px",borderBottom:"1px solid #10102a",background:"linear-gradient(180deg,#0a0a18,#05050d)",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:6,background:"linear-gradient(135deg,#0fa,#08f)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:"#000"}}>⚡</div>
          <div>
            <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,fontSize:18,color:"#f0f2f8"}}>SmartFlow Pro</div>
            <div style={{fontSize:11,display:"flex",gap:10,marginTop:1}}>
              <span style={{color:wsOk?"#0fa":"#f45"}}>● {wsOk?"Binance 即時連線":"連線中..."}</span>
              {fg!=null&&<span style={{color:fg<25?"#f45":fg>70?"#0fa":"#fc6"}}>恐懼貪婪 {fg}</span>}
              {fr.BTC!=null&&<span style={{color:fr.BTC>0.01?"#f45":"#0fa"}}>BTC資金費率 {fr.BTC}%</span>}
              {lsRatios.BTC&&<span style={{color:lsRatios.BTC>1.5?"#f45":"#0fa"}}>多空比 {lsRatios.BTC}</span>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {ts2.total>0&&<div style={{background:"#0a0a1a",border:"1px solid #15152e",borderRadius:6,padding:"4px 10px",fontSize:12}}>
            <span style={{color:(ts2.wr||0)>=50?"#0fa":"#f45",fontWeight:600}}>勝率 {ts2.wr}%</span>
            <span style={{color:"#334",margin:"0 6px"}}>|</span>
            <span style={{color:"#778"}}>{ts2.total} 筆交易</span>
            <span style={{color:"#334",margin:"0 6px"}}>|</span>
            <span style={{color:(ts2.pf||0)>=1.5?"#0fa":"#fc6"}}>PF {ts2.pf}</span>
          </div>}
          <button onClick={()=>setLive(!live)} style={{background:live?"#0a0a1a":"#0fa10",border:`1px solid ${live?"#15152e":"#0fa30"}`,color:live?"#778":"#0fa",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:600}}>
            <span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:live?"#0fa":"#f45",marginRight:6,animation:live?"pulse 1.5s infinite":"none"}}/>{live?"LIVE":"OFF"}
          </button>
          <button onClick={()=>setSound(!sound)} style={{background:"#0a0a1a",border:"1px solid #15152e",color:sound?"#0fa":"#334",borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:14}}>{sound?"🔔":"🔕"}</button>
        </div>
      </header>

      <nav style={{display:"flex",borderBottom:"1px solid #10102a",background:"#07071a",padding:"0 16px",overflowX:"auto"}}>
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",borderBottom:tab===t.id?"2px solid #0fa":"2px solid transparent",color:tab===t.id?"#0fa":"#334",padding:"10px 16px",cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:tab===t.id?600:400,whiteSpace:"nowrap",transition:"all .15s"}}>{t.ic} {t.lb}
          {t.id==="signals"&&signals.length>0&&<span style={{marginLeft:5,background:"#0fa18",color:"#0fa",padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:600}}>{signals.length}</span>}
        </button>)}
      </nav>

      <div style={{padding:"14px 18px"}}>

        {/* ═══ OVERVIEW ═══ */}
        {tab==="overview"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
          {!hasData&&<div style={{textAlign:"center",padding:50}}><Spin s={28}/><div style={{color:"#556",fontSize:15,marginTop:14}}>正在連線 Binance...</div></div>}
          {hasData&&<>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))",gap:10}}>
              {COINS.map(c=>{const p=prices[c.s]||{},h=hist[c.s]||[],up=(p.chg||0)>=0;
                const rv=calcRsi(h,14),curRsi=rv.length?rv[rv.length-1]:null;
                const mc=calcMacd(h),curMH=mc.h.length?mc.h[mc.h.length-1]:null;
                const bb=calcBB(h,Math.min(20,h.length)),bbP=bb&&h.length?((h[h.length-1]-bb.l)/(bb.u-bb.l)*100):null;
                const e5=ema(h,5),e20=ema(h,20);
                const ce5=e5.length?e5[e5.length-1]:null,ce20=e20.length?e20[e20.length-1]:null;
                const trend=ce5&&ce20?(ce5>ce20?"▲上升":"▼下降"):null;
                return<div key={c.s} style={{background:"#0a0a1a",border:"1px solid #12122e",borderRadius:10,padding:14,animation:"fadeUp .3s"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{fontWeight:700,color:"#f0f2f8",fontSize:18,fontFamily:"'Space Grotesk'"}}>{c.s}</span>
                    <span style={{fontSize:13,fontWeight:600,color:up?"#0fa":"#f45",background:up?"#0fa10":"#f4510",padding:"2px 8px",borderRadius:5}}>{up?"+":""}{(p.chg||0).toFixed(2)}%</span>
                  </div>
                  <div style={{fontSize:24,fontWeight:700,color:"#f8f9ff",marginBottom:4,fontFamily:"'Space Grotesk'"}}>{fp(p.price)}</div>
                  <div style={{fontSize:11,color:"#445",marginBottom:6}}>H {fp(p.high)} · L {fp(p.low)} · Vol {p.qvol?(p.qvol/1e6).toFixed(0)+"M":"—"}</div>
                  <Spark data={h.slice(-100)} color={up?"#0fa":"#f45"}/>
                  {/* INDICATORS */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:8}}>
                    {curRsi!=null&&<div style={{background:"#08081a",borderRadius:5,padding:"5px 7px"}}>
                      <div style={{fontSize:10,color:"#445"}}>RSI</div>
                      <div style={{fontSize:15,fontWeight:700,color:curRsi<30?"#0fa":curRsi>70?"#f45":"#aab"}}>{curRsi.toFixed(1)}</div>
                    </div>}
                    {curMH!=null&&<div style={{background:"#08081a",borderRadius:5,padding:"5px 7px"}}>
                      <div style={{fontSize:10,color:"#445"}}>MACD</div>
                      <div style={{fontSize:15,fontWeight:700,color:curMH>0?"#0fa":"#f45"}}>{curMH>0?"+":""}{curMH.toFixed(p.price<1?6:2)}</div>
                    </div>}
                    {bbP!=null&&<div style={{background:"#08081a",borderRadius:5,padding:"5px 7px"}}>
                      <div style={{fontSize:10,color:"#445"}}>BB位置</div>
                      <div style={{fontSize:15,fontWeight:700,color:bbP<20?"#0fa":bbP>80?"#f45":"#aab"}}>{bbP.toFixed(0)}%</div>
                    </div>}
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:6,fontSize:11,flexWrap:"wrap"}}>
                    {trend&&<span style={{color:trend.includes("上升")?"#0fa":"#f45",background:"#0a0a1a",padding:"2px 6px",borderRadius:4,border:"1px solid #15152e"}}>{trend}</span>}
                    {fr[c.s]!=null&&<span style={{color:fr[c.s]>0.01?"#f45":fr[c.s]<-0.005?"#0fa":"#778",background:"#0a0a1a",padding:"2px 6px",borderRadius:4,border:"1px solid #15152e"}}>FR {fr[c.s]}%</span>}
                    {lsRatios[c.s]&&<span style={{color:lsRatios[c.s]>1.5?"#f45":"#0fa",background:"#0a0a1a",padding:"2px 6px",borderRadius:4,border:"1px solid #15152e"}}>多空 {lsRatios[c.s]}</span>}
                  </div>
                </div>})}
            </div>
            {/* LATEST SIGNALS */}
            <div style={{background:"#0a0a1a",border:"1px solid #12122e",borderRadius:10,padding:16}}>
              <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,color:"#f0f2f8",marginBottom:10,fontSize:16}}>🎯 最新進場訊號</div>
              {signals.length===0&&<div style={{color:"#334",textAlign:"center",padding:20,fontSize:13}}>價格數據累積中，約 1-2 分鐘後開始產生訊號...</div>}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))",gap:8}}>
                {signals.slice(0,6).map(s=><div key={s.id} style={{padding:12,borderRadius:8,background:"#08081a",border:`1px solid ${s.direction==="做多"?"#0fa22":"#f4522"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:16,fontWeight:700,color:"#f0f2f8",fontFamily:"'Space Grotesk'"}}>{s.symbol}</span>
                      <span style={{background:s.direction==="做多"?"#0fa":"#f45",color:"#000",fontWeight:700,fontSize:12,padding:"3px 10px",borderRadius:5}}>{s.direction}</span>
                    </div>
                    <span style={{fontSize:13,fontWeight:600,color:"#aab"}}>{s.confidence}% · R:R {s.rr}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                    {[["入場",s.entry,"#f0f2f8"],["止盈 TP",s.tp,"#0fa"],["止損 SL",s.sl,"#f45"]].map(([l,v,c])=><div key={l} style={{background:"#06061a",borderRadius:5,padding:"6px 8px"}}><div style={{fontSize:10,color:"#445"}}>{l}</div><div style={{fontSize:15,fontWeight:700,color:c}}>{fp(v)}</div></div>)}
                  </div>
                  <div style={{fontSize:11,color:"#556",marginTop:6}}>RSI {s.ind.rsi} · MACD {s.ind.macdH>0?"+":""}{s.ind.macdH}{s.ind.bbPos!=null?` · BB ${s.ind.bbPos}%`:""} <span style={{float:"right",color:"#334"}}>{s.time}</span></div>
                </div>)}
              </div>
            </div>
          </>}
        </div>}

        {/* ═══ SIGNALS ═══ */}
        {tab==="signals"&&<div style={{background:"#0a0a1a",border:"1px solid #12122e",borderRadius:10,padding:16}}>
          <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,color:"#f0f2f8",fontSize:18,marginBottom:4}}>🎯 訊號引擎（6維交叉驗證）</div>
          <div style={{fontSize:12,color:"#445",marginBottom:14}}>趨勢25% · 動量25% · 波動15% · 資金費率15% · 恐懼貪婪10% · 多空比10% | ≥3維同向 + R:R≥1.2</div>
          <div style={{maxHeight:500,overflowY:"auto",display:"flex",flexDirection:"column",gap:8}}>
            {signals.map(s=><div key={s.id} style={{padding:14,borderRadius:9,background:"#08081a",border:`1px solid ${s.direction==="做多"?"#0fa20":"#f4520"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:18,fontWeight:700,color:"#f0f2f8",fontFamily:"'Space Grotesk'"}}>{s.symbol}</span>
                  <span style={{background:s.direction==="做多"?"#0fa":"#f45",color:"#000",fontWeight:700,fontSize:12,padding:"3px 10px",borderRadius:5}}>{s.direction}</span>
                  <span style={{fontSize:12,color:"#556"}}>{s.dimCount}/6維 · 分數 {s.finalScore}</span>
                </div>
                <div style={{background:`conic-gradient(${s.confidence>=70?"#0fa":"#fc6"} ${s.confidence*3.6}deg, #15152e 0deg)`,width:34,height:34,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:25,height:25,borderRadius:"50%",background:"#08081a",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#f0f2f8"}}>{s.confidence}</div></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,marginBottom:10}}>
                {[["入場",s.entry,"#f0f2f8"],["止盈",s.tp,"#0fa"],["止損",s.sl,"#f45"],["R:R",s.rr,"#fc6"]].map(([l,v,c])=><div key={l} style={{background:"#06061a",borderRadius:5,padding:"6px 8px"}}><div style={{fontSize:10,color:"#334"}}>{l}</div><div style={{fontSize:14,fontWeight:700,color:c}}>{typeof v==="number"&&l!=="R:R"?fp(v):v}</div></div>)}
              </div>
              {s.scores&&<div style={{marginBottom:6}}><DimBar v={Math.round(s.scores.trend)} label="趨勢 EMA5/20"/><DimBar v={Math.round(s.scores.momentum)} label="動量 RSI/MACD"/><DimBar v={Math.round(s.scores.volatility)} label="波動 BB"/><DimBar v={Math.round(s.scores.funding||0)} label="資金費率"/><DimBar v={Math.round(s.scores.fearGreed||0)} label="恐懼貪婪"/><DimBar v={Math.round(s.scores.longShort||0)} label="多空比"/></div>}
              <div style={{fontSize:12,color:"#556"}}>RSI {s.ind.rsi} · MACD {s.ind.macdH>0?"+":""}{s.ind.macdH} · EMA5 {fp(s.ind.ema5)} / EMA20 {fp(s.ind.ema20)}{s.ind.bbPos!=null?` · BB ${s.ind.bbPos}%`:""} · ATR {s.ind.atr}<span style={{float:"right",color:"#334"}}>{s.time}</span></div>
            </div>)}
            {signals.length===0&&<div style={{color:"#223",textAlign:"center",padding:40,fontSize:14}}>需累積 20+ 個價格數據點，約 1-2 分鐘</div>}
          </div>
        </div>}

        {/* ═══ PERFORMANCE ═══ */}
        {tab==="perf"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))",gap:8}}>
            {[["勝率",`${ts2.wr||0}%`,(ts2.wr||0)>=50?"#0fa":"#f45"],["總交易",`${ts2.total||0}`,"#f0f2f8"],["勝 / 負",`${ts2.w||0} / ${ts2.l||0}`,"#aab"],["利潤因子",`${ts2.pf||0}`,(ts2.pf||0)>=1.5?"#0fa":"#fc6"],["總 PnL",`${(ts2.pnl||0).toFixed(2)}%`,(ts2.pnl||0)>=0?"#0fa":"#f45"],["持倉中",`${ts2.openN||0}`,"#08f"]].map(([l,v,c])=>
              <div key={l} style={{background:"#0a0a1a",border:"1px solid #12122e",borderRadius:8,padding:12}}>
                <div style={{fontSize:11,color:"#445",marginBottom:3}}>{l}</div>
                <div style={{fontSize:22,fontWeight:700,color:c,fontFamily:"'Space Grotesk'"}}>{v}</div>
              </div>)}
          </div>
          <div style={{background:"#0a0a1a",border:"1px solid #12122e",borderRadius:10,padding:14}}>
            <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,color:"#f0f2f8",marginBottom:10,fontSize:16}}>📋 交易紀錄</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
                <thead><tr style={{borderBottom:"2px solid #12122e"}}>{["幣種","方向","入場","出場","PnL","R:R","結果","信心度"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 6px",color:"#445",fontSize:12,fontWeight:500}}>{h}</th>)}</tr></thead>
                <tbody>{rt.map((t,i)=><tr key={i} style={{borderBottom:"1px solid #0e0e22"}}>
                  <td style={{padding:"8px 6px",color:"#f0f2f8",fontSize:13,fontWeight:600}}>{t.symbol}</td>
                  <td style={{padding:"8px 6px",color:t.direction==="做多"?"#0fa":"#f45",fontSize:13,fontWeight:600}}>{t.direction}</td>
                  <td style={{padding:"8px 6px",color:"#778",fontSize:13}}>{fp(t.entry)}</td>
                  <td style={{padding:"8px 6px",color:"#778",fontSize:13}}>{fp(t.exitPrice)}</td>
                  <td style={{padding:"8px 6px",color:t.pnl>=0?"#0fa":"#f45",fontSize:14,fontWeight:700}}>{t.pnl>=0?"+":""}{t.pnl}%</td>
                  <td style={{padding:"8px 6px",color:"#fc6",fontSize:13}}>{t.rr}</td>
                  <td style={{padding:"8px 6px"}}><span style={{padding:"3px 8px",borderRadius:4,fontSize:12,fontWeight:600,background:t.result==="tp"?"#0fa15":"#f4515",color:t.result==="tp"?"#0fa":t.result==="sl"?"#f45":"#fc6"}}>{t.result==="tp"?"✓ 止盈":t.result==="sl"?"✗ 止損":"⏱ 超時"}</span></td>
                  <td style={{padding:"8px 6px",color:"#556",fontSize:12}}>{t.confidence}%</td>
                </tr>)}</tbody>
              </table>
              {rt.length===0&&<div style={{color:"#223",textAlign:"center",padding:30,fontSize:14}}>尚無已完成交易，訊號產生後會自動追蹤</div>}
            </div>
          </div>
        </div>}

        {/* ═══ ALERTS ═══ */}
        {tab==="alerts"&&<div style={{background:"#0a0a1a",border:"1px solid #12122e",borderRadius:10,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontFamily:"'Space Grotesk'",fontWeight:700,color:"#f0f2f8",fontSize:18}}>🔔 警報紀錄</div>
            <button onClick={()=>setAlertLog([])} style={{background:"#08081a",border:"1px solid #15152e",color:"#445",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>清除全部</button>
          </div>
          <div style={{maxHeight:500,overflowY:"auto"}}>
            {alertLog.map(a=><div key={a.id} style={{display:"flex",gap:8,padding:"10px 0",borderBottom:"1px solid #0e0e22"}}>
              <div style={{width:3,borderRadius:2,background:"#0fa",flexShrink:0}}/>
              <div><div style={{color:"#aab",fontSize:13,whiteSpace:"pre-line",lineHeight:1.6}}>{a.content}</div><div style={{color:"#223",fontSize:11,marginTop:2}}>{a.time}</div></div>
            </div>)}
            {alertLog.length===0&&<div style={{color:"#223",textAlign:"center",padding:40,fontSize:14}}>尚無警報</div>}
          </div>
        </div>}
      </div>
      <footer style={{textAlign:"center",padding:"12px 0",color:"#10102a",fontSize:10,borderTop:"1px solid #0e0e22"}}>SmartFlow Pro v8 · Binance WebSocket · Binance Futures API · Alternative.me · 6-Dimension Signal Engine</footer>
    </div>
  );
}
