// ── app.js ────────────────────────────────────────────────────────
import { saveLetter, loadLetter, saveApply, watchLetter } from './firebase.js';

// ══════════════════════════════════════════════════════════════════
// 상태
// ══════════════════════════════════════════════════════════════════
const S = {
  mode: 'text',
  penColor: '#2c2018', penSize: 4,
  isDrawing: false, lastX: 0, lastY: 0,
  drawn: false,
  drawCtx: null,
  stickers: [],
  senderImg: null, replyImg: null,
  letterId: null, shareUrl: '',
  isReply: false,
  savedText: '', savedTo: '', savedFrom: '',
  seaRaf: null, watchUnsub: null,
  // 통합 캔버스
  composerCtx: null,
  composerW: 0, composerH: 0,
};

// ══════════════════════════════════════════════════════════════════
// 유틸
// ══════════════════════════════════════════════════════════════════
function $(id) { return document.getElementById(id); }
function show(id) {
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  $(id).classList.add('on');
  window.scrollTo(0, 0);
}
function showLoading(on, msg) {
  $('loading').style.display = on ? 'flex' : 'none';
  if (msg) $('loading-msg').textContent = msg;
}

// ══════════════════════════════════════════════════════════════════
// 수채화 번짐 전환
// ══════════════════════════════════════════════════════════════════
function inkTransition(color, onMid) {
  return new Promise(resolve => {
    const ov = $('ink-overlay');
    ov.style.cssText = [
      `background:${color}`,
      'opacity:0',
      'transform:scale(0.15)',
      'border-radius:100%',
      'position:fixed',
      'inset:0',
      'z-index:50',
      'pointer-events:all',
      'transition:none',
    ].join(';');
    void ov.offsetWidth;
    ov.style.transition = 'opacity 0.5s ease, transform 0.8s cubic-bezier(0.4,0,0.2,1), border-radius 0.8s ease';
    ov.style.opacity = '1';
    ov.style.transform = 'scale(2.2)';
    ov.style.borderRadius = '0';
    setTimeout(() => onMid && onMid(), 500);
    setTimeout(() => {
      ov.style.transition = 'opacity 0.6s ease';
      ov.style.opacity = '0';
      setTimeout(() => { ov.style.pointerEvents = 'none'; resolve(); }, 600);
    }, 950);
  });
}

// ══════════════════════════════════════════════════════════════════
// 통합 편지지 캔버스 초기화
// ══════════════════════════════════════════════════════════════════
function initComposer() {
  const wrap   = $('composer-preview-wrap');
  const canvas = $('composer-canvas');
  const dpr    = window.devicePixelRatio || 1;
  const W = wrap.clientWidth  || 358;
  const H = Math.round(W * 0.68);
  canvas.width  = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  wrap.style.height = H + 'px';
  S.composerCtx = canvas.getContext('2d');
  S.composerCtx.scale(dpr, dpr);
  S.composerW = W; S.composerH = H;
  renderComposer();
}

// 편지지 배경 + 현재 내용 렌더링
function renderComposer() {
  const ctx = S.composerCtx;
  if (!ctx) return;
  const W = S.composerW, H = S.composerH;
  const toName = ($('to-input')?.value || '').trim();

  // 종이 배경
  ctx.fillStyle = '#fefcf4'; ctx.fillRect(0,0,W,H);
  // 줄선
  ctx.strokeStyle = 'rgba(160,130,90,0.18)'; ctx.lineWidth = 0.6;
  const lineH = 36, startY = 14 + (toName ? 32 : 0);
  for (let y = startY; y < H; y += lineH) {
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
  }
  // 여백선
  ctx.strokeStyle = 'rgba(220,120,100,0.26)'; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(38,0); ctx.lineTo(38,H); ctx.stroke();
  // To.
  if (toName) {
    ctx.fillStyle = '#c05848';
    ctx.font = '700 13px "Noto Sans KR", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('To. ' + toName, 44, 8);
    ctx.strokeStyle = 'rgba(220,120,100,0.18)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(0,28); ctx.lineTo(W,28); ctx.stroke();
  }

  // ── 본문 텍스트는 캔버스에 그리지 않음 ──────────────────────
  // 입력창(.overlay-textarea)이 캔버스 위에 떠서 글씨를 직접 보여주므로,
  // 여기서 또 그리면 글씨가 두 겹으로 겹쳐 보인다. 표시는 입력창에 일임하고,
  // 최종 이미지에 글씨를 새기는 일은 capture()가 따로 처리한다.

  // ── 그림 레이어 합성 (그린 경우) ────────────────────────────
  if (S.drawn) {
    const dl = $('draw-layer');
    if (dl && dl.width > 0) {
      ctx.globalAlpha = 0.92;
      ctx.drawImage(dl, 0, 0, W, H);
      ctx.globalAlpha = 1.0;
    }
  }
}

