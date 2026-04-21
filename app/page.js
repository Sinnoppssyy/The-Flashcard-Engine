'use client';
import { useState, useEffect, useRef } from 'react';

// ── SM-2 ─────────────────────────────────────────────────────────────────────
function sm2(card, rating) {
  let { intervalHours=24, easeFactor=2.5, repetitions=0 } = card;
  if (rating===0){repetitions=0;intervalHours=1;}
  else if(rating===1){intervalHours=Math.max(1,Math.round(intervalHours*0.6));repetitions+=1;}
  else{intervalHours=repetitions===0?24:repetitions===1?72:Math.round(intervalHours*easeFactor);repetitions+=1;}
  const q=[0,1,3,5][rating];
  easeFactor=Math.max(1.3,Math.min(3.0,easeFactor+0.1-(5-q)*(0.08+(5-q)*0.02)));
  const next=new Date();next.setHours(next.getHours()+intervalHours);
  return{...card,intervalHours,easeFactor,repetitions,nextReview:next.toISOString(),lastReview:new Date().toISOString(),history:[...(card.history||[]),{date:new Date().toISOString(),rating}]};
}
function isDue(c){return new Date(c.nextReview)<=new Date();}
function masteryLevel(c){if(c.repetitions===0)return'new';if(c.intervalHours>=21*24)return'mastered';if(c.intervalHours>=7*24)return'learning';return'young';}
function fmtNext(iso){if(!iso)return'Now';const h=Math.max(0,Math.ceil((new Date(iso)-new Date())/36e5));if(h<=0)return'⚡Due';if(h<24)return`${h}h`;const d=Math.round(h/24);return d===1?'Tomorrow':d<7?`${d}d`:`${Math.round(d/7)}w`;}
function fmtInterval(h){if(!h||h<1)return'1h';if(h<24)return`${h}h`;const d=Math.round(h/24);return d===1?'1d':d<7?`${d}d`:d<30?`${Math.round(d/7)}w`:`${Math.round(d/30)}mo`;}
function fmtDate(iso){if(!iso)return'—';return new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});}
function fmtDateTime(iso){if(!iso)return'—';return new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
function buildQuizOpts(card){const correct=card.options[0];const all=shuffle([correct,...shuffle(card.options.slice(1))]);return{all,correctIdx:all.indexOf(correct)};}

// ── API ───────────────────────────────────────────────────────────────────────
const api={
  decks:()=>fetch('/api/decks').then(r=>r.json()).then(d=>d.decks||[]),
  saveDeck:deck=>fetch('/api/decks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(deck)}),
  deleteDeck:id=>fetch('/api/decks',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}),
  updateCards:cards=>fetch('/api/decks/update-cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cards})}),
  results:(deckId)=>fetch(deckId?`/api/results?deckId=${deckId}`:'/api/results').then(r=>r.json()).then(d=>d.results||[]),
  saveResult:r=>fetch('/api/results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(r)}),
  stats:()=>fetch('/api/stats').then(r=>r.json()).then(d=>d.stats||{}),
  saveFeedback:f=>fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f)}),
};

// ── TINY ATOMS ────────────────────────────────────────────────────────────────
function Spin({size=18,color='var(--primary)'}){return<div style={{width:size,height:size,border:`2.5px solid var(--border)`,borderTopColor:color,borderRadius:'50%',animation:'spin 0.7s linear infinite',flexShrink:0}}/>;}
function Toast({t}){if(!t)return null;const c={ok:'t-ok',err:'t-err',inf:'t-inf'}[t.type]||'t-inf';return<div className={`toast ${c}`}>{t.msg}</div>;}
function Prog({value,max,color='var(--primary)',h=5}){const p=max>0?Math.min(100,(value/max)*100):0;return<div className="prog" style={{height:h}}><div className="prog-fill" style={{width:`${p}%`,background:color}}/></div>;}
function Confetti({active}){if(!active)return null;return<div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:9998,overflow:'hidden'}}>{Array.from({length:28},(_,i)=><div key={i} className="confetti-piece" style={{left:`${2+Math.random()*96}%`,top:'-12px',background:['#4255ff','#06b6d4','#f59e0b','#ef4444','#10b981','#8b5cf6'][i%6],width:5+Math.random()*7,height:5+Math.random()*7,animationDelay:`${Math.random()*0.5}s`,borderRadius:Math.random()>0.5?'50%':'2px'}}/>)}</div>;}

function MBadge({level}){
  const m={new:['b-new','New'],young:['b-young','Learning'],learning:['b-learning','Review'],mastered:['b-mastered','Mastered']};
  const[c,l]=m[level]||m.new;return<span className={`badge ${c}`}>{l}</span>;
}

function StatBox({icon,value,label,color,sub}){
  return<div className="stat-box"><div style={{display:'flex',alignItems:'center',gap:'0.6rem',marginBottom:'0.35rem'}}><span style={{fontSize:'1.4rem'}}>{icon}</span><div className="stat-num" style={{color:color||'var(--ink)'}}>{value}</div></div><div className="stat-lbl">{label}</div>{sub&&<div style={{fontSize:'0.72rem',color:'var(--ink3)',marginTop:2}}>{sub}</div>}</div>;
}

// ── FEEDBACK MODAL ────────────────────────────────────────────────────────────
function FeedbackModal({onClose}){
  const [rating,setRating]=useState(0);const[hover,setHover]=useState(0);const[cat,setCat]=useState('');const[comment,setComment]=useState('');const[email,setEmail]=useState('');const[sent,setSent]=useState(false);const[loading,setLoading]=useState(false);
  const cats=['Feature Request','Bug Report','UI/UX Feedback','Content Quality','General'];
  async function submit(){if(!rating)return;setLoading(true);await api.saveFeedback({rating,category:cat,comment,email});setLoading(false);setSent(true);}
  if(sent)return<div className="modal-overlay" onClick={onClose}><div className="modal asc" onClick={e=>e.stopPropagation()} style={{textAlign:'center'}}><div style={{fontSize:'3rem',marginBottom:'0.75rem',animation:'bounce 0.6s ease'}}>🎉</div><h3 style={{marginBottom:'0.5rem'}}>Thanks for your feedback!</h3><p style={{color:'var(--ink2)',fontSize:'0.9rem',marginBottom:'1.5rem'}}>Your response helps us build a better product for students.</p><button className="btn btn-primary" onClick={onClose}>Close</button></div></div>;
  return<div className="modal-overlay" onClick={onClose}><div className="modal au" onClick={e=>e.stopPropagation()}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem'}}>
      <div><h3 style={{marginBottom:'0.2rem'}}>Share Your Feedback</h3><p style={{fontSize:'0.82rem',color:'var(--ink3)'}}>Help us improve FlashMind for students</p></div>
      <button className="btn btn-ghost" style={{padding:'0.3rem 0.6rem',fontSize:'1rem'}} onClick={onClose}>✕</button>
    </div>
    <div style={{marginBottom:'1.25rem'}}>
      <div style={{fontSize:'0.8rem',fontWeight:700,marginBottom:'0.5rem',color:'var(--ink2)'}}>How would you rate your experience?</div>
      <div style={{display:'flex',gap:'0.4rem'}}>{[1,2,3,4,5].map(s=><span key={s} className="star" style={{color:(hover||rating)>=s?'#f59e0b':'var(--border2)'}} onMouseEnter={()=>setHover(s)} onMouseLeave={()=>setHover(0)} onClick={()=>setRating(s)}>★</span>)}</div>
      {rating>0&&<div style={{fontSize:'0.78rem',color:'var(--ink3)',marginTop:'0.3rem'}}>{['','Needs a lot of work','Could be better','It\'s decent','Really good!','Absolutely love it!'][rating]}</div>}
    </div>
    <div style={{marginBottom:'1rem'}}>
      <div style={{fontSize:'0.8rem',fontWeight:700,marginBottom:'0.5rem',color:'var(--ink2)'}}>Category</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:'0.4rem'}}>{cats.map(c=><button key={c} onClick={()=>setCat(c)} style={{padding:'0.35rem 0.75rem',borderRadius:99,border:`1.5px solid ${cat===c?'var(--primary)':'var(--border)'}`,background:cat===c?'var(--primary-lt)':'var(--card)',color:cat===c?'var(--primary)':'var(--ink2)',fontSize:'0.78rem',fontWeight:600,cursor:'pointer',transition:'all 0.13s'}}>{c}</button>)}</div>
    </div>
    <div style={{marginBottom:'1rem'}}><textarea className="input" placeholder="Tell us what you think — what works, what doesn't, what you'd love to see..." value={comment} onChange={e=>setComment(e.target.value)} rows={3} style={{resize:'vertical',minHeight:80}}/></div>
    <div style={{marginBottom:'1.25rem'}}><input className="input" type="email" placeholder="Email (optional — we'll reply)" value={email} onChange={e=>setEmail(e.target.value)}/></div>
    <button className="btn btn-primary" onClick={submit} disabled={!rating||loading} style={{width:'100%',padding:'0.8rem'}}>{loading?<><Spin size={16} color="#fff"/>Sending…</>:'Send Feedback'}</button>
  </div></div>;
}

