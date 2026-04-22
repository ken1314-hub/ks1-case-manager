import { useState, useEffect, useRef, useCallback } from "react";
import { db, auth, googleProvider } from "./firebase";
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs } from "firebase/firestore";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

const CK = "ks1-cases";
const SK = "ks1-seminars";
const UK = "ks1-customers";
const TK = "ks1-tasks";
const collMap = {"ks1-cases": "cases", "ks1-seminars": "seminars", "ks1-customers": "customers", "ks1-tasks": "tasks"};
const STS = ["検討中","仮予約","進行中","確認待ち","完了","失注","保留"];
const SC = {"検討中":{bg:"#FFF3E0",t:"#E65100",d:"#FF9800"},"仮予約":{bg:"#E0F7FA",t:"#006064",d:"#00ACC1"},"進行中":{bg:"#E3F2FD",t:"#0D47A1",d:"#2196F3"},"確認待ち":{bg:"#FFF8E1",t:"#F57F17",d:"#FFC107"},"完了":{bg:"#E8F5E9",t:"#1B5E20",d:"#4CAF50"},"失注":{bg:"#FFEBEE",t:"#B71C1C",d:"#E53935"},"保留":{bg:"#F3E5F5",t:"#4A148C",d:"#9C27B0"}};
const CST = ["新規","商談中","取引中","休眠","失注"];
const CSC = {"新規":{bg:"#E3F2FD",t:"#0D47A1",d:"#2196F3"},"商談中":{bg:"#FFF3E0",t:"#E65100",d:"#FF9800"},"取引中":{bg:"#E8F5E9",t:"#1B5E20",d:"#4CAF50"},"休眠":{bg:"#F5F5F5",t:"#546E7A",d:"#90A4AE"},"失注":{bg:"#FFEBEE",t:"#B71C1C",d:"#E53935"}};
const isDone=s=>s==="完了"||s==="失注";
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const fd=d=>{if(!d)return"";const x=new Date(d);const w=["日","月","火","水","木","金","土"][x.getDay()];return x.getFullYear()+"/"+String(x.getMonth()+1).padStart(2,"0")+"/"+String(x.getDate()).padStart(2,"0")+"("+w+")"};
const dt=d=>{if(!d)return null;const n=new Date();n.setHours(0,0,0,0);const t=new Date(d);t.setHours(0,0,0,0);return Math.ceil((t-n)/864e5)};
const pa=v=>parseFloat(String(v||"").replace(/,/g,""))||0;
const fn=v=>{const n=String(v||"").replace(/[^\d]/g,"");return n?Number(n).toLocaleString():""};
const ci=(a,t)=>{if(a<=0)return 0;if(t==="取材編")return Math.round(125000+(a*0.8-170000)*0.265);if(t==="社長出演編")return Math.round(115000+(a*0.8-150000)*0.29);return 0};
const is={width:"100%",padding:"10px 14px",border:"1.5px solid #CFD8DC",borderRadius:10,fontSize:14,fontFamily:"'Noto Sans JP',sans-serif",outline:"none",boxSizing:"border-box",background:"#FAFAFA",color:"#1A2A3A"};

function useSt(key){
  const[d,sD]=useState([]);const[ok,sO]=useState(false);const ref=useRef(d);
  useEffect(()=>{
    const collName=collMap[key]||key;
    const timer=setTimeout(()=>sO(true),3000);
    const unsub=onSnapshot(collection(db,collName),snap=>{
      const items=snap.docs.map(d=>({...d.data(),id:d.id}));
      ref.current=items;sD(items);sO(true);clearTimeout(timer);
    },err=>{console.error("Firestore error",collName,err);sO(true);clearTimeout(timer)});
    return()=>{clearTimeout(timer);unsub()};
  },[]);
  const setData=useCallback((updater)=>{
    const prev=ref.current;
    const next=typeof updater==='function'?updater(prev):updater;
    ref.current=next;sD(next);
    const collName=collMap[key]||key;
    const prevMap=new Map(prev.map(i=>[i.id,i]));
    const nextMap=new Map(next.map(i=>[i.id,i]));
    for(const[id,item]of nextMap){
      if(!prevMap.has(id)||JSON.stringify(prevMap.get(id))!==JSON.stringify(item)){
        setDoc(doc(db,collName,id),item);
      }
    }
    for(const[id]of prevMap){
      if(!nextMap.has(id))deleteDoc(doc(db,collName,id));
    }
  },[key]);
  return[d,setData,ok];
}

function DB({d:dl}){const dy=dt(dl);if(dy===null)return null;let c="#78909C",l=dy+"日後";if(dy<0){c="#C62828";l=Math.abs(dy)+"日超過"}else if(dy===0){c="#E53935";l="本日"}else if(dy<=3)c="#FB8C00";return <span style={{fontSize:11,color:c,fontWeight:600,display:"inline-flex",alignItems:"center",gap:3}}>{l}</span>}
function Md({open,onClose,children}){if(!open)return null;return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.35)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}><div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:32,maxWidth:520,width:"92%",maxHeight:"85vh",overflow:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.18)"}}>{children}</div></div>}
function Lb({label,children}){return <label style={{display:"block",marginBottom:16}}><span style={{fontSize:12,fontWeight:600,color:"#546E7A",display:"block",marginBottom:6}}>{label}</span>{children}</label>}
function SB({s}){const c=SC[s]||SC["検討中"];return <span style={{fontSize:11,fontWeight:600,color:c.t,background:c.bg,padding:"2px 10px",borderRadius:20,display:"inline-flex",alignItems:"center",gap:4}}><span style={{width:6,height:6,borderRadius:"50%",background:c.d,display:"inline-block"}}/>{s}</span>}

function CaseForm({init,onSave,onCancel,opts}){
  const df={name:"",client:"",status:"検討中",assignee:"",deadline:"",shootType:"取材",shootDate:"",shootTime:"",publishDate:"",nextAction:"",nextActionDeadline:"",nextActionMemo:"",caseType:"取材編",amount:"",itoShare:"",itoManual:false,invoiceSubmitted:false,memo:"",actionLog:[]};
  const[f,sF]=useState(init||df);
  useEffect(()=>{sF(init||df)},[init]);
  const s=(k,v)=>sF(p=>({...p,[k]:v}));
  const completeNow=()=>{if(!f.nextAction)return;const log={action:f.nextAction,deadline:f.nextActionDeadline||"",memo:f.nextActionMemo||"",completedAt:new Date().toISOString()};sF(p=>({...p,actionLog:[...(p.actionLog||[]),log],nextAction:"",nextActionDeadline:"",nextActionMemo:""}))};
  const amt=pa(f.amount),ito=pa(f.itoShare);
  useEffect(()=>{if(f.itoManual||f.caseType==="カスタム")return;const c=ci(amt,f.caseType);if(c>0&&String(c)!==String(f.itoShare))sF(p=>({...p,itoShare:String(c)}))},[f.amount,f.caseType]);
  return <div>
    <h2 style={{fontSize:20,fontWeight:700,color:"#1A2A3A",marginBottom:24}}>{init?"案件を編集":"新規案件"}</h2>
    <Lb label="案件名 *"><input style={is} value={f.name} onChange={e=>s("name",e.target.value)} placeholder="例：○○社 IR支援" autoFocus/></Lb>
    <Lb label="クライアント名"><input style={is} value={f.client} onChange={e=>s("client",e.target.value)} placeholder="例：株式会社○○"/></Lb>
    <Lb label="ステータス"><select style={{...is,cursor:"pointer"}} value={f.status} onChange={e=>s("status",e.target.value)}>{STS.map(x=><option key={x}>{x}</option>)}</select></Lb>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <Lb label="担当者"><input style={is} list="al" value={f.assignee} onChange={e=>s("assignee",e.target.value)} placeholder="名前"/><datalist id="al">{opts.map(a=><option key={a} value={a}/>)}</datalist></Lb>
      <Lb label="期限"><input style={is} type="date" value={f.deadline} onChange={e=>s("deadline",e.target.value)}/></Lb>
    </div>
    <div style={{background:"#F1F8E9",borderRadius:12,padding:"16px 16px 4px",marginBottom:16,border:"1px solid #DCEDC8"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#33691E",marginBottom:12}}>金額</div>
      <Lb label="案件種別"><select style={{...is,cursor:"pointer"}} value={f.caseType||"取材編"} onChange={e=>{s("caseType",e.target.value);s("itoManual",false)}}><option value="取材編">取材編（自動計算）</option><option value="社長出演編">社長出演編（自動計算）</option><option value="カスタム">カスタム（手入力）</option></select></Lb>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Lb label="案件金額（税抜）"><div style={{position:"relative"}}><span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"#78909C"}}>¥</span><input style={{...is,paddingLeft:28}} inputMode="numeric" value={fn(f.amount)} onChange={e=>s("amount",e.target.value.replace(/[^\d]/g,""))} placeholder="0"/></div></Lb>
        <Lb label="いとちゃん取り分"><div style={{position:"relative"}}><span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"#78909C"}}>¥</span><input style={{...is,paddingLeft:28}} inputMode="numeric" value={fn(f.itoShare)} onChange={e=>{s("itoShare",e.target.value.replace(/[^\d]/g,""));s("itoManual",true)}} placeholder="0"/></div>{!f.itoManual&&f.caseType!=="カスタム"&&<div style={{fontSize:10,color:"#558B2F",marginTop:4,fontWeight:600}}>● 自動計算中</div>}{f.itoManual&&f.caseType!=="カスタム"&&<button onClick={()=>s("itoManual",false)} style={{marginTop:4,fontSize:10,color:"#1E88E5",background:"none",border:"none",cursor:"pointer",textDecoration:"underline",padding:0}}>自動計算に戻す</button>}</Lb>
      </div>
      {amt>0&&<div style={{fontSize:12,color:"#546E7A",marginBottom:12,padding:"8px 10px",background:"#fff",borderRadius:8,display:"flex",justifyContent:"space-between"}}><span>KS One</span><span style={{fontWeight:700,color:"#33691E"}}>¥{(amt-ito).toLocaleString()}</span></div>}
      <label style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#fff",borderRadius:10,border:"1.5px solid #DCEDC8",cursor:"pointer",marginBottom:16}}><input type="checkbox" checked={!!f.invoiceSubmitted} onChange={e=>s("invoiceSubmitted",e.target.checked)} style={{width:18,height:18,cursor:"pointer",accentColor:"#33691E"}}/><span style={{fontSize:13,fontWeight:600,color:"#33691E"}}>請求書提出済</span></label>
    </div>
    <div style={{background:"#F8FAFB",borderRadius:12,padding:"16px 16px 4px",marginBottom:16,border:"1px solid #ECEFF1"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#37474F",marginBottom:12}}>スケジュール</div>
      <Lb label="取材/撮影"><div style={{display:"flex",gap:8}}><select style={{...is,width:"auto",minWidth:80}} value={f.shootType} onChange={e=>s("shootType",e.target.value)}><option value="取材">取材</option><option value="撮影">撮影</option></select><input style={{...is,flex:1}} type="date" value={f.shootDate} onChange={e=>s("shootDate",e.target.value)}/><input style={{...is,width:110}} type="time" value={f.shootTime||""} onChange={e=>s("shootTime",e.target.value)}/></div></Lb>
      <Lb label="配信（公開）日"><input style={is} type="date" value={f.publishDate} onChange={e=>s("publishDate",e.target.value)}/></Lb>
    </div>
    <div style={{background:"#FFF8F0",borderRadius:12,padding:"16px 16px 4px",marginBottom:16,border:"1px solid #FFE0B2"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#E65100",marginBottom:12}}>次のアクション</div>
      <Lb label="内容"><input style={is} value={f.nextAction} onChange={e=>s("nextAction",e.target.value)} placeholder="例：原稿確認依頼"/></Lb>
      <Lb label="期限"><input style={is} type="date" value={f.nextActionDeadline} onChange={e=>s("nextActionDeadline",e.target.value)}/></Lb>
      <Lb label="メモ"><textarea style={{...is,minHeight:50,resize:"vertical"}} value={f.nextActionMemo||""} onChange={e=>s("nextActionMemo",e.target.value)} placeholder="補足"/></Lb>
      {f.nextAction&&<button onClick={completeNow} style={{padding:"8px 16px",borderRadius:10,border:"1.5px solid #4CAF50",background:"#E8F5E9",color:"#1B5E20",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12}}>✓ このアクションを完了してログに記録</button>}
    </div>
    {f.actionLog&&f.actionLog.length>0&&<div style={{background:"#F5F5F5",borderRadius:12,padding:"16px 16px 8px",marginBottom:16,border:"1px solid #E0E0E0"}}><div style={{fontSize:12,fontWeight:700,color:"#546E7A",marginBottom:10}}>完了したアクション ({f.actionLog.length}件)</div>{f.actionLog.slice().reverse().map((log,i)=><div key={i} style={{padding:"8px 12px",background:"#fff",borderRadius:8,marginBottom:6,border:"1px solid #ECEFF1"}}><div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"space-between"}}><span style={{fontSize:13,fontWeight:600,color:"#37474F"}}><span style={{color:"#4CAF50",marginRight:4}}>✓</span>{log.action}</span><span style={{fontSize:10,color:"#B0BEC5",whiteSpace:"nowrap"}}>{fd(log.completedAt)}</span></div>{log.memo&&<div style={{fontSize:11,color:"#90A4AE",marginTop:2}}>{log.memo}</div>}</div>)}</div>}
    <Lb label="メモ"><textarea style={{...is,minHeight:70,resize:"vertical"}} value={f.memo} onChange={e=>s("memo",e.target.value)} placeholder="備考"/></Lb>
    <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
      <button onClick={onCancel} style={{padding:"10px 22px",borderRadius:10,border:"1.5px solid #CFD8DC",background:"#fff",fontSize:14,cursor:"pointer",color:"#546E7A"}}>キャンセル</button>
      <button onClick={()=>f.name.trim()&&onSave(f)} disabled={!f.name.trim()} style={{padding:"10px 28px",borderRadius:10,border:"none",background:f.name.trim()?"#1A2A3A":"#B0BEC5",color:"#fff",fontSize:14,fontWeight:600,cursor:f.name.trim()?"pointer":"default"}}>保存</button>
    </div>
  </div>;
}

function CC({c,onEdit,onDel,onDragStart,onDrop,onDragEnd,isDragging,dragOver,onCompleteAction}){
  const amt=pa(c.amount),ito=pa(c.itoShare);
  const isMobile="ontouchstart"in window;
  return <div><div draggable={!isMobile} onDragStart={e=>{e.dataTransfer.effectAllowed="move";onDragStart&&onDragStart(c.id)}} onDragOver={e=>{e.preventDefault();onDrop&&onDrop(c.id,"over")}} onDragLeave={()=>onDrop&&onDrop(c.id,"leave")} onDrop={e=>{e.preventDefault();onDrop&&onDrop(c.id,"drop")}} onDragEnd={onDragEnd} style={{background:"#fff",borderRadius:14,padding:"18px 20px",marginBottom:dragOver?0:10,border:isDragging?"2px dashed #42A5F5":"1px solid #ECEFF1",cursor:isMobile?"pointer":"grab",opacity:isDragging?.4:1,transition:"opacity 0.2s, margin 0.15s"}} onClick={()=>onEdit(c)}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
          <span style={{fontSize:15,fontWeight:700,color:"#1A2A3A"}}>{c.name}</span>
          <SB s={c.status}/>
          {c.invoiceSubmitted&&<span style={{fontSize:11,fontWeight:600,color:"#1B5E20",background:"#E8F5E9",padding:"2px 10px",borderRadius:20}}>✓ 請求書提出済</span>}
        </div>
        {c.client&&<div style={{fontSize:13,color:"#78909C",marginBottom:4}}>{c.client}</div>}
        <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap",marginTop:4}}>
          {c.assignee&&<span style={{fontSize:12,color:"#546E7A"}}>{c.assignee}</span>}
          {c.deadline&&<span style={{fontSize:12,color:"#546E7A"}}>{fd(c.deadline)} <DB d={c.deadline}/></span>}
        </div>
        {amt>0&&<div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginTop:4}}><span style={{fontSize:12,color:"#33691E",fontWeight:600}}>¥{amt.toLocaleString()}</span>{ito>0&&<span style={{fontSize:11,color:"#78909C"}}>（いとちゃん ¥{ito.toLocaleString()} / KS One ¥{(amt-ito).toLocaleString()}）</span>}</div>}
        {(c.shootDate||c.publishDate)&&<div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginTop:10,paddingTop:10,borderTop:"1px dashed #ECEFF1"}}>{c.shootDate&&<span style={{fontSize:14,fontWeight:800,color:"#3949AB",background:"#E8EAF6",padding:"6px 14px",borderRadius:12,border:"1px solid #C5CAE9"}}>{c.shootType||"取材"} {fd(c.shootDate)}{c.shootTime?" "+c.shootTime:""}</span>}{c.publishDate&&<span style={{fontSize:14,fontWeight:800,color:"#00897B",background:"#E0F2F1",padding:"6px 14px",borderRadius:12,border:"1px solid #B2DFDB"}}>配信 {fd(c.publishDate)}</span>}</div>}
        {c.nextAction&&<div style={{marginTop:8,padding:"8px 12px",background:"#FFF8F0",borderRadius:10,border:"1px solid #FFE0B2"}}><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontSize:12,fontWeight:700,color:"#E65100"}}>次：</span><span style={{fontSize:12,fontWeight:600,color:"#37474F",flex:1,minWidth:0}}>{c.nextAction}</span>{c.nextActionDeadline&&<span style={{fontSize:11,color:"#78909C"}}>{fd(c.nextActionDeadline)} <DB d={c.nextActionDeadline}/></span>}<button onClick={e=>{e.stopPropagation();onCompleteAction&&onCompleteAction(c.id)}} style={{padding:"3px 10px",borderRadius:8,border:"1.5px solid #4CAF50",background:"#E8F5E9",color:"#1B5E20",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>✓ 完了</button></div>{c.nextActionMemo&&<div style={{fontSize:11,color:"#90A4AE",marginTop:4,whiteSpace:"pre-line",maxHeight:36,overflow:"hidden",paddingLeft:0}}>{c.nextActionMemo}</div>}</div>}
        {c.actionLog&&c.actionLog.length>0&&<div style={{marginTop:6}}>{c.actionLog.slice(-3).map((log,i)=><div key={i} style={{fontSize:11,color:"#78909C",display:"flex",gap:6,alignItems:"center",marginTop:2}}><span style={{color:"#4CAF50"}}>✓</span><span>{log.action}</span><span style={{color:"#B0BEC5",fontSize:10}}>{fd(log.completedAt)}</span></div>)}{c.actionLog.length>3&&<div style={{fontSize:10,color:"#B0BEC5",marginTop:2}}>他{c.actionLog.length-3}件</div>}</div>}
        {c.memo&&<div style={{fontSize:12,color:"#90A4AE",marginTop:6,whiteSpace:"pre-line",maxHeight:40,overflow:"hidden"}}>{c.memo}</div>}
      </div>
      <button onClick={e=>{e.stopPropagation();onDel(c.id)}} style={{background:"none",border:"none",cursor:"pointer",padding:4,color:"#B0BEC5",flexShrink:0}}>✕</button>
    </div>
  </div>{dragOver&&<div style={{height:4,borderRadius:2,background:"#42A5F5",margin:"4px 0 10px",transition:"all 0.15s"}}/>}</div>;
}