// textarea 동기화
function onTextInput() {
  renderComposer();
  // 그림 탭이면 draw-layer도 위에 있으므로 텍스트는 canvas에 표시 안 해도 됨
  // (overlay-textarea가 투명하게 위에 있어서 실제 입력됨)
}

// ══════════════════════════════════════════════════════════════════
// 탭 전환
// ══════════════════════════════════════════════════════════════════
function swTab(mode) {
  S.mode = mode;
  // 버튼 활성화
  ['text','draw','sticker'].forEach(m => {
    const btn = $('bt-' + m);
    if (btn) btn.classList.toggle('on', m === mode);
  });
  // 텍스트 오버레이: 텍스트 탭만 포인터 이벤트 받음
  const ta = $('ltxt');
  if (ta) ta.style.pointerEvents = mode === 'text' ? 'auto' : 'none';

  // 그림 레이어: 그림 탭일 때만 활성화
  const dl = $('draw-layer');
  if (dl) dl.style.display = mode === 'draw' ? 'block' : 'none';

  // 그림 도구
  const dt = $('draw-tools');
  if (dt) dt.style.display = mode === 'draw' ? 'flex' : 'none';

  // 스티커 도구
  const st = $('sticker-tools');
  if (st) st.style.display = mode === 'sticker' ? 'block' : 'none';

  // 스티커 레이어 포인터
  const sl = $('sticker-layer');
  if (sl) sl.style.pointerEvents = mode === 'sticker' ? 'auto' : 'none';

  if (mode === 'draw') initDrawLayer();

  // 꾸미기 탭: composer 다시 렌더(텍스트+그림 합성 보여주기)
  if (mode === 'sticker') renderComposer();
}

// ══════════════════════════════════════════════════════════════════
// 그림 레이어 초기화
// ══════════════════════════════════════════════════════════════════
function initDrawLayer() {
  const dl = $('draw-layer');
  if (!dl) return;
  const dpr = window.devicePixelRatio || 1;
  const W = S.composerW || 358;
  const H = S.composerH || Math.round(W * 0.68);
  // 크기가 다를 때만 재초기화
  if (!S.drawCtx || dl.width !== W * dpr) {
    dl.width  = W * dpr; dl.height = H * dpr;
    dl.style.width = W + 'px'; dl.style.height = H + 'px';
    const ctx = dl.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    S.drawCtx = ctx;
  }
  const ctx = S.drawCtx;

  function getPos(e) {
    const r = dl.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    }
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  // 이미 이벤트 등록됐으면 skip
  if (dl._eventsSet) return;
  dl._eventsSet = true;
  dl.addEventListener('mousedown',  e => { S.isDrawing=true; const p=getPos(e); S.lastX=p.x; S.lastY=p.y; });
  dl.addEventListener('mousemove',  e => {
    if (!S.isDrawing) return; S.drawn = true;
    const p = getPos(e);
    ctx.strokeStyle = S.penColor; ctx.lineWidth = S.penSize;
    ctx.beginPath(); ctx.moveTo(S.lastX,S.lastY); ctx.lineTo(p.x,p.y); ctx.stroke();
    S.lastX = p.x; S.lastY = p.y;
  });
  dl.addEventListener('mouseup',    () => S.isDrawing = false);
  dl.addEventListener('mouseleave', () => S.isDrawing = false);
  dl.addEventListener('touchstart', e => { e.preventDefault(); S.isDrawing=true; const p=getPos(e); S.lastX=p.x; S.lastY=p.y; }, {passive:false});
  dl.addEventListener('touchmove',  e => {
    e.preventDefault(); if (!S.isDrawing) return; S.drawn = true;
    const p = getPos(e);
    ctx.strokeStyle = S.penColor; ctx.lineWidth = S.penSize;
    ctx.beginPath(); ctx.moveTo(S.lastX,S.lastY); ctx.lineTo(p.x,p.y); ctx.stroke();
    S.lastX = p.x; S.lastY = p.y;
  }, {passive:false});
  dl.addEventListener('touchend', e => { e.preventDefault(); S.isDrawing=false; }, {passive:false});
}