// ── UPLOAD VIEW ───────────────────────────────────────────────────────────────
function UploadView({onCreated}){
  const [drag,setDrag]=useState(false);const[file,setFile]=useState(null);const[name,setName]=useState('');
  const [phase,setPhase]=useState('idle');const[err,setErr]=useState('');const[pct,setPct]=useState(0);
  const ref=useRef();const timer=useRef();
  function pick(f){if(!f)return;if(f.type!=='application/pdf'){setErr('Only PDF files.');return;}if(f.size>10*1024*1024){setErr('Max 10MB.');return;}setErr('');setFile(f);if(!name)setName(f.name.replace('.pdf','').replace(/[-_]/g,' ').replace(/\b\w/g,l=>l.toUpperCase()));}
  useEffect(()=>{if(phase==='generating'){setPct(25);timer.current=setInterval(()=>setPct(p=>p<85?p+1:p),600);}if(phase==='idle'||phase==='error'){clearInterval(timer.current);setPct(0);}if(phase==='done'){clearInterval(timer.current);setPct(100);}return()=>clearInterval(timer.current);},[phase]);
  async function go(){if(!file||!name.trim())return;setErr('');setPhase('parsing');
    try{const fd=new FormData();fd.append('pdf',file);const pr=await fetch('/api/parse-pdf',{method:'POST',body:fd});const pd=await pr.json();if(!pr.ok)throw new Error(pd.error);
      setPhase('generating');const gr=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:pd.text,deckName:name.trim()})});const gd=await gr.json();if(!gr.ok)throw new Error(gd.error);
      const deck={id:Date.now().toString(),name:name.trim(),createdAt:new Date().toISOString(),cards:gd.cards,pages:pd.pages};
      await api.saveDeck(deck);setPhase('done');onCreated(deck);
    }catch(e){setErr(e.message||'Something went wrong.');setPhase('error');}}
  const busy=phase==='parsing'||phase==='generating';
  return(
    <div style={{maxWidth:620,margin:'0 auto'}}>
      <div style={{marginBottom:'2rem'}}><h2 style={{marginBottom:'0.3rem'}}>Create New Deck</h2><p style={{color:'var(--ink2)',fontSize:'0.9rem'}}>Upload any PDF and get AI-generated flashcards with quiz & matching game — ready in under 60 seconds.</p></div>
      {/* Hero drop zone */}
      <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);pick(e.dataTransfer.files[0]);}} onClick={()=>!busy&&ref.current?.click()}
        style={{border:`3px dashed ${drag?'var(--primary)':file?'var(--green)':'var(--border2)'}`,borderRadius:'var(--r-lg)',background:drag?'var(--primary-lt)':file?'var(--green-lt)':'var(--card)',padding:'3rem 2rem',textAlign:'center',cursor:busy?'not-allowed':'pointer',transition:'all 0.2s',marginBottom:'1rem',position:'relative',overflow:'hidden',boxShadow:drag?`0 0 0 6px rgba(66,85,255,0.1)`:'none'}}>
        <input ref={ref} type="file" accept=".pdf" style={{display:'none'}} onChange={e=>pick(e.target.files[0])}/>
        {busy&&<div style={{position:'absolute',bottom:0,left:0,right:0,height:5,background:'var(--border)'}}><div style={{height:'100%',background:'linear-gradient(90deg,var(--primary),var(--teal))',width:`${pct}%`,transition:'width 0.4s ease'}}/></div>}
        <div style={{fontSize:'3rem',marginBottom:'0.75rem'}}>{busy?'⚙️':file?'📄':'☁️'}</div>
        {file?<><div style={{fontWeight:700,fontSize:'1.05rem',marginBottom:4}}>{file.name}</div><div style={{color:'var(--ink3)',fontSize:'0.82rem'}}>{busy?(phase==='parsing'?'📖 Reading your PDF…':'🤖 AI generating elaborated flashcards with quiz options…'):`${(file.size/1024).toFixed(0)} KB · click to change`}</div></>
        :<><div style={{fontWeight:700,fontSize:'1.1rem',marginBottom:6}}>Drop your PDF here</div><div style={{color:'var(--ink3)'}}>or click to browse — supports any text-based PDF up to 10MB</div></>}
      </div>
      <input className="input" type="text" placeholder="Give this deck a name (e.g. Physics: Laws of Motion)" value={name} onChange={e=>setName(e.target.value)} disabled={busy} maxLength={80} style={{marginBottom:'0.75rem'}} onKeyDown={e=>e.key==='Enter'&&go()}/>
      {err&&<div style={{background:'var(--red-lt)',border:'1px solid #fca5a5',borderRadius:'var(--r-sm)',padding:'0.7rem 1rem',marginBottom:'0.75rem',color:'var(--red)',fontSize:'0.85rem',fontWeight:500}}>⚠️ {err}</div>}
      <button className="btn btn-primary" onClick={go} disabled={busy||!file||!name.trim()} style={{width:'100%',padding:'0.9rem',fontSize:'1rem'}}>
        {busy?<><Spin size={18} color="#fff"/>{phase==='parsing'?'Reading PDF…':'Generating Smart Flashcards…'}</>:'✦ Generate Flashcards + Quiz + Match Game'}
      </button>
      {/* What you get */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'0.75rem',marginTop:'1.5rem'}}>
        {[['🃏','Flashcards','Flip through elaborated cards with examples'],['🎯','Learn Mode','SM-2 spaced repetition — right cards at the right time'],['📝','Quiz Mode','Multiple choice with topic-level performance analysis'],['🔗','Match Game','Pair terms with definitions — race the clock']].map(([ic,t,d])=>(
          <div key={t} style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'1rem',display:'flex',gap:'0.75rem',alignItems:'flex-start'}}>
            <span style={{fontSize:'1.5rem',flexShrink:0}}>{ic}</span>
            <div><div style={{fontWeight:700,fontSize:'0.88rem',marginBottom:2}}>{t}</div><div style={{fontSize:'0.75rem',color:'var(--ink3)',lineHeight:1.4}}>{d}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── FLASHCARD MODE ────────────────────────────────────────────────────────────
function FlashcardsMode({deck,onBack}){
  const cards=deck.cards;const[idx,setIdx]=useState(0);const[flipped,setFlipped]=useState(false);const[k,setK]=useState(0);
  useEffect(()=>{const h=e=>{if(e.key===' '||e.key==='ArrowRight'){e.preventDefault();if(!flipped)setFlipped(true);else if(idx<cards.length-1){setK(p=>p+1);setFlipped(false);setIdx(idx+1);}}if(e.key==='ArrowLeft'&&idx>0){setK(p=>p+1);setFlipped(false);setIdx(idx-1);}};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);},[flipped,idx]);
  const card=cards[idx];
  return<div style={{maxWidth:720,margin:'0 auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}>
      <button className="btn btn-ghost" onClick={onBack}>← Back</button>
      <div style={{flex:1,padding:'0 1.5rem'}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}><span style={{fontSize:'0.8rem',color:'var(--ink3)',fontWeight:600}}>{idx+1} / {cards.length}</span><span style={{fontSize:'0.75rem',color:'var(--ink3)'}}>{card.topic}</span></div><Prog value={idx+1} max={cards.length}/></div>
      <MBadge level={masteryLevel(card)}/>
    </div>
    <div key={`${k}-${flipped}`} className="card3 af" onClick={()=>setFlipped(f=>!f)} style={{minHeight:320,display:'flex',flexDirection:'column',padding:'2.75rem 2.5rem',cursor:'pointer',marginBottom:'1.25rem',boxShadow:flipped?'0 16px 48px rgba(66,85,255,0.15)':'var(--sh3)'}}>
      <div style={{fontSize:'0.65rem',fontWeight:800,letterSpacing:'0.1em',textTransform:'uppercase',color:flipped?'var(--primary)':'var(--ink3)',marginBottom:'1.25rem',display:'flex',alignItems:'center',gap:'0.5rem'}}>
        <span style={{width:7,height:7,borderRadius:'50%',background:flipped?'var(--primary)':'var(--border2)',display:'inline-block',animation:flipped?'glow 2s infinite':''}}/>
        {flipped?'Answer':'Question'}
      </div>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
        {!flipped?<p style={{fontFamily:'var(--font-card)',fontSize:'1.25rem',fontWeight:600,lineHeight:1.7,textAlign:'center'}}>{card.front}</p>
        :<div style={{width:'100%'}}>{card.back.split(/\n+/).filter(Boolean).map((p,i)=><p key={i} style={{fontFamily:'var(--font-card)',fontSize:'1.05rem',lineHeight:1.85,marginBottom:'0.65rem',color:'var(--ink)'}}>{p}</p>)}
          <div style={{background:'var(--primary-lt)',border:'1px solid #c7d2fe',borderRadius:'var(--r-sm)',padding:'0.65rem 1rem',fontSize:'0.83rem',color:'var(--primary)',fontWeight:600,marginTop:'0.5rem'}}>💡 Key point: {card.shortAnswer}</div>
        </div>}
      </div>
      {!flipped&&<div style={{textAlign:'center',marginTop:'1.5rem',color:'var(--ink3)',fontSize:'0.77rem'}}>Click to flip · <kbd style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:4,padding:'1px 7px',fontSize:'0.72rem'}}>space</kbd> or <kbd style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:4,padding:'1px 7px',fontSize:'0.72rem'}}>→</kbd></div>}
    </div>
    <div style={{display:'flex',gap:'0.75rem',justifyContent:'center',alignItems:'center',marginBottom:'1rem'}}>
      <button className="btn btn-outline" onClick={()=>{if(idx>0){setK(p=>p+1);setFlipped(false);setIdx(idx-1);}}} disabled={idx===0} style={{padding:'0.6rem 1.25rem'}}>← Prev</button>
      <button className="btn btn-outline" onClick={()=>{if(idx<cards.length-1){setK(p=>p+1);setFlipped(false);setIdx(idx+1);}}} disabled={idx===cards.length-1} style={{padding:'0.6rem 1.25rem'}}>Next →</button>
    </div>
    <div style={{display:'flex',justifyContent:'center',gap:'0.3rem',flexWrap:'wrap'}}>
      {cards.map((_,i)=><div key={i} onClick={()=>{setK(p=>p+1);setFlipped(false);setIdx(i);}} style={{width:9,height:9,borderRadius:'50%',background:i===idx?'var(--primary)':i<idx?'var(--green)':'var(--border2)',cursor:'pointer',transition:'all 0.15s'}}/>)}
    </div>
  </div>;
}

