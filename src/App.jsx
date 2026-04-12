import { useState, useEffect, useRef, useCallback } from "react";
import { db, auth, googleProvider } from "./firebase";
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs } from "firebase/firestore";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

const CK = "ks1-cases";
const SK = "ks1-seminars";
const collMap = {"ks1-cases": "cases", "ks1-seminars": "seminars"};
const STS = ["検討中","仮予約","進行中","確認待ち","完了","保留"];
const SC = {"検討中":{bg:"#FFF3E0",t:"#E65100",d:"#FF9800"},"仮予約":{bg:"#E0F7FA",t:"#006064",d:"#00ACC1"},"進行中":{bg:"#E3F2FD",t:"#0D47A1",d:"#2196F3"},"確認待ち":{bg:"#FFF8E1",t:"#F57F17",d:"#FFC107"},"完了":{bg:"#E8F5E9",t:"#1B5E20",d:"#4CAF50"},"保留":{bg:"#F3E5F5",t:"#4A148C",d:"#9C27B0"}};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const fd=d=>{if(!d)return"";const x=new Date(d);return x.getFullYear()+"/"+String(x.getMonth()+1).padStart(2,"0")+"/"+String(x.getDate()).padStart(2,"0")};
const dt=d=>{if(!d)return null;const n=new Date();n.setHours(0,0,0,0);const t=new Date(d);t.setHours(0,0,0,0);return Math.ceil((t-n)/864e5)};
const pa=v=>parseFloat(String(v||"").replace(/,/g,""))||0;
const fn=v=>{const n=String(v||"").replace(/[^\d]/g,"");return n?Number(n).toLocaleString():""};
const ci=(a,t)=>{if(a<=0)return 0;if(t==="取材編")return Math.round(125000+(a*0.8-170000)*0.265);if(t==="社長出演編")return Math.round(115000+(a*0.8-150000)*0.29);return 0};
const is={width:"100%",padding:"10px 14px",border:"1.5px solid #CFD8DC",borderRadius:10,fontSize:14,fontFamily:"'Noto Sans JP',sans-serif",outline:"none",boxSizing:"border-box",background:"#FAFAFA"};