// ══════════════════════════════════════════════════════════════════
// 스티커
// ══════════════════════════════════════════════════════════════════
function addSticker(emoji) {
  const layer = $('sticker-layer');
  const wrap  = $('composer-preview-wrap');
  if (!layer || !wrap) return;
  const el = document.createElement('div');
  el.className = 'placed-sticker'; el.textContent = emoji;
  const bw = wrap.clientWidth-40, bh = wrap.clientHeight-40;
  const x = 10+Math.random()*Math.max(0,bw);
  const y = 8 +Math.random()*Math.max(0,bh);
  el.style.left = x+'px'; el.style.top = y+'px';
  const ref = {emoji,x,y}; S.stickers.push(ref);
  layer.appendChild(el);
  // 드래그
  let ox=0,oy=0;
  function start(cx,cy){ox=cx-el.offsetLeft;oy=cy-el.offsetTop;}
  function move(cx,cy){const nx=cx-ox,ny=cy-oy;el.style.left=nx+'px';el.style.top=ny+'px';ref.x=nx;ref.y=ny;}
  el.addEventListener('mousedown', e=>{e.preventDefault();start(e.clientX,e.clientY);const mm=e2=>move(e2.clientX,e2.clientY);const mu=()=>{window.removeEventListener('mousemove',mm);window.removeEventListener('mouseup',mu);};window.addEventListener('mousemove',mm);window.addEventListener('mouseup',mu);});
  el.addEventListener('touchstart',e=>{e.preventDefault();const t=e.touches[0];start(t.clientX,t.clientY);},{passive:false});
  el.addEventListener('touchmove', e=>{e.preventDefault();const t=e.touches[0];move(t.clientX,t.clientY);},{passive:false});
}

// ══════════════════════════════════════════════════════════════════
// 편지 캡처
// ══════════════════════════════════════════════════════════════════
function capture() {
  return new Promise(resolve => {
    const OW=320, OH=220;
    const out = document.createElement('canvas'); out.width=OW; out.height=OH;
    const ctx = out.getContext('2d');
    const toName   = ($('to-input')?.value   || '').trim();
    const fromName = ($('from-input')?.value || '').trim();
    const txt      = ($('ltxt')?.value       || '');

    // 종이
    ctx.fillStyle='#fefcf4'; ctx.fillRect(0,0,OW,OH);
    ctx.strokeStyle='rgba(160,130,90,0.18)'; ctx.lineWidth=0.6;
    for(let y=36;y<OH;y+=22){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(OW,y);ctx.stroke();}
    ctx.strokeStyle='rgba(220,120,100,0.26)'; ctx.lineWidth=0.7;
    ctx.beginPath();ctx.moveTo(32,0);ctx.lineTo(32,OH);ctx.stroke();
    // To.
    if(toName){ctx.fillStyle='#c05848';ctx.font='700 12px "Noto Sans KR",sans-serif';ctx.textBaseline='top';ctx.fillText('To. '+toName,38,5);}
    ctx.strokeStyle='rgba(220,120,100,0.18)';ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(0,22);ctx.lineTo(OW,22);ctx.stroke();
    // 텍스트
    if(txt){
      const maxW=OW-48,areaH=OH-56;
      function wl(sz){ctx.font=`300 ${sz}px "Gaegu",cursive`;const ls=[];txt.split('\n').forEach(p=>{let l='';for(const ch of p){const t=l+ch;if(ctx.measureText(t).width>maxW&&l){ls.push(l);l=ch;}else l=t;}ls.push(l);});return ls;}
      let fs=15,lines=wl(fs);
      while((lines.length>6||lines.length*fs*1.75>areaH)&&fs>10){fs-=0.5;lines=wl(fs);}
      while(lines.length<=3&&lines.length*fs*1.75<areaH*0.6&&fs<18){fs+=0.5;lines=wl(fs);}
      ctx.fillStyle='#2c2018';ctx.font=`300 ${fs}px "Gaegu",cursive`;ctx.textBaseline='top';
      const lh=fs*1.75,sy=26+(areaH-lines.slice(0,6).length*lh)/2;
      lines.slice(0,6).forEach((l,i)=>ctx.fillText(l,40,sy+i*lh));
    }
    // 그림 오버레이 (미리보기와 동일하게 전체 영역에 합성 → 위치 일치)
    if(S.drawn){
      const dl=$('draw-layer');
      if(dl){ctx.globalAlpha=txt?0.85:1.0;ctx.drawImage(dl,0,0,OW,OH);ctx.globalAlpha=1.0;}
    }
    // 스티커 (미리보기 .placed-sticker: 28px·좌상단 기준과 일치시킴)
    if(S.stickers.length){
      const wrap=$('composer-preview-wrap');
      const pw=wrap?.clientWidth||292,ph=wrap?.clientHeight||198;
      ctx.textBaseline='top';
      S.stickers.forEach(st=>{const sz=Math.round(OW/pw*28);ctx.font=sz+'px serif';ctx.fillText(st.emoji,(st.x/pw)*OW,(st.y/ph)*OH);});
    }
    // From.
    if(fromName){ctx.fillStyle='#c05848';ctx.font='700 11px "Noto Sans KR",sans-serif';const fw=ctx.measureText('From. '+fromName).width;ctx.fillText('From. '+fromName,OW-fw-8,OH-13);}
    const img=new Image();img.onload=()=>resolve(img);img.src=out.toDataURL('image/png');
  });
}