// ── LEARN MODE ────────────────────────────────────────────────────────────────
function LearnMode({deck,onBack,onUpdate}){
  const due=deck.cards.filter(isDue);const[queue]=useState(()=>due.length>0?shuffle(due):shuffle(deck.cards));
  const[idx,setIdx]=useState(0);const[flipped,setFlipped]=useState(false);const[stats,setStats]=useState({0:0,1:0,2:0,3:0});
  const[done,setDone]=useState(false);const[allCards,setAllCards]=useState([...deck.cards]);const[k,setK]=useState(0);
  const[confetti,setConfetti]=useState(false);const startTime=useRef(Date.now());
  useEffect(()=>{const h=e=>{if(done)return;if((e.key===' '||e.key==='Enter')&&!flipped){e.preventDefault();setFlipped(true);}if(flipped){if(e.key==='1')rate(0);if(e.key==='2')rate(1);if(e.key==='3')rate(2);if(e.key==='4')rate(3);}};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);},[flipped,done,idx]);
  async function rate(r){
    const c=queue[idx];const up=sm2(c,r);const na=allCards.map(x=>x.id===c.id?up:x);setAllCards(na);
    await api.updateCards(na);onUpdate(na);setStats(p=>({...p,[r]:p[r]+1}));
    if(idx+1>=queue.length){
      const ns={...stats,[r]:stats[r]+1};const total=Object.values(ns).reduce((a,b)=>a+b,0);const acc=total>0?Math.round(((ns[2]+ns[3])/total)*100):0;
      if(acc>=60)setConfetti(true);
      await api.saveResult({deckId:deck.id,deckName:deck.name,mode:'learn',score:ns[2]+ns[3],total,accuracy:acc,durationSeconds:Math.round((Date.now()-startTime.current)/1000)});
      setDone(true);return;}
    setK(p=>p+1);setFlipped(false);setIdx(idx+1);}
  if(done){const total=Object.values(stats).reduce((a,b)=>a+b,0);const acc=total>0?Math.round(((stats[2]+stats[3])/total)*100):0;
    return<div className="asc" style={{maxWidth:520,margin:'0 auto',textAlign:'center',padding:'1rem 0'}}><Confetti active={confetti}/>
      <div style={{fontSize:'3.5rem',marginBottom:'0.75rem',animation:'bounce 0.8s ease 0.2s both'}}>{acc>=80?'🎉':acc>=60?'💪':'📚'}</div>
      <h2 style={{marginBottom:'0.3rem'}}>Session Complete!</h2><div style={{color:'var(--ink2)',marginBottom:'1.5rem'}}>{total} cards · {acc}% accuracy</div>
      <div className="g4" style={{marginBottom:'1.5rem'}}>
        {[['😵','Again',stats[0],'var(--red)'],['😓','Hard',stats[1],'var(--amber)'],['🙂','Good',stats[2],'var(--teal)'],['😎','Easy',stats[3],'var(--green)']].map(([em,lb,v,c])=>(
          <div key={lb} className="card" style={{padding:'0.85rem 0.4rem',textAlign:'center'}}><div style={{fontSize:'1.1rem',marginBottom:2}}>{em}</div><div style={{fontWeight:800,fontSize:'1.5rem',color:c,lineHeight:1}}>{v}</div><div style={{fontSize:'0.6rem',color:'var(--ink3)',textTransform:'uppercase',fontWeight:700,letterSpacing:'0.06em',marginTop:2}}>{lb}</div></div>
        ))}
      </div>
      <button className="btn btn-primary" style={{width:'100%',padding:'0.8rem'}} onClick={onBack}>Back to Deck →</button>
    </div>;}
  const card=queue[idx];
  return<div style={{maxWidth:700,margin:'0 auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
      <button className="btn btn-ghost" onClick={onBack}>← Exit</button>
      <div style={{flex:1,padding:'0 1.5rem'}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}><span style={{fontSize:'0.78rem',color:'var(--ink3)',fontWeight:600}}>{idx+1} / {queue.length}</span><span style={{fontSize:'0.78rem',color:'var(--ink3)',fontWeight:600}}>Due: {fmtNext(card.nextReview)}</span></div><Prog value={idx} max={queue.length}/></div>
      <div style={{display:'flex',gap:5,fontSize:'0.75rem',fontWeight:700}}>{stats[3]>0&&<span style={{color:'var(--green)'}}>✓{stats[3]}</span>}{stats[0]>0&&<span style={{color:'var(--red)'}}>✗{stats[0]}</span>}</div>
    </div>
    <div style={{display:'flex',gap:'0.5rem',marginBottom:'0.75rem',flexWrap:'wrap'}}>
      <span style={{fontSize:'0.7rem',background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:99,padding:'2px 10px',color:'var(--ink3)',fontWeight:600}}>{card.topic}</span>
      <MBadge level={masteryLevel(card)}/>
    </div>
    <div key={`${k}-${flipped}`} className="card3 af" onClick={()=>!flipped&&setFlipped(true)} style={{minHeight:300,display:'flex',flexDirection:'column',padding:'2.75rem 2.5rem',cursor:flipped?'default':'pointer',marginBottom:'1.1rem',boxShadow:flipped?'0 16px 48px rgba(66,85,255,0.12)':'var(--sh3)'}}>
      <div style={{fontSize:'0.65rem',fontWeight:800,letterSpacing:'0.1em',textTransform:'uppercase',color:flipped?'var(--primary)':'var(--ink3)',marginBottom:'1.25rem',display:'flex',alignItems:'center',gap:'0.45rem'}}>
        <span style={{width:7,height:7,borderRadius:'50%',background:flipped?'var(--primary)':'var(--border2)',display:'inline-block'}}/>{flipped?'Answer':'Question'}
      </div>
      <div style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'center'}}>
        {!flipped?<p style={{fontFamily:'var(--font-card)',fontSize:'1.2rem',fontWeight:600,lineHeight:1.7,textAlign:'center'}}>{card.front}</p>
        :<div>{card.back.split(/\n+/).filter(Boolean).map((p,i)=><p key={i} style={{fontFamily:'var(--font-card)',fontSize:'1.02rem',lineHeight:1.85,marginBottom:'0.65rem'}}>{p}</p>)}
          <div style={{background:'var(--primary-lt)',border:'1px solid #c7d2fe',borderRadius:'var(--r-sm)',padding:'0.65rem 1rem',fontSize:'0.82rem',color:'var(--primary)',fontWeight:600}}>
            💡 Next review in <strong>{fmtInterval(card.intervalHours)}</strong> — rate below to adjust
          </div>
        </div>}
      </div>
      {!flipped&&<div style={{textAlign:'center',marginTop:'1.5rem',color:'var(--ink3)',fontSize:'0.77rem'}}>Tap to reveal · <kbd style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:4,padding:'1px 7px',fontSize:'0.72rem'}}>space</kbd></div>}
    </div>
    {flipped?<div>
      <div style={{fontSize:'0.77rem',color:'var(--ink3)',fontWeight:600,textAlign:'center',marginBottom:'0.6rem'}}>How well did you know this? <span style={{opacity:.6}}>(press 1–4)</span></div>
      <div className="g4">
        {[['😵','Again','in 1h',0,'btn-red'],['😓','Hard',fmtInterval(Math.max(1,Math.round((card.intervalHours||24)*0.6))),1,'btn-amber'],['🙂','Good',fmtInterval(card.intervalHours||24),2,'btn-primary'],['😎','Easy',fmtInterval(Math.round((card.intervalHours||24)*(card.easeFactor||2.5))),3,'btn-green']].map(([em,lb,sub,r,cls])=>(
          <button key={lb} className={`btn ${cls}`} onClick={()=>rate(r)} style={{flexDirection:'column',padding:'0.75rem 0.3rem',gap:3,fontSize:'0.85rem'}}>
            <span style={{fontSize:'1.1rem'}}>{em}</span><span style={{fontWeight:700}}>{lb}</span><span style={{fontSize:'0.63rem',opacity:.75,fontWeight:500}}>{sub} · [{r+1}]</span>
          </button>
        ))}
      </div>
    </div>:<button className="btn btn-primary" style={{width:'100%',padding:'0.85rem',fontSize:'1rem'}} onClick={()=>setFlipped(true)}>Show Answer</button>}
  </div>;
}