function useSt(key){
  const[d,sD]=useState([]);const[ok,sO]=useState(false);const ref=useRef(d);
  useEffect(()=>{
    const collName=collMap[key]||key;
    const unsub=onSnapshot(collection(db,collName),snap=>{
      const items=snap.docs.map(d=>({...d.data(),id:d.id}));
      ref.current=items;sD(items);sO(true);
    });
    return unsub;
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
  const[f,sF]=useState(init||{name:"",client:"",status:"検討中",assignee:"",deadline:"",shootType:"取材",shootDate:"",shootTime:"",publishDate:"",nextAction:"",nextActionDeadline:"",nextActionMemo:"",caseType:"取材編",amount:"",itoShare:"",itoManual:false,memo:""});
  const s=(k,v)=>sF(p=>({...p,[k]:v}));
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
    </div>
    <Lb label="メモ"><textarea style={{...is,minHeight:70,resize:"vertical"}} value={f.memo} onChange={e=>s("memo",e.target.value)} placeholder="備考"/></Lb>
    <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
      <button onClick={onCancel} style={{padding:"10px 22px",borderRadius:10,border:"1.5px solid #CFD8DC",background:"#fff",fontSize:14,cursor:"pointer",color:"#546E7A"}}>キャンセル</button>
      <button onClick={()=>f.name.trim()&&onSave(f)} disabled={!f.name.trim()} style={{padding:"10px 28px",borderRadius:10,border:"none",background:f.name.trim()?"#1A2A3A":"#B0BEC5",color:"#fff",fontSize:14,fontWeight:600,cursor:f.name.trim()?"pointer":"default"}}>保存</button>
    </div>
  </div>;
}

function CC({c,onEdit,onDel,onDragStart,onDrop,onDragEnd,isDragging,dragOver}){
  const amt=pa(c.amount),ito=pa(c.itoShare);
  return <div><div draggable onDragStart={e=>{e.dataTransfer.effectAllowed="move";onDragStart&&onDragStart(c.id)}} onDragOver={e=>{e.preventDefault();onDrop&&onDrop(c.id,"over")}} onDragLeave={()=>onDrop&&onDrop(c.id,"leave")} onDrop={e=>{e.preventDefault();onDrop&&onDrop(c.id,"drop")}} onDragEnd={onDragEnd} style={{background:"#fff",borderRadius:14,padding:"18px 20px",marginBottom:dragOver?0:10,border:isDragging?"2px dashed #42A5F5":"1px solid #ECEFF1",cursor:"grab",opacity:isDragging?.4:1,transition:"opacity 0.2s, margin 0.15s"}} onClick={()=>onEdit(c)}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
          <span style={{fontSize:15,fontWeight:700,color:"#1A2A3A"}}>{c.name}</span>
          <SB s={c.status}/>
        </div>
        {c.client&&<div style={{fontSize:13,color:"#78909C",marginBottom:4}}>{c.client}</div>}
        <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap",marginTop:4}}>
          {c.assignee&&<span style={{fontSize:12,color:"#546E7A"}}>{c.assignee}</span>}
          {c.deadline&&<span style={{fontSize:12,color:"#546E7A"}}>{fd(c.deadline)} <DB d={c.deadline}/></span>}
        </div>
        {amt>0&&<div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginTop:4}}><span style={{fontSize:12,color:"#33691E",fontWeight:600}}>¥{amt.toLocaleString()}</span>{ito>0&&<span style={{fontSize:11,color:"#78909C"}}>（いとちゃん ¥{ito.toLocaleString()} / KS One ¥{(amt-ito).toLocaleString()}）</span>}</div>}
        {(c.shootDate||c.publishDate)&&<div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginTop:10,paddingTop:10,borderTop:"1px dashed #ECEFF1"}}>{c.shootDate&&<div style={{display:"flex",alignItems:"center",gap:6,background:"#E8EAF6",padding:"8px 14px",borderRadius:12,border:"1px solid #C5CAE9"}}><span style={{fontSize:18}}>📹</span><div><div style={{fontSize:10,color:"#7986CB",fontWeight:600,lineHeight:1}}>{c.shootType||"取材"}</div><div style={{fontSize:15,fontWeight:800,color:"#3949AB",lineHeight:1.3}}>{fd(c.shootDate)}</div>{c.shootTime&&<div style={{fontSize:12,fontWeight:600,color:"#5C6BC0"}}>{c.shootTime}</div>}</div></div>}{c.publishDate&&<div style={{display:"flex",alignItems:"center",gap:6,background:"#E0F2F1",padding:"8px 14px",borderRadius:12,border:"1px solid #B2DFDB"}}><span style={{fontSize:18}}>📡</span><div><div style={{fontSize:10,color:"#80CBC4",fontWeight:600,lineHeight:1}}>配信</div><div style={{fontSize:15,fontWeight:800,color:"#00897B",lineHeight:1.3}}>{fd(c.publishDate)}</div></div></div>}</div>}
        {c.nextAction&&<div style={{marginTop:8,padding:"8px 12px",background:"#FFF8F0",borderRadius:10,border:"1px solid #FFE0B2"}}><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontSize:12,fontWeight:700,color:"#E65100"}}>次：</span><span style={{fontSize:12,fontWeight:600,color:"#37474F",flex:1,minWidth:0}}>{c.nextAction}</span>{c.nextActionDeadline&&<span style={{fontSize:11,color:"#78909C"}}>{fd(c.nextActionDeadline)} <DB d={c.nextActionDeadline}/></span>}</div>{c.nextActionMemo&&<div style={{fontSize:11,color:"#90A4AE",marginTop:4,whiteSpace:"pre-line",maxHeight:36,overflow:"hidden",paddingLeft:0}}>{c.nextActionMemo}</div>}</div>}
        {c.memo&&<div style={{fontSize:12,color:"#90A4AE",marginTop:6,whiteSpace:"pre-line",maxHeight:40,overflow:"hidden"}}>{c.memo}</div>}
      </div>
      <button onClick={e=>{e.stopPropagation();onDel(c.id)}} style={{background:"none",border:"none",cursor:"pointer",padding:4,color:"#B0BEC5",flexShrink:0}}>✕</button>
    </div>
  </div>{dragOver&&<div style={{height:4,borderRadius:2,background:"#42A5F5",margin:"4px 0 10px",transition:"all 0.15s"}}/>}</div>;
}

