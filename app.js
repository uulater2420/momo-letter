// ── app.js ────────────────────────────────────────────────────────
import { saveLetter, loadLetter, saveApply } from './firebase.js';

const S = {
  mode: 'text', rmode: 'text',
  dctx: null, rdctx: null,
  pen: '#1c2e26', rpen: '#1c2e26',
  sz: 4, rsz: 4,
  drawing: false, rdrawing: false,
  lx: 0, ly: 0, rlx: 0, rly: 0,
  drawn: false, rdrawn: false,
  stickers: [], rstickers: [],
  senderImg: null, replyImg: null,
  letterId: null,
  seaRaf: null,
  isReply: false,
};

// ── 화면 전환 ──────────────────────────────────────────────────────
function show(id) {
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  document.getElementById(id).classList.add('on');
  window.scrollTo(0, 0);
}
function showLoading(on, msg = '편지를 바다에 띄우는 중…') {
  document.getElementById('loading').style.display = on ? 'flex' : 'none';
  document.getElementById('loading-msg').textContent = msg;
}

// ── 탭 전환 ───────────────────────────────────────────────────────
window.sw = function(m, who) {
  const r = who === 'r';
  if (r) S.rmode = m; else S.mode = m;

  if (!r) {
    ['bt','bd','bs'].forEach(id => document.getElementById(id)?.classList.remove('on'));
    ({ text:'bt', draw:'bd', sticker:'bs' })[m] && document.getElementById(({ text:'bt', draw:'bd', sticker:'bs' })[m])?.classList.add('on');
    ['tp-t','tp-d','tp-s'].forEach(id => document.getElementById(id).className = 'tab-pane');
    document.getElementById(({ text:'tp-t', draw:'tp-d', sticker:'tp-s' })[m]).className = 'tab-pane on';
  } else {
    ['rbt','rbd','rbs'].forEach(id => document.getElementById(id)?.classList.remove('on'));
    ({ text:'rbt', draw:'rbd', sticker:'rbs' })[m] && document.getElementById(({ text:'rbt', draw:'rbd', sticker:'rbs' })[m])?.classList.add('on');
    ['rtp-t','rtp-d','rtp-s'].forEach(id => document.getElementById(id).className = 'tab-pane');
    document.getElementById(({ text:'rtp-t', draw:'rtp-d', sticker:'rtp-s' })[m]).className = 'tab-pane on';
  }
  if (m === 'draw') initDC(r ? 'r' : 's');
};

// ── 그리기 캔버스 ─────────────────────────────────────────────────
function initDC(who) {
  const isr = who === 'r';
  if (isr && S.rdctx) return;
  if (!isr && S.dctx) return;
  const c   = document.getElementById(isr ? 'rdc' : 'dc');
  const dpr = window.devicePixelRatio || 1;
  const w   = c.getBoundingClientRect().width || 358;
  const h   = Math.round(w * 0.72);
  c.width = w * dpr; c.height = h * dpr; c.style.height = h + 'px';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (isr) S.rdctx = ctx; else S.dctx = ctx;

  const onDown = (ox,oy) => { if(isr){S.rdrawing=true;S.rlx=ox;S.rly=oy;}else{S.drawing=true;S.lx=ox;S.ly=oy;} };
  const onMove = (ox,oy) => {
    if(isr){ if(!S.rdrawing)return; S.rdrawn=true; S.rdctx.strokeStyle=S.rpen; S.rdctx.lineWidth=S.rsz; S.rdctx.beginPath(); S.rdctx.moveTo(S.rlx,S.rly); S.rdctx.lineTo(ox,oy); S.rdctx.stroke(); S.rlx=ox; S.rly=oy; }
    else   { if(!S.drawing) return; S.drawn=true;  S.dctx.strokeStyle=S.pen;   S.dctx.lineWidth=S.sz;   S.dctx.beginPath();  S.dctx.moveTo(S.lx,S.ly);   S.dctx.lineTo(ox,oy);  S.dctx.stroke();  S.lx=ox;  S.ly=oy; }
  };
  const onUp = () => { if(isr) S.rdrawing=false; else S.drawing=false; };

  c.addEventListener('mousedown',  e => onDown(e.offsetX,e.offsetY));
  c.addEventListener('mousemove',  e => onMove(e.offsetX,e.offsetY));
  c.addEventListener('mouseup',    onUp);
  c.addEventListener('mouseleave', onUp);
  c.addEventListener('touchstart', e => { e.preventDefault(); const t=e.touches[0]; const r=c.getBoundingClientRect(); onDown(t.clientX-r.left,t.clientY-r.top); }, {passive:false});
  c.addEventListener('touchmove',  e => { e.preventDefault(); const t=e.touches[0]; const r=c.getBoundingClientRect(); onMove(t.clientX-r.left,t.clientY-r.top); }, {passive:false});
  c.addEventListener('touchend',   e => { e.preventDefault(); onUp(); }, {passive:false});
}