// ══════════════════════════════════════════════════════════════════
// 바다 애니메이션
// ══════════════════════════════════════════════════════════════════
function startSea(canvasId, items, fadeIn) {
  if(S.seaRaf){cancelAnimationFrame(S.seaRaf);S.seaRaf=null;}
  const canvas=$(canvasId);
  const box=canvas.parentElement;
  const dpr=window.devicePixelRatio||1;
  const W=box.clientWidth||390,H=box.clientHeight||window.innerHeight;
  canvas.width=W*dpr;canvas.height=H*dpr;
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);

  const letters=items.map(it=>{
    const iw=it.img.naturalWidth||320,ih=it.img.naturalHeight||220;
    const sw=W*it.sw,sh=sw*(ih/iw);
    return{img:it.img,x:it.x*W,y:it.y*H,vx:it.vx,vy:it.vy,angle:it.a,va:it.va,sw,sh,alpha:fadeIn?0:0.93,phase:it.ph};
  });
  const spd=fadeIn?0.007:0.015;
  let t=0;

  function bg(){
    // 더 진하고 차가운 바다
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,   '#b0d0e0');
    g.addColorStop(0.22,'#5a90a8');
    g.addColorStop(0.50,'#2a6080');
    g.addColorStop(0.75,'#163850');
    g.addColorStop(1,   '#0a2030');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    // 수면 아래 돌
    ctx.save();ctx.globalAlpha=0.06;
    for(let i=0;i<7;i++){const rx=((i*167+t*0.2)%W),ry=H*0.48+(i*71)%(H*0.42),rr=18+(i*43)%36;ctx.fillStyle='#081820';ctx.beginPath();ctx.ellipse(rx,ry,rr,rr*0.45,0,0,Math.PI*2);ctx.fill();}
    ctx.restore();
    // 섬
    ctx.fillStyle='rgba(50,100,120,0.30)';
    ctx.beginPath();ctx.moveTo(W*0.0,H*0.37);ctx.bezierCurveTo(W*0.08,H*0.24,W*0.20,H*0.22,W*0.30,H*0.33);ctx.bezierCurveTo(W*0.36,H*0.38,W*0.40,H*0.40,W*0.46,H*0.39);ctx.lineTo(W*0.46,H*0.44);ctx.lineTo(W*0.0,H*0.44);ctx.closePath();ctx.fill();
    // 파도선
    const wv=[{ry:0.42,amp:5,spd:0.008,ph:0.0,al:0.12,lw:1.0},{ry:0.50,amp:6,spd:0.006,ph:1.3,al:0.10,lw:1.1},{ry:0.58,amp:5,spd:0.010,ph:2.5,al:0.09,lw:0.9},{ry:0.66,amp:7,spd:0.007,ph:0.7,al:0.09,lw:1.0},{ry:0.75,amp:5,spd:0.009,ph:1.9,al:0.07,lw:0.8},{ry:0.84,amp:6,spd:0.006,ph:1.4,al:0.08,lw:1.0}];
    for(const w of wv){ctx.beginPath();ctx.strokeStyle=`rgba(255,255,255,${w.al})`;ctx.lineWidth=w.lw;for(let x=0;x<=W;x+=2){const y=H*w.ry+w.amp*Math.sin((x/W)*Math.PI*6+w.ph+t*w.spd*60);x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();}
    // 윤슬
    for(let i=0;i<5;i++){const gx=((i*173+t*7)%(W+80))-40,gy=H*0.40+(i*67)%(H*0.48),ga=0.08+0.11*Math.abs(Math.sin(t*0.04+i*0.9));const gr=ctx.createRadialGradient(gx,gy,0,gx,gy,36+i*8);gr.addColorStop(0,`rgba(255,255,255,${ga})`);gr.addColorStop(0.4,`rgba(200,230,245,${ga*0.5})`);gr.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gr;ctx.beginPath();ctx.ellipse(gx,gy,36+i*8,(14+i*4)*(0.8+0.3*Math.abs(Math.sin(t*0.03+i))),0,0,Math.PI*2);ctx.fill();}
    for(let i=0;i<26;i++){const sx=((i*97+t*(5+i%4))%(W+20))-10,sy=H*0.37+(i*43+Math.sin(t*0.05+i)*8)%(H*0.52),sa=0.10+0.50*Math.pow(Math.abs(Math.sin(t*0.08+i*0.7)),2),sr=0.5+0.7*Math.abs(Math.sin(t*0.06+i*0.5));ctx.fillStyle=`rgba(255,255,255,${sa})`;ctx.beginPath();ctx.arc(sx,sy,sr,0,Math.PI*2);ctx.fill();}
    for(let i=0;i<6;i++){const lx=((i*211+t*9)%(W+100))-50,ly=H*0.41+(i*59)%(H*0.46),la=0.09+0.16*Math.abs(Math.sin(t*0.05+i)),lw=10+(i*37)%24;ctx.strokeStyle=`rgba(255,255,255,${la})`;ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(lx,ly);ctx.bezierCurveTo(lx+lw*0.3,ly-2,lx+lw*0.7,ly+2,lx+lw,ly);ctx.stroke();}
  }

  function dl(l){
    const bY=Math.sin(t*0.04+l.phase)*4,bA=Math.sin(t*0.03+l.phase)*0.028;
    ctx.save();ctx.globalAlpha=l.alpha;ctx.translate(l.x+l.sw/2,l.y+l.sh/2+bY);ctx.rotate(l.angle+bA);
    ctx.shadowColor='rgba(0,30,60,0.20)';ctx.shadowBlur=10;ctx.shadowOffsetY=4;
    ctx.drawImage(l.img,-l.sw/2,-l.sh/2,l.sw,l.sh);ctx.restore();
  }

  function frame(){
    t++;ctx.clearRect(0,0,W,H);bg();
    for(const l of letters){if(l.alpha<0.93)l.alpha=Math.min(0.93,l.alpha+spd);dl(l);l.x+=l.vx;l.y+=l.vy;l.angle+=l.va;if(l.x<W*0.03||l.x>W*0.72)l.vx*=-1;if(l.y<H*0.05||l.y>H*0.62)l.vy*=-1;}
    S.seaRaf=requestAnimationFrame(frame);
  }
  frame();
}