function SemForm({init,onSave,onCancel}){
  const[f,sF]=useState(init||{name:"",client:"",status:"検討中",eventDate:"",eventTime:"",venue:"",amount:"",invoiceSubmitted:false,nextAction:"",nextActionDeadline:"",nextActionMemo:"",memo:""});
  const s=(k,v)=>sF(p=>({...p,[k]:v}));
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
    </div>
    <Lb label="メモ"><textarea style={{...is,minHeight:70,resize:"vertical"}} value={f.memo} onChange={e=>s("memo",e.target.value)} placeholder="備考"/></Lb>
    <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
      <button onClick={onCancel} style={{padding:"10px 22px",borderRadius:10,border:"1.5px solid #CFD8DC",background:"#fff",fontSize:14,cursor:"pointer",color:"#546E7A"}}>キャンセル</button>
      <button onClick={()=>f.name.trim()&&onSave(f)} disabled={!f.name.trim()} style={{padding:"10px 28px",borderRadius:10,border:"none",background:f.name.trim()?"#4527A0":"#B0BEC5",color:"#fff",fontSize:14,fontWeight:600,cursor:f.name.trim()?"pointer":"default"}}>保存</button>
    </div>
  </div>;
}

function SC2({c,onEdit,onDel}){
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
        {c.nextAction&&<div style={{marginTop:8,padding:"8px 12px",background:"#FFF8F0",borderRadius:10,border:"1px solid #FFE0B2"}}><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontSize:12,fontWeight:700,color:"#E65100"}}>次：</span><span style={{fontSize:12,fontWeight:600,color:"#37474F",flex:1,minWidth:0}}>{c.nextAction}</span>{c.nextActionDeadline&&<span style={{fontSize:11,color:"#78909C"}}>{fd(c.nextActionDeadline)} <DB d={c.nextActionDeadline}/></span>}</div>{c.nextActionMemo&&<div style={{fontSize:11,color:"#90A4AE",marginTop:4,whiteSpace:"pre-line",maxHeight:36,overflow:"hidden"}}>{c.nextActionMemo}</div>}</div>}
      </div>
      <button onClick={e=>{e.stopPropagation();onDel(c.id)}} style={{background:"none",border:"none",cursor:"pointer",padding:4,color:"#B0BEC5",flexShrink:0}}>✕</button>
    </div>
  </div>;
}