window.pc = function(el, who) {
  const isr = who === 'r';
  if(isr) S.rpen=el.dataset.c; else S.pen=el.dataset.c;
  document.getElementById(isr?'rtp-d':'tp-d').querySelectorAll('.cdot').forEach(d=>d.classList.remove('on'));
  el.classList.add('on');
};
window.clr = function(who) {
  const isr = who === 'r';
  const c = document.getElementById(isr?'rdc':'dc');
  const ctx = isr ? S.rdctx : S.dctx;
  if(ctx) ctx.clearRect(0,0,c.width,c.height);
  if(isr) S.rdrawn=false; else S.drawn=false;
};
document.getElementById('bsr') ?.addEventListener('input', function(){ S.sz  = +this.value; });
document.getElementById('rbsr')?.addEventListener('input', function(){ S.rsz = +this.value; });

// ── 스티커 ────────────────────────────────────────────────────────
window.addSticker = function(emoji, who) {
  const isr = who === 'r';
  const layerId   = isr ? 'r-sticker-layer'   : 'sticker-layer';
  const previewId = isr ? 'r-sticker-preview' : 'sticker-preview';
  const arr = isr ? S.rstickers : S.stickers;

  const layer   = document.getElementById(layerId);
  const preview = document.getElementById(previewId);
  const el = document.createElement('div');
  el.className = 'placed-sticker';
  el.textContent = emoji;
  const bw = preview.clientWidth - 40;
  const bh = preview.clientHeight - 40;
  const x = 10 + Math.random() * Math.max(0, bw);
  const y = 4  + Math.random() * Math.max(0, bh);
  el.style.left = x + 'px'; el.style.top = y + 'px';
  const ref = { emoji, x, y };
  arr.push(ref);
  layer.appendChild(el);
  makeDraggable(el, ref);
};

function makeDraggable(el, ref) {
  let ox=0, oy=0;
  const onDown = (cx,cy) => { ox=cx-el.offsetLeft; oy=cy-el.offsetTop; };
  const onMove = (cx,cy) => { const nx=cx-ox,ny=cy-oy; el.style.left=nx+'px'; el.style.top=ny+'px'; ref.x=nx; ref.y=ny; };
  el.addEventListener('mousedown', e => {
    e.preventDefault(); onDown(e.clientX,e.clientY);
    const mm=e2=>onMove(e2.clientX,e2.clientY);
    const mu=()=>{window.removeEventListener('mousemove',mm);window.removeEventListener('mouseup',mu);};
    window.addEventListener('mousemove',mm); window.addEventListener('mouseup',mu);
  });
  el.addEventListener('touchstart', e=>{e.preventDefault();const t=e.touches[0];onDown(t.clientX,t.clientY);},{passive:false});
  el.addEventListener('touchmove',  e=>{e.preventDefault();const t=e.touches[0];onMove(t.clientX,t.clientY);},{passive:false});
}