// ══════════════════════════════════════════════════════════════════
// 요괴 춤 전환
// ══════════════════════════════════════════════════════════════════
function showYokaiDance(onDone) {
  show('s-yokai-dance');
  setTimeout(onDone, 2600);
}

// ══════════════════════════════════════════════════════════════════
// 편지 보내기
// ══════════════════════════════════════════════════════════════════
async function doSend() {
  if (S.isReply) { await doReplySend(); return; }

  const txt = ($('ltxt')?.value || '').trim();
  if (S.mode==='text' && !txt) {
    const ta=$('ltxt'); if(ta){ta.style.outline='2px solid rgba(192,88,72,0.5)';ta.focus();setTimeout(()=>ta.style.outline='',1500);} return;
  }
  if (S.mode==='draw' && !S.drawn) return;

  S.savedText = txt;
  S.savedTo   = $('to-input')?.value   || '';
  S.savedFrom = $('from-input')?.value || '';

  showLoading(true, '편지를 봉투에 담는 중…');
  S.senderImg = await capture();

  try {
    const p1=saveLetter({senderData:S.senderImg.src,replyData:null,mode:S.mode});
    S.letterId = await Promise.race([p1, new Promise(r=>setTimeout(()=>r(null),3000))]);
  } catch(e){ console.warn('저장 실패:',e); }

  S.shareUrl = `${location.origin}${location.pathname}?id=${S.letterId||'preview'}`;
  showLoading(false);

  // 요괴 춤 전환 씬
  showYokaiDance(() => {
    inkTransition(
      'radial-gradient(circle, rgba(220,148,132,0.95) 0%, rgba(50,110,140,0.92) 100%)',
      () => {
        $('sea-msg').textContent='편지가 바다 위를 떠다니고 있어요 ✦';
        $('sea-sub').textContent='마음에 드시나요?';
        $('share-btn').style.display='block';
        $('edit-btn').style.display='block';
        $('apply-btn').style.display='block';
        $('reply-btn').style.display='none';
        $('new-btn').style.display='none';
        show('s-sea');
        startSea('sea-canvas',[{img:S.senderImg,x:.28,y:.18,vx:.28,vy:-.07,a:-.04,va:.00018,sw:.65,ph:0}],true);
      }
    );
    if(S.letterId) startWatching(S.letterId);
  });
}

