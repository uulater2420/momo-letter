// ── app.js ────────────────────────────────────────────────────────
import { saveLetter, loadLetter, saveApply, watchLetter } from './firebase.js';

// ── 전역 상태 ──────────────────────────────────────────────────────
const S = {
  mode: 'text',           // 'text' | 'draw' | 'sticker' | 'mixed'
  dctx: null,
  pen: '#2c2018', sz: 4,
  drawing: false, lx: 0, ly: 0,
  drawn: false,           // 그림 그렸는지
  hasText: false,         // 텍스트 입력했는지
  stickers: [],
  senderImg: null, replyImg: null,
  letterId: null, shareUrl: '',
  seaRaf: null,
  isReply: false,
  savedText: '', savedTo: '', savedFrom: '',
  watchUnsub: null,       // Firebase 실시간 감지 해제 함수
};

// ── 화면 전환 ─────────────────────────────────────────────────────
function show(id){
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  document.getElementById(id).classList.add('on');
  window.scrollTo(0, 0);
}
function showLoading(on, msg = '편지를 바다에 띄우는 중…'){
  document.getElementById('loading').style.display = on ? 'flex' : 'none';
  document.getElementById('loading-msg').textContent = msg;
}

// ── 수채화 번짐 전환 ──────────────────────────────────────────────
function inkTransition(color, onMidpoint){
  return new Promise(resolve => {
    const overlay = document.getElementById('ink-overlay');
    overlay.style.background = color;
    overlay.style.opacity = '0';
    overlay.style.transform = 'scale(0.2)';
    overlay.style.borderRadius = '100%';
    overlay.classList.remove('fading');
    overlay.classList.add('spreading');
    setTimeout(() => { onMidpoint && onMidpoint(); }, 500);
    setTimeout(() => {
      overlay.classList.remove('spreading');
      overlay.classList.add('fading');
      setTimeout(() => { overlay.classList.remove('fading'); overlay.style.opacity = '0'; resolve(); }, 700);
    }, 1100);
  });
}

// ── 탭 전환 ──────────────────────────────────────────────────────
window.sw = function(m){
  S.mode = m;
  ['bt','bd','bs','bm'].forEach(id => document.getElementById(id)?.classList.remove('on'));
  document.getElementById({text:'bt',draw:'bd',sticker:'bs',mixed:'bm'}[m])?.classList.add('on');
  ['tp-t','tp-d','tp-s','tp-m'].forEach(id => document.getElementById(id).className = 'tab-pane');
  document.getElementById({text:'tp-t',draw:'tp-d',sticker:'tp-s',mixed:'tp-m'}[m]).className = 'tab-pane on';
  if(m === 'draw' || m === 'mixed') initDC();
  if(m === 'sticker'){ initPreviewCanvas(); drawPreview(); }
};

// ── 그리기 캔버스 초기화 ─────────────────────────────────────────
function initDC(){
  if(S.dctx) return;
  const c = document.getElementById('dc');
  const dpr = window.devicePixelRatio || 1;
  const w = c.getBoundingClientRect().width || 358;
  const h = Math.round(w * 0.65);
  c.width = w * dpr; c.height = h * dpr; c.style.height = h + 'px';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  S.dctx = ctx;
  const dn = (ox,oy) => { S.drawing = true; S.lx = ox; S.ly = oy; };
  const dm = (ox,oy) => {
    if(!S.drawing) return; S.drawn = true;
    ctx.strokeStyle = S.pen; ctx.lineWidth = S.sz;
    ctx.beginPath(); ctx.moveTo(S.lx, S.ly); ctx.lineTo(ox, oy); ctx.stroke();
    S.lx = ox; S.ly = oy;
  };
  const du = () => S.drawing = false;
  c.addEventListener('mousedown',  e => dn(e.offsetX, e.offsetY));
  c.addEventListener('mousemove',  e => dm(e.offsetX, e.offsetY));
  c.addEventListener('mouseup',    du); c.addEventListener('mouseleave', du);
  c.addEventListener('touchstart', e => { e.preventDefault(); const t=e.touches[0]; const r=c.getBoundingClientRect(); dn(t.clientX-r.left, t.clientY-r.top); }, {passive:false});
  c.addEventListener('touchmove',  e => { e.preventDefault(); const t=e.touches[0]; const r=c.getBoundingClientRect(); dm(t.clientX-r.left, t.clientY-r.top); }, {passive:false});
  c.addEventListener('touchend',   e => { e.preventDefault(); du(); }, {passive:false});
  document.getElementById('bsr').addEventListener('input', function(){ S.sz = +this.value; });
}