window.clearStickers = function(who) {
  const isr = who === 'r';
  document.getElementById(isr?'r-sticker-layer':'sticker-layer').innerHTML = '';
  if(isr) S.rstickers=[]; else S.stickers=[];
};
window.toggleAgreeDetail = function() {
  const d=document.getElementById('agree-detail');
  d.style.display = d.style.display==='none' ? 'block' : 'none';
};

// ── 편지 캡처 → HTMLImageElement ──────────────────────────────────
// 텍스트/드로잉 모두 편지지 배경 포함, 내용이 편지지에 꽉 차도록 크기 조정
function capture(who) {
  return new Promise(resolve => {
    const isr      = who === 'r';
    const m        = isr ? S.rmode : S.mode;
    const hasDraw  = isr ? S.rdrawn : S.drawn;
    const toName   = document.getElementById('to-input')?.value.trim()   || '';
    const fromName = document.getElementById('from-input')?.value.trim() || '';
    const stickers = isr ? S.rstickers : S.stickers;

    const OW = 320, OH = 220;
    const out = document.createElement('canvas');
    out.width = OW; out.height = OH;
    const ctx = out.getContext('2d');

    // ── 편지지 배경 (항상) ──────────────────────────────────────
    ctx.fillStyle = '#fefcf5'; ctx.fillRect(0,0,OW,OH);
    ctx.strokeStyle = 'rgba(180,160,120,0.20)'; ctx.lineWidth = 0.6;
    for(let y=36; y<OH; y+=22){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(OW,y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(200,150,130,0.22)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(32,0); ctx.lineTo(32,OH); ctx.stroke();

    // To.
    if(toName){ ctx.fillStyle='#4a7a96'; ctx.font='300 11px "Noto Serif KR",serif'; ctx.textBaseline='top'; ctx.fillText('To. '+toName, 38, 5); }
    ctx.strokeStyle='rgba(90,160,200,0.18)'; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.moveTo(0,22); ctx.lineTo(OW,22); ctx.stroke();

    if(m === 'draw' && hasDraw) {
      // 그림: 편지지 위에 그림 오버레이
      const src = document.getElementById(isr ? 'rdc' : 'dc');
      ctx.drawImage(src, 0, 22, OW, OH - 36);
    } else {
      // 텍스트: 내용 길이에 맞게 폰트 크기 자동 조정
      const txt = document.getElementById(isr ? 'rtxt' : 'ltxt').value || '';
      const maxW = OW - 48;
      const maxLines = 6;
      const areaH = OH - 56; // To~From 영역 제외

      // 줄바꿈 처리
      const wrapLines = (size) => {
        ctx.font = `300 ${size}px "Noto Serif KR",serif`;
        const lines = [];
        txt.split('\n').forEach(para => {
          let line = '';
          for(const ch of para){
            const test = line + ch;
            if(ctx.measureText(test).width > maxW && line){ lines.push(line); line=ch; }
            else line = test;
          }
          lines.push(line);
        });
        return lines;
      };

      // 폰트 크기 자동 조정: 내용이 편지지 안에 꽉 차도록
      let fontSize = 14;
      let lines = wrapLines(fontSize);
      const lineH = () => fontSize * 1.75;

      // 줄이 많으면 폰트 줄이기
      while((lines.length > maxLines || lines.length * lineH() > areaH) && fontSize > 9) {
        fontSize -= 0.5;
        lines = wrapLines(fontSize);
      }
      // 줄이 적으면 폰트 키우기
      while(lines.length <= 3 && lines.length * lineH() < areaH * 0.7 && fontSize < 16) {
        fontSize += 0.5;
        lines = wrapLines(fontSize);
      }

      ctx.fillStyle = '#1c2e26';
      ctx.font = `300 ${fontSize}px "Noto Serif KR",serif`;
      ctx.textBaseline = 'top';
      const lh = lineH();
      const totalH = lines.slice(0,maxLines).length * lh;
      const startY = 26 + (areaH - totalH) / 2; // 세로 가운데 정렬
      lines.slice(0, maxLines).forEach((l, i) => ctx.fillText(l, 40, startY + i * lh));
    }

    // 스티커
    if(stickers.length) {
      const previewId = isr ? 'r-sticker-preview' : 'sticker-preview';
      const preview = document.getElementById(previewId);
      const pw = preview.clientWidth  || 292;
      const ph = preview.clientHeight || 100;
      stickers.forEach(st => {
        const fontSize = Math.round(OW / pw * 22);
        ctx.font = `${fontSize}px serif`;
        ctx.fillText(st.emoji, (st.x/pw)*OW, (st.y/ph)*(OH-30)+10);
      });
    }

    // From.
    if(fromName){
      ctx.fillStyle='#4a7a96'; ctx.font='300 11px "Noto Serif KR",serif';
      const fw = ctx.measureText('From. '+fromName).width;
      ctx.fillText('From. '+fromName, OW-fw-8, OH-14);
    }

    const img = new Image();
    img.onload = () => resolve(img);
    img.src = out.toDataURL('image/png');
  });
}

// ── 바다 애니메이션 ────────────────────────────────────────────────
function startSea(canvasId, items) {
  if(S.seaRaf){ cancelAnimationFrame(S.seaRaf); S.seaRaf=null; }
  const canvas = document.getElementById(canvasId);
  const box    = canvas.parentElement;
  const dpr    = window.devicePixelRatio || 1;
  const W      = box.clientWidth  || 390;
  const H      = box.clientHeight || window.innerHeight;
  canvas.width=W*dpr; canvas.height=H*dpr;
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr,dpr);

  const letters = items.map(it => {
    const iw=it.img.naturalWidth||320, ih=it.img.naturalHeight||220;
    const sw=W*it.scaleW, sh=sw*(ih/iw);
    return { img:it.img, x:it.xr*W, y:it.yr*H, vx:it.vx, vy:it.vy, angle:it.angle, va:it.va, sw, sh, alpha:0, phase:it.phase };
  });

  const WV=[
    {ry:.48,amp:7,spd:.007,ph:0,   al:.08},{ry:.57,amp:5,spd:.010,ph:1.1,al:.06},
    {ry:.65,amp:9,spd:.006,ph:2.3, al:.10},{ry:.74,amp:5,spd:.012,ph:.8, al:.06},
    {ry:.83,amp:8,spd:.008,ph:1.9, al:.08},
  ];
  let t=0;

  function drawBg(){
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#b8e0f5');g.addColorStop(.35,'#70c0de');g.addColorStop(.7,'#3aa8cc');g.addColorStop(1,'#1e7ea8');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='rgba(100,180,210,.18)';
    ctx.beginPath();ctx.moveTo(W*.04,H*.38);ctx.bezierCurveTo(W*.09,H*.26,W*.21,H*.24,W*.30,H*.35);ctx.bezierCurveTo(W*.34,H*.39,W*.38,H*.41,W*.44,H*.40);ctx.lineTo(W*.44,H*.45);ctx.lineTo(W*.04,H*.45);ctx.closePath();ctx.fill();
    for(const w of WV){
      ctx.beginPath();ctx.strokeStyle=`rgba(255,255,255,${w.al})`;ctx.lineWidth=1;
      for(let x=0;x<=W;x+=2){const y=H*w.ry+w.amp*Math.sin((x/W)*Math.PI*6+w.ph+t*w.spd*60);x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
      ctx.stroke();
    }
    for(let i=0;i<14;i++){const sx=((i*137+t*13)%(W+30))-15;const sy=H*.36+(i*41)%(H*.5);const sa=.18+.42*Math.abs(Math.sin(t*.06+i));ctx.fillStyle=`rgba(255,255,255,${sa})`;ctx.beginPath();ctx.arc(sx,sy,1,0,Math.PI*2);ctx.fill();}
  }

  function drawLetter(l){
    const bY=Math.sin(t*.04+l.phase)*4, bA=Math.sin(t*.03+l.phase)*.030;
    ctx.save(); ctx.globalAlpha=l.alpha;
    ctx.translate(l.x+l.sw/2, l.y+l.sh/2+bY); ctx.rotate(l.angle+bA);
    ctx.shadowColor='rgba(0,50,100,.15)'; ctx.shadowBlur=8; ctx.shadowOffsetY=3;
    ctx.drawImage(l.img,-l.sw/2,-l.sh/2,l.sw,l.sh);
    ctx.restore();
  }

  function frame(){
    t++;
    ctx.clearRect(0,0,W,H); drawBg();
    for(const l of letters){
      if(l.alpha<.93) l.alpha=Math.min(.93,l.alpha+.011);
      drawLetter(l);
      l.x+=l.vx; l.y+=l.vy; l.angle+=l.va;
      if(l.x<W*.04||l.x>W*.70) l.vx*=-1;
      if(l.y<H*.06||l.y>H*.62) l.vy*=-1;
    }
    S.seaRaf=requestAnimationFrame(frame);
  }
  frame();
}

// ── 발신인 편지 보내기 ────────────────────────────────────────────
window.doSend = async function() {
  const txt = document.getElementById('ltxt').value.trim();
  if(S.mode==='text' && !txt){
    const ta=document.getElementById('ltxt');
    ta.style.outline='2px solid rgba(180,60,40,0.4)'; ta.focus();
    setTimeout(()=>ta.style.outline='',1500); return;
  }
  if(S.mode==='draw' && !S.drawn) return;

  showLoading(true);
  // capture를 비동기로 바로 처리 (스티커 포함해도 빠르게)
  S.senderImg = await capture('s');

  try {
    S.letterId = await saveLetter({ senderData:S.senderImg.src, replyData:null, mode:S.mode });
  } catch(e){ console.error('저장 실패:',e); }

  showLoading(false);
  document.getElementById('sea-msg').textContent = '편지가 바다 위를 떠다니고 있어요 ✦';
  document.getElementById('sea-sub').textContent  = '잠시 감상해 보세요';
  document.getElementById('share-btn').style.display = 'block';
  document.getElementById('reply-btn').style.display  = 'none';
  show('s-sea');
  startSea('seaC',[{ img:S.senderImg, xr:.30, yr:.20, vx:.30, vy:-.07, angle:-.04, va:.00018, scaleW:.65, phase:0 }]);
};

// ── 공유 링크 ─────────────────────────────────────────────────────
window.goShare = function(){
  const url=`${location.origin}${location.pathname}?id=${S.letterId||'preview'}`;
  document.getElementById('slink-txt').textContent=url;
  document.getElementById('slink').dataset.url=url;
  show('s-share');
};
window.copyLink = function(){
  const url=document.getElementById('slink').dataset.url||'';
  if(navigator.clipboard) navigator.clipboard.writeText(url).then(()=>{
    document.getElementById('copyhint').textContent='✓ 복사되었습니다!';
    setTimeout(()=>document.getElementById('copyhint').textContent='탭하면 클립보드에 복사돼요',2000);
  });
};
window.goSea = function(){ show('s-sea'); };

// ── 수신인 답장 화면 ──────────────────────────────────────────────
window.goReply = function(){
  document.getElementById('write-title').innerHTML  = '당신의 마음도<br>바다에 띄워 보세요';
  document.getElementById('write-sub').textContent  = '답장을 보내면 두 마음이 같은 바다 위에서 만납니다.';
  document.getElementById('send-btn-label').textContent = '답장 띄우기';
  document.getElementById('send-main-btn').style.background = '#a87020';
  document.getElementById('to-input').value  = '';
  document.getElementById('from-input').value = '';
  S.isReply = true;
  show('s-write');
};

window.doReply = async function(){
  const txt=document.getElementById(S.mode==='text'?'ltxt':'ltxt').value.trim();
  if(S.mode==='text' && !txt){ document.getElementById('ltxt').focus(); return; }
  if(S.mode==='draw' && !S.drawn) return;

  showLoading(true,'답장을 바다에 띄우는 중…');
  S.replyImg = await capture('s'); // 수신인도 같은 작성 화면 사용

  if(S.letterId){
    try { await saveLetter({ id:S.letterId, senderData:S.senderImg?.src||null, replyData:S.replyImg.src, mode:S.mode }); }
    catch(e){ console.error('답장 저장 실패:',e); }
  }

  showLoading(false);
  launchSharedSea();
};

// ── 두 편지 함께 바다 ──────────────────────────────────────────────
function launchSharedSea(){
  show('s-shared');
  const items=[];
  // 발신인 편지: 왼쪽 위
  if(S.senderImg) items.push({ img:S.senderImg, xr:.06, yr:.16, vx:.20, vy:-.05, angle:-.05, va:.00015, scaleW:.55, phase:0 });
  // 수신인 답장: 오른쪽 아래
  if(S.replyImg)  items.push({ img:S.replyImg,  xr:.38, yr:.38, vx:.18, vy:-.04, angle:.06,  va:-.00015, scaleW:.50, phase:1.8 });
  startSea('sharedC', items);
}

// ── 이벤트 응모 ───────────────────────────────────────────────────
window.goApply = function(){ show('s-apply'); };

window.doApply = async function(){
  const name  = document.getElementById('a-name').value.trim();
  const phone = document.getElementById('a-phone').value.trim();
  const email = document.getElementById('a-email').value.trim();
  const agree = document.getElementById('a-agree').checked;
  const err   = document.getElementById('apply-err');
  if(!name)  { err.textContent='이름을 입력해 주세요.'; return; }
  if(!phone) { err.textContent='연락처를 입력해 주세요.'; return; }
  if(!agree) { err.textContent='개인정보 수집에 동의해 주세요.'; return; }
  err.textContent='';
  showLoading(true,'응모 정보를 저장하는 중…');
  try { await saveApply({ name, phone, email, letterId:S.letterId||null }); }
  catch(e){ console.error('응모 저장 실패:',e); }
  showLoading(false);
  show('s-apply-done');
};

// ── 처음으로 ──────────────────────────────────────────────────────
window.restartAll = function(){
  if(S.seaRaf){ cancelAnimationFrame(S.seaRaf); S.seaRaf=null; }
  Object.assign(S,{ senderImg:null, replyImg:null, drawn:false, rdrawn:false, letterId:null, isReply:false, stickers:[], rstickers:[] });
  ['ltxt','rtxt','to-input','from-input'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  ['sticker-layer','r-sticker-layer'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=''; });
  if(S.dctx){ const c=document.getElementById('dc'); S.dctx.clearRect(0,0,c.width,c.height); }
  document.getElementById('write-title').innerHTML  = '전하지 못한 마음을<br>바다에 띄워 보세요';
  document.getElementById('write-sub').textContent  = '그리운 누군가에게 편지를 쓰거나 그림을 그려 바다에 보내세요.';
  document.getElementById('send-btn-label').textContent = '바다에 띄우기';
  document.getElementById('send-main-btn').style.background = '';
  sw('text');
  show('s-write');
};

// ── URL 파라미터 확인 (수신인 랜딩) ──────────────────────────────
async function init(){
  const id=new URLSearchParams(location.search).get('id');
  if(!id) return;
  S.letterId=id; S.isReply=true;
  showLoading(true,'편지를 불러오는 중…');
  try {
    const data=await loadLetter(id);
    if(data?.senderData){
      const img=new Image();
      img.onload=()=>{
        S.senderImg=img;
        showLoading(false);
        document.getElementById('sea-msg').textContent='누군가의 편지가 도착했어요 ✦';
        document.getElementById('sea-sub').textContent='잠시 감상해 보세요';
        document.getElementById('reply-btn').style.display='block';
        document.getElementById('share-btn').style.display='none';
        show('s-sea');
        startSea('seaC',[{ img:S.senderImg, xr:.30, yr:.20, vx:.25, vy:-.06, angle:-.04, va:.00018, scaleW:.65, phase:0 }]);
      };
      img.src=data.senderData;
    } else { showLoading(false); }
  } catch(e){ console.error('불러오기 실패:',e); showLoading(false); }
}
init();