// ── QUIZ MODE ─────────────────────────────────────────────────────────────────
function QuizMode({deck,onBack}){
  const[questions]=useState(()=>shuffle(deck.cards).slice(0,Math.min(deck.cards.length,20)).map(c=>({card:c,...buildQuizOpts(c)})));
  const[idx,setIdx]=useState(0);const[chosen,setChosen]=useState(null);const[answered,setAnswered]=useState(false);
  const[results,setResults]=useState([]);const[done,setDone]=useState(false);const[reviewing,setReviewing]=useState(false);
  const[k,setK]=useState(0);const[confetti,setConfetti]=useState(false);const startTime=useRef(Date.now());
  async function choose(i){if(answered)return;setChosen(i);setAnswered(true);setResults(r=>[...r,{card:questions[idx].card,all:questions[idx].all,correctIdx:questions[idx].correctIdx,chosenIdx:i,correct:i===questions[idx].correctIdx}]);}
  async function next(){
    if(idx+1>=questions.length){
      const allRes=[...results,{card:questions[idx].card,all:questions[idx].all,correctIdx:questions[idx].correctIdx,chosenIdx:chosen,correct:chosen===questions[idx].correctIdx}];
      const correct=allRes.filter(r=>r.correct).length;const acc=Math.round((correct/questions.length)*100);
      if(acc>=80)setConfetti(true);
      const topicBreakdown={};allRes.forEach(r=>{const t=r.card.topic;if(!topicBreakdown[t])topicBreakdown[t]={c:0,t:0};topicBreakdown[t].t++;if(r.correct)topicBreakdown[t].c++;});
      await api.saveResult({deckId:deck.id,deckName:deck.name,mode:'quiz',score:correct,total:questions.length,accuracy:acc,durationSeconds:Math.round((Date.now()-startTime.current)/1000),topicBreakdown});
      setDone(true);return;}
    setK(p=>p+1);setChosen(null);setAnswered(false);setIdx(idx+1);}
  if(done&&!reviewing){
    const allRes=results;const correct=allRes.filter(r=>r.correct).length;const pct=Math.round((correct/questions.length)*100);
    const byTopic={};allRes.forEach(r=>{const t=r.card.topic;if(!byTopic[t])byTopic[t]={c:0,t:0};byTopic[t].t++;if(r.correct)byTopic[t].c++;});
    const topics=Object.entries(byTopic).sort((a,b)=>(a[1].c/a[1].t)-(b[1].c/b[1].t));
    return<div className="asc" style={{maxWidth:600,margin:'0 auto'}}><Confetti active={confetti}/>
      <div style={{textAlign:'center',marginBottom:'1.5rem'}}><div style={{fontSize:'3rem',marginBottom:'0.5rem'}}>{pct>=90?'🏆':pct>=70?'🎯':pct>=50?'📚':'💪'}</div><h2 style={{marginBottom:'0.25rem'}}>{pct>=90?'Excellent!':pct>=70?'Good job!':pct>=50?'Keep going!':'Needs practice'}</h2><div style={{color:'var(--ink2)'}}>{questions.length} questions · {correct} correct</div></div>
      <div className="card3" style={{padding:'1.75rem',textAlign:'center',marginBottom:'1rem'}}>
        <div style={{fontSize:'4rem',fontWeight:800,color:pct>=70?'var(--green)':pct>=50?'var(--amber)':'var(--red)',lineHeight:1,marginBottom:'0.75rem'}}>{pct}%</div>
        <Prog value={correct} max={questions.length} color={pct>=70?'var(--green)':pct>=50?'var(--amber)':'var(--red)'} h={10}/>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:'0.75rem'}}><span style={{color:'var(--green)',fontWeight:700}}>✓ {correct} correct</span><span style={{color:'var(--red)',fontWeight:700}}>✗ {questions.length-correct} wrong</span></div>
      </div>
      {topics.length>0&&<div className="card" style={{padding:'1.25rem',marginBottom:'1rem'}}>
        <div style={{fontWeight:700,fontSize:'0.83rem',color:'var(--ink2)',marginBottom:'0.75rem'}}>📊 Topic Breakdown — weakest first</div>
        <div className="gstack">{topics.map(([t,{c,tt}])=>{const p=Math.round((c/tt)*100);const col=p>=70?'var(--green)':p>=50?'var(--amber)':'var(--red)';return<div key={t}><div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><span style={{fontSize:'0.85rem',fontWeight:600}}>{p<70?'⚠️':p>=90?'✅':'🔵'} {t}</span><span style={{fontSize:'0.82rem',color:col,fontWeight:700}}>{c}/{tt} · {p}%</span></div><Prog value={c} max={tt} color={col} h={6}/></div>;})}
        </div>
      </div>}
      <div className="g2">
        {allRes.filter(r=>!r.correct).length>0&&<button className="btn btn-primary" style={{padding:'0.75rem'}} onClick={()=>setReviewing(true)}>📖 Review {allRes.filter(r=>!r.correct).length} wrong</button>}
        <button className="btn btn-outline" style={{padding:'0.75rem'}} onClick={onBack}>Done</button>
      </div>
    </div>;}
  if(done&&reviewing){const wrong=results.filter(r=>!r.correct);
    return<div className="au" style={{maxWidth:700,margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}><h3>📖 Wrong Answers Review ({wrong.length})</h3><button className="btn btn-ghost" onClick={onBack}>Done</button></div>
      <div className="gstack">{wrong.map(({card,all,correctIdx,chosenIdx},i)=>(
        <div key={i} className="card2" style={{padding:'1.25rem'}}>
          <div style={{fontFamily:'var(--font-card)',fontWeight:600,marginBottom:'0.75rem',fontSize:'1rem',lineHeight:1.5}}>Q: {card.front}</div>
          <div className="gstack" style={{gap:'0.35rem',marginBottom:'0.75rem'}}>{all.map((opt,oi)=>{const isC=oi===correctIdx,wasC=oi===chosenIdx;return<div key={oi} style={{padding:'0.5rem 0.8rem',borderRadius:'var(--r-sm)',fontSize:'0.85rem',fontWeight:500,background:isC?'var(--green-lt)':wasC?'var(--red-lt)':'var(--bg)',color:isC?'#065f46':wasC?'var(--red)':'var(--ink3)',border:`1px solid ${isC?'#6ee7b7':wasC?'#fca5a5':'var(--border)'}`,display:'flex',alignItems:'center',gap:'0.5rem'}}>{isC?'✓':wasC?'✗':'·'} {opt}</div>;})}
          </div>
          <div style={{fontFamily:'var(--font-card)',fontSize:'0.88rem',color:'var(--ink2)',lineHeight:1.75,background:'var(--primary-lt)',borderRadius:'var(--r-sm)',padding:'0.75rem 1rem',border:'1px solid #c7d2fe'}}>💡 {card.back}</div>
        </div>
      ))}</div>
    </div>;}
  const q=questions[idx];
  return<div style={{maxWidth:700,margin:'0 auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
      <button className="btn btn-ghost" onClick={onBack}>← Exit</button>
      <div style={{flex:1,padding:'0 1.5rem'}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}><span style={{fontSize:'0.78rem',color:'var(--ink3)',fontWeight:600}}>Q {idx+1} / {questions.length}</span><span style={{fontSize:'0.78rem',fontWeight:700,color:'var(--green)'}}>{results.filter(r=>r.correct).length} correct</span></div><Prog value={idx} max={questions.length}/></div>
    </div>
    <div key={k} className="au">
      <div style={{display:'flex',gap:'0.5rem',marginBottom:'0.75rem'}}><span style={{fontSize:'0.7rem',background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:99,padding:'2px 10px',color:'var(--ink3)',fontWeight:600}}>{q.card.topic}</span><span className="badge b-quiz">Quiz</span></div>
      <div className="card3" style={{padding:'2rem',marginBottom:'1rem',minHeight:110}}><p style={{fontFamily:'var(--font-card)',fontSize:'1.15rem',fontWeight:600,lineHeight:1.7}}>{q.card.front}</p></div>
      <div className="gstack" style={{marginBottom:'1rem'}}>
        {q.all.map((opt,i)=>{const isC=i===q.correctIdx,isCh=i===chosen;let cls='quiz-opt';if(answered){if(isC)cls+=' correct';else if(isCh)cls+=' wrong';else cls+=' show-c';}
          return<button key={i} className={cls} onClick={()=>choose(i)} disabled={answered}>
            <span style={{width:24,height:24,borderRadius:'50%',background:answered&&isC?'var(--green)':answered&&isCh?'var(--red)':'var(--bg2)',color:answered&&(isC||isCh)?'white':'var(--ink3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.78rem',fontWeight:800,flexShrink:0}}>{answered&&isC?'✓':answered&&isCh?'✗':String.fromCharCode(65+i)}</span>
            <span style={{lineHeight:1.5}}>{opt}</span>
          </button>;})}
      </div>
      {answered&&<div className="au" style={{background:chosen===q.correctIdx?'var(--green-lt)':'var(--red-lt)',border:`1px solid ${chosen===q.correctIdx?'#6ee7b7':'#fca5a5'}`,borderRadius:'var(--r)',padding:'1.1rem 1.25rem',marginBottom:'1rem'}}>
        <div style={{fontWeight:700,color:chosen===q.correctIdx?'#065f46':'var(--red)',marginBottom:'0.4rem'}}>
          {chosen===q.correctIdx?'✓ Correct!':'✗ Not quite — here\'s the full explanation:'}
        </div>
        <div style={{fontFamily:'var(--font-card)',fontSize:'0.9rem',lineHeight:1.8,color:'var(--ink)'}}>{q.card.back}</div>
      </div>}
      {answered&&<button className="btn btn-primary" style={{width:'100%',padding:'0.85rem',fontSize:'1rem'}} onClick={next}>{idx+1>=questions.length?'See Results →':'Next Question →'}</button>}
    </div>
  </div>;
}

// ── MATCH MODE ────────────────────────────────────────────────────────────────
function MatchMode({deck,onBack}){
  const COUNT=Math.min(6,deck.cards.length);const[sel6]=useState(()=>shuffle(deck.cards).slice(0,COUNT));
  const[tiles,setTiles]=useState(()=>{const t=sel6.map((c,i)=>({id:`t${i}`,cardId:c.id,type:'term',text:c.front,matched:false}));const d=sel6.map((c,i)=>({id:`d${i}`,cardId:c.id,type:'def',text:c.shortAnswer||c.back.slice(0,80),matched:false}));return shuffle([...t,...d]);});
  const[selId,setSelId]=useState(null);const[wrongPair,setWrongPair]=useState([]);const[matched,setMatched]=useState(0);
  const[errors,setErrors]=useState(0);const[done,setDone]=useState(false);const[confetti,setConfetti]=useState(false);const startTime=useRef(Date.now());
  const[mc]=useState(()=>{const cols=['#4255ff','#06b6d4','#8b5cf6','#f97316','#10b981','#ef4444'];return Object.fromEntries(sel6.map((c,i)=>[c.id,cols[i%cols.length]]));});
  function clickTile(tile){
    if(tile.matched||wrongPair.includes(tile.id))return;
    if(tile.id===selId){setSelId(null);return;}if(!selId){setSelId(tile.id);return;}
    const first=tiles.find(t=>t.id===selId);if(!first)return;
    if(first.cardId===tile.cardId&&first.type!==tile.type){
      setTiles(p=>p.map(t=>t.id===first.id||t.id===tile.id?{...t,matched:true}:t));
      const nm=matched+1;if(nm>=COUNT){setDone(true);setConfetti(true);api.saveResult({deckId:deck.id,deckName:deck.name,mode:'match',score:COUNT-Math.min(errors,COUNT),total:COUNT,accuracy:Math.round(((COUNT-Math.min(errors,COUNT))/COUNT)*100),durationSeconds:Math.round((Date.now()-startTime.current)/1000),errors});}
      setMatched(nm);setSelId(null);
    }else{setWrongPair([first.id,tile.id]);setErrors(e=>e+1);setTimeout(()=>{setWrongPair([]);setSelId(null);},700);}
  }
  if(done)return<div className="asc" style={{maxWidth:460,margin:'0 auto',textAlign:'center',padding:'1rem 0'}}><Confetti active={confetti}/>
    <div style={{fontSize:'3.5rem',marginBottom:'0.75rem',animation:'bounce 0.8s ease 0.2s both'}}>🎉</div><h2 style={{marginBottom:'0.25rem'}}>All Matched!</h2><div style={{color:'var(--ink2)',marginBottom:'1.5rem'}}>Matched all {COUNT} pairs</div>
    <div className="g2" style={{marginBottom:'1.5rem'}}>
      <div className="card3" style={{padding:'1.25rem',textAlign:'center'}}><div style={{fontWeight:800,fontSize:'2.2rem',color:'var(--primary)',lineHeight:1}}>{Math.round((Date.now()-startTime.current)/1000)}s</div><div style={{fontSize:'0.65rem',color:'var(--ink3)',textTransform:'uppercase',fontWeight:700,letterSpacing:'0.06em',marginTop:4}}>Time</div></div>
      <div className="card3" style={{padding:'1.25rem',textAlign:'center'}}><div style={{fontWeight:800,fontSize:'2.2rem',color:errors===0?'var(--green)':errors<3?'var(--amber)':'var(--red)',lineHeight:1}}>{errors}</div><div style={{fontSize:'0.65rem',color:'var(--ink3)',textTransform:'uppercase',fontWeight:700,letterSpacing:'0.06em',marginTop:4}}>Errors</div></div>
    </div>
    {errors===0&&<div style={{background:'var(--green-lt)',border:'1px solid #6ee7b7',borderRadius:'var(--r-sm)',padding:'0.75rem',marginBottom:'1.25rem',color:'#065f46',fontWeight:700}}>🌟 Perfect round — zero errors!</div>}
    <div className="g2"><button className="btn btn-primary" style={{padding:'0.75rem'}} onClick={()=>window.location.reload()}>Play Again</button><button className="btn btn-outline" style={{padding:'0.75rem'}} onClick={onBack}>Done</button></div>
  </div>;
  return<div style={{maxWidth:760,margin:'0 auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}>
      <button className="btn btn-ghost" onClick={onBack}>← Exit</button>
      <div style={{textAlign:'center'}}><h3 style={{marginBottom:2}}>Match the Pairs</h3><div style={{fontSize:'0.75rem',color:'var(--ink3)',fontWeight:600}}>{matched}/{COUNT} matched · {errors} error{errors!==1?'s':''}</div></div>
      <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:'0.4rem 0.9rem',fontSize:'0.8rem',fontWeight:700,color:'var(--ink2)'}}>⏱ Live</div>
    </div>
    <div style={{marginBottom:'1rem'}}><Prog value={matched} max={COUNT} color="var(--green)" h={8}/></div>
    <div style={{background:'var(--primary-lt)',border:'1px solid #c7d2fe',borderRadius:'var(--r-sm)',padding:'0.65rem 1.1rem',marginBottom:'1.25rem',fontSize:'0.83rem',color:'var(--primary)',fontWeight:600}}>🎯 Click a term, then click its matching definition. Match all {COUNT} pairs to win!</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'0.7rem'}}>
      {tiles.map(tile=>{const isSel=tile.id===selId;const isWrong=wrongPair.includes(tile.id);const col=tile.matched?mc[tile.cardId]:undefined;let cls='match-tile';if(tile.matched)cls+=' matched';else if(isWrong)cls+=' wrong';else if(isSel)cls+=' sel';
        return<div key={tile.id} className={cls} style={tile.matched?{borderColor:col,background:`${col}18`,opacity:0.7,cursor:'default'}:isSel?{borderColor:'var(--primary)',background:'var(--primary-lt)',boxShadow:'0 0 0 3px rgba(66,85,255,0.2)',transform:'translateY(-2px)'}:{}} onClick={()=>clickTile(tile)}>
          <div style={{fontSize:'0.6rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.08em',color:tile.matched?col:tile.type==='term'?'var(--primary)':'var(--ink3)',marginBottom:'0.3rem',opacity:tile.matched?0.8:1}}>{tile.type==='term'?'TERM':'DEFINITION'}</div>
          <span style={{fontSize:'0.85rem',color:tile.matched?col:'var(--ink)',fontWeight:tile.type==='term'?600:400,lineHeight:1.35}}>{tile.text}</span>
          {tile.matched&&<div style={{position:'absolute',top:5,right:8,fontSize:'0.8rem',color:col}}>✓</div>}
        </div>;})}
    </div>
  </div>;
}