// ══════════════════════════════════════════════════════════════════
// 실시간 감지
// ══════════════════════════════════════════════════════════════════
function startWatching(id) {
  if(S.watchUnsub){S.watchUnsub();S.watchUnsub=null;}
  S.watchUnsub=watchLetter(id,data=>{
    if(!data.replyData||$('s-shared').classList.contains('on')||S.replyImg)return;
    const img=new Image();img.onload=()=>{S.replyImg=img;launchSharedSea();};img.src=data.replyData;
  });
}

function launchSharedSea(){
  if(S.watchUnsub){S.watchUnsub();S.watchUnsub=null;}
  inkTransition('radial-gradient(circle, rgba(100,180,200,0.92) 0%, rgba(30,90,120,0.95) 100%)',()=>{
    show('s-shared');
    const items=[];
    if(S.senderImg)items.push({img:S.senderImg,x:.06,y:.14,vx:.20,vy:-.05,a:-.05,va:.00015,sw:.55,ph:0});
    if(S.replyImg) items.push({img:S.replyImg, x:.36,y:.36,vx:.17,vy:-.04,a:.06, va:-.00015,sw:.50,ph:1.8});
    startSea('shared-canvas',items,true);
  });
}

// ══════════════════════════════════════════════════════════════════
// 수정하기
// ══════════════════════════════════════════════════════════════════
function editLetter() {
  if(S.seaRaf){cancelAnimationFrame(S.seaRaf);S.seaRaf=null;}
  const ta=$('ltxt');if(ta)ta.value=S.savedText;
  const ti=$('to-input');if(ti)ti.value=S.savedTo;
  const fi=$('from-input');if(fi)fi.value=S.savedFrom;
  $('write-title').innerHTML='전하지 못한 마음을 바다에 띄워 보세요';
  $('write-sub').textContent='내용을 수정하고 다시 바다에 띄워 보세요.';
  $('send-btn-label').textContent='바다에 띄우기';
  $('send-main-btn').style.background='';
  S.isReply=false;
  swTab('text');
  show('s-write');
  renderComposer();
}

// ══════════════════════════════════════════════════════════════════
// 공유
// ══════════════════════════════════════════════════════════════════
async function goShare() {
  const url=S.shareUrl||location.href;
  if(navigator.share){try{await navigator.share({title:'모모와 다락방의 수상한 요괴들 — 바다에 띄우는 편지 이벤트',text:'바다 위에 떠다니는 편지가 도착했어요. 열어보세요 ✦',url});return;}catch(e){if(e.name==='AbortError')return;}}
  $('slink-txt').textContent=url;$('slink').dataset.url=url;show('s-share');
}

function copyLink(){
  const url=$('slink')?.dataset.url||S.shareUrl||location.href;
  if(navigator.clipboard)navigator.clipboard.writeText(url).then(()=>{$('copyhint').textContent='✓ 복사되었습니다!';setTimeout(()=>$('copyhint').textContent='탭하면 복사돼요',2000);});
}

// ══════════════════════════════════════════════════════════════════
// 수신인
// ══════════════════════════════════════════════════════════════════
function goReply(){setReplyMode();show('s-write');renderComposer();}
function goNewLetter(){
  if(S.seaRaf){cancelAnimationFrame(S.seaRaf);S.seaRaf=null;}
  if(S.watchUnsub){S.watchUnsub();S.watchUnsub=null;}
  resetState();setNewMode();show('s-write');renderComposer();
}