function ActList({items,onEdit}){
  if(!items.length)return <div style={{textAlign:"center",padding:"60px 20px",color:"#B0BEC5"}}>未完了のアクションはありません。</div>;
  return <div>{items.map(c=>{const dy=dt(c.nextActionDeadline);let rb="#ECEFF1";if(dy!==null&&dy<=0)rb="#FFCDD2";else if(dy!==null&&dy<=3)rb="#FFE0B2";return <div key={c.id} onClick={()=>onEdit(c)} style={{background:"#fff",borderRadius:12,padding:"14px 18px",marginBottom:8,border:"1.5px solid "+rb,cursor:"pointer"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}><div style={{display:"flex",alignItems:"center",gap:8}}>{c.nextActionDeadline?<span style={{fontSize:14,fontWeight:800,color:dy<0?"#C62828":dy<=3?"#E65100":"#37474F"}}>{fd(c.nextActionDeadline)}</span>:<span style={{fontSize:13,color:"#B0BEC5",fontStyle:"italic"}}>期限未設定</span>}<DB d={c.nextActionDeadline}/></div><SB s={c.status}/></div><div style={{fontSize:13,fontWeight:600,color:"#37474F",marginBottom:4}}>{c.nextAction}</div>{c.nextActionMemo&&<div style={{fontSize:11,color:"#90A4AE",marginBottom:4,whiteSpace:"pre-line",maxHeight:36,overflow:"hidden"}}>{c.nextActionMemo}</div>}<div style={{fontSize:12,color:"#78909C"}}>{c.name}{c.client?" — "+c.client:""}</div></div>})}</div>;
}

function DataP({onClose}){
  const fr=useRef(null);const[msg,sM]=useState(null);const[imp,sI]=useState(false);
  const td=new Date().toISOString().slice(0,10).replace(/-/g,"");
  const dl=(d,n)=>{const b=new Blob([JSON.stringify(d,null,2)],{type:"application/json"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=n;a.click();URL.revokeObjectURL(u)};
  const ex=async()=>{try{const[cSnap,sSnap]=await Promise.all([getDocs(collection(db,"cases")),getDocs(collection(db,"seminars"))]);const c=cSnap.docs.map(d=>({...d.data(),id:d.id}));const s=sSnap.docs.map(d=>({...d.data(),id:d.id}));dl({version:1,exportedAt:new Date().toISOString(),cases:c,seminars:s},"ks1-backup-"+td+".json");sM({ok:true,t:"バックアップ保存（案件"+c.length+"件・セミナー"+s.length+"件）"})}catch(e){sM({ok:false,t:"エクスポート失敗"})}};
  const hf=async e=>{const file=e.target.files&&e.target.files[0];if(!file)return;sI(true);try{const txt=await file.text();const d=JSON.parse(txt);if(!d.version){sM({ok:false,t:"非対応ファイル"});sI(false);return}let cc=0,sc=0;if(d.cases&&Array.isArray(d.cases)){for(const item of d.cases){await setDoc(doc(db,"cases",item.id),item)}cc=d.cases.length}if(d.seminars&&Array.isArray(d.seminars)){for(const item of d.seminars){await setDoc(doc(db,"seminars",item.id),item)}sc=d.seminars.length}sM({ok:true,t:"インポート完了（案件"+cc+"件・セミナー"+sc+"件）"})}catch(e){sM({ok:false,t:"読み込み失敗"})}sI(false);if(fr.current)fr.current.value=""};
  const bs={padding:"10px 16px",borderRadius:10,border:"none",fontSize:13,fontWeight:600,cursor:"pointer",width:"100%",textAlign:"center"};
  return <div><h2 style={{fontSize:20,fontWeight:700,color:"#1A2A3A",marginBottom:8}}>データ管理</h2><p style={{fontSize:13,color:"#78909C",marginBottom:20}}>バックアップの保存・復元</p><button onClick={ex} style={{...bs,background:"#1A2A3A",color:"#fff",marginBottom:8}}>全データバックアップ（JSON）</button><input ref={fr} type="file" accept=".json" onChange={hf} style={{display:"none"}}/><button onClick={()=>fr.current&&fr.current.click()} disabled={imp} style={{...bs,background:"#fff",color:"#1A2A3A",border:"1.5px solid #CFD8DC",marginBottom:8}}>{imp?"読み込み中…":"バックアップから復元（JSON）"}</button><p style={{fontSize:11,color:"#B0BEC5",marginBottom:12}}>※既存データとマージされます</p>{msg&&<div style={{padding:"10px 14px",borderRadius:10,marginBottom:16,fontSize:13,background:msg.ok?"#E8F5E9":"#FFEBEE",color:msg.ok?"#1B5E20":"#C62828"}}>{msg.t}</div>}<button onClick={onClose} style={{...bs,background:"#F5F5F5",color:"#546E7A"}}>閉じる</button></div>;
}

function CaseMod(){
  const[cases,sC,ok]=useSt(CK);const[mo,sM]=useState(false);const[ed,sE]=useState(null);const[dl,sD]=useState(null);const[vw,sV]=useState("cases");const[fs,sFs]=useState("すべて");const[q,sQ]=useState("");const[aq,sAq]=useState("");
  const opts=[...new Set(["Ken","Ito",...cases.map(c=>c.assignee).filter(Boolean)])];
  const save=f=>{if(ed){sC(p=>p.map(c=>c.id===ed.id?{...c,...f,updatedAt:new Date().toISOString()}:c))}else{const it={id:uid(),...f,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};sC(p=>{const ac=p.filter(c=>c.status!=="完了"),dn=p.filter(c=>c.status==="完了"),pd=it.publishDate||"9999-12-31";let idx=ac.length;for(let i=0;i<ac.length;i++){if(pd<=(ac[i].publishDate||"9999-12-31")){idx=i;break}}const na=[...ac];na.splice(idx,0,it);return[...na,...dn]})}sM(false);sE(null)};
  const[dragId,sDragId]=useState(null);const[dragOverId,sDragOverId]=useState(null);
  const fil=cases.filter(c=>{if(c.status==="完了")return false;if(fs!=="すべて"&&c.status!==fs)return false;if(q)return(c.name+c.client+c.assignee+c.memo+(c.nextAction||"")).toLowerCase().includes(q.toLowerCase());return true}).sort((a,b)=>{const ka=a.status==="検討中"?1:0,kb=b.status==="検討中"?1:0;if(ka!==kb)return ka-kb;if(a.order!=null&&b.order!=null)return a.order-b.order;if(a.order!=null)return-1;if(b.order!=null)return 1;return(a.shootDate||"9999").localeCompare(b.shootDate||"9999")});
  const onDragStart=(id)=>sDragId(id);
  const handleDrop=(targetId,action)=>{if(action==="over"){if(dragId&&dragId!==targetId)sDragOverId(targetId);return}if(action==="leave"){sDragOverId(v=>v===targetId?null:v);return}if(action==="drop"){if(!dragId||dragId===targetId){sDragId(null);sDragOverId(null);return}const ids=fil.map(c=>c.id);const fromIdx=ids.indexOf(dragId);const toIdx=ids.indexOf(targetId);if(fromIdx<0||toIdx<0)return;ids.splice(fromIdx,1);ids.splice(toIdx,0,dragId);const orderMap=Object.fromEntries(ids.map((id,i)=>[id,i]));sC(p=>p.map(c=>orderMap[c.id]!=null?{...c,order:orderMap[c.id]}:c));sDragId(null);sDragOverId(null)}};
  const onDragEnd=()=>{sDragId(null);sDragOverId(null)};
  const cnt={total:cases.filter(c=>c.status!=="完了").length,act:cases.filter(c=>c.status==="進行中").length,pend:cases.filter(c=>c.status==="確認待ち").length,done:cases.filter(c=>c.status==="完了").length};
  const acts=cases.filter(c=>c.nextAction&&c.status!=="完了").sort((a,b)=>(a.nextActionDeadline||"9999").localeCompare(b.nextActionDeadline||"9999"));
  const arch=cases.filter(c=>c.status==="完了").filter(c=>!aq||(c.name+c.client+c.memo).toLowerCase().includes(aq.toLowerCase())).sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
  if(!ok)return <div style={{textAlign:"center",padding:60,color:"#90A4AE"}}>読み込み中…</div>;
  return <><div style={{background:"#1A2A3A",padding:"28px 28px 24px",borderRadius:"0 0 24px 24px"}}><div style={{maxWidth:720,margin:"0 auto"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.45)",letterSpacing:".12em",marginBottom:4}}>KS One Investment</div><h1 style={{fontSize:22,fontWeight:800,color:"#fff",margin:0}}>案件マネージャー</h1></div><button onClick={()=>{sE(null);sM(true)}} style={{background:"linear-gradient(135deg,#42A5F5,#1E88E5)",color:"#fff",border:"none",borderRadius:12,padding:"11px 22px",fontSize:14,fontWeight:700,cursor:"pointer"}}>+ 新規案件</button></div><div style={{display:"flex",gap:10,marginTop:20}}>{[["全案件",cnt.total,"#1A2A3A"],["進行中",cnt.act,"#2196F3"],["確認待ち",cnt.pend,"#FFC107"],["完了",cnt.done,"#4CAF50"]].map(([l,v,c])=><div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 18px",border:"1px solid #ECEFF1",flex:"1 1 0",minWidth:80}}><div style={{fontSize:24,fontWeight:800,color:c}}>{v}</div><div style={{fontSize:11,color:"#90A4AE",fontWeight:600,marginTop:2}}>{l}</div></div>)}</div></div></div>
  <div style={{maxWidth:720,margin:"0 auto",padding:"20px 16px 40px"}}>
    <div style={{display:"flex",gap:0,marginBottom:16,background:"#fff",borderRadius:12,border:"1px solid #E0E6EB",overflow:"hidden"}}>{[{k:"cases",l:"案件一覧"},{k:"actions",l:"アクション期限",n:acts.length},{k:"archive",l:"過去の案件",n:cnt.done}].map(t=><button key={t.k} onClick={()=>sV(t.k)} style={{flex:1,padding:"11px 14px",border:"none",cursor:"pointer",background:vw===t.k?"#1A2A3A":"transparent",color:vw===t.k?"#fff":"#78909C",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>{t.l}{t.n!=null&&<span style={{fontSize:11,fontWeight:700,padding:"1px 7px",borderRadius:10,background:vw===t.k?"rgba(255,255,255,.2)":"#FFF3E0",color:vw===t.k?"#fff":"#E65100"}}>{t.n}</span>}</button>)}</div>
    {vw==="cases"&&<><div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}><div style={{flex:1,minWidth:180}}><input style={{...is,background:"#fff"}} placeholder="検索…" value={q} onChange={e=>sQ(e.target.value)}/></div><div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>{["すべて",...STS.filter(s=>s!=="完了")].map(s=>{const a=fs===s,sc=s!=="すべて"?SC[s]:null;return <button key={s} onClick={()=>sFs(s)} style={{padding:"7px 14px",borderRadius:20,border:a?"none":"1.5px solid #E0E6EB",background:a?(sc?sc.bg:"#1A2A3A"):"#fff",color:a?(sc?sc.t:"#fff"):"#78909C",fontSize:12,fontWeight:600,cursor:"pointer"}}>{s}</button>})}</div></div>{fil.length===0?<div style={{textAlign:"center",padding:60,color:"#B0BEC5"}}>{cases.length===0?"まだ案件がありません。":"該当なし"}</div>:fil.map(c=><CC key={c.id} c={c} onEdit={c=>{sE(c);sM(true)}} onDel={id=>sD(id)} onDragStart={onDragStart} onDrop={handleDrop} onDragEnd={onDragEnd} isDragging={dragId===c.id} dragOver={dragOverId===c.id&&dragId!==c.id}/>)}</>}
    {vw==="actions"&&<ActList items={acts} onEdit={c=>{sE(c);sM(true)}}/>}
    {vw==="archive"&&<div><div style={{marginBottom:14}}><input style={{...is,background:"#fff"}} placeholder="過去の案件を検索…" value={aq} onChange={e=>sAq(e.target.value)}/></div>{arch.length===0?<div style={{textAlign:"center",padding:60,color:"#B0BEC5"}}>完了案件なし</div>:arch.map(c=>{const a=pa(c.amount),i=pa(c.itoShare);return <div key={c.id} onClick={()=>{sE(c);sM(true)}} style={{background:"#fff",borderRadius:12,padding:"14px 18px",marginBottom:8,border:"1px solid #E8F5E9",cursor:"pointer",opacity:.85}}><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}><span style={{fontSize:14,fontWeight:700,color:"#37474F"}}>{c.name}</span><span style={{fontSize:10,color:"#1B5E20",background:"#E8F5E9",padding:"2px 8px",borderRadius:12}}>✓ 完了</span></div>{c.client&&<div style={{fontSize:12,color:"#90A4AE",marginBottom:4}}>{c.client}</div>}<div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{a>0&&<span style={{fontSize:11,color:"#558B2F",fontWeight:600}}>¥{a.toLocaleString()}</span>}{i>0&&<span style={{fontSize:11,color:"#90A4AE"}}>（いとちゃん ¥{i.toLocaleString()}）</span>}</div></div>})}{arch.length>0&&(()=>{const ta=arch.reduce((s,c)=>s+pa(c.amount),0),ti=arch.reduce((s,c)=>s+pa(c.itoShare),0);return ta>0?<div style={{marginTop:12,padding:"12px 16px",background:"#F1F8E9",borderRadius:12,border:"1px solid #DCEDC8",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,fontWeight:600,color:"#33691E"}}>完了合計</span><div style={{display:"flex",gap:16,fontSize:12}}><span style={{color:"#33691E",fontWeight:700}}>¥{ta.toLocaleString()}</span>{ti>0&&<span style={{color:"#558B2F"}}>KS One ¥{(ta-ti).toLocaleString()}</span>}</div></div>:null})()}</div>}
  </div>
  <Md open={mo} onClose={()=>{sM(false);sE(null)}}><CaseForm init={ed} onSave={save} onCancel={()=>{sM(false);sE(null)}} opts={opts}/></Md>
  <Md open={!!dl} onClose={()=>sD(null)}><div style={{textAlign:"center"}}><div style={{fontSize:40,marginBottom:12}}>⚠️</div><h3 style={{fontSize:17,fontWeight:700,marginBottom:24}}>削除しますか？</h3><div style={{display:"flex",gap:10,justifyContent:"center"}}><button onClick={()=>sD(null)} style={{padding:"10px 24px",borderRadius:10,border:"1.5px solid #CFD8DC",background:"#fff",fontSize:14,cursor:"pointer"}}>キャンセル</button><button onClick={()=>{sC(p=>p.filter(c=>c.id!==dl));sD(null)}} style={{padding:"10px 24px",borderRadius:10,border:"none",background:"#E53935",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>削除</button></div></div></Md>
  </>;
}

function SemMod(){
  const[sems,sS,ok]=useSt(SK);const[mo,sM]=useState(false);const[ed,sE]=useState(null);const[dl,sD]=useState(null);const[vw,sV]=useState("list");const[fs,sFs]=useState("すべて");const[q,sQ]=useState("");const[aq,sAq]=useState("");
  const save=f=>{if(ed){sS(p=>p.map(c=>c.id===ed.id?{...c,...f,updatedAt:new Date().toISOString()}:c))}else{sS(p=>[{id:uid(),...f,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},...p])}sM(false);sE(null)};
  const fil=sems.filter(c=>{if(c.status==="完了")return false;if(fs!=="すべて"&&c.status!==fs)return false;if(q)return(c.name+c.client+c.venue+c.memo+(c.nextAction||"")).toLowerCase().includes(q.toLowerCase());return true});
  const cnt={total:sems.filter(c=>c.status!=="完了").length,act:sems.filter(c=>c.status==="進行中").length,pend:sems.filter(c=>c.status==="確認待ち").length,done:sems.filter(c=>c.status==="完了").length};
  const acts=sems.filter(c=>c.nextAction&&c.status!=="完了").sort((a,b)=>(a.nextActionDeadline||"9999").localeCompare(b.nextActionDeadline||"9999"));
  const arch=sems.filter(c=>c.status==="完了").filter(c=>!aq||(c.name+c.client+c.venue).toLowerCase().includes(aq.toLowerCase())).sort((a,b)=>{const ai=a.invoiceSubmitted?1:0,bi=b.invoiceSubmitted?1:0;if(ai!==bi)return ai-bi;return(b.updatedAt||"").localeCompare(a.updatedAt||"")});
  const upc=arch.filter(c=>!c.invoiceSubmitted).length;
  if(!ok)return <div style={{textAlign:"center",padding:60,color:"#90A4AE"}}>読み込み中…</div>;
  return <><div style={{background:"linear-gradient(135deg,#4527A0,#6A1B9A)",padding:"28px 28px 24px",borderRadius:"0 0 24px 24px"}}><div style={{maxWidth:720,margin:"0 auto"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.45)",letterSpacing:".12em",marginBottom:4}}>KS One Investment</div><h1 style={{fontSize:22,fontWeight:800,color:"#fff",margin:0}}>セミナー管理</h1></div><button onClick={()=>{sE(null);sM(true)}} style={{background:"linear-gradient(135deg,#AB47BC,#8E24AA)",color:"#fff",border:"none",borderRadius:12,padding:"11px 22px",fontSize:14,fontWeight:700,cursor:"pointer"}}>+ 新規セミナー</button></div><div style={{display:"flex",gap:10,marginTop:20}}>{[["全件",cnt.total,"#4527A0"],["進行中",cnt.act,"#2196F3"],["確認待ち",cnt.pend,"#FFC107"],["完了",cnt.done,"#4CAF50"]].map(([l,v,c])=><div key={l} style={{background:"#fff",borderRadius:12,padding:"14px 18px",border:"1px solid #ECEFF1",flex:"1 1 0",minWidth:80}}><div style={{fontSize:24,fontWeight:800,color:c}}>{v}</div><div style={{fontSize:11,color:"#90A4AE",fontWeight:600,marginTop:2}}>{l}</div></div>)}</div></div></div>
  <div style={{maxWidth:720,margin:"0 auto",padding:"20px 16px 40px"}}>
    <div style={{display:"flex",gap:0,marginBottom:16,background:"#fff",borderRadius:12,border:"1px solid #E0E6EB",overflow:"hidden"}}>{[{k:"list",l:"セミナー一覧"},{k:"actions",l:"アクション期限",n:acts.length},{k:"archive",l:"過去のセミナー",n:cnt.done}].map(t=><button key={t.k} onClick={()=>sV(t.k)} style={{flex:1,padding:"11px 14px",border:"none",cursor:"pointer",background:vw===t.k?"#4527A0":"transparent",color:vw===t.k?"#fff":"#78909C",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>{t.l}{t.n!=null&&<span style={{fontSize:11,fontWeight:700,padding:"1px 7px",borderRadius:10,background:vw===t.k?"rgba(255,255,255,.2)":"#F3E5F5",color:vw===t.k?"#fff":"#6A1B9A"}}>{t.n}</span>}</button>)}</div>
    {vw==="list"&&<><div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}><div style={{flex:1,minWidth:180}}><input style={{...is,background:"#fff"}} placeholder="検索…" value={q} onChange={e=>sQ(e.target.value)}/></div><div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>{["すべて",...STS.filter(s=>s!=="完了")].map(s=>{const a=fs===s,sc=s!=="すべて"?SC[s]:null;return <button key={s} onClick={()=>sFs(s)} style={{padding:"7px 14px",borderRadius:20,border:a?"none":"1.5px solid #E0E6EB",background:a?(sc?sc.bg:"#4527A0"):"#fff",color:a?(sc?sc.t:"#fff"):"#78909C",fontSize:12,fontWeight:600,cursor:"pointer"}}>{s}</button>})}</div></div>{fil.length===0?<div style={{textAlign:"center",padding:60,color:"#B0BEC5"}}>{sems.length===0?"まだセミナーがありません。":"該当なし"}</div>:fil.map(c=><SC2 key={c.id} c={c} onEdit={c=>{sE(c);sM(true)}} onDel={id=>sD(id)}/>)}</>}
    {vw==="actions"&&<ActList items={acts} onEdit={c=>{sE(c);sM(true)}}/>}
    {vw==="archive"&&<div><div style={{marginBottom:14}}><input style={{...is,background:"#fff"}} placeholder="過去のセミナーを検索…" value={aq} onChange={e=>sAq(e.target.value)}/></div>{upc>0&&<div style={{marginBottom:12,padding:"12px 16px",background:"#FFF3E0",borderRadius:12,border:"1.5px solid #FFCC80"}}><span style={{fontSize:13,fontWeight:700,color:"#E65100"}}>⚠ 請求書未提出 {upc}件</span></div>}{arch.length===0?<div style={{textAlign:"center",padding:60,color:"#B0BEC5"}}>完了セミナーなし</div>:arch.map(c=>{const a=pa(c.amount),up=!c.invoiceSubmitted;return <div key={c.id} onClick={()=>{sE(c);sM(true)}} style={{background:"#fff",borderRadius:12,padding:"14px 18px",marginBottom:8,border:up?"1.5px solid #FFCC80":"1px solid #E8F5E9",cursor:"pointer",opacity:up?1:.85}}><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}><span style={{fontSize:14,fontWeight:700,color:"#37474F"}}>{c.name}</span><span style={{fontSize:10,color:"#1B5E20",background:"#E8F5E9",padding:"2px 8px",borderRadius:12}}>✓ 完了</span>{up?<span style={{fontSize:10,fontWeight:700,color:"#E65100",background:"#FFF3E0",padding:"2px 8px",borderRadius:12}}>請求書未提出</span>:<span style={{fontSize:10,color:"#1B5E20",background:"#E8F5E9",padding:"2px 8px",borderRadius:12}}>✓ 提出済</span>}</div>{c.client&&<div style={{fontSize:12,color:"#90A4AE",marginBottom:4}}>{c.client}</div>}<div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{c.eventDate&&<span style={{fontSize:11,color:"#90A4AE"}}>{fd(c.eventDate)}{c.eventTime?" "+c.eventTime:""}</span>}{c.venue&&<span style={{fontSize:11,color:"#90A4AE"}}>{c.venue}</span>}{a>0&&<span style={{fontSize:11,color:"#558B2F",fontWeight:600}}>¥{a.toLocaleString()}</span>}</div></div>})}{arch.length>0&&(()=>{const ta=arch.reduce((s,c)=>s+pa(c.amount),0);return ta>0?<div style={{marginTop:12,padding:"12px 16px",background:"#F1F8E9",borderRadius:12,border:"1px solid #DCEDC8",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,fontWeight:600,color:"#33691E"}}>完了合計</span><span style={{fontSize:12,color:"#33691E",fontWeight:700}}>¥{ta.toLocaleString()}</span></div>:null})()}</div>}
  </div>
  <Md open={mo} onClose={()=>{sM(false);sE(null)}}><SemForm init={ed} onSave={save} onCancel={()=>{sM(false);sE(null)}}/></Md>
  <Md open={!!dl} onClose={()=>sD(null)}><div style={{textAlign:"center"}}><div style={{fontSize:40,marginBottom:12}}>⚠️</div><h3 style={{fontSize:17,fontWeight:700,marginBottom:24}}>削除しますか？</h3><div style={{display:"flex",gap:10,justifyContent:"center"}}><button onClick={()=>sD(null)} style={{padding:"10px 24px",borderRadius:10,border:"1.5px solid #CFD8DC",background:"#fff",fontSize:14,cursor:"pointer"}}>キャンセル</button><button onClick={()=>{sS(p=>p.filter(c=>c.id!==dl));sD(null)}} style={{padding:"10px 24px",borderRadius:10,border:"none",background:"#E53935",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>削除</button></div></div></Md>
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
    <div style={{maxWidth:720,margin:"0 auto",padding:"16px 16px 0"}}><div style={{display:"flex",gap:8,alignItems:"center"}}>{[{k:"cases",l:"案件管理",e:"📋",bg:"#1A2A3A"},{k:"seminars",l:"セミナー管理",e:"🎤",bg:"#4527A0"}].map(t=><button key={t.k} onClick={()=>sA(t.k)} style={{flex:1,padding:"12px 16px",borderRadius:14,border:app===t.k?"2px solid "+t.bg:"2px solid transparent",background:app===t.k?t.bg:"#fff",color:app===t.k?"#fff":"#78909C",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><span style={{fontSize:18}}>{t.e}</span>{t.l}</button>)}<button onClick={()=>sD(true)} style={{width:48,height:48,borderRadius:14,border:"none",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#90A4AE",fontSize:20}}>⬇</button><button onClick={()=>signOut(auth)} title="ログアウト" style={{width:48,height:48,borderRadius:14,border:"none",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#90A4AE",fontSize:16}}>🚪</button></div></div>
    {app==="cases"&&<CaseMod/>}
    {app==="seminars"&&<SemMod/>}
    <Md open={dp} onClose={()=>sD(false)}><DataP onClose={()=>sD(false)}/></Md>
  </div>;
}