// ── SUMMARY DASHBOARD ─────────────────────────────────────────────────────────
function SummaryDashboard({decks,results,globalStats}){
  const totalCards=decks.reduce((s,d)=>s+d.cards.length,0);
  const mastered=decks.reduce((s,d)=>s+d.cards.filter(c=>masteryLevel(c)==='mastered').length,0);
  const mastPct=totalCards>0?Math.round((mastered/totalCards)*100):0;
  const topicMap={};
  results.forEach(r=>{if(r.topicBreakdown)Object.entries(r.topicBreakdown).forEach(([t,d])=>{if(!topicMap[t])topicMap[t]={c:0,tot:0,s:0};topicMap[t].c+=d.c||0;topicMap[t].tot+=d.t||0;topicMap[t].s++;});});
  const topics=Object.entries(topicMap).filter(([,d])=>d.tot>0).sort((a,b)=>(a[1].c/a[1].tot)-(b[1].c/b[1].tot));
  const modeIcons={quiz:'📝',learn:'🎯',match:'🔗',flashcards:'🃏'};
  const modeColors={quiz:'var(--purple)',learn:'var(--teal)',match:'var(--orange)',flashcards:'var(--primary)'};

  // 7-day activity
  const activity=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);const ds=d.toISOString().slice(0,10);return{day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],count:results.filter(r=>r.completedAt?.slice(0,10)===ds).length};});
  const maxAct=Math.max(1,...activity.map(a=>a.count));

  return<div className="au">
    <div style={{marginBottom:'1.5rem'}}><h2 style={{marginBottom:'0.25rem'}}>📊 Learning Dashboard</h2><p style={{color:'var(--ink2)',fontSize:'0.88rem'}}>Your complete study analytics — every session, every topic.</p></div>

    <div className="g4" style={{marginBottom:'1.25rem'}}>
      <StatBox icon="📚" value={decks.length} label="Decks Created"/>
      <StatBox icon="⭐" value={mastered} label="Cards Mastered" color="var(--green)" sub={`${mastPct}% of total`}/>
      <StatBox icon="🏆" value={`${globalStats.bestScore||0}%`} label="Best Score" color="var(--amber)"/>
      <StatBox icon="🔥" value={globalStats.streak||0} label="Day Streak" color="var(--orange)" sub="days in a row"/>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'1.25rem',marginBottom:'1.25rem'}}>
      {/* Mastery overview */}
      <div className="card2" style={{padding:'1.5rem'}}>
        <h3 style={{marginBottom:'0.3rem'}}>Overall Mastery</h3>
        <div style={{color:'var(--ink3)',fontSize:'0.82rem',marginBottom:'1rem'}}>{mastered} of {totalCards} cards mastered across all decks</div>
        <div style={{display:'flex',alignItems:'center',gap:'1rem',marginBottom:'1rem'}}>
          <div style={{fontWeight:800,fontSize:'3rem',color:mastPct>=70?'var(--green)':mastPct>=40?'var(--amber)':'var(--red)',lineHeight:1}}>{mastPct}%</div>
          <div style={{flex:1}}><Prog value={mastered} max={totalCards} color={mastPct>=70?'var(--green)':mastPct>=40?'var(--amber)':'var(--red)'} h={12}/></div>
        </div>
        <div className="g4">
          {(['new','young','learning','mastered']).map(level=>{const count=decks.reduce((s,d)=>s+d.cards.filter(c=>masteryLevel(c)===level).length,0);const col={new:'var(--ink3)',young:'#92400e',learning:'var(--primary)',mastered:'#065f46'}[level];return<div key={level} style={{textAlign:'center',background:'var(--bg)',borderRadius:'var(--r-sm)',padding:'0.6rem 0.3rem'}}><div style={{fontWeight:800,fontSize:'1.3rem',color:col,lineHeight:1}}>{count}</div><div style={{fontSize:'0.6rem',color:'var(--ink3)',textTransform:'capitalize',fontWeight:700,marginTop:2}}>{level}</div></div>;})}
        </div>
      </div>
      {/* Activity chart */}
      <div className="card2" style={{padding:'1.5rem'}}>
        <h3 style={{marginBottom:'0.75rem'}}>7-Day Activity</h3>
        <div style={{display:'flex',gap:'0.4rem',alignItems:'flex-end',height:80,marginBottom:'0.5rem'}}>
          {activity.map((a,i)=><div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
            <div style={{width:'100%',borderRadius:4,background:a.count>0?'var(--primary)':'var(--border)',height:`${Math.max(6,(a.count/maxAct)*60)}px`,transition:'height 0.3s',opacity:a.count>0?1:0.5}}/>
            <span style={{fontSize:'0.58rem',color:'var(--ink3)',fontWeight:700}}>{a.day}</span>
          </div>)}
        </div>
        <div style={{textAlign:'center',fontSize:'0.75rem',color:'var(--ink3)',fontWeight:600}}>{results.length} total sessions · {globalStats.avgAccuracy||0}% avg score</div>
      </div>
    </div>

    {/* By mode */}
    {globalStats.byMode?.length>0&&<div className="card2" style={{padding:'1.5rem',marginBottom:'1.25rem'}}>
      <h3 style={{marginBottom:'0.85rem'}}>Performance by Mode</h3>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'0.75rem'}}>
        {globalStats.byMode.map(m=><div key={m.mode} style={{background:'var(--bg)',borderRadius:'var(--r)',padding:'1rem',border:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'0.5rem'}}><span style={{fontSize:'1.2rem'}}>{modeIcons[m.mode]||'📖'}</span><span style={{fontWeight:700,textTransform:'capitalize',fontSize:'0.9rem'}}>{m.mode}</span></div>
          <div style={{fontWeight:800,fontSize:'1.5rem',color:modeColors[m.mode]||'var(--ink)',lineHeight:1,marginBottom:'0.3rem'}}>{Math.round(m.avg||0)}%</div>
          <Prog value={m.avg||0} max={100} color={modeColors[m.mode]||'var(--primary)'} h={5}/>
          <div style={{fontSize:'0.68rem',color:'var(--ink3)',marginTop:4}}>{m.c} session{m.c!==1?'s':''}</div>
        </div>)}
      </div>
    </div>}

    {/* Deck breakdown */}
    {decks.length>0&&<div className="card2" style={{padding:'1.5rem',marginBottom:'1.25rem'}}>
      <h3 style={{marginBottom:'0.85rem'}}>Deck Performance</h3>
      <div className="gstack">
        {decks.map(deck=>{const dc=deck.cards.length;const dm=deck.cards.filter(c=>masteryLevel(c)==='mastered').length;const dp=dc>0?Math.round((dm/dc)*100):0;const due=deck.cards.filter(isDue).length;
          return<div key={deck.id} style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.65rem 0',borderBottom:'1px solid var(--border)'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontWeight:700,fontSize:'0.9rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{deck.name}</span><span style={{fontWeight:800,fontSize:'0.88rem',color:dp>=70?'var(--green)':dp>=40?'var(--amber)':'var(--red)',flexShrink:0,marginLeft:8}}>{dp}%</span></div>
              <Prog value={dm} max={dc} color={dp>=70?'var(--green)':dp>=40?'var(--amber)':'var(--red)'} h={6}/>
              <div style={{display:'flex',gap:'0.75rem',marginTop:3,fontSize:'0.7rem',color:'var(--ink3)'}}><span>{dc} cards</span><span>{dm} mastered</span>{due>0&&<span style={{color:'var(--red)'}}>⚡{due} due</span>}</div>
            </div>
          </div>;})}
      </div>
    </div>}

    {/* Topic analysis */}
    {topics.length>0&&<div className="card2" style={{padding:'1.5rem',marginBottom:'1.25rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.85rem'}}>
        <h3>Topic Analysis</h3><span style={{fontSize:'0.75rem',color:'var(--ink3)'}}>weakest → strongest</span>
      </div>
      <div className="gstack">
        {topics.map(([t,d])=>{const p=Math.round((d.c/d.tot)*100);const col=p>=70?'var(--green)':p>=50?'var(--amber)':'var(--red)';const icon=p>=70?'✅':p>=50?'⚠️':'❌';
          return<div key={t} style={{padding:'0.75rem',background:p<50?'var(--red-lt)':p<70?'var(--amber-lt)':'var(--green-lt)',borderRadius:'var(--r-sm)',border:`1px solid ${p<50?'#fca5a5':p<70?'#fcd34d':'#6ee7b7'}`}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}><span style={{fontWeight:700,fontSize:'0.88rem'}}>{icon} {t}</span><span style={{fontWeight:800,fontSize:'0.88rem',color:col}}>{p}%</span></div>
            <Prog value={d.c} max={d.tot} color={col} h={6}/>
            <div style={{fontSize:'0.7rem',color:'var(--ink2)',marginTop:4}}>{d.c}/{d.tot} correct · {d.s} session{d.s!==1?'s':''}</div>
          </div>;})}
      </div>
    </div>}

    {/* All sessions */}
    <div className="card2" style={{padding:'1.5rem'}}>
      <h3 style={{marginBottom:'0.85rem'}}>All Sessions {results.length>0?`(${results.length})`:''}</h3>
      {results.length===0?<div style={{textAlign:'center',padding:'2rem',color:'var(--ink3)'}}><div style={{fontSize:'2rem',marginBottom:'0.5rem'}}>📊</div>No sessions yet. Complete a Quiz, Learn, or Match session to see your results here.</div>
      :<div style={{maxHeight:360,overflowY:'auto',display:'grid',gap:'0.5rem'}}>
        {results.map((r,i)=>{const col=r.accuracy>=70?'var(--green)':r.accuracy>=50?'var(--amber)':'var(--red)';return<div key={r.id||i} style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.65rem 0.85rem',background:'var(--bg)',borderRadius:'var(--r-sm)',border:'1px solid var(--border)'}}>
          <span style={{fontSize:'1.1rem'}}>{modeIcons[r.mode]||'📖'}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:'0.85rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.deckName}</div>
            <div style={{fontSize:'0.7rem',color:'var(--ink3)',display:'flex',gap:'0.5rem',marginTop:1,flexWrap:'wrap'}}><span style={{textTransform:'capitalize'}}>{r.mode}</span><span>·</span><span>{fmtDateTime(r.completedAt)}</span>{r.durationSeconds>0&&<><span>·</span><span>{r.durationSeconds}s</span></>}</div>
          </div>
          <div style={{textAlign:'right',flexShrink:0}}><div style={{fontWeight:800,fontSize:'1.05rem',color:col}}>{Math.round(r.accuracy)}%</div><div style={{fontSize:'0.7rem',color:'var(--ink3)'}}>{r.score}/{r.total}</div></div>
        </div>;})}
      </div>}
    </div>
  </div>;
}