function SemForm({init,onSave,onCancel}){
  const df={name:"",client:"",status:"検討中",eventDate:"",eventTime:"",venue:"",amount:"",invoiceSubmitted:false,nextAction:"",nextActionDeadline:"",nextActionMemo:"",memo:"",actionLog:[]};
  const[f,sF]=useState(init||df);
  useEffect(()=>{sF(init||df)},[init]);
  const s=(k,v)=>sF(p=>({...p,[k]:v}));
  const completeNow=()=>{if(!f.nextAction)return;const log={action:f.nextAction,deadline:f.nextActionDeadline||"",memo:f.nextActionMemo||"",completedAt:new Date().toISOString()};sF(p=>({...p,actionLog:[...(p.actionLog||[]),log],nextAction:"",nextActionDeadline:"",nextActionMemo:""}))};
  return <div>
    <h2 style={{fontSize:20,fontWeight:700,color:"#1A2A3A",marginBottom:24}}>{init?"セミナーを編集":"新規セミナー"}</h2>
    <Lb label="セミナー名 *"><input style={is} value={f.name} onChange={e=>s("name",e.target.value)} placeholder="例：○○社IRセミナー" autoFocus/></Lb>
    <Lb label="クライアント名"><input style={is} value={f.client} onChange={e=>s("client",e.target.value)} placeholder="例：株式会社○○"/></Lb>
    <Lb label="ステータス"><select style={{...is,cursor:"pointer"}} value={f.status} onChange={e=>s("status",e.target.value)}>{STS.map(x=><option key={x}>{x}</option>)}</select></Lb>
    <div style={{background:"#EDE7F6",borderRadius:12,padding:"16px 16px 4px",marginBottom:16,border:"1px solid #D1C4E9"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#4527A0",marginBottom:12}}>開催情報</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Lb label="開催日"><input style={is} type="date" value={f.eventDate} onChange={e=>s("eventDate",e.target.value)}/></Lb>
        <Lb label="時間（任意）"><input style={is} type="time" value={f.eventTime||""} onChange={e=>s("eventTime",e.target.value)}/></Lb>
      </div>
      <Lb label="会場"><input style={is} value={f.venue} onChange={e=>s("venue",e.target.value)} placeholder="例：東京ミッドタウン"/></Lb>
    </div>
    <div style={{background:"#F1F8E9",borderRadius:12,padding:"16px 16px 4px",marginBottom:16,border:"1px solid #DCEDC8"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#33691E",marginBottom:12}}>金額・請求</div>
      <Lb label="セミナー金額（税抜）"><div style={{position:"relative"}}><span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"#78909C"}}>¥</span><input style={{...is,paddingLeft:28}} inputMode="numeric" value={fn(f.amount)} onChange={e=>s("amount",e.target.value.replace(/[^\d]/g,""))} placeholder="0"/></div></Lb>
      <label style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#fff",borderRadius:10,border:"1.5px solid #DCEDC8",cursor:"pointer",marginBottom:16}}><input type="checkbox" checked={!!f.invoiceSubmitted} onChange={e=>s("invoiceSubmitted",e.target.checked)} style={{width:18,height:18,cursor:"pointer",accentColor:"#33691E"}}/><span style={{fontSize:13,fontWeight:600,color:"#33691E"}}>請求書提出済</span></label>
    </div>
    <div style={{background:"#FFF8F0",borderRadius:12,padding:"16px 16px 4px",marginBottom:16,border:"1px solid #FFE0B2"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#E65100",marginBottom:12}}>次のアクション</div>
      <Lb label="内容"><input style={is} value={f.nextAction} onChange={e=>s("nextAction",e.target.value)} placeholder="例：会場予約"/></Lb>
      <Lb label="期限"><input style={is} type="date" value={f.nextActionDeadline} onChange={e=>s("nextActionDeadline",e.target.value)}/></Lb>
      <Lb label="メモ"><textarea style={{...is,minHeight:50,resize:"vertical"}} value={f.nextActionMemo||""} onChange={e=>s("nextActionMemo",e.target.value)} placeholder="補足"/></Lb>
      {f.nextAction&&<button onClick={completeNow} style={{padding:"8px 16px",borderRadius:10,border:"1.5px solid #4CAF50",background:"#E8F5E9",color:"#1B5E20",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12}}>✓ このアクションを完了してログに記録</button>}
    </div>
    {f.actionLog&&f.actionLog.length>0&&<div style={{background:"#F5F5F5",borderRadius:12,padding:"16px 16px 8px",marginBottom:16,border:"1px solid #E0E0E0"}}><div style={{fontSize:12,fontWeight:700,color:"#546E7A",marginBottom:10}}>完了したアクション ({f.actionLog.length}件)</div>{f.actionLog.slice().reverse().map((log,i)=><div key={i} style={{padding:"8px 12px",background:"#fff",borderRadius:8,marginBottom:6,border:"1px solid #ECEFF1"}}><div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"space-between"}}><span style={{fontSize:13,fontWeight:600,color:"#37474F"}}><span style={{color:"#4CAF50",marginRight:4}}>✓</span>{log.action}</span><span style={{fontSize:10,color:"#B0BEC5",whiteSpace:"nowrap"}}>{fd(log.completedAt)}</span></div>{log.memo&&<div style={{fontSize:11,color:"#90A4AE",marginTop:2}}>{log.memo}</div>}</div>)}</div>}
    <Lb label="メモ"><textarea style={{...is,minHeight:70,resize:"vertical"}} value={f.memo} onChange={e=>s("memo",e.target.value)} placeholder="備考"/></Lb>
    <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
      <button onClick={onCancel} style={{padding:"10px 22px",borderRadius:10,border:"1.5px solid #CFD8DC",background:"#fff",fontSize:14,cursor:"pointer",color:"#546E7A"}}>キャンセル</button>
      <button onClick={()=>f.name.trim()&&onSave(f)} disabled={!f.name.trim()} style={{padding:"10px 28px",borderRadius:10,border:"none",background:f.name.trim()?"#4527A0":"#B0BEC5",color:"#fff",fontSize:14,fontWeight:600,cursor:f.name.trim()?"pointer":"default"}}>保存</button>
    </div>
  </div>;
}

function SC2({c,onEdit,onDel,onCompleteAction}){
  const amt=pa(c.amount);
  return <div style={{background:"#fff",borderRadius:14,padding:"18px 20px",marginBottom:10,border:"1px solid #EDE7F6",cursor:"pointer"}} onClick={()=>onEdit(c)}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
          <span style={{fontSize:15,fontWeight:700,color:"#1A2A3A"}}>{c.name}</span>
          <SB s={c.status}/>
          {c.invoiceSubmitted&&<span style={{fontSize:11,fontWeight:600,color:"#1B5E20",background:"#E8F5E9",padding:"2px 10px",borderRadius:20}}>✓ 請求書提出済</span>}
        </div>
        {c.client&&<div style={{fontSize:13,color:"#78909C",marginBottom:4}}>{c.client}</div>}
        <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap",marginTop:4}}>
          {c.eventDate&&<span style={{fontSize:12,color:"#4527A0",fontWeight:600}}>{fd(c.eventDate)}{c.eventTime?" "+c.eventTime:""} <DB d={c.eventDate}/></span>}
          {c.venue&&<span style={{fontSize:12,color:"#546E7A"}}>{c.venue}</span>}
        </div>
        {amt>0&&<div style={{marginTop:4}}><span style={{fontSize:12,color:"#33691E",fontWeight:600}}>¥{amt.toLocaleString()}</span></div>}
        {c.nextAction&&<div style={{marginTop:8,padding:"8px 12px",background:"#FFF8F0",borderRadius:10,border:"1px solid #FFE0B2"}}><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontSize:12,fontWeight:700,color:"#E65100"}}>次：</span><span style={{fontSize:12,fontWeight:600,color:"#37474F",flex:1,minWidth:0}}>{c.nextAction}</span>{c.nextActionDeadline&&<span style={{fontSize:11,color:"#78909C"}}>{fd(c.nextActionDeadline)} <DB d={c.nextActionDeadline}/></span>}<button onClick={e=>{e.stopPropagation();onCompleteAction&&onCompleteAction(c.id)}} style={{padding:"3px 10px",borderRadius:8,border:"1.5px solid #4CAF50",background:"#E8F5E9",color:"#1B5E20",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>✓ 完了</button></div>{c.nextActionMemo&&<div style={{fontSize:11,color:"#90A4AE",marginTop:4,whiteSpace:"pre-line",maxHeight:36,overflow:"hidden"}}>{c.nextActionMemo}</div>}</div>}
        {c.actionLog&&c.actionLog.length>0&&<div style={{marginTop:6}}>{c.actionLog.slice(-3).map((log,i)=><div key={i} style={{fontSize:11,color:"#78909C",display:"flex",gap:6,alignItems:"center",marginTop:2}}><span style={{color:"#4CAF50"}}>✓</span><span>{log.action}</span><span style={{color:"#B0BEC5",fontSize:10}}>{fd(log.completedAt)}</span></div>)}{c.actionLog.length>3&&<div style={{fontSize:10,color:"#B0BEC5",marginTop:2}}>他{c.actionLog.length-3}件</div>}</div>}
      </div>
      <button onClick={e=>{e.stopPropagation();onDel(c.id)}} style={{background:"none",border:"none",cursor:"pointer",padding:4,color:"#B0BEC5",flexShrink:0}}>✕</button>
    </div>
  </div>;
}

function CustForm({init,onSave,onCancel,cases,sems}){
  const df={name:"",contactName:"",contactRole:"",email:"",phone:"",status:"新規",nextApproach:"",nextApproachDeadline:"",nextApproachMemo:"",meetings:[],publishes:[],memo:""};
  const[f,sF]=useState(init||df);
  useEffect(()=>{sF(init||df)},[init]);
  const s=(k,v)=>sF(p=>({...p,[k]:v}));
  const td=new Date().toISOString().slice(0,10);
  const[nm,sNm]=useState({date:td,title:"",memo:""});
  const addMeeting=()=>{if(!nm.title.trim())return;sF(p=>({...p,meetings:[...(p.meetings||[]),{id:uid(),...nm}]}));sNm({date:td,title:"",memo:""})};
  const delMeeting=id=>sF(p=>({...p,meetings:(p.meetings||[]).filter(m=>m.id!==id)}));
  const[np,sNp]=useState({date:td,title:"",url:"",views:"",memo:""});
  const addPublish=()=>{if(!np.title.trim())return;sF(p=>({...p,publishes:[...(p.publishes||[]),{id:uid(),...np}]}));sNp({date:td,title:"",url:"",views:"",memo:""})};
  const delPublish=id=>sF(p=>({...p,publishes:(p.publishes||[]).filter(m=>m.id!==id)}));
  const updPublish=(id,k,v)=>sF(p=>({...p,publishes:(p.publishes||[]).map(m=>m.id===id?{...m,[k]:v}:m)}));
  const related=(cases||[]).filter(c=>c.client&&f.name&&c.client.trim()===f.name.trim()).sort((a,b)=>(b.publishDate||"").localeCompare(a.publishDate||""));
  const relSems=(sems||[]).filter(c=>c.client&&f.name&&c.client.trim()===f.name.trim()).sort((a,b)=>(b.eventDate||"").localeCompare(a.eventDate||""));
  const meetings=(f.meetings||[]).slice().sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const publishes=(f.publishes||[]).slice().sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const totalViews=publishes.reduce((s,p)=>s+(parseInt(String(p.views||"").replace(/,/g,""),10)||0),0);
  return <div>
    <h2 style={{fontSize:20,fontWeight:700,color:"#1A2A3A",marginBottom:24}}>{init?"顧客を編集":"新規顧客"}</h2>
    <Lb label="会社名 *"><input style={is} value={f.name} onChange={e=>s("name",e.target.value)} placeholder="例：株式会社○○" autoFocus/></Lb>
    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12}}>
      <Lb label="担当者名"><input style={is} value={f.contactName} onChange={e=>s("contactName",e.target.value)} placeholder="山田太郎"/></Lb>
      <Lb label="役職"><input style={is} value={f.contactRole} onChange={e=>s("contactRole",e.target.value)} placeholder="部長"/></Lb>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <Lb label="メール"><input style={is} type="email" value={f.email} onChange={e=>s("email",e.target.value)} placeholder="example@company.com"/></Lb>
      <Lb label="電話"><input style={is} value={f.phone} onChange={e=>s("phone",e.target.value)} placeholder="03-0000-0000"/></Lb>
    </div>
    <Lb label="ステータス"><select style={{...is,cursor:"pointer"}} value={f.status} onChange={e=>s("status",e.target.value)}>{CST.map(x=><option key={x}>{x}</option>)}</select></Lb>
    <div style={{background:"#E3F2FD",borderRadius:12,padding:"16px 16px 4px",marginBottom:16,border:"1px solid #BBDEFB"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#0D47A1",marginBottom:12}}>今後のアプローチ</div>
      <Lb label="内容"><input style={is} value={f.nextApproach} onChange={e=>s("nextApproach",e.target.value)} placeholder="例：新企画の提案"/></Lb>
      <Lb label="期限"><input style={is} type="date" value={f.nextApproachDeadline} onChange={e=>s("nextApproachDeadline",e.target.value)}/></Lb>
      <Lb label="メモ"><textarea style={{...is,minHeight:50,resize:"vertical"}} value={f.nextApproachMemo||""} onChange={e=>s("nextApproachMemo",e.target.value)} placeholder="補足"/></Lb>
    </div>
    <div style={{background:"#FFF3E0",borderRadius:12,padding:"16px",marginBottom:16,border:"1px solid #FFE0B2"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#E65100",marginBottom:12}}>打ち合わせログ ({meetings.length}件)</div>
      {meetings.map(m=><div key={m.id} style={{padding:"10px 12px",background:"#fff",borderRadius:8,marginBottom:8,border:"1px solid #ECEFF1"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <span style={{fontSize:12,color:"#E65100",fontWeight:700}}>{m.date?fd(m.date):""}</span>
          <button onClick={()=>delMeeting(m.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#B0BEC5",fontSize:12}}>✕</button>
        </div>
        <div style={{fontSize:13,fontWeight:600,color:"#37474F"}}>{m.title}</div>
        {m.memo&&<div style={{fontSize:11,color:"#90A4AE",marginTop:4,whiteSpace:"pre-line"}}>{m.memo}</div>}
      </div>)}
      <div style={{display:"grid",gridTemplateColumns:"140px 1fr",gap:8,marginBottom:8}}>
        <input style={is} type="date" value={nm.date} onChange={e=>sNm({...nm,date:e.target.value})}/>
        <input style={is} value={nm.title} onChange={e=>sNm({...nm,title:e.target.value})} placeholder="タイトル"/>
      </div>
      <textarea style={{...is,minHeight:40,resize:"vertical",marginBottom:8}} value={nm.memo} onChange={e=>sNm({...nm,memo:e.target.value})} placeholder="メモ"/>
      <button onClick={addMeeting} disabled={!nm.title.trim()} style={{padding:"8px 16px",borderRadius:8,border:"none",background:nm.title.trim()?"#E65100":"#B0BEC5",color:"#fff",fontSize:12,fontWeight:700,cursor:nm.title.trim()?"pointer":"default"}}>+ 打ち合わせを追加</button>
    </div>
    <div style={{background:"#E8F5E9",borderRadius:12,padding:"16px",marginBottom:16,border:"1px solid #C8E6C9"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#1B5E20",marginBottom:12,display:"flex",justifyContent:"space-between"}}>
        <span>公開ログ ({publishes.length}件)</span>
        {totalViews>0&&<span style={{color:"#33691E"}}>合計再生 {totalViews.toLocaleString()}回</span>}
      </div>
      {publishes.map(m=><div key={m.id} style={{padding:"10px 12px",background:"#fff",borderRadius:8,marginBottom:8,border:"1px solid #ECEFF1"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <span style={{fontSize:12,color:"#1B5E20",fontWeight:700}}>{m.date?fd(m.date):""}</span>
          <button onClick={()=>delPublish(m.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#B0BEC5",fontSize:12}}>✕</button>
        </div>
        <div style={{fontSize:13,fontWeight:600,color:"#37474F",marginBottom:4}}>{m.title}</div>
        {m.url&&<a href={m.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:11,color:"#1976D2",wordBreak:"break-all",display:"block",marginBottom:4}}>{m.url}</a>}
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
          <span style={{fontSize:11,color:"#546E7A",fontWeight:600,whiteSpace:"nowrap"}}>再生回数:</span>
          <input style={{...is,flex:1,padding:"6px 10px",fontSize:12}} inputMode="numeric" value={fn(m.views)} onChange={e=>updPublish(m.id,"views",e.target.value.replace(/[^\d]/g,""))} placeholder="0"/>
        </div>
        {m.memo&&<div style={{fontSize:11,color:"#90A4AE",marginTop:4,whiteSpace:"pre-line"}}>{m.memo}</div>}
      </div>)}
      <div style={{display:"grid",gridTemplateColumns:"140px 1fr",gap:8,marginBottom:8}}>
        <input style={is} type="date" value={np.date} onChange={e=>sNp({...np,date:e.target.value})}/>
        <input style={is} value={np.title} onChange={e=>sNp({...np,title:e.target.value})} placeholder="タイトル"/>
      </div>
      <input style={{...is,marginBottom:8}} value={np.url} onChange={e=>sNp({...np,url:e.target.value})} placeholder="URL (任意)"/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:8,marginBottom:8}}>
        <input style={is} inputMode="numeric" value={fn(np.views)} onChange={e=>sNp({...np,views:e.target.value.replace(/[^\d]/g,"")})} placeholder="再生数"/>
        <input style={is} value={np.memo} onChange={e=>sNp({...np,memo:e.target.value})} placeholder="メモ"/>
      </div>
      <button onClick={addPublish} disabled={!np.title.trim()} style={{padding:"8px 16px",borderRadius:8,border:"none",background:np.title.trim()?"#1B5E20":"#B0BEC5",color:"#fff",fontSize:12,fontWeight:700,cursor:np.title.trim()?"pointer":"default"}}>+ 公開を追加</button>
    </div>
    {(related.length>0||relSems.length>0)&&<div style={{background:"#F5F5F5",borderRadius:12,padding:"16px",marginBottom:16,border:"1px solid #E0E0E0"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#546E7A",marginBottom:10}}>関連案件・セミナー（クライアント名一致）</div>
      {related.map(c=><div key={c.id} style={{padding:"8px 12px",background:"#fff",borderRadius:8,marginBottom:6,border:"1px solid #ECEFF1",fontSize:12}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{fontWeight:700,color:"#37474F"}}>📋 {c.name}</span>
          <SB s={c.status}/>
          {c.publishDate&&<span style={{fontSize:11,color:"#00897B",fontWeight:600}}>配信 {fd(c.publishDate)}</span>}
        </div>
      </div>)}
      {relSems.map(c=><div key={c.id} style={{padding:"8px 12px",background:"#fff",borderRadius:8,marginBottom:6,border:"1px solid #EDE7F6",fontSize:12}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{fontWeight:700,color:"#4527A0"}}>🎤 {c.name}</span>
          <SB s={c.status}/>
          {c.eventDate&&<span style={{fontSize:11,color:"#4527A0",fontWeight:600}}>{fd(c.eventDate)}</span>}
        </div>
      </div>)}
    </div>}
    <Lb label="メモ"><textarea style={{...is,minHeight:70,resize:"vertical"}} value={f.memo} onChange={e=>s("memo",e.target.value)} placeholder="備考"/></Lb>
    <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
      <button onClick={onCancel} style={{padding:"10px 22px",borderRadius:10,border:"1.5px solid #CFD8DC",background:"#fff",fontSize:14,cursor:"pointer",color:"#546E7A"}}>キャンセル</button>
      <button onClick={()=>f.name.trim()&&onSave(f)} disabled={!f.name.trim()} style={{padding:"10px 28px",borderRadius:10,border:"none",background:f.name.trim()?"#00695C":"#B0BEC5",color:"#fff",fontSize:14,fontWeight:600,cursor:f.name.trim()?"pointer":"default"}}>保存</button>
    </div>
  </div>;
}

function CC3({c,onEdit,onDel,caseCount,totalViews}){
  const sc=CSC[c.status]||CSC["新規"];
  return <div onClick={()=>onEdit(c)} style={{background:"#fff",borderRadius:14,padding:"18px 20px",marginBottom:10,border:"1px solid #E0F2F1",cursor:"pointer"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
          <span style={{fontSize:15,fontWeight:700,color:"#1A2A3A"}}>{c.name}</span>
          <span style={{fontSize:11,fontWeight:600,color:sc.t,background:sc.bg,padding:"2px 10px",borderRadius:20,display:"inline-flex",alignItems:"center",gap:4}}><span style={{width:6,height:6,borderRadius:"50%",background:sc.d,display:"inline-block"}}/>{c.status}</span>
        </div>
        {(c.contactName||c.contactRole)&&<div style={{fontSize:12,color:"#78909C",marginBottom:4}}>{c.contactRole?c.contactRole+" ":""}{c.contactName}</div>}
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:4}}>
          {c.email&&<span style={{fontSize:11,color:"#546E7A"}}>✉ {c.email}</span>}
          {c.phone&&<span style={{fontSize:11,color:"#546E7A"}}>☎ {c.phone}</span>}
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
          {caseCount>0&&<span style={{fontSize:11,color:"#1A2A3A",background:"#ECEFF1",padding:"3px 9px",borderRadius:10,fontWeight:600}}>案件 {caseCount}件</span>}
          {c.meetings&&c.meetings.length>0&&<span style={{fontSize:11,color:"#E65100",background:"#FFF3E0",padding:"3px 9px",borderRadius:10,fontWeight:600}}>打合せ {c.meetings.length}回</span>}
          {c.publishes&&c.publishes.length>0&&<span style={{fontSize:11,color:"#1B5E20",background:"#E8F5E9",padding:"3px 9px",borderRadius:10,fontWeight:600}}>公開 {c.publishes.length}本</span>}
          {totalViews>0&&<span style={{fontSize:11,color:"#1976D2",background:"#E3F2FD",padding:"3px 9px",borderRadius:10,fontWeight:600}}>再生 {totalViews.toLocaleString()}</span>}
        </div>
        {c.nextApproach&&<div style={{marginTop:8,padding:"8px 12px",background:"#E3F2FD",borderRadius:10,border:"1px solid #BBDEFB"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:12,fontWeight:700,color:"#0D47A1"}}>次:</span>
            <span style={{fontSize:12,fontWeight:600,color:"#37474F",flex:1,minWidth:0}}>{c.nextApproach}</span>
            {c.nextApproachDeadline&&<span style={{fontSize:11,color:"#78909C"}}>{fd(c.nextApproachDeadline)} <DB d={c.nextApproachDeadline}/></span>}
          </div>
        </div>}
        {c.memo&&<div style={{fontSize:12,color:"#90A4AE",marginTop:6,whiteSpace:"pre-line",maxHeight:40,overflow:"hidden"}}>{c.memo}</div>}
      </div>
      <button onClick={e=>{e.stopPropagation();onDel(c.id)}} style={{background:"none",border:"none",cursor:"pointer",padding:4,color:"#B0BEC5",flexShrink:0}}>✕</button>
    </div>
  </div>;
}

function ActList({items,onEdit,onCompleteAction}){
  if(!items.length)return <div style={{textAlign:"center",padding:"60px 20px",color:"#B0BEC5"}}>未完了のアクションはありません。</div>;
  return <div>{items.map(c=>{const dy=dt(c.nextActionDeadline);let rb="#ECEFF1";if(dy!==null&&dy<=0)rb="#FFCDD2";else if(dy!==null&&dy<=3)rb="#FFE0B2";return <div key={c.id} onClick={()=>onEdit(c)} style={{background:"#fff",borderRadius:12,padding:"14px 18px",marginBottom:8,border:"1.5px solid "+rb,cursor:"pointer"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}><div style={{display:"flex",alignItems:"center",gap:8}}>{c.nextActionDeadline?<span style={{fontSize:14,fontWeight:800,color:dy<0?"#C62828":dy<=3?"#E65100":"#37474F"}}>{fd(c.nextActionDeadline)}</span>:<span style={{fontSize:13,color:"#B0BEC5",fontStyle:"italic"}}>期限未設定</span>}<DB d={c.nextActionDeadline}/></div><div style={{display:"flex",alignItems:"center",gap:6}}><SB s={c.status}/><button onClick={e=>{e.stopPropagation();onCompleteAction&&onCompleteAction(c.id)}} style={{padding:"3px 10px",borderRadius:8,border:"1.5px solid #4CAF50",background:"#E8F5E9",color:"#1B5E20",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>✓ 完了</button></div></div><div style={{fontSize:13,fontWeight:600,color:"#37474F",marginBottom:4}}>{c.nextAction}</div>{c.nextActionMemo&&<div style={{fontSize:11,color:"#90A4AE",marginBottom:4,whiteSpace:"pre-line",maxHeight:36,overflow:"hidden"}}>{c.nextActionMemo}</div>}<div style={{fontSize:12,color:"#78909C"}}>{c.name}{c.client?" — "+c.client:""}</div></div>})}</div>;
}

function DataP({onClose}){
  const fr=useRef(null);const[msg,sM]=useState(null);const[imp,sI]=useState(false);
  const td=new Date().toISOString().slice(0,10).replace(/-/g,"");
  const dl=(d,n)=>{const b=new Blob([JSON.stringify(d,null,2)],{type:"application/json"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=n;a.click();URL.revokeObjectURL(u)};
  const ex=async()=>{try{const[cSnap,sSnap,uSnap,tSnap]=await Promise.all([getDocs(collection(db,"cases")),getDocs(collection(db,"seminars")),getDocs(collection(db,"customers")),getDocs(collection(db,"tasks"))]);const c=cSnap.docs.map(d=>({...d.data(),id:d.id}));const s=sSnap.docs.map(d=>({...d.data(),id:d.id}));const u=uSnap.docs.map(d=>({...d.data(),id:d.id}));const tk=tSnap.docs.map(d=>({...d.data(),id:d.id}));dl({version:3,exportedAt:new Date().toISOString(),cases:c,seminars:s,customers:u,tasks:tk},"ks1-backup-"+td+".json");sM({ok:true,t:"バックアップ保存（案件"+c.length+"・セミナー"+s.length+"・顧客"+u.length+"・タスク"+tk.length+"）"})}catch(e){sM({ok:false,t:"エクスポート失敗"})}};
  const hf=async e=>{const file=e.target.files&&e.target.files[0];if(!file)return;sI(true);try{const txt=await file.text();const d=JSON.parse(txt);if(!d.version){sM({ok:false,t:"非対応ファイル"});sI(false);return}let cc=0,sc=0,uc=0,tc=0;if(d.cases&&Array.isArray(d.cases)){for(const item of d.cases){await setDoc(doc(db,"cases",item.id),item)}cc=d.cases.length}if(d.seminars&&Array.isArray(d.seminars)){for(const item of d.seminars){await setDoc(doc(db,"seminars",item.id),item)}sc=d.seminars.length}if(d.customers&&Array.isArray(d.customers)){for(const item of d.customers){await setDoc(doc(db,"customers",item.id),item)}uc=d.customers.length}if(d.tasks&&Array.isArray(d.tasks)){for(const item of d.tasks){await setDoc(doc(db,"tasks",item.id),item)}tc=d.tasks.length}sM({ok:true,t:"インポート完了（案件"+cc+"・セミナー"+sc+"・顧客"+uc+"・タスク"+tc+"）"})}catch(e){sM({ok:false,t:"読み込み失敗"})}sI(false);if(fr.current)fr.current.value=""};
  const bs={padding:"10px 16px",borderRadius:10,border:"none",fontSize:13,fontWeight:600,cursor:"pointer",width:"100%",textAlign:"center"};
  return <div><h2 style={{fontSize:20,fontWeight:700,color:"#1A2A3A",marginBottom:8}}>データ管理</h2><p style={{fontSize:13,color:"#78909C",marginBottom:20}}>バックアップの保存・復元</p><button onClick={ex} style={{...bs,background:"#1A2A3A",color:"#fff",marginBottom:8}}>全データバックアップ（JSON）</button><input ref={fr} type="file" accept=".json" onChange={hf} style={{display:"none"}}/><button onClick={()=>fr.current&&fr.current.click()} disabled={imp} style={{...bs,background:"#fff",color:"#1A2A3A",border:"1.5px solid #CFD8DC",marginBottom:8}}>{imp?"読み込み中…":"バックアップから復元（JSON）"}</button><p style={{fontSize:11,color:"#B0BEC5",marginBottom:12}}>※既存データとマージされます</p>{msg&&<div style={{padding:"10px 14px",borderRadius:10,marginBottom:16,fontSize:13,background:msg.ok?"#E8F5E9":"#FFEBEE",color:msg.ok?"#1B5E20":"#C62828"}}>{msg.t}</div>}<button onClick={onClose} style={{...bs,background:"#F5F5F5",color:"#546E7A"}}>閉じる</button></div>;
}

function CaseMod(){
  const[cases,sC,ok]=useSt(CK);const[mo,sM]=useState(false);const[ed,sE]=useState(null);const[mk,sMk]=useState(0);const[dl,sD]=useState(null);const[vw,sV]=useState("cases");const[fs,sFs]=useState("すべて");const[q,sQ]=useState("");const[aq,sAq]=useState("");
  const opts=[...new Set(["Ken","Ito",...cases.map(c=>c.assignee).filter(Boolean)])];
  const save=f=>{if(ed){sC(p=>p.map(c=>c.id===ed.id?{...c,...f,updatedAt:new Date().toISOString()}:c))}else{const it={id:uid(),...f,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};sC(p=>{const ac=p.filter(c=>!isDone(c.status)),dn=p.filter(c=>isDone(c.status)),pd=it.publishDate||"9999-12-31";let idx=ac.length;for(let i=0;i<ac.length;i++){if(pd<=(ac[i].publishDate||"9999-12-31")){idx=i;break}}const na=[...ac];na.splice(idx,0,it);return[...na,...dn]})}sM(false);sE(null)};
  const completeAction=(id)=>{sC(p=>p.map(c=>{if(c.id!==id||!c.nextAction)return c;const log={action:c.nextAction,deadline:c.nextActionDeadline||"",memo:c.nextActionMemo||"",completedAt:new Date().toISOString()};return{...c,actionLog:[...(c.actionLog||[]),log],nextAction:"",nextActionDeadline:"",nextActionMemo:"",updatedAt:new Date().toISOString()}}));};
  const[dragId,sDragId]=useState(null);const[dragOverId,sDragOverId]=useState(null);const[sortBy,sSortBy]=useState("publishDate");
  const sortFn=(a,b)=>{const ka=a.status==="検討中"?1:0,kb=b.status==="検討中"?1:0;if(ka!==kb)return ka-kb;if(sortBy==="manual"){if(a.order!=null&&b.order!=null)return a.order-b.order;if(a.order!=null)return-1;if(b.order!=null)return 1;return(a.publishDate||"9999").localeCompare(b.publishDate||"9999")}const key=sortBy==="shootDate"?"shootDate":"publishDate";return(a[key]||"9999").localeCompare(b[key]||"9999")};
  const fil=cases.filter(c=>{if(isDone(c.status))return false;if(fs!=="すべて"&&c.status!==fs)return false;if(q)return(c.name+c.client+c.assignee+c.memo+(c.nextAction||"")).toLowerCase().includes(q.toLowerCase());return true}).sort(sortFn);
  const onDragStart=(id)=>sDragId(id);
  const handleDrop=(targetId,action)=>{if(action==="over"){if(dragId&&dragId!==targetId)sDragOverId(targetId);return}if(action==="leave"){sDragOverId(v=>v===targetId?null:v);return}if(action==="drop"){if(!dragId||dragId===targetId){sDragId(null);sDragOverId(null);return}const ids=fil.map(c=>c.id);const fromIdx=ids.indexOf(dragId);const toIdx=ids.indexOf(targetId);if(fromIdx<0||toIdx<0)return;ids.splice(fromIdx,1);ids.splice(toIdx,0,dragId);const orderMap=Object.fromEntries(ids.map((id,i)=>[id,i]));sC(p=>p.map(c=>orderMap[c.id]!=null?{...c,order:orderMap[c.id]}:c));sDragId(null);sDragOverId(null)}};
  const onDragEnd=()=>{sDragId(null);sDragOverId(null)};
  const cnt={total:cases.filter(c=>!isDone(c.status)).length,act:cases.filter(c=>c.status==="進行中").length,pend:cases.filter(c=>c.status==="確認待ち").length,done:cases.filter(c=>isDone(c.status)).length};
  const acts=cases.filter(c=>c.nextAction&&!isDone(c.status)).sort((a,b)=>(a.nextActionDeadline||"9999").localeCompare(b.nextActionDeadline||"9999"));
  const arch=cases.filter(c=>isDone(c.status)).filter(c=>!aq||(c.name+c.client+c.memo).toLowerCase().includes(aq.toLowerCase())).sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
  const itoMonths=(()=>{const tgt=cases.filter(c=>c.status!=="失注"&&pa(c.itoShare)>0);const grp={};for(const c of tgt){const m=c.publishDate?c.publishDate.slice(0,7):"未定";if(!grp[m])grp[m]=[];grp[m].push(c)}const keys=Object.keys(grp).sort((a,b)=>{if(a==="未定")return 1;if(b==="未定")return-1;return b.localeCompare(a)});return keys.map(k=>({month:k,items:grp[k].sort((a,b)=>(a.publishDate||"").localeCompare(b.publishDate||"")),totalAmt:grp[k].reduce((s,c)=>s+pa(c.amount),0),totalIto:grp[k].reduce((s,c)=>s+pa(c.itoShare),0)}))})();
  const itoTotal=itoMonths.reduce((s,g)=>s+g.totalIto,0);
  const exportCSV=()=>{const rows=[["月","案件名","クライアント","ステータス","撮影/取材","撮影日","撮影時間","配信日","案件金額(税抜)","いとちゃん取り分"]];for(const g of itoMonths){const ml=g.month==="未定"?"配信日未定":g.month;for(const c of g.items){rows.push([ml,c.name||"",c.client||"",c.status||"",c.shootType||"",c.shootDate?fd(c.shootDate):"",c.shootTime||"",c.publishDate?fd(c.publishDate):"",pa(c.amount),pa(c.itoShare)])}rows.push([ml+" 小計","","","","","","","",g.totalAmt,g.totalIto]);rows.push([])}rows.push(["総合計","","","","","","","",itoMonths.reduce((s,g)=>s+g.totalAmt,0),itoTotal]);const esc=v=>{const s=String(v??"");return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};const csv=rows.map(r=>r.map(esc).join(",")).join("\r\n");const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});const td=new Date().toISOString().slice(0,10).replace(/-/g,"");const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download="いとちゃん取り分_"+td+".csv";a.click();URL.revokeObjectURL(u)};
  const exportPrint=()=>{const td=new Date();const dStr=td.getFullYear()+"年"+(td.getMonth()+1)+"月"+td.getDate()+"日";const html='<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>いとちゃん取り分一覧</title><style>body{font-family:"Hiragino Sans","Yu Gothic","Meiryo",sans-serif;color:#1A2A3A;padding:24px;max-width:980px;margin:0 auto}h1{font-size:22px;margin:0 0 4px;color:#1A2A3A}.sub{font-size:12px;color:#78909C;margin-bottom:20px}.total{background:linear-gradient(135deg,#FFF3E0,#FFE0B2);padding:16px 20px;border-radius:10px;margin-bottom:24px;border:1.5px solid #FFCC80}.total-l{font-size:11px;color:#E65100;font-weight:700;letter-spacing:.08em}.total-v{font-size:24px;font-weight:800;color:#BF360C;margin-top:4px}.month{margin-bottom:24px;page-break-inside:avoid}.mh{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #1A2A3A;padding-bottom:6px;margin-bottom:8px}.mh h2{font-size:16px;margin:0;color:#1A2A3A}.mh .sum{font-size:13px;color:#BF360C;font-weight:700}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#FAFAFA;color:#546E7A;font-weight:600;text-align:left;padding:7px;border-bottom:1px solid #ECEFF1;font-size:10px}td{padding:7px;border-bottom:1px solid #F5F5F5}td.r{text-align:right}td.shoot{color:#3949AB;font-weight:600}td.pub{color:#00897B;font-weight:600}tr.sub td{background:#FAFAFA;font-weight:700;color:#37474F}.foot{margin-top:32px;padding-top:16px;border-top:1px solid #ECEFF1;font-size:10px;color:#B0BEC5;text-align:center}@media print{body{padding:0}.noprint{display:none}}</style></head><body><h1>いとちゃん取り分一覧</h1><div class="sub">KS One Investment ／ 出力日：'+dStr+'</div><div class="total"><div class="total-l">合計（失注を除く）</div><div class="total-v">¥'+itoTotal.toLocaleString()+'</div></div>'+itoMonths.map(g=>{const ml=g.month==="未定"?"配信日未定":g.month.slice(0,4)+"年"+g.month.slice(5,7)+"月";return '<div class="month"><div class="mh"><h2>'+ml+' <span style="font-size:11px;color:#90A4AE;font-weight:500;margin-left:8px">'+g.items.length+'件</span></h2><div class="sum">いとちゃん ¥'+g.totalIto.toLocaleString()+'</div></div><table><thead><tr><th>案件名</th><th>クライアント</th><th>撮影/取材</th><th>配信日</th><th class="r">案件金額</th><th class="r">いとちゃん取り分</th></tr></thead><tbody>'+g.items.map(c=>'<tr><td>'+(c.name||"")+'</td><td>'+(c.client||"")+'</td><td class="shoot">'+(c.shootDate?(c.shootType||"取材")+" "+fd(c.shootDate)+(c.shootTime?" "+c.shootTime:""):"-")+'</td><td class="pub">'+(c.publishDate?fd(c.publishDate):"-")+'</td><td class="r">¥'+pa(c.amount).toLocaleString()+'</td><td class="r">¥'+pa(c.itoShare).toLocaleString()+'</td></tr>').join("")+'<tr class="sub"><td colspan="4">小計</td><td class="r">¥'+g.totalAmt.toLocaleString()+'</td><td class="r">¥'+g.totalIto.toLocaleString()+'</td></tr></tbody></table></div>';}).join("")+'<div class="foot">KS One Investment 案件マネージャー</div><div class="noprint" style="margin-top:24px;text-align:center"><button onclick="window.print()" style="padding:12px 32px;background:#1A2A3A;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer">印刷 / PDF保存</button></div></body></html>';const w=window.open("","_blank");if(!w){alert("ポップアップがブロックされています。許可してください。");return}w.document.write(html);w.document.close()};
  const schedItems=cases.filter(c=>!isDone(c.status)&&(c.shootDate||c.publishDate)).sort((a,b)=>{const ka=a.shootDate||a.publishDate||"9999",kb=b.shootDate||b.publishDate||"9999";return ka.localeCompare(kb)});
  const exportSchedCSV=()=>{const rows=[["案件名","クライアント","ステータス","撮影/取材","撮影日","撮影時間","配信日","担当者","次のアクション","アクション期限"]];for(const c of schedItems){rows.push([c.name||"",c.client||"",c.status||"",c.shootType||"",c.shootDate?fd(c.shootDate):"",c.shootTime||"",c.publishDate?fd(c.publishDate):"",c.assignee||"",c.nextAction||"",c.nextActionDeadline?fd(c.nextActionDeadline):""])}const esc=v=>{const s=String(v??"");return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};const csv=rows.map(r=>r.map(esc).join(",")).join("\r\n");const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});const td=new Date().toISOString().slice(0,10).replace(/-/g,"");const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download="案件スケジュール_"+td+".csv";a.click();URL.revokeObjectURL(u)};
  const exportSchedPrint=()=>{const td=new Date();const dStr=td.getFullYear()+"年"+(td.getMonth()+1)+"月"+td.getDate()+"日";const html='<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>案件スケジュール</title><style>body{font-family:"Hiragino Sans","Yu Gothic","Meiryo",sans-serif;color:#1A2A3A;padding:24px;max-width:980px;margin:0 auto}h1{font-size:22px;margin:0 0 4px;color:#1A2A3A}.sub{font-size:12px;color:#78909C;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#1A2A3A;color:#fff;font-weight:700;text-align:left;padding:10px 8px;font-size:11px}td{padding:10px 8px;border-bottom:1px solid #ECEFF1;vertical-align:top}td.shoot{color:#3949AB;font-weight:700;white-space:nowrap}td.pub{color:#00897B;font-weight:700;white-space:nowrap}td.name{font-weight:700;color:#1A2A3A}td.client{color:#78909C;font-size:11px}.st{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#ECEFF1;color:#546E7A}.foot{margin-top:32px;padding-top:16px;border-top:1px solid #ECEFF1;font-size:10px;color:#B0BEC5;text-align:center}@media print{body{padding:0}.noprint{display:none}}</style></head><body><h1>案件スケジュール</h1><div class="sub">KS One Investment ／ 出力日：'+dStr+' ／ 進行中の案件 '+schedItems.length+'件</div><table><thead><tr><th>案件名 / クライアント</th><th>撮影 / 取材</th><th>配信日</th><th>ステータス</th></tr></thead><tbody>'+schedItems.map(c=>'<tr><td><div class="name">'+(c.name||"")+'</div>'+(c.client?'<div class="client">'+c.client+'</div>':"")+'</td><td class="shoot">'+(c.shootDate?(c.shootType||"取材")+'<br>'+fd(c.shootDate)+(c.shootTime?" "+c.shootTime:""):'-')+'</td><td class="pub">'+(c.publishDate?fd(c.publishDate):"-")+'</td><td><span class="st">'+(c.status||"")+'</span></td></tr>').join("")+'</tbody></table><div class="foot">KS One Investment 案件マネージャー</div><div class="noprint" style="margin-top:24px;text-align:center"><button onclick="window.print()" style="padding:12px 32px;background:#1A2A3A;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer">印刷 / PDF保存</button></div></body></html>';const w=window.open("","_blank");if(!w){alert("ポップアップがブロックされています。許可してください。");return}w.document.write(html);w.document.close()};
  if(!ok)return <div style={{textAlign:"center",padding:60,color:"#90A4AE"}}>読み込み中…</div>;
  return <><div style={{background:"#1A2A3A",padding:"28px 28px 24px",borderRadius:"0 0 24px 24px"}}><div style={{maxWidth:720,margin:"0 auto"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.45)",letterSpacing:".12em",marginBottom:4}}>KS One Investment</div><h1 style={{fontSize:22,fontWeight:800,color:"#fff",margin:0}}>案件マネージャー</h1></div><button onClick={()=>{sE(null);sM(true);sMk(k=>k+1)}} style={{background:"linear-gradient(135deg,#42A5F5,#1E88E5)",color:"#fff",border:"none",borderRadius:12,padding:"11px 22px",fontSize:14,fontWeight:700,cursor:"pointer"}}>+ 新規案件</button></div><div style={{display:"flex",gap:10,marginTop:20}}>{[["全案件",cnt.total,"#1A2A3A"],["進行中",cnt.act,"#2196F3"],["確認待ち",cnt.pend,"#FFC107"],["完了",cnt.done,"#4CAF50"]].map(([l,v,c])=><div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 18px",border:"1px solid #ECEFF1",flex:"1 1 0",minWidth:80}}><div style={{fontSize:24,fontWeight:800,color:c}}>{v}</div><div style={{fontSize:11,color:"#90A4AE",fontWeight:600,marginTop:2}}>{l}</div></div>)}</div></div></div>
  <div style={{maxWidth:720,margin:"0 auto",padding:"20px 16px 40px"}}>
    <div style={{display:"flex",gap:0,marginBottom:16,background:"#fff",borderRadius:12,border:"1px solid #E0E6EB",overflow:"hidden",flexWrap:"wrap"}}>{[{k:"cases",l:"案件一覧"},{k:"actions",l:"期限",n:acts.length},{k:"archive",l:"過去の案件",n:cnt.done},{k:"ito",l:"いとちゃん月別"}].map(t=><button key={t.k} onClick={()=>sV(t.k)} style={{flex:"1 1 80px",padding:"11px 8px",border:"none",cursor:"pointer",background:vw===t.k?"#1A2A3A":"transparent",color:vw===t.k?"#fff":"#78909C",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>{t.l}{t.n!=null&&<span style={{fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:10,background:vw===t.k?"rgba(255,255,255,.2)":"#FFF3E0",color:vw===t.k?"#fff":"#E65100"}}>{t.n}</span>}</button>)}</div>
    {vw==="cases"&&<><div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
      <button onClick={exportSchedPrint} style={{flex:"1 1 140px",padding:"10px 14px",borderRadius:10,border:"none",background:"#1A2A3A",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>📄 スケジュールをPDF出力</button>
      <button onClick={exportSchedCSV} style={{flex:"1 1 140px",padding:"10px 14px",borderRadius:10,border:"1.5px solid #1A2A3A",background:"#fff",color:"#1A2A3A",fontSize:12,fontWeight:700,cursor:"pointer"}}>📊 スケジュールをCSV出力</button>
    </div><div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}}><div style={{flex:1,minWidth:180}}><input style={{...is,background:"#fff"}} placeholder="検索…" value={q} onChange={e=>sQ(e.target.value)}/></div><div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>{["すべて",...STS.filter(s=>!isDone(s))].map(s=>{const a=fs===s,sc=s!=="すべて"?SC[s]:null;return <button key={s} onClick={()=>sFs(s)} style={{padding:"7px 14px",borderRadius:20,border:a?"none":"1.5px solid #E0E6EB",background:a?(sc?sc.bg:"#1A2A3A"):"#fff",color:a?(sc?sc.t:"#fff"):"#78909C",fontSize:12,fontWeight:600,cursor:"pointer"}}>{s}</button>})}</div></div><div style={{display:"flex",gap:4,marginBottom:16}}>{[{k:"publishDate",l:"配信日順"},{k:"shootDate",l:"撮影日順"},{k:"manual",l:"手動並び替え"}].map(t=><button key={t.k} onClick={()=>sSortBy(t.k)} style={{padding:"5px 12px",borderRadius:8,border:sortBy===t.k?"none":"1px solid #E0E6EB",background:sortBy===t.k?"#37474F":"#fff",color:sortBy===t.k?"#fff":"#90A4AE",fontSize:11,fontWeight:600,cursor:"pointer"}}>{t.l}</button>)}</div>{fil.length===0?<div style={{textAlign:"center",padding:60,color:"#B0BEC5"}}>{cases.length===0?"まだ案件がありません。":"該当なし"}</div>:fil.map(c=><CC key={c.id} c={c} onEdit={c=>{sE(c);sM(true);sMk(k=>k+1)}} onDel={id=>sD(id)} onDragStart={onDragStart} onDrop={handleDrop} onDragEnd={onDragEnd} isDragging={dragId===c.id} dragOver={dragOverId===c.id&&dragId!==c.id} onCompleteAction={completeAction}/>)}</>}
    {vw==="actions"&&<ActList items={acts} onEdit={c=>{sE(c);sM(true);sMk(k=>k+1)}} onCompleteAction={completeAction}/>}
    {vw==="archive"&&<div><div style={{marginBottom:14}}><input style={{...is,background:"#fff"}} placeholder="過去の案件を検索…" value={aq} onChange={e=>sAq(e.target.value)}/></div>{(()=>{const upc=arch.filter(c=>c.status==="完了"&&!c.invoiceSubmitted).length;return upc>0?<div style={{marginBottom:12,padding:"12px 16px",background:"#FFF3E0",borderRadius:12,border:"1.5px solid #FFCC80"}}><span style={{fontSize:13,fontWeight:700,color:"#E65100"}}>⚠ 請求書未提出 {upc}件</span></div>:null})()}{arch.length===0?<div style={{textAlign:"center",padding:60,color:"#B0BEC5"}}>完了案件なし</div>:arch.map(c=>{const a=pa(c.amount),i=pa(c.itoShare),up=c.status==="完了"&&!c.invoiceSubmitted;return <div key={c.id} onClick={()=>{sE(c);sM(true);sMk(k=>k+1)}} style={{background:"#fff",borderRadius:12,padding:"14px 18px",marginBottom:8,border:up?"1.5px solid #FFCC80":"1px solid #E8F5E9",cursor:"pointer",opacity:up?1:.85}}><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}><span style={{fontSize:14,fontWeight:700,color:"#37474F"}}>{c.name}</span>{c.status==="失注"?<span style={{fontSize:10,fontWeight:700,color:"#B71C1C",background:"#FFEBEE",padding:"2px 8px",borderRadius:12}}>✕ 失注</span>:<span style={{fontSize:10,color:"#1B5E20",background:"#E8F5E9",padding:"2px 8px",borderRadius:12}}>✓ 完了</span>}{c.status==="完了"&&(c.invoiceSubmitted?<span style={{fontSize:10,color:"#1B5E20",background:"#E8F5E9",padding:"2px 8px",borderRadius:12}}>✓ 請求書提出済</span>:<span style={{fontSize:10,fontWeight:700,color:"#E65100",background:"#FFF3E0",padding:"2px 8px",borderRadius:12}}>請求書未提出</span>)}</div>{c.client&&<div style={{fontSize:12,color:"#90A4AE",marginBottom:4}}>{c.client}</div>}<div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{a>0&&<span style={{fontSize:11,color:"#558B2F",fontWeight:600}}>¥{a.toLocaleString()}</span>}{i>0&&<span style={{fontSize:11,color:"#90A4AE"}}>（いとちゃん ¥{i.toLocaleString()}）</span>}</div></div>})}{arch.length>0&&(()=>{const ta=arch.reduce((s,c)=>s+pa(c.amount),0),ti=arch.reduce((s,c)=>s+pa(c.itoShare),0);return ta>0?<div style={{marginTop:12,padding:"12px 16px",background:"#F1F8E9",borderRadius:12,border:"1px solid #DCEDC8",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,fontWeight:600,color:"#33691E"}}>完了合計</span><div style={{display:"flex",gap:16,fontSize:12}}><span style={{color:"#33691E",fontWeight:700}}>¥{ta.toLocaleString()}</span>{ti>0&&<span style={{color:"#558B2F"}}>KS One ¥{(ta-ti).toLocaleString()}</span>}</div></div>:null})()}</div>}
    {vw==="ito"&&<div>
      <div style={{marginBottom:16,padding:"16px 20px",background:"linear-gradient(135deg,#FFF3E0,#FFE0B2)",borderRadius:14,border:"1.5px solid #FFCC80"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#E65100",letterSpacing:".08em",marginBottom:4}}>いとちゃん取り分 合計（失注を除く）</div>
        <div style={{fontSize:26,fontWeight:800,color:"#BF360C"}}>¥{itoTotal.toLocaleString()}</div>
      </div>
      {itoMonths.length>0&&<div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <button onClick={exportPrint} style={{flex:"1 1 140px",padding:"12px 18px",borderRadius:12,border:"none",background:"#1A2A3A",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>📄 PDF / 印刷で出力</button>
        <button onClick={exportCSV} style={{flex:"1 1 140px",padding:"12px 18px",borderRadius:12,border:"1.5px solid #1A2A3A",background:"#fff",color:"#1A2A3A",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>📊 CSV (Excel) で出力</button>
      </div>}
      {itoMonths.length===0?<div style={{textAlign:"center",padding:60,color:"#B0BEC5"}}>取り分のある案件がありません</div>:itoMonths.map(g=>{
        const ks=g.totalAmt-g.totalIto;
        const monthLabel=g.month==="未定"?"配信日未定":g.month.slice(0,4)+"年"+g.month.slice(5,7)+"月";
        return <div key={g.month} style={{marginBottom:18,background:"#fff",borderRadius:14,border:"1px solid #ECEFF1",overflow:"hidden"}}>
          <div style={{padding:"14px 18px",background:"#FAFAFA",borderBottom:"1px solid #ECEFF1",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:15,fontWeight:800,color:"#37474F"}}>{monthLabel} <span style={{fontSize:11,color:"#90A4AE",fontWeight:600,marginLeft:6}}>{g.items.length}件</span></div>
            <div style={{display:"flex",gap:14,fontSize:12,flexWrap:"wrap"}}>
              <span style={{color:"#78909C"}}>案件合計 <strong style={{color:"#33691E"}}>¥{g.totalAmt.toLocaleString()}</strong></span>
              <span style={{color:"#BF360C",fontWeight:700}}>いとちゃん ¥{g.totalIto.toLocaleString()}</span>
              <span style={{color:"#546E7A"}}>KS One ¥{ks.toLocaleString()}</span>
            </div>
          </div>
          {g.items.map(c=>{const a=pa(c.amount),i=pa(c.itoShare);return <div key={c.id} onClick={()=>{sE(c);sM(true);sMk(k=>k+1)}} style={{padding:"12px 18px",borderBottom:"1px solid #F5F5F5",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:160}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:13,fontWeight:700,color:"#1A2A3A"}}>{c.name}</span>
                <SB s={c.status}/>
              </div>
              {c.client&&<div style={{fontSize:11,color:"#90A4AE",marginTop:2}}>{c.client}</div>}
              {c.publishDate&&<div style={{fontSize:11,color:"#00897B",marginTop:2,fontWeight:600}}>配信 {fd(c.publishDate)}</div>}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:14,fontWeight:800,color:"#BF360C"}}>¥{i.toLocaleString()}</div>
              {a>0&&<div style={{fontSize:10,color:"#90A4AE",marginTop:2}}>案件 ¥{a.toLocaleString()}</div>}
            </div>
          </div>})}
        </div>;
      })}
    </div>}
  </div>
  <Md open={mo} onClose={()=>{sM(false);sE(null)}}><CaseForm key={mk} init={ed} onSave={save} onCancel={()=>{sM(false);sE(null)}} opts={opts}/></Md>
  <Md open={!!dl} onClose={()=>sD(null)}><div style={{textAlign:"center"}}><div style={{fontSize:40,marginBottom:12}}>⚠️</div><h3 style={{fontSize:17,fontWeight:700,marginBottom:24}}>削除しますか？</h3><div style={{display:"flex",gap:10,justifyContent:"center"}}><button onClick={()=>sD(null)} style={{padding:"10px 24px",borderRadius:10,border:"1.5px solid #CFD8DC",background:"#fff",fontSize:14,cursor:"pointer"}}>キャンセル</button><button onClick={()=>{sC(p=>p.filter(c=>c.id!==dl));sD(null)}} style={{padding:"10px 24px",borderRadius:10,border:"none",background:"#E53935",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>削除</button></div></div></Md>
  </>;
}

function SemMod(){
  const[sems,sS,ok]=useSt(SK);const[mo,sM]=useState(false);const[ed,sE]=useState(null);const[mk,sMk]=useState(0);const[dl,sD]=useState(null);const[vw,sV]=useState("list");const[fs,sFs]=useState("すべて");const[q,sQ]=useState("");const[aq,sAq]=useState("");
  const save=f=>{if(ed){sS(p=>p.map(c=>c.id===ed.id?{...c,...f,updatedAt:new Date().toISOString()}:c))}else{sS(p=>[{id:uid(),...f,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},...p])}sM(false);sE(null)};
  const completeAction=(id)=>{sS(p=>p.map(c=>{if(c.id!==id||!c.nextAction)return c;const log={action:c.nextAction,deadline:c.nextActionDeadline||"",memo:c.nextActionMemo||"",completedAt:new Date().toISOString()};return{...c,actionLog:[...(c.actionLog||[]),log],nextAction:"",nextActionDeadline:"",nextActionMemo:"",updatedAt:new Date().toISOString()}}));};
  const fil=sems.filter(c=>{if(isDone(c.status))return false;if(fs!=="すべて"&&c.status!==fs)return false;if(q)return(c.name+c.client+c.venue+c.memo+(c.nextAction||"")).toLowerCase().includes(q.toLowerCase());return true}).sort((a,b)=>{const ka=a.status==="検討中"?1:0,kb=b.status==="検討中"?1:0;if(ka!==kb)return ka-kb;return(a.eventDate||"9999-12-31").localeCompare(b.eventDate||"9999-12-31")});
  const cnt={total:sems.filter(c=>!isDone(c.status)).length,act:sems.filter(c=>c.status==="進行中").length,pend:sems.filter(c=>c.status==="確認待ち").length,done:sems.filter(c=>isDone(c.status)).length};
  const acts=sems.filter(c=>c.nextAction&&!isDone(c.status)).sort((a,b)=>(a.nextActionDeadline||"9999").localeCompare(b.nextActionDeadline||"9999"));
  const arch=sems.filter(c=>isDone(c.status)).filter(c=>!aq||(c.name+c.client+c.venue).toLowerCase().includes(aq.toLowerCase())).sort((a,b)=>{const ai=a.invoiceSubmitted?1:0,bi=b.invoiceSubmitted?1:0;if(ai!==bi)return ai-bi;return(b.updatedAt||"").localeCompare(a.updatedAt||"")});
  const upc=arch.filter(c=>!c.invoiceSubmitted).length;
  if(!ok)return <div style={{textAlign:"center",padding:60,color:"#90A4AE"}}>読み込み中…</div>;
  return <><div style={{background:"linear-gradient(135deg,#4527A0,#6A1B9A)",padding:"28px 28px 24px",borderRadius:"0 0 24px 24px"}}><div style={{maxWidth:720,margin:"0 auto"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.45)",letterSpacing:".12em",marginBottom:4}}>KS One Investment</div><h1 style={{fontSize:22,fontWeight:800,color:"#fff",margin:0}}>セミナー管理</h1></div><button onClick={()=>{sE(null);sM(true);sMk(k=>k+1)}} style={{background:"linear-gradient(135deg,#AB47BC,#8E24AA)",color:"#fff",border:"none",borderRadius:12,padding:"11px 22px",fontSize:14,fontWeight:700,cursor:"pointer"}}>+ 新規セミナー</button></div><div style={{display:"flex",gap:10,marginTop:20}}>{[["全件",cnt.total,"#4527A0"],["進行中",cnt.act,"#2196F3"],["確認待ち",cnt.pend,"#FFC107"],["完了",cnt.done,"#4CAF50"]].map(([l,v,c])=><div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 18px",border:"1px solid #ECEFF1",flex:"1 1 0",minWidth:80}}><div style={{fontSize:24,fontWeight:800,color:c}}>{v}</div><div style={{fontSize:11,color:"#90A4AE",fontWeight:600,marginTop:2}}>{l}</div></div>)}</div></div></div>
  <div style={{maxWidth:720,margin:"0 auto",padding:"20px 16px 40px"}}>
    <div style={{display:"flex",gap:0,marginBottom:16,background:"#fff",borderRadius:12,border:"1px solid #E0E6EB",overflow:"hidden"}}>{[{k:"list",l:"セミナー一覧"},{k:"actions",l:"アクション期限",n:acts.length},{k:"archive",l:"過去のセミナー",n:cnt.done}].map(t=><button key={t.k} onClick={()=>sV(t.k)} style={{flex:1,padding:"11px 14px",border:"none",cursor:"pointer",background:vw===t.k?"#4527A0":"transparent",color:vw===t.k?"#fff":"#78909C",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>{t.l}{t.n!=null&&<span style={{fontSize:11,fontWeight:700,padding:"1px 7px",borderRadius:10,background:vw===t.k?"rgba(255,255,255,.2)":"#F3E5F5",color:vw===t.k?"#fff":"#6A1B9A"}}>{t.n}</span>}</button>)}</div>
    {vw==="list"&&<><div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}><div style={{flex:1,minWidth:180}}><input style={{...is,background:"#fff"}} placeholder="検索…" value={q} onChange={e=>sQ(e.target.value)}/></div><div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>{["すべて",...STS.filter(s=>!isDone(s))].map(s=>{const a=fs===s,sc=s!=="すべて"?SC[s]:null;return <button key={s} onClick={()=>sFs(s)} style={{padding:"7px 14px",borderRadius:20,border:a?"none":"1.5px solid #E0E6EB",background:a?(sc?sc.bg:"#4527A0"):"#fff",color:a?(sc?sc.t:"#fff"):"#78909C",fontSize:12,fontWeight:600,cursor:"pointer"}}>{s}</button>})}</div></div>{fil.length===0?<div style={{textAlign:"center",padding:60,color:"#B0BEC5"}}>{sems.length===0?"まだセミナーがありません。":"該当なし"}</div>:fil.map(c=><SC2 key={c.id} c={c} onEdit={c=>{sE(c);sM(true);sMk(k=>k+1)}} onDel={id=>sD(id)} onCompleteAction={completeAction}/>)}</>}
    {vw==="actions"&&<ActList items={acts} onEdit={c=>{sE(c);sM(true);sMk(k=>k+1)}} onCompleteAction={completeAction}/>}
    {vw==="archive"&&<div><div style={{marginBottom:14}}><input style={{...is,background:"#fff"}} placeholder="過去のセミナーを検索…" value={aq} onChange={e=>sAq(e.target.value)}/></div>{upc>0&&<div style={{marginBottom:12,padding:"12px 16px",background:"#FFF3E0",borderRadius:12,border:"1.5px solid #FFCC80"}}><span style={{fontSize:13,fontWeight:700,color:"#E65100"}}>⚠ 請求書未提出 {upc}件</span></div>}{arch.length===0?<div style={{textAlign:"center",padding:60,color:"#B0BEC5"}}>完了セミナーなし</div>:arch.map(c=>{const a=pa(c.amount),up=!c.invoiceSubmitted;return <div key={c.id} onClick={()=>{sE(c);sM(true);sMk(k=>k+1)}} style={{background:"#fff",borderRadius:12,padding:"14px 18px",marginBottom:8,border:up?"1.5px solid #FFCC80":"1px solid #E8F5E9",cursor:"pointer",opacity:up?1:.85}}><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}><span style={{fontSize:14,fontWeight:700,color:"#37474F"}}>{c.name}</span><span style={{fontSize:10,color:"#1B5E20",background:"#E8F5E9",padding:"2px 8px",borderRadius:12}}>✓ 完了</span>{up?<span style={{fontSize:10,fontWeight:700,color:"#E65100",background:"#FFF3E0",padding:"2px 8px",borderRadius:12}}>請求書未提出</span>:<span style={{fontSize:10,color:"#1B5E20",background:"#E8F5E9",padding:"2px 8px",borderRadius:12}}>✓ 提出済</span>}</div>{c.client&&<div style={{fontSize:12,color:"#90A4AE",marginBottom:4}}>{c.client}</div>}<div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{c.eventDate&&<span style={{fontSize:11,color:"#90A4AE"}}>{fd(c.eventDate)}{c.eventTime?" "+c.eventTime:""}</span>}{c.venue&&<span style={{fontSize:11,color:"#90A4AE"}}>{c.venue}</span>}{a>0&&<span style={{fontSize:11,color:"#558B2F",fontWeight:600}}>¥{a.toLocaleString()}</span>}</div></div>})}{arch.length>0&&(()=>{const ta=arch.reduce((s,c)=>s+pa(c.amount),0);return ta>0?<div style={{marginTop:12,padding:"12px 16px",background:"#F1F8E9",borderRadius:12,border:"1px solid #DCEDC8",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,fontWeight:600,color:"#33691E"}}>完了合計</span><span style={{fontSize:12,color:"#33691E",fontWeight:700}}>¥{ta.toLocaleString()}</span></div>:null})()}</div>}
  </div>
  <Md open={mo} onClose={()=>{sM(false);sE(null)}}><SemForm key={mk} init={ed} onSave={save} onCancel={()=>{sM(false);sE(null)}}/></Md>
  <Md open={!!dl} onClose={()=>sD(null)}><div style={{textAlign:"center"}}><div style={{fontSize:40,marginBottom:12}}>⚠️</div><h3 style={{fontSize:17,fontWeight:700,marginBottom:24}}>削除しますか？</h3><div style={{display:"flex",gap:10,justifyContent:"center"}}><button onClick={()=>sD(null)} style={{padding:"10px 24px",borderRadius:10,border:"1.5px solid #CFD8DC",background:"#fff",fontSize:14,cursor:"pointer"}}>キャンセル</button><button onClick={()=>{sS(p=>p.filter(c=>c.id!==dl));sD(null)}} style={{padding:"10px 24px",borderRadius:10,border:"none",background:"#E53935",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>削除</button></div></div></Md>
  </>;
}

function CustMod(){
  const[custs,sC,ok]=useSt(UK);const[cases]=useSt(CK);const[sems]=useSt(SK);
  const[mo,sM]=useState(false);const[ed,sE]=useState(null);const[mk,sMk]=useState(0);const[dl,sD]=useState(null);const[fs,sFs]=useState("すべて");const[q,sQ]=useState("");
  const save=f=>{if(ed){sC(p=>p.map(c=>c.id===ed.id?{...c,...f,updatedAt:new Date().toISOString()}:c))}else{sC(p=>[{id:uid(),...f,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},...p])}sM(false);sE(null)};
  const getCaseCount=(name)=>cases.filter(c=>c.client&&name&&c.client.trim()===name.trim()).length;
  const getViews=(c)=>(c.publishes||[]).reduce((s,p)=>s+(parseInt(String(p.views||"").replace(/,/g,""),10)||0),0);
  const fil=custs.filter(c=>{if(fs!=="すべて"&&c.status!==fs)return false;if(q)return((c.name||"")+(c.contactName||"")+(c.email||"")+(c.phone||"")+(c.memo||"")+(c.nextApproach||"")).toLowerCase().includes(q.toLowerCase());return true}).sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
  const cnt={total:custs.length,active:custs.filter(c=>c.status==="取引中").length,nego:custs.filter(c=>c.status==="商談中").length,newC:custs.filter(c=>c.status==="新規").length};
  const approaches=custs.filter(c=>c.nextApproach).sort((a,b)=>(a.nextApproachDeadline||"9999").localeCompare(b.nextApproachDeadline||"9999"));
  if(!ok)return <div style={{textAlign:"center",padding:60,color:"#90A4AE"}}>読み込み中…</div>;
  return <>
    <div style={{background:"linear-gradient(135deg,#00897B,#00695C)",padding:"28px 28px 24px",borderRadius:"0 0 24px 24px"}}>
      <div style={{maxWidth:720,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.45)",letterSpacing:".12em",marginBottom:4}}>KS One Investment</div>
            <h1 style={{fontSize:22,fontWeight:800,color:"#fff",margin:0}}>顧客管理</h1>
          </div>
          <button onClick={()=>{sE(null);sM(true);sMk(k=>k+1)}} style={{background:"linear-gradient(135deg,#26A69A,#00897B)",color:"#fff",border:"none",borderRadius:12,padding:"11px 22px",fontSize:14,fontWeight:700,cursor:"pointer"}}>+ 新規顧客</button>
        </div>
        <div style={{display:"flex",gap:10,marginTop:20}}>
          {[["全顧客",cnt.total,"#00695C"],["取引中",cnt.active,"#4CAF50"],["商談中",cnt.nego,"#FF9800"],["新規",cnt.newC,"#2196F3"]].map(([l,v,c])=><div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 18px",border:"1px solid #ECEFF1",flex:"1 1 0",minWidth:80}}>
            <div style={{fontSize:24,fontWeight:800,color:c}}>{v}</div>
            <div style={{fontSize:11,color:"#90A4AE",fontWeight:600,marginTop:2}}>{l}</div>
          </div>)}
        </div>
      </div>
    </div>
    <div style={{maxWidth:720,margin:"0 auto",padding:"20px 16px 40px"}}>
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:180}}><input style={{...is,background:"#fff"}} placeholder="検索…" value={q} onChange={e=>sQ(e.target.value)}/></div>
        <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
          {["すべて",...CST].map(s=>{const a=fs===s,sc=s!=="すべて"?CSC[s]:null;return <button key={s} onClick={()=>sFs(s)} style={{padding:"7px 14px",borderRadius:20,border:a?"none":"1.5px solid #E0E6EB",background:a?(sc?sc.bg:"#00695C"):"#fff",color:a?(sc?sc.t:"#fff"):"#78909C",fontSize:12,fontWeight:600,cursor:"pointer"}}>{s}</button>})}
        </div>
      </div>
      {approaches.length>0&&<div style={{background:"#E3F2FD",borderRadius:12,padding:"14px 16px",marginBottom:16,border:"1px solid #BBDEFB"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#0D47A1",marginBottom:8,letterSpacing:".04em"}}>今後のアプローチ ({approaches.length}件)</div>
        {approaches.slice(0,5).map(c=><div key={c.id} onClick={()=>{sE(c);sM(true);sMk(k=>k+1)}} style={{padding:"8px 10px",background:"#fff",borderRadius:8,marginBottom:6,cursor:"pointer",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:12,fontWeight:700,color:"#0D47A1"}}>{c.name}</span>
          <span style={{fontSize:12,color:"#37474F",flex:1,minWidth:0}}>{c.nextApproach}</span>
          {c.nextApproachDeadline&&<span style={{fontSize:11,color:"#78909C"}}>{fd(c.nextApproachDeadline)} <DB d={c.nextApproachDeadline}/></span>}
        </div>)}
        {approaches.length>5&&<div style={{fontSize:11,color:"#90A4AE",textAlign:"center",marginTop:4}}>他 {approaches.length-5}件</div>}
      </div>}
      {fil.length===0?<div style={{textAlign:"center",padding:60,color:"#B0BEC5"}}>{custs.length===0?"まだ顧客がありません。":"該当なし"}</div>:fil.map(c=><CC3 key={c.id} c={c} caseCount={getCaseCount(c.name)} totalViews={getViews(c)} onEdit={c=>{sE(c);sM(true);sMk(k=>k+1)}} onDel={id=>sD(id)}/>)}
    </div>
    <Md open={mo} onClose={()=>{sM(false);sE(null)}}><CustForm key={mk} init={ed} cases={cases} sems={sems} onSave={save} onCancel={()=>{sM(false);sE(null)}}/></Md>
    <Md open={!!dl} onClose={()=>sD(null)}><div style={{textAlign:"center"}}><div style={{fontSize:40,marginBottom:12}}>⚠️</div><h3 style={{fontSize:17,fontWeight:700,marginBottom:24}}>削除しますか？</h3><div style={{display:"flex",gap:10,justifyContent:"center"}}><button onClick={()=>sD(null)} style={{padding:"10px 24px",borderRadius:10,border:"1.5px solid #CFD8DC",background:"#fff",fontSize:14,cursor:"pointer"}}>キャンセル</button><button onClick={()=>{sC(p=>p.filter(c=>c.id!==dl));sD(null)}} style={{padding:"10px 24px",borderRadius:10,border:"none",background:"#E53935",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>削除</button></div></div></Md>
  </>;
}

function TaskMod(){
  const[tasks,sT,ok]=useSt(TK);
  const[newT,sNewT]=useState("");const[newD,sNewD]=useState("");const[exp,sExp]=useState({});const[showDone,sShowDone]=useState(false);const[filter,sFilter]=useState("all");
  const add=()=>{if(!newT.trim())return;sT(p=>[...p,{id:uid(),title:newT.trim(),deadline:newD,memo:"",done:false,createdAt:new Date().toISOString(),order:p.length}]);sNewT("");sNewD("")};
  const toggle=id=>sT(p=>p.map(t=>t.id===id?{...t,done:!t.done,completedAt:!t.done?new Date().toISOString():null}:t));
  const update=(id,k,v)=>sT(p=>p.map(t=>t.id===id?{...t,[k]:v}:t));
  const del=id=>sT(p=>p.filter(t=>t.id!==id));
  const clearDone=()=>sT(p=>p.filter(t=>!t.done));
  const active=tasks.filter(t=>!t.done);
  const done=tasks.filter(t=>t.done).sort((a,b)=>(b.completedAt||"").localeCompare(a.completedAt||""));
  const filtered=active.filter(t=>{if(filter==="today"){const dy=dt(t.deadline);return dy!==null&&dy<=0}if(filter==="week"){const dy=dt(t.deadline);return dy!==null&&dy<=7}if(filter==="nodate")return !t.deadline;return true}).sort((a,b)=>{const ad=a.deadline||"9999-12-31",bd=b.deadline||"9999-12-31";if(ad!==bd)return ad.localeCompare(bd);return(a.order||0)-(b.order||0)});
  const cnt={all:active.length,today:active.filter(t=>{const dy=dt(t.deadline);return dy!==null&&dy<=0}).length,week:active.filter(t=>{const dy=dt(t.deadline);return dy!==null&&dy<=7}).length,nodate:active.filter(t=>!t.deadline).length};
  if(!ok)return <div style={{textAlign:"center",padding:60,color:"#90A4AE"}}>読み込み中…</div>;
  return <>
    <div style={{background:"linear-gradient(135deg,#1976D2,#0D47A1)",padding:"28px 28px 24px",borderRadius:"0 0 24px 24px"}}>
      <div style={{maxWidth:720,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.45)",letterSpacing:".12em",marginBottom:4}}>KS One Investment</div>
            <h1 style={{fontSize:22,fontWeight:800,color:"#fff",margin:0}}>タスク</h1>
          </div>
          <div style={{fontSize:13,color:"rgba(255,255,255,.75)",fontWeight:600}}>未完了 {active.length}件</div>
        </div>
      </div>
    </div>
    <div style={{maxWidth:720,margin:"0 auto",padding:"20px 16px 40px"}}>
      <div style={{background:"#fff",borderRadius:14,padding:"12px 14px",marginBottom:16,border:"1px solid #E3F2FD",boxShadow:"0 2px 8px rgba(25,118,210,.06)"}}>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <input style={{...is,flex:"1 1 200px",border:"1.5px solid #BBDEFB"}} value={newT} onChange={e=>sNewT(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")add()}} placeholder="+ 新しいタスクを追加"/>
          <input style={{...is,width:150,border:"1.5px solid #BBDEFB"}} type="date" value={newD} onChange={e=>sNewD(e.target.value)}/>
          <button onClick={add} disabled={!newT.trim()} style={{padding:"10px 20px",borderRadius:10,border:"none",background:newT.trim()?"#1976D2":"#B0BEC5",color:"#fff",fontSize:13,fontWeight:700,cursor:newT.trim()?"pointer":"default"}}>追加</button>
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {[{k:"all",l:"すべて",c:cnt.all},{k:"today",l:"今日まで",c:cnt.today},{k:"week",l:"今週",c:cnt.week},{k:"nodate",l:"期限なし",c:cnt.nodate}].map(t=><button key={t.k} onClick={()=>sFilter(t.k)} style={{padding:"7px 14px",borderRadius:20,border:filter===t.k?"none":"1.5px solid #E0E6EB",background:filter===t.k?"#1976D2":"#fff",color:filter===t.k?"#fff":"#78909C",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>{t.l}<span style={{fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:10,background:filter===t.k?"rgba(255,255,255,.2)":"#ECEFF1",color:filter===t.k?"#fff":"#546E7A"}}>{t.c}</span></button>)}
      </div>
      {filtered.length===0?<div style={{textAlign:"center",padding:40,color:"#B0BEC5"}}>{active.length===0?"タスクはありません。追加してみましょう！":"該当するタスクがありません"}</div>:<div>
        {filtered.map(t=>{const dy=dt(t.deadline);const urg=dy!==null&&dy<=0;const warn=dy!==null&&dy>0&&dy<=3;const open=exp[t.id];return <div key={t.id} style={{background:"#fff",borderRadius:12,marginBottom:8,border:urg?"1.5px solid #EF9A9A":warn?"1.5px solid #FFCC80":"1px solid #ECEFF1",overflow:"hidden",transition:"all .15s"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",cursor:"pointer"}} onClick={()=>sExp(e=>({...e,[t.id]:!e[t.id]}))}>
            <button onClick={e=>{e.stopPropagation();toggle(t.id)}} style={{width:22,height:22,borderRadius:"50%",border:"2px solid #1976D2",background:"#fff",cursor:"pointer",flexShrink:0,padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#1976D2",fontSize:14,fontWeight:700,visibility:"hidden"}}>✓</span></button>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:600,color:"#1A2A3A"}}>{t.title}</div>
              {t.deadline&&<div style={{display:"flex",alignItems:"center",gap:8,marginTop:2}}><span style={{fontSize:11,color:urg?"#C62828":warn?"#E65100":"#78909C",fontWeight:600}}>📅 {fd(t.deadline)}</span><DB d={t.deadline}/></div>}
              {t.memo&&!open&&<div style={{fontSize:11,color:"#90A4AE",marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.memo}</div>}
            </div>
            <span style={{color:"#B0BEC5",fontSize:12}}>{open?"▲":"▼"}</span>
          </div>
          {open&&<div style={{padding:"0 14px 14px 46px",borderTop:"1px solid #F5F5F5"}}>
            <input style={{...is,marginTop:10,marginBottom:8}} value={t.title} onChange={e=>update(t.id,"title",e.target.value)} placeholder="タイトル"/>
            <input style={{...is,marginBottom:8}} type="date" value={t.deadline||""} onChange={e=>update(t.id,"deadline",e.target.value)}/>
            <textarea style={{...is,minHeight:50,resize:"vertical",marginBottom:8}} value={t.memo||""} onChange={e=>update(t.id,"memo",e.target.value)} placeholder="メモ"/>
            <button onClick={()=>del(t.id)} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #FFCDD2",background:"#fff",color:"#C62828",fontSize:11,fontWeight:600,cursor:"pointer"}}>🗑 削除</button>
          </div>}
        </div>})}
      </div>}
      {done.length>0&&<div style={{marginTop:24,paddingTop:16,borderTop:"1px solid #ECEFF1"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <button onClick={()=>sShowDone(!showDone)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:"#78909C",display:"flex",alignItems:"center",gap:6,padding:0}}>{showDone?"▼":"▶"} 完了済み ({done.length}件)</button>
          {showDone&&<button onClick={()=>{if(confirm("完了済みタスクを全て削除しますか？"))clearDone()}} style={{fontSize:11,color:"#C62828",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>全て削除</button>}
        </div>
        {showDone&&<div>{done.map(t=><div key={t.id} style={{background:"#FAFAFA",borderRadius:10,padding:"10px 14px",marginBottom:6,border:"1px solid #F0F0F0",display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>toggle(t.id)} style={{width:22,height:22,borderRadius:"50%",border:"2px solid #4CAF50",background:"#4CAF50",cursor:"pointer",flexShrink:0,padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#fff",fontSize:13,fontWeight:700}}>✓</span></button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,color:"#90A4AE",textDecoration:"line-through"}}>{t.title}</div>
            {t.completedAt&&<div style={{fontSize:10,color:"#B0BEC5",marginTop:2}}>完了 {fd(t.completedAt)}</div>}
          </div>
          <button onClick={()=>del(t.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#B0BEC5",fontSize:14}}>✕</button>
        </div>)}</div>}
      </div>}
    </div>
  </>;
}

export default function App(){
  const[user,sU]=useState(null);const[loading,sL]=useState(true);const[app,sA]=useState("cases");const[dp,sD]=useState(false);
  useEffect(()=>{const unsub=onAuthStateChanged(auth,u=>{sU(u);sL(false)});return unsub},[]);
  if(loading)return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(160deg,#F5F7FA,#EEF1F5)",fontFamily:"'Noto Sans JP',sans-serif"}}><div style={{color:"#90A4AE",fontSize:16}}>読み込み中…</div></div>;
  if(!user)return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(160deg,#F5F7FA,#EEF1F5)",fontFamily:"'Noto Sans JP','DM Sans',sans-serif"}}>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&family=Noto+Sans+JP:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
    <div style={{background:"#fff",borderRadius:20,padding:"48px 40px",textAlign:"center",boxShadow:"0 8px 32px rgba(0,0,0,.08)",maxWidth:400,width:"90%"}}>
      <div style={{fontSize:11,fontWeight:600,color:"rgba(26,42,58,.4)",letterSpacing:".12em",marginBottom:8}}>KS One Investment</div>
      <h1 style={{fontSize:24,fontWeight:800,color:"#1A2A3A",margin:"0 0 8px"}}>案件マネージャー</h1>
      <p style={{fontSize:14,color:"#90A4AE",marginBottom:32}}>ログインして続けてください</p>
      <button onClick={()=>signInWithPopup(auth,googleProvider)} style={{background:"#1A2A3A",color:"#fff",border:"none",borderRadius:12,padding:"14px 32px",fontSize:15,fontWeight:700,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:10}}>
        <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 010-9.18l-7.98-6.19a24.08 24.08 0 000 21.56l7.98-6.19z"/><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Googleでログイン
      </button>
    </div>
  </div>;
  return <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#F5F7FA,#EEF1F5)",fontFamily:"'Noto Sans JP','DM Sans',sans-serif"}}>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&family=Noto+Sans+JP:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
    <div style={{maxWidth:720,margin:"0 auto",padding:"16px 16px 0"}}><div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>{[{k:"cases",l:"案件",e:"📋",bg:"#1A2A3A"},{k:"seminars",l:"セミナー",e:"🎤",bg:"#4527A0"},{k:"customers",l:"顧客",e:"🤝",bg:"#00695C"},{k:"tasks",l:"タスク",e:"✓",bg:"#1976D2"}].map(t=><button key={t.k} onClick={()=>sA(t.k)} style={{flex:"1 1 70px",padding:"11px 6px",borderRadius:14,border:app===t.k?"2px solid "+t.bg:"2px solid transparent",background:app===t.k?t.bg:"#fff",color:app===t.k?"#fff":"#78909C",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}><span style={{fontSize:15}}>{t.e}</span>{t.l}</button>)}<button onClick={()=>sD(true)} style={{width:42,height:42,borderRadius:14,border:"none",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#90A4AE",fontSize:17}}>⬇</button><button onClick={()=>signOut(auth)} title="ログアウト" style={{width:42,height:42,borderRadius:14,border:"none",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#90A4AE",fontSize:13}}>🚪</button></div></div>
    {app==="cases"&&<CaseMod/>}
    {app==="seminars"&&<SemMod/>}
    {app==="customers"&&<CustMod/>}
    {app==="tasks"&&<TaskMod/>}
    <Md open={dp} onClose={()=>sD(false)}><DataP onClose={()=>sD(false)}/></Md>
  </div>;
}