function setReplyMode(){
  $('write-title').innerHTML='당신의 마음도<br>바다에 띄워 보세요';
  $('write-sub').textContent='답장을 보내면 두 마음이 같은 바다 위에서 만납니다.';
  $('send-btn-label').textContent='답장 띄우기';
  $('send-main-btn').style.background='#5a7a98';
  ['to-input','from-input','ltxt'].forEach(id=>{const el=$(id);if(el)el.value='';});
  S.drawn=false;S.stickers=[];
  const sl=$('sticker-layer');if(sl)sl.innerHTML='';
  if(S.drawCtx){const dl=$('draw-layer');if(dl)S.drawCtx.clearRect(0,0,dl.width,dl.height);}
  swTab('text');S.isReply=true;
}
function setNewMode(){
  $('write-title').innerHTML='전하지 못한 마음을<br>바다에 띄워 보세요';
  $('write-sub').textContent='그리운 누군가에게 편지를 써서 바다에 보내보세요.';
  $('send-btn-label').textContent='바다에 띄우기';
  $('send-main-btn').style.background='';
  S.isReply=false;swTab('text');
}

function resetState(){
  S.senderImg=null;S.replyImg=null;S.drawn=false;S.stickers=[];
  S.letterId=null;S.shareUrl='';S.savedText='';S.savedTo='';S.savedFrom='';
  const sl=$('sticker-layer');if(sl)sl.innerHTML='';
  if(S.drawCtx){const dl=$('draw-layer');if(dl)S.drawCtx.clearRect(0,0,dl.width,dl.height);}
  ['ltxt','to-input','from-input'].forEach(id=>{const el=$(id);if(el)el.value='';});
}

async function doReplySend(){
  const txt=($('ltxt')?.value||'').trim();
  if(S.mode==='text'&&!txt){$('ltxt')?.focus();return;}
  if(S.mode==='draw'&&!S.drawn)return;
  showLoading(true,'답장을 봉투에 담는 중…');
  S.replyImg=await capture();
  if(S.letterId){try{const p1=saveLetter({id:S.letterId,senderData:S.senderImg?.src||null,replyData:S.replyImg.src,mode:S.mode});await Promise.race([p1,new Promise(r=>setTimeout(r,3000))]);}catch(e){console.warn('답장 저장 실패:',e);}}
  showLoading(false);
  showYokaiDance(()=>launchSharedSea());
}

// ══════════════════════════════════════════════════════════════════
// 응모
// ══════════════════════════════════════════════════════════════════
async function doApply(){
  const name=$('a-name')?.value.trim()||'';
  const phone=$('a-phone')?.value.trim()||'';
  const email=$('a-email')?.value.trim()||'';
  const agree=$('a-agree')?.checked||false;
  const err=$('apply-err');
  if(!name){if(err)err.textContent='이름을 입력해 주세요.';return;}
  if(!phone){if(err)err.textContent='연락처를 입력해 주세요.';return;}
  if(!agree){if(err)err.textContent='개인정보 수집에 동의해 주세요.';return;}
  if(err)err.textContent='';
  showLoading(true,'응모 정보를 저장하는 중…');
  try{const p1=saveApply({name,phone,email,letterId:S.letterId||null});await Promise.race([p1,new Promise(r=>setTimeout(r,3000))]);}catch(e){console.warn('응모 저장 실패:',e);}
  showLoading(false);show('s-done');
}

function restartAll(){
  if(S.seaRaf){cancelAnimationFrame(S.seaRaf);S.seaRaf=null;}
  if(S.watchUnsub){S.watchUnsub();S.watchUnsub=null;}
  resetState();setNewMode();show('s-write');renderComposer();
}