// ── DECK DETAIL ───────────────────────────────────────────────────────────────
function DeckDetail({deck,onMode,onBack,onDelete,deckResults}){
  const[tab,setTab]=useState('cards');const[search,setSearch]=useState('');const[filter,setFilter]=useState('all');
  const due=deck.cards.filter(isDue).length;const byLevel={new:0,young:0,learning:0,mastered:0};deck.cards.forEach(c=>byLevel[masteryLevel(c)]++);
  const total=deck.cards.length;const mastPct=total>0?Math.round((byLevel.mastered/total)*100):0;
  const filtered=deck.cards.filter(c=>{const ms=!search||[c.front,c.back,c.topic].some(t=>t.toLowerCase().includes(search.toLowerCase()));const mf=filter==='all'||(filter==='due'&&isDue(c))||masteryLevel(c)===filter;return ms&&mf;});
  const MODES2=[{id:'flashcards',icon:'🃏',label:'Flashcards',desc:'Browse all cards',color:'var(--primary)'},{id:'learn',icon:'🎯',label:'Learn',desc:due>0?`${due} cards due`:'Spaced repetition',color:'var(--teal)',badge:due>0},{id:'quiz',icon:'📝',label:'Quiz',desc:'Multiple choice test',color:'var(--purple)'},{id:'match',icon:'🔗',label:'Match',desc:'Pair terms & defs',color:'var(--orange)'}];
  return<div className="au" style={{maxWidth:'100%'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1.5rem',flexWrap:'wrap',gap:'0.75rem'}}>
      <div style={{display:'flex',gap:'0.75rem',alignItems:'center'}}><button className="btn btn-ghost" onClick={onBack}>← Back</button><div><h2 style={{marginBottom:'0.2rem'}}>{deck.name}</h2><div style={{color:'var(--ink3)',fontSize:'0.82rem'}}>{total} cards · {deck.pages||0} pages · {fmtDate(deck.createdAt)}</div></div></div>
      <button className="btn btn-ghost" style={{color:'var(--red)',fontSize:'0.82rem'}} onClick={()=>{if(confirm(`Delete "${deck.name}"?`)){onDelete(deck.id);}}}>🗑 Delete</button>
    </div>
    <div className="g4" style={{marginBottom:'1.1rem'}}>
      <StatBox icon="🆕" value={byLevel.new} label="New"/><StatBox icon="📖" value={byLevel.young} label="Learning" color="var(--amber)"/>
      <StatBox icon="🔄" value={byLevel.learning} label="Review" color="var(--primary)"/><StatBox icon="⭐" value={byLevel.mastered} label="Mastered" color="var(--green)"/>
    </div>
    <div style={{marginBottom:'1.25rem'}}><div style={{display:'flex',justifyContent:'space-between',fontSize:'0.82rem',fontWeight:600,marginBottom:6}}><span style={{color:'var(--ink2)'}}>Mastery Progress</span><span style={{color:'var(--primary)'}}>{mastPct}%</span></div><Prog value={byLevel.mastered} max={total} h={10}/></div>
    <div className="g2" style={{marginBottom:'1.5rem'}}>
      {MODES2.map(m=><button key={m.id} className="mode-card" onClick={()=>onMode(m.id)}>
        <div className="mode-card-icon">{m.icon}</div>
        <div className="mode-card-title">{m.label}</div>
        <div className="mode-card-desc">{m.desc}</div>
        {m.badge&&<span className="badge b-due" style={{alignSelf:'flex-start',marginTop:2}}>⚡{due} due</span>}
      </button>)}
    </div>
    {deckResults.length>0&&<div className="card" style={{padding:'1rem 1.25rem',marginBottom:'1.25rem'}}>
      <div style={{fontWeight:700,fontSize:'0.83rem',color:'var(--ink2)',marginBottom:'0.65rem'}}>📈 Your History on This Deck ({deckResults.length} sessions)</div>
      <div style={{display:'grid',gap:'0.4rem',maxHeight:160,overflowY:'auto'}}>
        {deckResults.map((r,i)=>{const mIc={quiz:'📝',learn:'🎯',match:'🔗',flashcards:'🃏'};const col=r.accuracy>=70?'var(--green)':r.accuracy>=50?'var(--amber)':'var(--red)';return<div key={i} style={{display:'flex',alignItems:'center',gap:'0.6rem',padding:'0.4rem 0.6rem',background:'var(--bg)',borderRadius:'var(--r-sm)'}}><span>{mIc[r.mode]||'📖'}</span><span style={{flex:1,fontWeight:600,fontSize:'0.8rem',textTransform:'capitalize'}}>{r.mode}</span><span style={{fontSize:'0.72rem',color:'var(--ink3)'}}>{fmtDateTime(r.completedAt)}</span><span style={{fontWeight:800,color:col,fontSize:'0.85rem'}}>{Math.round(r.accuracy)}%</span></div>;})}</div>
    </div>}
    <div className="ntabs" style={{marginBottom:'1rem'}}>
      {[['cards',`All Cards (${total})`],['due',`Due Now (${due})`]].map(([id,lb])=><button key={id} className={`ntab ${tab===id?'active':''}`} onClick={()=>setTab(id)}>{lb}</button>)}
    </div>
    <div style={{display:'flex',gap:'0.6rem',marginBottom:'0.85rem',flexWrap:'wrap'}}>
      <input className="input" placeholder="Search cards…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,minWidth:160}}/>
      <select value={filter} onChange={e=>setFilter(e.target.value)} style={{background:'var(--card)',border:'2px solid var(--border)',borderRadius:'var(--r-sm)',padding:'0 0.9rem',color:'var(--ink)',fontFamily:'var(--font-ui)',fontSize:'0.88rem',cursor:'pointer',outline:'none'}}>
        <option value="all">All</option><option value="new">New</option><option value="young">Learning</option><option value="learning">Review</option><option value="mastered">Mastered</option>
      </select>
    </div>
    <div className="gstack">
      {filtered.length===0&&<div style={{textAlign:'center',padding:'2rem',color:'var(--ink3)'}}>No cards match.</div>}
      {(tab==='due'?filtered.filter(isDue):filtered).map((card,i)=>(
        <div key={card.id} className="card" style={{padding:'1rem 1.1rem'}}>
          <div style={{display:'flex',gap:'0.75rem',alignItems:'flex-start'}}>
            <span style={{fontSize:'0.65rem',color:'var(--ink3)',fontWeight:700,minWidth:22,paddingTop:3}}>{String(i+1).padStart(2,'0')}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:'var(--font-card)',fontSize:'0.93rem',fontWeight:600,marginBottom:'0.3rem',lineHeight:1.5}}>{card.front}</div>
              <div style={{fontSize:'0.83rem',color:'var(--ink2)',marginBottom:'0.4rem',lineHeight:1.55}}>{card.back.length>180?card.back.slice(0,180)+'…':card.back}</div>
              <div style={{display:'flex',gap:'0.4rem',alignItems:'center',flexWrap:'wrap'}}>
                <MBadge level={masteryLevel(card)}/>
                <span style={{fontSize:'0.65rem',background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:99,padding:'2px 9px',color:'var(--ink3)',fontWeight:600}}>{card.topic}</span>
                {isDue(card)&&<span className="badge b-due">Due</span>}
                <span style={{fontSize:'0.7rem',color:'var(--ink3)',marginLeft:'auto'}}>Next: {fmtNext(card.nextReview)}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>;
}

// ── DECK LIST ─────────────────────────────────────────────────────────────────
function DeckList({decks,onSelect,onDelete,onNew}){
  const totalDue=decks.reduce((s,d)=>s+d.cards.filter(isDue).length,0);
  const mastered=decks.reduce((s,d)=>s+d.cards.filter(c=>masteryLevel(c)==='mastered').length,0);
  const total=decks.reduce((s,d)=>s+d.cards.length,0);
  return<div className="au">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1.5rem',flexWrap:'wrap',gap:'0.75rem'}}>
      <div><h2 style={{marginBottom:'0.2rem'}}>My Study Sets</h2><p style={{color:'var(--ink2)',fontSize:'0.88rem'}}>{decks.length} deck{decks.length!==1?'s':''} · {total} cards total</p></div>
      <button className="btn btn-primary" style={{fontSize:'0.9rem'}} onClick={onNew}>+ Create New Deck</button>
    </div>
    <div className="g3" style={{marginBottom:'1.5rem'}}>
      <StatBox icon="📚" value={decks.length} label="Total Decks"/><StatBox icon="⚡" value={totalDue} label="Cards Due Now" color={totalDue>0?'var(--red)':'var(--green)'}/><StatBox icon="⭐" value={mastered} label="Cards Mastered" color="var(--green)" sub={total>0?`${Math.round((mastered/total)*100)}% of all cards`:''}/>
    </div>
    <div className="gstack">
      {decks.map((deck,i)=>{const due=deck.cards.filter(isDue).length;const dm=deck.cards.filter(c=>masteryLevel(c)==='mastered').length;const dc=deck.cards.length;const pct=dc>0?Math.round((dm/dc)*100):0;
        return<div key={deck.id} className={`card2 au`} style={{padding:'1.35rem 1.5rem',cursor:'pointer',transition:'all 0.15s',animationDelay:`${i*0.04}s`}} onClick={()=>onSelect(deck.id)} onMouseEnter={e=>e.currentTarget.style.boxShadow='var(--sh3)'} onMouseLeave={e=>e.currentTarget.style.boxShadow='var(--sh2)'}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'1rem'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'0.35rem',flexWrap:'wrap'}}><h3 style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:320,fontSize:'1.05rem'}}>{deck.name}</h3>{due>0&&<span className="badge b-due">⚡{due} due</span>}</div>
              <div style={{color:'var(--ink3)',fontSize:'0.79rem',marginBottom:'0.8rem'}}>{dc} cards · {deck.pages||0} pages · Created {fmtDate(deck.createdAt)}</div>
              <div style={{marginBottom:'0.45rem'}}><Prog value={dm} max={dc} h={7}/></div>
              <div style={{fontSize:'0.77rem',color:'var(--ink3)',fontWeight:600}}>{dm}/{dc} mastered · {pct}% complete</div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:'0.45rem',flexShrink:0}}>
              <button className={`btn ${due>0?'btn-primary':'btn-outline'}`} style={{padding:'0.5rem 1rem',fontSize:'0.82rem'}} onClick={e=>{e.stopPropagation();onSelect(deck.id);}}>{due>0?`Study ${due}`:'Open'}</button>
              <button className="btn btn-ghost" style={{padding:'0.5rem 1rem',fontSize:'0.78rem',color:'var(--red)'}} onClick={e=>{e.stopPropagation();if(confirm(`Delete "${deck.name}"?`))onDelete(deck.id);}}>Delete</button>
            </div>
          </div>
        </div>;})}
    </div>
  </div>;
}

