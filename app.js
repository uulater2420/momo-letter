// ── app.js ────────────────────────────────────────────────────────
import { createConversation, addLetter, loadConversation, watchConversation, saveApply, getStatus } from './firebase.js';

// ══════════════════════════════════════════════════════════════════
// 상태
// ══════════════════════════════════════════════════════════════════
const S = {
  mode: 'text',
  penColor: '#2c2018', penSize: 4,
  isDrawing: false, lastX: 0, lastY: 0,
  drawn: false,
  drawCtx: null,
  drawTool: 'pen',          // 'pen'(그리기) | 'move'(이동)
  drawDX: 0, drawDY: 0,     // 그림 전체 이동 오프셋(CSS px)
  moveStartX: 0, moveStartY: 0, moveBaseDX: 0, moveBaseDY: 0,
  stickers: [],
  senderImg: null, replyImg: null,
  letterId: null, shareUrl: '',
  isReply: false,
  convId: null,            // 대화 ID (?c=)
  latestLetters: [],       // 현재 대화의 편지 목록(최신)
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

  // 본문 입력창: To. 줄과 겹치지 않도록 위 여백을 동적으로 조절
  const ta = $('ltxt');
  if (ta) ta.style.paddingTop = toName ? '40px' : '14px';

  // ── 본문 텍스트는 캔버스에 그리지 않음 ──────────────────────
  // 입력창(.overlay-textarea)이 캔버스 위에 떠서 글씨를 직접 보여주므로,
  // 여기서 또 그리면 글씨가 두 겹으로 겹쳐 보인다. 표시는 입력창에 일임하고,
  // 최종 이미지에 글씨를 새기는 일은 capture()가 따로 처리한다.

  // ── 그림 레이어 합성 (그린 경우, 이동 오프셋 반영) ──────────
  if (S.drawn) {
    const dl = $('draw-layer');
    if (dl && dl.width > 0) {
      ctx.globalAlpha = 0.92;
      ctx.drawImage(dl, S.drawDX, S.drawDY, W, H);
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

  if (mode === 'draw') { initDrawLayer(); setDrawTool('pen'); }

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
  applyDrawOffset();

  // CSS 변형(이동)까지 반영해 캔버스 내부 좌표를 구함
  function getPos(e) {
    const r = dl.getBoundingClientRect();
    // r 은 translate 변형을 포함하므로, 그 기준으로 빼면 내부 좌표가 된다
    return {
      x: (e.clientX - r.left) * (W / r.width),
      y: (e.clientY - r.top)  * (H / r.height),
    };
  }

  // 마우스·터치를 하나로 합친 포인터 이벤트 사용 (모바일 중복 발생 방지)
  if (dl._eventsSet) return;
  dl._eventsSet = true;

  dl.addEventListener('pointerdown', e => {
    e.preventDefault();
    dl.setPointerCapture?.(e.pointerId);
    if (S.drawTool === 'move') {
      S.isDrawing = true;
      S.moveStartX = e.clientX; S.moveStartY = e.clientY;
      S.moveBaseDX = S.drawDX;  S.moveBaseDY = S.drawDY;
    } else {
      S.isDrawing = true;
      const p = getPos(e); S.lastX = p.x; S.lastY = p.y;
      // 점 하나만 찍어도 표시되도록
      ctx.strokeStyle = S.penColor; ctx.lineWidth = S.penSize;
      ctx.beginPath(); ctx.arc(p.x, p.y, S.penSize/2, 0, Math.PI*2);
      ctx.fillStyle = S.penColor; ctx.fill();
      S.drawn = true;
    }
  });

  dl.addEventListener('pointermove', e => {
    if (!S.isDrawing) return;
    e.preventDefault();
    if (S.drawTool === 'move') {
      const r = dl.getBoundingClientRect();
      const sx = W / r.width, sy = H / r.height;
      S.drawDX = S.moveBaseDX + (e.clientX - S.moveStartX) * sx;
      S.drawDY = S.moveBaseDY + (e.clientY - S.moveStartY) * sy;
      applyDrawOffset();
    } else {
      const p = getPos(e);
      ctx.strokeStyle = S.penColor; ctx.lineWidth = S.penSize;
      ctx.beginPath(); ctx.moveTo(S.lastX, S.lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
      S.lastX = p.x; S.lastY = p.y; S.drawn = true;
    }
  });

  const endStroke = e => {
    if (!S.isDrawing) return;
    S.isDrawing = false;
    dl.releasePointerCapture?.(e.pointerId);
  };
  dl.addEventListener('pointerup', endStroke);
  dl.addEventListener('pointercancel', endStroke);
  dl.addEventListener('pointerleave', endStroke);
}

// 그림 레이어에 이동 오프셋을 화면(CSS)으로 반영
function applyDrawOffset() {
  const dl = $('draw-layer');
  if (dl) dl.style.transform = `translate(${S.drawDX}px, ${S.drawDY}px)`;
}

// 그림 모드(그리기/이동) 전환
function setDrawTool(tool) {
  S.drawTool = tool;
  const dl = $('draw-layer');
  if (dl) dl.style.cursor = tool === 'move' ? 'grab' : 'crosshair';
  const btn = $('btn-draw-mode');
  if (btn) {
    // 버튼에는 "탭하면 전환될 모드"를 표시
    if (tool === 'move') { btn.textContent = '✏️ 그리기'; btn.dataset.mode = 'move'; btn.classList.add('on'); }
    else                 { btn.textContent = '✋ 이동';   btn.dataset.mode = 'pen';  btn.classList.remove('on'); }
  }
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
    // 그림 오버레이 (미리보기와 동일 전체 영역 + 이동 오프셋 반영 → 위치 일치)
    if(S.drawn){
      const dl=$('draw-layer');
      if(dl){
        const W=S.composerW||OW, H=S.composerH||OH;
        const ox=S.drawDX/W*OW, oy=S.drawDY/H*OH;
        ctx.globalAlpha=txt?0.85:1.0;
        ctx.drawImage(dl,ox,oy,OW,OH);
        ctx.globalAlpha=1.0;
      }
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
function startSea(canvasId, imgs, fadeIn) {
  if(S.seaRaf){cancelAnimationFrame(S.seaRaf);S.seaRaf=null;}
  const canvas=$(canvasId);
  const box=canvas.parentElement;
  const dpr=window.devicePixelRatio||1;
  const W=box.clientWidth||390,H=box.clientHeight||window.innerHeight;
  canvas.width=W*dpr;canvas.height=H*dpr;
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);

  // ── 편지를 격자 슬롯에 배치(서로 겹치지 않게) ──────────────────
  const n=imgs.length;
  const cols = n<=1?1 : n<=4?2 : 3;
  const rows = Math.max(1, Math.ceil(n/cols));
  const ax0=0.06*W, ax1=0.94*W, ay0=0.06*H, ay1=0.50*H; // 하단 시트 위쪽 영역
  const cellW=(ax1-ax0)/cols, cellH=(ay1-ay0)/rows;
  const rnd=k=>{const s=Math.sin((k+1)*99.73)*1e4;return s-Math.floor(s);};

  const letters=imgs.map((img,i)=>{
    const iw=img.naturalWidth||320, ih=img.naturalHeight||220;
    const col=i%cols, row=Math.floor(i/cols);
    // 마지막 줄이 덜 찼으면 가운데 정렬
    const inRow = (row===rows-1) ? (n - row*cols) : cols;
    const rowOffset = (cols - inRow) * cellW / 2;
    let sw=cellW*0.84, sh=sw*(ih/iw);
    if(sh>cellH*0.80){ sh=cellH*0.80; sw=sh*(iw/ih); }
    const cx = ax0 + rowOffset + cellW*col + cellW/2 + (rnd(i)-0.5)*cellW*0.08;
    const cy = ay0 + cellH*row + cellH/2 + (rnd(i+7)-0.5)*cellH*0.08;
    return { img, cx, cy, sw, sh, baseAngle:(rnd(i+3)-0.5)*0.10, phase:i*0.9, alpha:fadeIn?0:1 };
  });
  S.seaLetters = letters; // 탭 히트테스트용

  // 탭하면 해당 편지를 크게 펼쳐 읽기 (한 번만 바인딩)
  if(!canvas._tapBound){
    canvas._tapBound=true;
    canvas.style.cursor='pointer';
    canvas.addEventListener('click', e=>{
      const r=canvas.getBoundingClientRect();
      const x=e.clientX-r.left, y=e.clientY-r.top;
      const list=S.seaLetters||[];
      for(let i=list.length-1;i>=0;i--){
        const l=list[i];
        if(x>=l.cx-l.sw/2 && x<=l.cx+l.sw/2 && y>=l.cy-l.sh/2-8 && y<=l.cy+l.sh/2+8){
          openLetterModal(l.img.src); return;
        }
      }
    });
  }

  let t=0;
  function bg(){
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,   '#b0d0e0');
    g.addColorStop(0.22,'#5a90a8');
    g.addColorStop(0.50,'#2a6080');
    g.addColorStop(0.75,'#163850');
    g.addColorStop(1,   '#0a2030');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.globalAlpha=0.06;
    for(let i=0;i<7;i++){const rx=((i*167+t*0.2)%W),ry=H*0.48+(i*71)%(H*0.42),rr=18+(i*43)%36;ctx.fillStyle='#081820';ctx.beginPath();ctx.ellipse(rx,ry,rr,rr*0.45,0,0,Math.PI*2);ctx.fill();}
    ctx.restore();
    ctx.fillStyle='rgba(50,100,120,0.30)';
    ctx.beginPath();ctx.moveTo(W*0.0,H*0.37);ctx.bezierCurveTo(W*0.08,H*0.24,W*0.20,H*0.22,W*0.30,H*0.33);ctx.bezierCurveTo(W*0.36,H*0.38,W*0.40,H*0.40,W*0.46,H*0.39);ctx.lineTo(W*0.46,H*0.44);ctx.lineTo(W*0.0,H*0.44);ctx.closePath();ctx.fill();
    const wv=[{ry:0.42,amp:5,spd:0.008,ph:0.0,al:0.12,lw:1.0},{ry:0.50,amp:6,spd:0.006,ph:1.3,al:0.10,lw:1.1},{ry:0.58,amp:5,spd:0.010,ph:2.5,al:0.09,lw:0.9},{ry:0.66,amp:7,spd:0.007,ph:0.7,al:0.09,lw:1.0},{ry:0.75,amp:5,spd:0.009,ph:1.9,al:0.07,lw:0.8},{ry:0.84,amp:6,spd:0.006,ph:1.4,al:0.08,lw:1.0}];
    for(const w of wv){ctx.beginPath();ctx.strokeStyle=`rgba(255,255,255,${w.al})`;ctx.lineWidth=w.lw;for(let x=0;x<=W;x+=2){const y=H*w.ry+w.amp*Math.sin((x/W)*Math.PI*6+w.ph+t*w.spd*60);x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();}
    for(let i=0;i<26;i++){const sx=((i*97+t*(5+i%4))%(W+20))-10,sy=H*0.37+(i*43+Math.sin(t*0.05+i)*8)%(H*0.52),sa=0.10+0.50*Math.pow(Math.abs(Math.sin(t*0.08+i*0.7)),2),sr=0.5+0.7*Math.abs(Math.sin(t*0.06+i*0.5));ctx.fillStyle=`rgba(255,255,255,${sa})`;ctx.beginPath();ctx.arc(sx,sy,sr,0,Math.PI*2);ctx.fill();}
  }

  function drawLetter(l){
    const bob=Math.sin(t*0.035+l.phase)*4;
    const sway=Math.sin(t*0.025+l.phase)*0.02;
    ctx.save();ctx.globalAlpha=l.alpha;
    ctx.translate(l.cx, l.cy+bob);ctx.rotate(l.baseAngle+sway);
    ctx.shadowColor='rgba(0,30,60,0.22)';ctx.shadowBlur=10;ctx.shadowOffsetY=4;
    // 종이 테두리(살짝)로 가독감
    ctx.drawImage(l.img,-l.sw/2,-l.sh/2,l.sw,l.sh);
    ctx.restore();
  }

  function frame(){
    t++;ctx.clearRect(0,0,W,H);bg();
    for(const l of letters){ if(l.alpha<1) l.alpha=Math.min(1,l.alpha+(fadeIn?0.025:0.05)); drawLetter(l); }
    S.seaRaf=requestAnimationFrame(frame);
  }
  frame();
}

// ── 편지 크게 펼쳐 읽기 모달 ──────────────────────────────────────
function openLetterModal(src){
  let m=document.getElementById('letter-modal');
  if(!m){
    m=document.createElement('div');
    m.id='letter-modal';
    m.style.cssText='position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(8,22,36,0.86);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);padding:6vw;opacity:0;transition:opacity .22s';
    const im=document.createElement('img');
    im.style.cssText='max-width:92vw;max-height:82vh;border-radius:12px;box-shadow:0 18px 55px rgba(0,0,0,.55);background:#fefcf4';
    const cl=document.createElement('button');
    cl.textContent='✕'; cl.setAttribute('aria-label','닫기');
    cl.style.cssText='position:absolute;top:calc(env(safe-area-inset-top,0px) + 16px);right:18px;width:42px;height:42px;border:none;border-radius:50%;background:rgba(255,255,255,0.94);font-size:20px;color:#333;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,.35)';
    const hint=document.createElement('p');
    hint.textContent='탭하면 닫혀요';
    hint.style.cssText='position:absolute;bottom:calc(env(safe-area-inset-bottom,0px) + 18px);left:0;right:0;text-align:center;color:rgba(255,255,255,0.7);font:500 13px sans-serif';
    m.appendChild(im);m.appendChild(cl);m.appendChild(hint);
    m.addEventListener('click',closeLetterModal);
    document.body.appendChild(m);
  }
  m.querySelector('img').src=src;
  m.style.display='flex';
  requestAnimationFrame(()=>{ m.style.opacity='1'; });
}
function closeLetterModal(){
  const m=document.getElementById('letter-modal');
  if(m){ m.style.opacity='0'; setTimeout(()=>{m.style.display='none';},220); }
}

// ══════════════════════════════════════════════════════════════════
// 요괴 춤 전환
// ══════════════════════════════════════════════════════════════════
function showYokaiDance(onDone) {
  show('s-yokai-dance');
  setTimeout(onDone, 2600);
}

// ══════════════════════════════════════════════════════════════════
// 대화형 바다 — 편지들이 같은 바다에 쌓이고 실시간 공유
// ══════════════════════════════════════════════════════════════════
const _imgCache = {};
let _seaCount = -1;

function stopSea(){ if(S.seaRaf){cancelAnimationFrame(S.seaRaf);S.seaRaf=null;} }

// ── 연결 상태 진단 배지 (문제 해결 후 제거해도 됨) ───────────────
async function renderFbStatus(){
  let badge=document.getElementById('fb-status');
  if(!badge){
    badge=document.createElement('div');
    badge.id='fb-status';
    badge.style.cssText='position:fixed;left:8px;bottom:8px;z-index:99999;font:600 11px/1.35 -apple-system,sans-serif;padding:7px 11px;border-radius:10px;max-width:86vw;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.25);white-space:pre-wrap;word-break:break-word';
    badge.title='탭하면 상세/숨김';
    badge.addEventListener('click',()=>{ badge.dataset.open = badge.dataset.open==='1'?'0':'1'; renderFbStatus(); });
    document.body.appendChild(badge);
  }
  const open = badge.dataset.open==='1';
  let s;
  try { s = await getStatus(); } catch(e){ s = {configured:false,connected:false,lastError:e.message}; }

  if(!s.configured){
    badge.style.background='#f8d7da'; badge.style.color='#842029';
    badge.textContent='🔴 로컬 모드 — firebase.js 설정값이 비어 있어요\n(기기 간 공유 불가). FIREBASE_CONFIG를 채우세요.';
  } else if(!s.connected){
    badge.style.background='#f8d7da'; badge.style.color='#842029';
    badge.textContent='🔴 Firebase 연결 실패' + (open && s.lastError ? '\n'+s.lastError : ' — 탭하면 상세');
  } else if(s.lastError){
    badge.style.background='#fff3cd'; badge.style.color='#664d03';
    badge.textContent='🟡 연결됨, 저장/읽기 오류(규칙 확인)' + (open && s.lastError ? '\n'+s.lastError : ' — 탭하면 상세');
  } else {
    badge.style.background='#d1e7dd'; badge.style.color='#0f5132';
    badge.textContent='🟢 실시간 공유 켜짐';
    // 정상이면 4초 뒤 살짝 숨김
    clearTimeout(badge._t);
    badge._t=setTimeout(()=>{ badge.style.opacity='0'; badge.style.transition='opacity .6s'; }, 4000);
    badge.style.opacity='1';
  }
}

// src(dataURL) → Image (캐시)
function loadImg(src){
  return new Promise(res=>{
    if(_imgCache[src]) return res(_imgCache[src]);
    const im=new Image();
    im.onload=()=>{_imgCache[src]=im;res(im);};
    im.onerror=()=>res(null);
    im.src=src;
  });
}

// 현재 대화의 편지들을 바다에 그림 (s-sea 가 보일 때만)
function paintConvSea(letters){
  S.latestLetters = letters || [];
  if(!$('s-sea')?.classList.contains('on')) return;
  const srcs=S.latestLetters.map(l=>l.img).filter(Boolean);
  if(!srcs.length){ _seaCount=0; return; }
  Promise.all(srcs.map(loadImg)).then(list=>{
    const imgs=list.filter(Boolean);
    if(!imgs.length) return;
    if(imgs.length===_seaCount) return; // 변화 없으면 그대로 유지
    _seaCount=imgs.length;
    startSea('sea-canvas', imgs, true);
    const sub=$('sea-sub');
    if(sub) sub.textContent = imgs.length<=1
      ? '🔗 링크를 공유하면 상대도 여기서 답장할 수 있어요'
      : `편지 ${imgs.length}통 · 편지를 탭하면 펼쳐서 읽을 수 있어요`;
  });
}

// 대화 실시간 감시 시작
function startConvWatch(){
  if(S.watchUnsub){S.watchUnsub();S.watchUnsub=null;}
  if(!S.convId) return;
  _seaCount=-1;
  S.watchUnsub=watchConversation(S.convId, letters=>paintConvSea(letters));
}

// 공유 바다 버튼 구성
function setupConvSeaButtons(){
  const msg=$('sea-msg'); if(msg) msg.textContent='편지들이 같은 바다에 모이고 있어요 ✦';
  const r=$('reply-btn'); if(r){ r.textContent='✏️ 편지 쓰기'; r.style.display='block'; }
  const s=$('share-btn'); if(s){ s.textContent='🔗 함께 볼 링크 공유'; s.style.display='block'; }
  const a=$('apply-btn'); if(a){ a.textContent='🎟 이벤트 응모하기'; a.style.display='block'; }
  const n=$('new-btn'); if(n) n.style.display='none';
  const e=$('edit-btn'); if(e) e.style.display='none';
}

// 공유 바다 열기 (전환 연출 포함)
function openConvSea(){
  inkTransition('radial-gradient(circle, rgba(100,180,200,0.92) 0%, rgba(30,90,120,0.95) 100%)',()=>{
    show('s-sea');
    setupConvSeaButtons();
    startConvWatch();           // 부착 즉시 현재 편지들이 그려짐
    paintConvSea(S.latestLetters); // 캐시가 있으면 즉시 한 번 더
  });
}

// ══════════════════════════════════════════════════════════════════
// 편지 보내기 (대화가 없으면 새로 만들고, 있으면 이어 붙임)
// ══════════════════════════════════════════════════════════════════
async function doSend() {
  const txt = ($('ltxt')?.value || '').trim();
  if (S.mode==='text' && !txt) {
    const ta=$('ltxt'); if(ta){ta.style.outline='2px solid rgba(192,88,72,0.5)';ta.focus();setTimeout(()=>ta.style.outline='',1500);} return;
  }
  if (S.mode==='draw' && !S.drawn) return;

  S.savedFrom = $('from-input')?.value || '';
  showLoading(true, '편지를 봉투에 담는 중…');
  const img = await capture();
  const letter = { img: img.src, at: Date.now(), from: S.savedFrom };

  try {
    if (!S.convId) {
      const cid = await createConversation(letter);
      if (cid) {
        S.convId = cid;
        history.replaceState(null,'',`${location.pathname}?c=${cid}`);
      }
    } else {
      await addLetter(S.convId, letter);
    }
  } catch(e){ console.warn('전송 실패:', e); }

  renderFbStatus(); // 전송 결과(저장 성공/실패)를 화면 배지에 반영

  S.shareUrl = S.convId
    ? `${location.origin}${location.pathname}?c=${S.convId}`
    : location.href;

  // 방금 보낸 편지를 즉시 반영(서버 응답 전에도 보이도록)
  S.latestLetters = [...(S.latestLetters||[]), letter];

  showLoading(false);
  showYokaiDance(()=>openConvSea());
}

// ══════════════════════════════════════════════════════════════════
// 편지 쓰기 / 새 대화
// ══════════════════════════════════════════════════════════════════
function clearComposer(){
  ['to-input','from-input','ltxt'].forEach(id=>{const el=$(id);if(el)el.value='';});
  S.drawn=false; S.stickers=[];
  S.drawDX=0; S.drawDY=0; applyDrawOffset();
  const sl=$('sticker-layer'); if(sl) sl.innerHTML='';
  if(S.drawCtx){const dl=$('draw-layer'); if(dl) S.drawCtx.clearRect(0,0,dl.width,dl.height);}
}

// 현재 대화에 이어서 편지 쓰기 (받는 사람도 같은 함수로 답장)
function goCompose(){
  clearComposer();
  const cont = !!S.convId;
  $('write-title').innerHTML = cont
    ? '편지를 이어서<br>바다에 띄워 보세요'
    : '전하지 못한 마음을<br>바다에 띄워 보세요';
  $('write-sub').textContent = cont
    ? '같은 바다 위에 두 사람의 편지가 함께 쌓여요.'
    : '그리운 누군가에게 편지를 써서 바다에 보내보세요.';
  $('send-btn-label').textContent='바다에 띄우기';
  $('send-main-btn').style.background='';
  swTab('text');
  show('s-write');
  renderComposer();
}

// 완전히 새로운 대화 시작
function goNewConversation(){
  stopSea();
  if(S.watchUnsub){S.watchUnsub();S.watchUnsub=null;}
  S.convId=null; S.shareUrl=''; S.latestLetters=[]; _seaCount=-1;
  history.replaceState(null,'',location.pathname);
  goCompose();
}

// ══════════════════════════════════════════════════════════════════
// 공유 (대화 링크 — 처음 한 번만 보내면 됨)
// ══════════════════════════════════════════════════════════════════
async function goShare() {
  const url = S.shareUrl || location.href;
  if (navigator.share) {
    try {
      await navigator.share({
        title:'모모와 다락방의 수상한 요괴들 — 바다에 띄우는 편지',
        text:'우리 둘의 편지가 같은 바다 위에 떠 있어요. 열어서 답장해 주세요 ✦',
        url,
      });
      return;
    } catch(e){ if(e.name==='AbortError') return; }
  }
  $('slink-txt').textContent=url; $('slink').dataset.url=url; show('s-share');
}

function copyLink(){
  const url=$('slink')?.dataset.url||S.shareUrl||location.href;
  if(navigator.clipboard)navigator.clipboard.writeText(url).then(()=>{$('copyhint').textContent='✓ 복사되었습니다!';setTimeout(()=>$('copyhint').textContent='탭하면 복사돼요',2000);});
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
  try{const p1=saveApply({name,phone,email,convId:S.convId||null});await Promise.race([p1,new Promise(r=>setTimeout(r,3000))]);}catch(e){console.warn('응모 저장 실패:',e);}
  showLoading(false);show('s-done');
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
        setDrawTool('pen'); // 색을 고르면 자동으로 그리기 모드
      });
    });
    const ps=$('pen-size');if(ps)ps.addEventListener('input',function(){S.penSize=+this.value;setDrawTool('pen');});
    // 이동 / 그리기 모드 전환
    const md=$('btn-draw-mode');
    if(md)md.addEventListener('click',()=>setDrawTool(S.drawTool==='move'?'pen':'move'));
    // 지우기: 그림과 이동 위치 모두 초기화
    const bc=$('btn-clear-draw');if(bc)bc.addEventListener('click',()=>{
      if(S.drawCtx){const dl=$('draw-layer');if(dl)S.drawCtx.clearRect(0,0,dl.width,dl.height);}
      S.drawn=false; S.drawDX=0; S.drawDY=0; applyDrawOffset(); setDrawTool('pen');
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
  const rb=$('reply-btn');if(rb)rb.addEventListener('click',goCompose);
  const nb=$('new-btn');if(nb)nb.addEventListener('click',goNewConversation);
  const sb=$('share-btn');if(sb)sb.addEventListener('click',goShare);
  const ab=$('apply-btn');if(ab)ab.addEventListener('click',()=>show('s-apply'));

  // 공유 바다 버튼들(구 화면 — 호환 유지)
  const sa=$('shared-apply-btn');if(sa)sa.addEventListener('click',()=>show('s-apply'));
  const ss=$('shared-share-btn');if(ss)ss.addEventListener('click',goShare);
  const sr=$('shared-restart-btn');if(sr)sr.addEventListener('click',goNewConversation);

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
  const drb=$('done-restart-btn');if(drb)drb.addEventListener('click',goNewConversation);
}

// ══════════════════════════════════════════════════════════════════
// 수신인 랜딩
// ══════════════════════════════════════════════════════════════════
async function init() {
  initComposer();
  bindEvents();
  swTab('text');
  renderFbStatus();  // 연결 상태를 화면에 표시(진단)

  const params = new URLSearchParams(location.search);
  const cid = params.get('c');

  // 대화 링크가 없으면 → 새 편지 작성 화면(기본)
  if (!cid) { goCompose(); return; }

  // 대화 링크로 들어옴 → 같은 바다를 실시간으로 함께 보기
  S.convId = cid;
  S.shareUrl = `${location.origin}${location.pathname}?c=${cid}`;
  showLoading(true, '바다를 불러오는 중…');
  try {
    const conv = await loadConversation(cid);
    S.latestLetters = (conv && conv.letters) ? conv.letters : [];
    showLoading(false);
    show('s-sea');
    setupConvSeaButtons();
    _seaCount = -1;
    startConvWatch();                 // 실시간 감시 시작(즉시 현재 편지 렌더)
    paintConvSea(S.latestLetters);    // 캐시가 있으면 즉시 그림
  } catch(e) {
    console.error('대화 불러오기 실패:', e);
    showLoading(false);
    goCompose();
  }
}

// DOM이 완전히 준비된 후 실행 보장 (PC module 타이밍 문제 해결)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