// ══════════════════════════════════════════════════════════════════
// 이벤트 바인딩 (addEventListener — PC 호환)
// ══════════════════════════════════════════════════════════════════
function bindEvents() {
  // 탭 버튼
  ['text','draw','sticker'].forEach(m=>{
    const btn=$('bt-'+m);
    if(btn) btn.addEventListener('click',()=>swTab(m));
  });

  // 펜 색상 (draw-tools 안)
  const dt=$('draw-tools');
  if(dt){
    dt.querySelectorAll('.cdot').forEach(el=>{
      el.addEventListener('click',()=>{
        S.penColor=el.dataset.c;
        dt.querySelectorAll('.cdot').forEach(d=>d.classList.remove('on'));
        el.classList.add('on');
      });
    });
    const ps=$('pen-size');if(ps)ps.addEventListener('input',function(){S.penSize=+this.value;});
    const bc=$('btn-clear-draw');if(bc)bc.addEventListener('click',()=>{
      if(S.drawCtx){const dl=$('draw-layer');if(dl)S.drawCtx.clearRect(0,0,dl.width,dl.height);}S.drawn=false;
    });
  }

  // 스티커 버튼
  const stg=document.getElementById('sticker-tools');
  if(stg){
    stg.querySelectorAll('.sticker-btn').forEach(btn=>{
      btn.addEventListener('click',()=>addSticker(btn.dataset.emoji));
    });
    const bcs=$('btn-clear-sticker');
    if(bcs)bcs.addEventListener('click',()=>{const sl=$('sticker-layer');if(sl)sl.innerHTML='';S.stickers=[];});
  }

  // To/From 입력시 캔버스 동기화
  const ti=$('to-input');if(ti)ti.addEventListener('input',()=>renderComposer());
  const fi=$('from-input');if(fi)fi.addEventListener('input',()=>renderComposer());
  const lt=$('ltxt');if(lt)lt.addEventListener('input',onTextInput);

  // 보내기 버튼
  const sm=$('send-main-btn');if(sm)sm.addEventListener('click',doSend);

  // 바다 버튼들
  const rb=$('reply-btn');if(rb)rb.addEventListener('click',goReply);
  const nb=$('new-btn');if(nb)nb.addEventListener('click',goNewLetter);
  const sb=$('share-btn');if(sb)sb.addEventListener('click',goShare);
  const eb=$('edit-btn');if(eb)eb.addEventListener('click',editLetter);
  const ab=$('apply-btn');if(ab)ab.addEventListener('click',()=>show('s-apply'));

  // 공유 바다 버튼들
  const sa=$('shared-apply-btn');if(sa)sa.addEventListener('click',()=>show('s-apply'));
  const ss=$('shared-share-btn');if(ss)ss.addEventListener('click',goShare);
  const sr=$('shared-restart-btn');if(sr)sr.addEventListener('click',restartAll);

  // 공유 화면
  const slink=$('slink');if(slink)slink.addEventListener('click',copyLink);
  const scb=$('share-copy-btn');if(scb)scb.addEventListener('click',goShare);
  const sab=$('share-apply-btn');if(sab)sab.addEventListener('click',()=>show('s-apply'));
  const ssb=$('share-sea-btn');if(ssb)ssb.addEventListener('click',()=>show('s-sea'));

  // 응모
  const bad=$('btn-agree-detail');if(bad)bad.addEventListener('click',()=>{const d=$('agree-detail');if(d)d.style.display=d.style.display==='none'?'block':'none';});
  const bda=$('btn-do-apply');if(bda)bda.addEventListener('click',doApply);
  const bab=$('apply-back-btn');if(bab)bab.addEventListener('click',()=>show('s-sea'));

  // 완료
  const dsb=$('done-sea-btn');if(dsb)dsb.addEventListener('click',()=>show('s-sea'));
  const dshb=$('done-share-btn');if(dshb)dshb.addEventListener('click',goShare);
  const drb=$('done-restart-btn');if(drb)drb.addEventListener('click',restartAll);
}

// ══════════════════════════════════════════════════════════════════
// 수신인 랜딩
// ══════════════════════════════════════════════════════════════════
async function init() {
  initComposer();
  bindEvents();
  swTab('text');

  const id=new URLSearchParams(location.search).get('id');
  if(!id)return;
  S.letterId=id;S.isReply=true;
  showLoading(true,'편지를 불러오는 중…');
  try{
    const data=await loadLetter(id);
    if(data?.senderData){
      const img=new Image();
      img.onload=()=>{
        S.senderImg=img;showLoading(false);
        if(data.replyData){
          const ri=new Image();ri.onload=()=>{S.replyImg=ri;show('s-shared');startSea('shared-canvas',[{img:S.senderImg,x:.06,y:.14,vx:.20,vy:-.05,a:-.05,va:.00015,sw:.55,ph:0},{img:S.replyImg,x:.36,y:.36,vx:.17,vy:-.04,a:.06,va:-.00015,sw:.50,ph:1.8}],false);};ri.src=data.replyData;
        } else {
          $('sea-msg').textContent='누군가의 편지가 도착했어요 ✦';$('sea-sub').textContent='잠시 감상해 보세요';
          $('reply-btn').style.display='block';$('new-btn').style.display='block';$('apply-btn').style.display='block';
          $('share-btn').style.display='none';$('edit-btn').style.display='none';
          show('s-sea');startSea('sea-canvas',[{img:S.senderImg,x:.28,y:.18,vx:.25,vy:-.06,a:-.04,va:.00018,sw:.65,ph:0}],false);
          startWatching(id);
        }
      };
      img.src=data.senderData;
    } else showLoading(false);
  }catch(e){console.error('불러오기 실패:',e);showLoading(false);}
}

// DOM이 완전히 준비된 후 실행 보장 (PC module 타이밍 문제 해결)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