window.pc = function(el){
  S.pen = el.dataset.c;
  document.getElementById('tp-d').querySelectorAll('.cdot').forEach(d => d.classList.remove('on'));
  document.getElementById('tp-m').querySelectorAll('.cdot').forEach(d => d.classList.remove('on'));
  el.classList.add('on');
};
window.clr = function(){
  if(S.dctx){ const c=document.getElementById('dc'); S.dctx.clearRect(0,0,c.width,c.height); }
  S.drawn = false;
};

// ── 꾸미기 미리보기 ──────────────────────────────────────────────
function initPreviewCanvas(){
  const wrap = document.querySelector('.preview-wrap');
  const c = document.getElementById('preview-canvas');
  if(c._init) return; c._init = true;
  const w = wrap.clientWidth || 320;
  const h = Math.round(w * 0.65);
  c.width = w; c.height = h; c.style.height = h + 'px';
}
function drawPreview(){
  const c = document.getElementById('preview-canvas');
  if(!c || !c.width) return;
  const W = c.width, H = c.height;
  const ctx = c.getContext('2d');
  const toName   = document.getElementById('to-input')?.value.trim() || '';
  const fromName = document.getElementById('from-input')?.value.trim() || '';
  ctx.fillStyle = '#fefcf4'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle = 'rgba(160,130,90,0.18)'; ctx.lineWidth = 0.6;
  for(let y=32; y<H; y+=20){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(220,120,100,0.28)'; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(28,0); ctx.lineTo(28,H); ctx.stroke();
  if(toName){ ctx.fillStyle='#c05848'; ctx.font='bold 10px "Noto Sans KR",sans-serif'; ctx.textBaseline='top'; ctx.fillText('To. '+toName, 32, 4); }
  if(S.drawn){ const dc=document.getElementById('dc'); if(dc) ctx.drawImage(dc, 0, 18, W, H-30); }
  else {
    const txt = document.getElementById('ltxt')?.value || document.getElementById('mtxt')?.value || '';
    ctx.fillStyle='#2c2018'; ctx.font='300 11px "Gaegu",cursive'; ctx.textBaseline='top';
    const lines=[]; txt.split('\n').forEach(p=>{ let l=''; for(const ch of p){ const t=l+ch; if(ctx.measureText(t).width>W-36&&l){lines.push(l);l=ch;}else l=t;} lines.push(l); });
    lines.slice(0,6).forEach((l,i)=>ctx.fillText(l, 32, 20+i*18));
  }
  if(fromName){ ctx.fillStyle='#c05848'; ctx.font='bold 10px "Noto Sans KR",sans-serif'; const fw=ctx.measureText('From. '+fromName).width; ctx.fillText('From. '+fromName, W-fw-6, H-13); }
}
window.syncPreview = function(){ if(S.mode==='sticker') drawPreview(); };

// ── 스티커 ────────────────────────────────────────────────────────
window.addSticker = function(emoji){
  if(S.mode!=='sticker'){ sw('sticker'); setTimeout(()=>doAdd(emoji),60); return; }
  doAdd(emoji);
};
function doAdd(emoji){
  initPreviewCanvas(); drawPreview();
  const layer = document.getElementById('sticker-layer');
  const wrap  = document.querySelector('.preview-wrap');
  const el = document.createElement('div'); el.className='placed-sticker'; el.textContent=emoji;
  const bw=wrap.clientWidth-40, bh=wrap.clientHeight-40;
  const x=10+Math.random()*Math.max(0,bw), y=8+Math.random()*Math.max(0,bh);
  el.style.left=x+'px'; el.style.top=y+'px';
  const ref={emoji,x,y}; S.stickers.push(ref); layer.appendChild(el); makeDrag(el,ref);
}
function makeDrag(el, ref){
  let ox=0,oy=0;
  const od=(cx,cy)=>{ox=cx-el.offsetLeft;oy=cy-el.offsetTop;};
  const om=(cx,cy)=>{const nx=cx-ox,ny=cy-oy;el.style.left=nx+'px';el.style.top=ny+'px';ref.x=nx;ref.y=ny;};
  el.addEventListener('mousedown',e=>{e.preventDefault();od(e.clientX,e.clientY);const mm=e2=>om(e2.clientX,e2.clientY);const mu=()=>{window.removeEventListener('mousemove',mm);window.removeEventListener('mouseup',mu);};window.addEventListener('mousemove',mm);window.addEventListener('mouseup',mu);});
  el.addEventListener('touchstart',e=>{e.preventDefault();const t=e.touches[0];od(t.clientX,t.clientY);},{passive:false});
  el.addEventListener('touchmove', e=>{e.preventDefault();const t=e.touches[0];om(t.clientX,t.clientY);},{passive:false});
}
window.clearStickers = function(){ document.getElementById('sticker-layer').innerHTML=''; S.stickers=[]; drawPreview(); };
window.toggleAgreeDetail = function(){ const d=document.getElementById('agree-detail'); d.style.display=d.style.display==='none'?'block':'none'; };

// ── 편지 캡처 → HTMLImageElement ─────────────────────────────────
// 텍스트 + 그림 레이어 합성
function capture(){
  return new Promise(resolve => {
    const OW=320, OH=220;
    const out = document.createElement('canvas'); out.width=OW; out.height=OH;
    const ctx = out.getContext('2d');
    const toName   = document.getElementById('to-input')?.value.trim() || '';
    const fromName = document.getElementById('from-input')?.value.trim() || '';

    // 편지지 배경
    ctx.fillStyle='#fefcf4'; ctx.fillRect(0,0,OW,OH);
    ctx.strokeStyle='rgba(160,130,90,0.18)'; ctx.lineWidth=0.6;
    for(let y=36;y<OH;y+=22){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(OW,y);ctx.stroke();}
    ctx.strokeStyle='rgba(220,120,100,0.28)'; ctx.lineWidth=0.7;
    ctx.beginPath();ctx.moveTo(32,0);ctx.lineTo(32,OH);ctx.stroke();

    // To.
    if(toName){ ctx.fillStyle='#c05848'; ctx.font='700 12px "Noto Sans KR",sans-serif'; ctx.textBaseline='top'; ctx.fillText('To. '+toName, 38, 5); }
    ctx.strokeStyle='rgba(220,120,100,0.20)'; ctx.lineWidth=0.5;
    ctx.beginPath();ctx.moveTo(0,22);ctx.lineTo(OW,22);ctx.stroke();

    // 텍스트 레이어
    const txtEl = S.mode==='mixed'
      ? document.getElementById('mtxt')
      : document.getElementById('ltxt');
    const txt = txtEl?.value || '';
    if(txt){
      const maxW=OW-48, areaH=OH-56;
      const wrapL=sz=>{ ctx.font=`300 ${sz}px "Gaegu",cursive`; const ls=[]; txt.split('\n').forEach(p=>{let l='';for(const ch of p){const t=l+ch;if(ctx.measureText(t).width>maxW&&l){ls.push(l);l=ch;}else l=t;}ls.push(l);}); return ls; };
      let fs=14, lines=wrapL(fs); const lh=()=>fs*1.75;
      while((lines.length>6||lines.length*lh()>areaH)&&fs>9){fs-=0.5;lines=wrapL(fs);}
      while(lines.length<=3&&lines.length*lh()<areaH*0.65&&fs<16){fs+=0.5;lines=wrapL(fs);}
      ctx.fillStyle='#2c2018'; ctx.font=`300 ${fs}px "Gaegu",cursive`; ctx.textBaseline='top';
      const lhv=lh(), totalH=lines.slice(0,6).length*lhv, startY=26+(areaH-totalH)/2;
      lines.slice(0,6).forEach((l,i)=>ctx.fillText(l,40,startY+i*lhv));
    }

    // 그림 레이어 — 텍스트 위에 반투명하게 합성
    if(S.drawn){
      const dc = document.getElementById('dc');
      if(dc){
        // mixed 모드면 투명도 낮게 겹침, draw 단독이면 불투명
        ctx.globalAlpha = (S.mode==='mixed' && txt) ? 0.82 : 1.0;
        ctx.drawImage(dc, 0, 22, OW, OH-36);
        ctx.globalAlpha = 1.0;
      }
    }

    // 스티커
    if(S.stickers.length){
      const wrap = document.querySelector('.preview-wrap');
      const pw=wrap?.clientWidth||292, ph=wrap?.clientHeight||190;
      S.stickers.forEach(st=>{ const sz=Math.round(OW/pw*24); ctx.font=`${sz}px serif`; ctx.fillText(st.emoji,(st.x/pw)*OW,(st.y/ph)*OH+sz*0.8); });
    }

    // From.
    if(fromName){ ctx.fillStyle='#c05848'; ctx.font='700 11px "Noto Sans KR",sans-serif'; const fw=ctx.measureText('From. '+fromName).width; ctx.fillText('From. '+fromName,OW-fw-8,OH-13); }

    const img = new Image(); img.onload=()=>resolve(img); img.src=out.toDataURL('image/png');
  });
}

// ── 바다 애니메이션 (윤슬 강화) ──────────────────────────────────
function startSea(canvasId, items, fadeIn=false){
  if(S.seaRaf){ cancelAnimationFrame(S.seaRaf); S.seaRaf=null; }
  const canvas = document.getElementById(canvasId);
  const box = canvas.parentElement;
  const dpr = window.devicePixelRatio||1;
  const W = box.clientWidth||390, H = box.clientHeight||window.innerHeight;
  canvas.width=W*dpr; canvas.height=H*dpr;
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr,dpr);

  const letters = items.map(it=>{
    const iw=it.img.naturalWidth||320, ih=it.img.naturalHeight||220;
    const sw=W*it.scaleW, sh=sw*(ih/iw);
    return{img:it.img,x:it.xr*W,y:it.yr*H,vx:it.vx,vy:it.vy,angle:it.angle,va:it.va,sw,sh,alpha:fadeIn?0:0.93,targetAlpha:0.93,phase:it.phase};
  });

  const fadeSpeed = fadeIn ? 0.007 : 0.013;
  let t = 0;

  function drawSea(){
    // ── 영화 스틸컷 색상: 청록 투명 바다 ──────────────────────
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,   '#c8e8f0');   // 하늘빛
    g.addColorStop(0.28,'#7ec4d8');   // 세토내해 청록
    g.addColorStop(0.55,'#48a0bc');
    g.addColorStop(0.78,'#2a7a98');
    g.addColorStop(1,   '#1a5878');   // 깊은 바다
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

    // ── 수면 아래 돌 그림자 (영화 스틸컷 특징) ────────────────
    ctx.globalAlpha=0.08;
    for(let i=0;i<8;i++){
      const rx=((i*137+t*0.3)%W), ry=H*0.45+(i*61)%(H*0.45);
      const rr=20+((i*53)%40);
      ctx.fillStyle='#1a4a60';
      ctx.beginPath(); ctx.ellipse(rx,ry,rr,rr*0.5,0,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha=1;

    // ── 섬 실루엣 ─────────────────────────────────────────────
    ctx.fillStyle='rgba(80,160,180,0.22)';
    ctx.beginPath();
    ctx.moveTo(W*0.0, H*0.36);
    ctx.bezierCurveTo(W*0.08,H*0.24, W*0.20,H*0.22, W*0.30,H*0.32);
    ctx.bezierCurveTo(W*0.36,H*0.38, W*0.40,H*0.40, W*0.46,H*0.39);
    ctx.lineTo(W*0.46,H*0.44); ctx.lineTo(W*0.0,H*0.44);
    ctx.closePath(); ctx.fill();

    // ── 파도선 ────────────────────────────────────────────────
    const waves = [
      {ry:0.42,amp:5,spd:0.008,ph:0.0,  al:0.12,w:1.0},
      {ry:0.50,amp:7,spd:0.006,ph:1.3,  al:0.10,w:1.2},
      {ry:0.58,amp:5,spd:0.010,ph:2.6,  al:0.08,w:0.9},
      {ry:0.66,amp:8,spd:0.007,ph:0.8,  al:0.10,w:1.1},
      {ry:0.75,amp:5,spd:0.009,ph:2.0,  al:0.08,w:0.8},
      {ry:0.84,amp:7,spd:0.006,ph:1.5,  al:0.09,w:1.0},
    ];
    for(const w of waves){
      ctx.beginPath();
      ctx.strokeStyle=`rgba(255,255,255,${w.al})`;
      ctx.lineWidth=w.w;
      for(let x=0;x<=W;x+=2){
        const y=H*w.ry+w.amp*Math.sin((x/W)*Math.PI*6+w.ph+t*w.spd*60);
        x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
      ctx.stroke();
    }

    // ── 윤슬 (수면 반사광) — 영화 스틸컷 핵심 ────────────────
    // 큰 윤슬 얼룩
    for(let i=0;i<6;i++){
      const gx = ((i*179+t*8)%(W+80))-40;
      const gy = H*0.38+(i*67)%(H*0.50);
      const ga = 0.10+0.12*Math.abs(Math.sin(t*0.04+i*0.8));
      const gr = ctx.createRadialGradient(gx,gy,0,gx,gy,40+i*8);
      gr.addColorStop(0,  `rgba(255,255,255,${ga})`);
      gr.addColorStop(0.4,`rgba(200,240,255,${ga*0.5})`);
      gr.addColorStop(1,  'rgba(255,255,255,0)');
      ctx.fillStyle=gr;
      ctx.beginPath();
      ctx.ellipse(gx,gy,40+i*8,(18+i*4)*(0.8+0.4*Math.abs(Math.sin(t*0.03+i))),0,0,Math.PI*2);
      ctx.fill();
    }

    // 작은 반짝임 점들
    for(let i=0;i<30;i++){
      const sx=((i*97+t*(6+i%4))%(W+20))-10;
      const sy=H*0.36+(i*43+Math.sin(t*0.05+i)*10)%(H*0.54);
      const sa=0.15+0.55*Math.pow(Math.abs(Math.sin(t*0.08+i*0.7)),2);
      const sr=0.6+0.8*Math.abs(Math.sin(t*0.06+i*0.5));
      ctx.fillStyle=`rgba(255,255,255,${sa})`;
      ctx.beginPath(); ctx.arc(sx,sy,sr,0,Math.PI*2); ctx.fill();
    }

    // 수면 흰 하이라이트 선 (물결 위 빛 반사)
    for(let i=0;i<8;i++){
      const lx=((i*211+t*10)%(W+100))-50;
      const ly=H*0.40+(i*59)%(H*0.48);
      const la=0.12+0.20*Math.abs(Math.sin(t*0.05+i));
      const lw=12+((i*37)%28);
      ctx.strokeStyle=`rgba(255,255,255,${la})`;
      ctx.lineWidth=1.5;
      ctx.beginPath();
      ctx.moveTo(lx,ly);
      ctx.bezierCurveTo(lx+lw*0.3,ly-3, lx+lw*0.7,ly+3, lx+lw,ly);
      ctx.stroke();
    }
  }

  function drawLetter(l){
    const bY=Math.sin(t*0.04+l.phase)*4, bA=Math.sin(t*0.03+l.phase)*0.030;
    ctx.save(); ctx.globalAlpha=l.alpha;
    ctx.translate(l.x+l.sw/2, l.y+l.sh/2+bY); ctx.rotate(l.angle+bA);
    ctx.shadowColor='rgba(0,40,80,0.18)'; ctx.shadowBlur=10; ctx.shadowOffsetY=4;
    ctx.drawImage(l.img,-l.sw/2,-l.sh/2,l.sw,l.sh);
    ctx.restore();
  }

  function frame(){
    t++;
    ctx.clearRect(0,0,W,H);
    drawSea();
    for(const l of letters){
      if(l.alpha < l.targetAlpha) l.alpha = Math.min(l.targetAlpha, l.alpha+fadeSpeed);
      drawLetter(l);
      l.x+=l.vx; l.y+=l.vy; l.angle+=l.va;
      if(l.x<W*0.04||l.x>W*0.70) l.vx*=-1;
      if(l.y<H*0.06||l.y>H*0.62) l.vy*=-1;
    }
    S.seaRaf=requestAnimationFrame(frame);
  }
  frame();

  // 편지 객체 배열 반환 (나중에 답장 추가할 수 있게)
  return letters;
}

// ── 발신인 보내기 ─────────────────────────────────────────────────
window.doSend = async function(){
  if(S.isReply){ await doReplySend(); return; }
  const txt = (document.getElementById('ltxt')?.value || document.getElementById('mtxt')?.value || '').trim();
  if(S.mode==='text'&&!txt){
    const ta=document.getElementById('ltxt');
    ta.style.outline='2px solid rgba(192,88,72,0.5)'; ta.focus();
    setTimeout(()=>ta.style.outline='',1500); return;
  }
  if(S.mode==='draw'&&!S.drawn) return;

  S.savedText = txt;
  S.savedTo   = document.getElementById('to-input')?.value || '';
  S.savedFrom = document.getElementById('from-input')?.value || '';

  showLoading(true,'편지를 봉투에 담는 중…');
  S.senderImg = await capture();

  // Firebase 저장 — 실패해도 3초 후 무조건 진행
  try{
    const savePromise = saveLetter({senderData:S.senderImg.src,replyData:null,mode:S.mode});
    const timeoutPromise = new Promise(r => setTimeout(r, 3000));
    S.letterId = await Promise.race([savePromise, timeoutPromise]);
  } catch(e){ console.warn('저장 실패, 계속 진행:', e); }

  S.shareUrl = `${location.origin}${location.pathname}?id=${S.letterId||'preview'}`;
  showLoading(false);

  await inkTransition(
    'radial-gradient(circle, rgba(240,168,152,0.95) 0%, rgba(74,144,168,0.92) 100%)',
    () => {
      document.getElementById('sea-msg').textContent='편지가 바다 위를 떠다니고 있어요 ✦';
      document.getElementById('sea-sub').textContent='마음에 드시나요?';
      document.getElementById('share-btn').style.display='block';
      document.getElementById('edit-btn').style.display='block';
      document.getElementById('reply-btn').style.display='none';
      document.getElementById('apply-from-sea-btn').style.display='block';
      show('s-sea');
      startSea('seaC',[{img:S.senderImg,xr:.28,yr:.18,vx:.28,vy:-.06,angle:-.04,va:.00018,scaleW:.65,phase:0}], true);
    }
  );

  // 발신인: 답장 도착 실시간 감지 시작
  if(S.letterId) startWatching(S.letterId);
};

// ── 실시간 감지 — 답장이 오면 양측 모두 공유 바다로 ──────────────
function startWatching(id){
  if(S.watchUnsub){ S.watchUnsub(); S.watchUnsub=null; }
  S.watchUnsub = watchLetter(id, (data) => {
    // 이미 공유 바다 화면이면 무시
    if(document.getElementById('s-shared').classList.contains('on')) return;
    // 답장 데이터가 새로 생기면
    if(data.replyData && !S.replyImg){
      const img = new Image();
      img.onload = () => {
        S.replyImg = img;
        launchSharedSea();
      };
      img.src = data.replyData;
    }
  });
}

// ── 두 편지 함께 공유 바다 ───────────────────────────────────────
function launchSharedSea(){
  if(S.watchUnsub){ S.watchUnsub(); S.watchUnsub=null; }
  inkTransition(
    'radial-gradient(circle, rgba(120,200,220,0.92) 0%, rgba(42,120,152,0.95) 100%)',
    () => {
      show('s-shared');
      const items=[];
      if(S.senderImg) items.push({img:S.senderImg,xr:.06,yr:.14,vx:.20,vy:-.05,angle:-.05,va:.00015,scaleW:.55,phase:0});
      if(S.replyImg)  items.push({img:S.replyImg, xr:.36,yr:.36,vx:.17,vy:-.04,angle:.06, va:-.00015,scaleW:.50,phase:1.8});
      startSea('sharedC', items, true);
    }
  );
}

// ── 수정하기 ─────────────────────────────────────────────────────
window.editLetter = function(){
  if(S.seaRaf){ cancelAnimationFrame(S.seaRaf); S.seaRaf=null; }
  document.getElementById('ltxt').value       = S.savedText;
  document.getElementById('to-input').value   = S.savedTo;
  document.getElementById('from-input').value = S.savedFrom;
  sw('text');
  document.getElementById('write-title').innerHTML  = '전하지 못한 마음을<br>바다에 띄워 보세요';
  document.getElementById('write-sub').textContent  = '내용을 수정하고 다시 바다에 띄워 보세요.';
  document.getElementById('send-btn-label').textContent = '바다에 띄우기';
  document.getElementById('send-main-btn').style.background = '';
  S.isReply = false;
  show('s-write');
};

// ── 공유 ─────────────────────────────────────────────────────────
window.goShare = async function(){
  const url = S.shareUrl || location.href;
  if(navigator.share){
    try{ await navigator.share({title:'모모와 다락방의 수상한 요괴들 — 편지 이벤트',text:'바다 위에 떠다니는 편지가 도착했어요. 열어보세요 ✦',url}); return; }
    catch(e){ if(e.name==='AbortError') return; }
  }
  document.getElementById('slink-txt').textContent = url;
  document.getElementById('slink').dataset.url = url;
  show('s-share');
};
window.copyLink = function(){
  const url = document.getElementById('slink')?.dataset.url || S.shareUrl || location.href;
  if(navigator.clipboard) navigator.clipboard.writeText(url).then(()=>{
    document.getElementById('copyhint').textContent='✓ 복사되었습니다!';
    setTimeout(()=>document.getElementById('copyhint').textContent='탭하면 복사돼요',2000);
  });
};
window.goSea = function(){ show('s-sea'); };

// ── 수신인: 답장 / 새 편지 ──────────────────────────────────────
window.goReply = function(){
  setWriteMode('reply');
  show('s-write');
};

// 수신인이 새 편지 쓰기 (발신인 플로우로 초기화)
window.goNewLetter = function(){
  if(S.seaRaf){ cancelAnimationFrame(S.seaRaf); S.seaRaf=null; }
  if(S.watchUnsub){ S.watchUnsub(); S.watchUnsub=null; }
  // 상태 초기화 (letterId만 리셋해서 새 편지로)
  S.isReply=false; S.senderImg=null; S.replyImg=null;
  S.letterId=null; S.shareUrl=''; S.drawn=false; S.stickers=[];
  ['ltxt','to-input','from-input'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('sticker-layer').innerHTML='';
  if(S.dctx){const c=document.getElementById('dc');S.dctx.clearRect(0,0,c.width,c.height);}
  setWriteMode('new');
  show('s-write');
};

function setWriteMode(mode){
  if(mode==='reply'){
    document.getElementById('write-title').innerHTML  = '당신의 마음도<br>바다에 띄워 보세요';
    document.getElementById('write-sub').textContent  = '답장을 보내면 두 마음이 같은 바다 위에서 만납니다.';
    document.getElementById('send-btn-label').textContent = '답장 띄우기';
    document.getElementById('send-main-btn').style.background = 'var(--iwa-blue)';
    document.getElementById('to-input').value  = '';
    document.getElementById('from-input').value = '';
    document.getElementById('ltxt').value = '';
    S.drawn=false; S.stickers=[]; S.mode='text';
    document.getElementById('sticker-layer').innerHTML='';
    if(S.dctx){const c=document.getElementById('dc');S.dctx.clearRect(0,0,c.width,c.height);}
    sw('text');
    S.isReply = true;
  } else {
    document.getElementById('write-title').innerHTML  = '전하지 못한 마음을<br>바다에 띄워 보세요';
    document.getElementById('write-sub').textContent  = '그리운 누군가에게 편지를 써서 바다에 보내보세요.';
    document.getElementById('send-btn-label').textContent = '바다에 띄우기';
    document.getElementById('send-main-btn').style.background = '';
    sw('text');
  }
}

async function doReplySend(){
  const txt=(document.getElementById('ltxt')?.value||document.getElementById('mtxt')?.value||'').trim();
  if(S.mode==='text'&&!txt){document.getElementById('ltxt').focus();return;}
  if(S.mode==='draw'&&!S.drawn)return;

  showLoading(true,'답장을 봉투에 담는 중…');
  S.replyImg = await capture();
  if(S.letterId){
    try{
      const savePromise = saveLetter({id:S.letterId,senderData:S.senderImg?.src||null,replyData:S.replyImg.src,mode:S.mode});
      await Promise.race([savePromise, new Promise(r=>setTimeout(r,3000))]);
    } catch(e){ console.warn('답장 저장 실패, 계속 진행:', e); }
  }
  showLoading(false);
  launchSharedSea();
}

// ── 응모 ─────────────────────────────────────────────────────────
window.goApply = function(){ show('s-apply'); };
window.doApply = async function(){
  const name =document.getElementById('a-name').value.trim();
  const phone=document.getElementById('a-phone').value.trim();
  const email=document.getElementById('a-email').value.trim();
  const agree=document.getElementById('a-agree').checked;
  const err  =document.getElementById('apply-err');
  if(!name) {err.textContent='이름을 입력해 주세요.';return;}
  if(!phone){err.textContent='연락처를 입력해 주세요.';return;}
  if(!agree){err.textContent='개인정보 수집에 동의해 주세요.';return;}
  err.textContent='';
  showLoading(true,'응모 정보를 저장하는 중…');
  try{
    const savePromise = saveApply({name,phone,email,letterId:S.letterId||null});
    await Promise.race([savePromise, new Promise(r=>setTimeout(r,3000))]);
  } catch(e){ console.warn('응모 저장 실패:', e); }
  showLoading(false);
  show('s-apply-done');
};

// ── 처음으로 ─────────────────────────────────────────────────────
window.restartAll = function(){
  if(S.seaRaf){ cancelAnimationFrame(S.seaRaf); S.seaRaf=null; }
  if(S.watchUnsub){ S.watchUnsub(); S.watchUnsub=null; }
  Object.assign(S,{senderImg:null,replyImg:null,drawn:false,letterId:null,shareUrl:'',isReply:false,stickers:[],mode:'text',savedText:'',savedTo:'',savedFrom:''});
  ['ltxt','mtxt','to-input','from-input'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('sticker-layer').innerHTML='';
  if(S.dctx){const c=document.getElementById('dc');S.dctx.clearRect(0,0,c.width,c.height);}
  setWriteMode('new');
  show('s-write');
};

// ── URL 파라미터 (수신인 랜딩) ───────────────────────────────────
async function init(){
  const id = new URLSearchParams(location.search).get('id');
  if(!id) return;
  S.letterId=id; S.isReply=true;
  showLoading(true,'편지를 불러오는 중…');
  try{
    const data = await loadLetter(id);
    if(data?.senderData){
      const img = new Image();
      img.onload = () => {
        S.senderImg=img;
        showLoading(false);
        // 이미 답장이 있으면 바로 공유 바다로
        if(data.replyData){
          const rimg = new Image();
          rimg.onload = () => { S.replyImg=rimg; show('s-shared'); startSea('sharedC',[{img:S.senderImg,xr:.06,yr:.14,vx:.20,vy:-.05,angle:-.05,va:.00015,scaleW:.55,phase:0},{img:S.replyImg,xr:.36,yr:.36,vx:.17,vy:-.04,angle:.06,va:-.00015,scaleW:.50,phase:1.8}]); };
          rimg.src=data.replyData;
        } else {
          // 아직 답장 없음: 발신인 편지만 보이는 수신인 화면
          document.getElementById('sea-msg').textContent='누군가의 편지가 도착했어요 ✦';
          document.getElementById('sea-sub').textContent='잠시 감상해 보세요';
          document.getElementById('reply-btn').style.display='block';
          document.getElementById('new-letter-btn').style.display='block';
          document.getElementById('share-btn').style.display='none';
          document.getElementById('edit-btn').style.display='none';
          document.getElementById('apply-from-sea-btn').style.display='block';
          show('s-sea');
          startSea('seaC',[{img:S.senderImg,xr:.28,yr:.18,vx:.25,vy:-.06,angle:-.04,va:.00018,scaleW:.65,phase:0}]);
          // 수신인도 답장 감지 (상대방이 답장 보내면 공유 바다로)
          startWatching(id);
        }
      };
      img.src=data.senderData;
    } else showLoading(false);
  }catch(e){ console.error('불러오기 실패:',e); showLoading(false); }
}
init();