// ── SIDENAV ───────────────────────────────────────────────────────────────────
function SideNav({view,goTo,decks,globalStats,totalDue}){
  const mastered=decks.reduce((s,d)=>s+d.cards.filter(c=>masteryLevel(c)==='mastered').length,0);
  const total=decks.reduce((s,d)=>s+d.cards.length,0);
  return<nav className="sidenav">
    <div className="nav-logo">
      <div className="nav-logo-icon">✦</div>
      <div><div className="nav-logo-text">FlashMind</div><div style={{fontSize:'0.58rem',color:'rgba(255,255,255,0.3)',fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase'}}>by Cuemath</div></div>
    </div>
    <div className="nav-stat-grid">
      {[['📚',decks.length,'Decks'],['⚡',totalDue,'Due',totalDue>0?'#ef4444':'#10b981'],['⭐',mastered,'Mastered','#10b981'],['🃏',total,'Cards']].map(([ic,v,lb,col])=>(
        <div key={lb} className="nav-stat"><div style={{fontSize:'0.8rem'}}>{ic}</div><div className="nav-stat-val" style={col?{color:col}:{}}>{v}</div><div className="nav-stat-lbl">{lb}</div></div>
      ))}
    </div>
    <div className="nav-section">Navigate</div>
    {[{id:'home',icon:'🏠',label:'My Decks'},{id:'summary',icon:'📊',label:'Dashboard'},{id:'upload',icon:'➕',label:'New Deck'}].map(item=>(
      <button key={item.id} className={`nav-btn ${view===item.id?'active':''}`} onClick={()=>goTo(item.id)}>
        <span className="ni">{item.icon}</span>{item.label}
        {item.id==='home'&&totalDue>0&&<span style={{marginLeft:'auto',background:'var(--red)',color:'white',fontSize:'0.58rem',fontWeight:800,padding:'1px 6px',borderRadius:99}}>{totalDue}</span>}
      </button>
    ))}
    {decks.length>0&&<>
      <div className="nav-section" style={{marginTop:'0.5rem'}}>Your Decks</div>
      {decks.slice(0,7).map(deck=>{const due=deck.cards.filter(isDue).length;const pct=deck.cards.length>0?Math.round((deck.cards.filter(c=>masteryLevel(c)==='mastered').length/deck.cards.length)*100):0;
        return<button key={deck.id} className="nav-deck-item" onClick={()=>goTo(`deck:${deck.id}`)}>
          <span style={{fontSize:'0.8rem'}}>📖</span>
          <div style={{flex:1,minWidth:0}}>
            <div className="nav-deck-name">{deck.name}</div>
            <div style={{height:2,background:'rgba(255,255,255,0.1)',borderRadius:99,marginTop:3,overflow:'hidden'}}><div style={{height:'100%',background:pct>70?'#10b981':'var(--primary)',width:`${pct}%`,borderRadius:99}}/></div>
          </div>
          {due>0&&<span style={{background:'var(--red)',color:'white',fontSize:'0.58rem',fontWeight:800,padding:'1px 5px',borderRadius:99,flexShrink:0}}>{due}</span>}
        </button>;})}
      {decks.length>7&&<div style={{fontSize:'0.7rem',color:'rgba(255,255,255,0.25)',padding:'0.25rem 1.5rem',fontWeight:600}}>+{decks.length-7} more</div>}
    </>}
    <div className="nav-streak">
      <span style={{fontSize:'1.2rem'}}>🔥</span>
      <div><div className="nav-streak-val">{globalStats.streak||0} day{globalStats.streak!==1?'s':''}</div><div className="nav-streak-text">Study streak</div></div>
    </div>
  </nav>;
}

// ── ROOT APP ──────────────────────────────────────────────────────────────────
export default function App(){
  const[decks,setDecks]=useState([]);const[results,setResults]=useState([]);const[globalStats,setGlobalStats]=useState({});
  const[view,setView]=useState('home');const[selId,setSelId]=useState(null);const[mode,setMode]=useState(null);
  const[toast,setToast]=useState(null);const[mounted,setMounted]=useState(false);const[loading,setLoading]=useState(true);
  const[deckResults,setDeckResults]=useState([]);const[showFeedback,setShowFeedback]=useState(false);
  const toastRef=useRef();

  useEffect(()=>{(async()=>{try{const[d,r,s]=await Promise.all([api.decks(),api.results(),api.stats()]);setDecks(d);setResults(r);setGlobalStats(s);}catch(e){console.error(e);}finally{setLoading(false);setMounted(true);}})();},[]);

  function showToast(msg,type='inf'){setToast({msg,type});clearTimeout(toastRef.current);toastRef.current=setTimeout(()=>setToast(null),3500);}
  async function refresh(){const[d,r,s]=await Promise.all([api.decks(),api.results(),api.stats()]);setDecks(d);setResults(r);setGlobalStats(s);}

  function goTo(v){setMode(null);setView(v);}

  async function handleCreated(deck){setDecks(p=>[...p,deck]);showToast(`✦ ${deck.cards.length} cards generated!`,'ok');await refresh();setSelId(deck.id);const dr=await api.results(deck.id);setDeckResults(dr);setView(`deck:${deck.id}`);}
  async function handleDelete(id){await api.deleteDeck(id);showToast('Deck deleted','err');await refresh();setView('home');}
  async function handleUpdateCards(cards){setDecks(p=>p.map(d=>d.id===selId?{...d,cards}:d));}
  async function handleSelectDeck(id){setSelId(id);const dr=await api.results(id);setDeckResults(dr);setView(`deck:${id}`);}

  const selected=decks.find(d=>d.id===selId);
  const totalDue=decks.reduce((s,d)=>s+d.cards.filter(isDue).length,0);
  const isMode=view==='mode'&&selected&&mode;

  const pageTitle={home:'My Study Sets',summary:'Learning Dashboard',upload:'Create New Deck'}[view]||(isMode?`${mode.charAt(0).toUpperCase()+mode.slice(1)} — ${selected?.name||''}`:selected?.name||'');

  if(!mounted||loading)return<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'var(--bg)',flexDirection:'column',gap:'1rem'}}><Spin size={36}/><div style={{color:'var(--ink3)',fontSize:'0.9rem',fontWeight:600}}>Loading FlashMind…</div></div>;

  return<div className="shell">
    <SideNav view={view} goTo={goTo} decks={decks} globalStats={globalStats} totalDue={totalDue}/>
    <div className="main-wrap">
      {/* Top bar */}
      <div className="topbar">
        <div>
          <div style={{fontWeight:800,fontSize:'1rem',letterSpacing:'-0.02em'}}>{pageTitle}</div>
          <div style={{fontSize:'0.72rem',color:'var(--ink3)'}}>{new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
        </div>
        <div style={{display:'flex',gap:'0.6rem',alignItems:'center'}}>
          {totalDue>0&&view==='home'&&<span className="badge b-due" style={{animation:'pulse 2s infinite'}}>⚡{totalDue} cards due</span>}
          {(view.startsWith('deck:')||view==='mode')&&<button className="btn btn-ghost" style={{fontSize:'0.82rem',padding:'0.4rem 0.85rem'}} onClick={()=>{setMode(null);setView(selId?`deck:${selId}`:'home');}}>← Back</button>}
          <button className="btn btn-outline" style={{fontSize:'0.82rem',padding:'0.4rem 0.85rem'}} onClick={()=>setShowFeedback(true)}>💬 Feedback</button>
        </div>
      </div>
      {/* Content */}
      <div className="page-body">
        {view==='home'&&<DeckList decks={decks} onSelect={handleSelectDeck} onDelete={handleDelete} onNew={()=>goTo('upload')}/>}
        {view==='summary'&&<SummaryDashboard decks={decks} results={results} globalStats={globalStats}/>}
        {view==='upload'&&<UploadView onCreated={handleCreated}/>}
        {view.startsWith('deck:')&&selected&&<DeckDetail deck={selected} onBack={()=>goTo('home')} onMode={m=>{setMode(m);setView('mode');}} onDelete={handleDelete} deckResults={deckResults}/>}
        {view==='mode'&&selected&&mode==='flashcards'&&<FlashcardsMode key={`fc-${selId}`} deck={selected} onBack={()=>goTo(`deck:${selId}`)} onUpdate={handleUpdateCards}/>}
        {view==='mode'&&selected&&mode==='learn'&&<LearnMode key={`lm-${selId}-${Date.now()}`} deck={selected} onBack={async()=>{await refresh();goTo(`deck:${selId}`);}} onUpdate={handleUpdateCards}/>}
        {view==='mode'&&selected&&mode==='quiz'&&<QuizMode key={`qz-${selId}-${Date.now()}`} deck={selected} onBack={async()=>{await refresh();goTo(`deck:${selId}`);}}/>}
        {view==='mode'&&selected&&mode==='match'&&<MatchMode key={`mt-${selId}-${Date.now()}`} deck={selected} onBack={async()=>{await refresh();goTo(`deck:${selId}`);}}/>}
        {(view.startsWith('deck:')||view==='mode')&&!selected&&<div style={{textAlign:'center',padding:'3rem',color:'var(--ink3)'}}><div style={{fontSize:'2rem',marginBottom:'1rem'}}>🔍</div><div style={{marginBottom:'1rem'}}>Deck not found.</div><button className="btn btn-primary" onClick={()=>goTo('home')}>Go Home</button></div>}
      </div>
    </div>
    {showFeedback&&<FeedbackModal onClose={()=>setShowFeedback(false)}/>}
    <Toast t={toast}/>
  </div>;
}