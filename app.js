// ── app.js ────────────────────────────────────────────────────────
import { saveLetter, loadLetter, saveApply } from './firebase.js';

// ── 전역 상태 ──────────────────────────────────────────────────────
const S = {
  mode: 'text', rmode: 'text',
  dctx: null, rdctx: null,
  pen: '#1c2e26', rpen: '#1c2e26',
  sz: 4, rsz: 4,
  drawing: false, rdrawing: false,
  lx: 0, ly: 0, rlx: 0, rly: 0,
  drawn: false, rdrawn: false,
  stickers: [],            // { emoji, x, y } 배열
  senderImg: null,
  replyImg: null,
  letterId: null,
  seaRaf: null,
  isReply: false,          // 수신인 플로우 여부
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
  const p = r ? 'r' : '';

  // 탭 버튼 (발신인만 sticker 탭 있음)
  if (!r) {
    ['bt','bd','bs'].forEach(id => document.getElementById(id)?.classList.remove('on'));
    const map = { text:'bt', draw:'bd', sticker:'bs' };
    document.getElementById(map[m])?.classList.add('on');
    ['tp-t','tp-d','tp-s'].forEach(id => document.getElementById(id).className = 'tab-pane');
    const pmap = { text:'tp-t', draw:'tp-d', sticker:'tp-s' };
    document.getElementById(pmap[m]).className = 'tab-pane on';
  } else {
    document.getElementById('rbt').className = 'tbtn' + (m==='text'?' on':'');
    document.getElementById('rbd').className = 'tbtn' + (m==='draw'?' on':'');
    document.getElementById('rtp-t').className = 'tab-pane' + (m==='text'?' on':'');
    document.getElementById('rtp-d').className = 'tab-pane' + (m==='draw'?' on':'');
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
  c.width   = w * dpr; c.height = h * dpr; c.style.height = h + 'px';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (isr) S.rdctx = ctx; else S.dctx = ctx;

  const onDown = (ox, oy) => { if(isr){S.rdrawing=true;S.rlx=ox;S.rly=oy;}else{S.drawing=true;S.lx=ox;S.ly=oy;} };
  const onMove = (ox, oy) => {
    if (isr) {
      if(!S.rdrawing) return; S.rdrawn=true;
      S.rdctx.strokeStyle=S.rpen; S.rdctx.lineWidth=S.rsz;
      S.rdctx.beginPath(); S.rdctx.moveTo(S.rlx,S.rly); S.rdctx.lineTo(ox,oy); S.rdctx.stroke();
      S.rlx=ox; S.rly=oy;
    } else {
      if(!S.drawing) return; S.drawn=true;
      S.dctx.strokeStyle=S.pen; S.dctx.lineWidth=S.sz;
      S.dctx.beginPath(); S.dctx.moveTo(S.lx,S.ly); S.dctx.lineTo(ox,oy); S.dctx.stroke();
      S.lx=ox; S.ly=oy;
    }
  };
  const onUp = () => { if(isr) S.rdrawing=false; else S.drawing=false; };

  c.addEventListener('mousedown',  e => onDown(e.offsetX, e.offsetY));
  c.addEventListener('mousemove',  e => onMove(e.offsetX, e.offsetY));
  c.addEventListener('mouseup',    onUp);
  c.addEventListener('mouseleave', onUp);
  c.addEventListener('touchstart', e => { e.preventDefault(); const t=e.touches[0]; const r=c.getBoundingClientRect(); onDown(t.clientX-r.left,t.clientY-r.top); }, {passive:false});
  c.addEventListener('touchmove',  e => { e.preventDefault(); const t=e.touches[0]; const r=c.getBoundingClientRect(); onMove(t.clientX-r.left,t.clientY-r.top); }, {passive:false});
  c.addEventListener('touchend',   e => { e.preventDefault(); onUp(); }, {passive:false});
}

window.pc = function(el, who) {
  const isr = who === 'r';
  if(isr) S.rpen=el.dataset.c; else S.pen=el.dataset.c;
  const container = document.getElementById(isr?'rtp-d':'tp-d');
  container.querySelectorAll('.cdot').forEach(d => d.classList.remove('on'));
  el.classList.add('on');
};
window.clr = function(who) {
  const isr = who === 'r';
  const c   = document.getElementById(isr?'rdc':'dc');
  const ctx = isr ? S.rdctx : S.dctx;
  if(ctx) ctx.clearRect(0, 0, c.width, c.height);
  if(isr) S.rdrawn=false; else S.drawn=false;
};
document.getElementById('bsr') ?.addEventListener('input', function(){ S.sz  = +this.value; });
document.getElementById('rbsr')?.addEventListener('input', function(){ S.rsz = +this.value; });

// ── 스티커 ────────────────────────────────────────────────────────
window.addSticker = function(emoji) {
  const layer = document.getElementById('sticker-layer');
  const preview = document.getElementById('sticker-preview');
  const el = document.createElement('div');
  el.className = 'placed-sticker';
  el.textContent = emoji;
  // 랜덤 위치
  const maxX = preview.clientWidth  - 40;
  const maxY = preview.clientHeight - 40;
  const x = 20 + Math.random() * Math.max(0, maxX - 20);
  const y = 10 + Math.random() * Math.max(0, maxY - 20);
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  S.stickers.push({ emoji, x, y });
  layer.appendChild(el);
  makeDraggable(el, S.stickers[S.stickers.length - 1]);
};

function makeDraggable(el, stickerRef) {
  let ox=0, oy=0;
  const onDown = (cx, cy) => { ox = cx - el.offsetLeft; oy = cy - el.offsetTop; };
  const onMove = (cx, cy) => {
    const nx = cx - ox, ny = cy - oy;
    el.style.left = nx + 'px'; el.style.top = ny + 'px';
    stickerRef.x = nx; stickerRef.y = ny;
  };
  el.addEventListener('mousedown',  e => { e.preventDefault(); onDown(e.clientX, e.clientY);
    const mm = e2 => onMove(e2.clientX, e2.clientY);
    const mu = () => { window.removeEventListener('mousemove',mm); window.removeEventListener('mouseup',mu); };
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
  });
  el.addEventListener('touchstart', e => { e.preventDefault(); const t=e.touches[0]; onDown(t.clientX, t.clientY); }, {passive:false});
  el.addEventListener('touchmove',  e => { e.preventDefault(); const t=e.touches[0]; onMove(t.clientX, t.clientY); }, {passive:false});
}

window.clearStickers = function() {
  document.getElementById('sticker-layer').innerHTML = '';
  S.stickers = [];
};

window.toggleAgreeDetail = function() {
  const d = document.getElementById('agree-detail');
  d.style.display = d.style.display === 'none' ? 'block' : 'none';
};

// ── 편지 캡처 ─────────────────────────────────────────────────────
function capture(who) {
  return new Promise(resolve => {
    const isr     = who === 'r';
    const m       = isr ? S.rmode : S.mode;
    const hasDraw = isr ? S.rdrawn : S.drawn;
    const toName  = document.getElementById('to-input')?.value.trim()   || '';
    const fromName= document.getElementById('from-input')?.value.trim() || '';

    if (m === 'draw') {
      // 그림: 획만 투명 배경
      const src = document.getElementById(isr ? 'rdc' : 'dc');
      const out = document.createElement('canvas');
      out.width = src.width; out.height = src.height;
      out.getContext('2d').drawImage(src, 0, 0);
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = out.toDataURL('image/png');

    } else {
      // 텍스트: 편지지에 렌더링
      const OW=320, OH=220;
      const out = document.createElement('canvas');
      out.width=OW; out.height=OH;
      const ctx = out.getContext('2d');

      // 종이 배경
      ctx.fillStyle = '#fefcf5'; ctx.fillRect(0,0,OW,OH);

      // 줄선
      ctx.strokeStyle='rgba(180,160,120,0.20)'; ctx.lineWidth=0.6;
      for(let y=36;y<OH;y+=22){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(OW,y); ctx.stroke(); }

      // 여백선
      ctx.strokeStyle='rgba(200,150,130,0.22)'; ctx.lineWidth=0.7;
      ctx.beginPath(); ctx.moveTo(32,0); ctx.lineTo(32,OH); ctx.stroke();

      // To.
      if(toName) {
        ctx.fillStyle='#4a7a96'; ctx.font='300 11px "Noto Serif KR",serif'; ctx.textBaseline='top';
        ctx.fillText('To. ' + toName, 38, 6);
      }

      // 구분선
      ctx.strokeStyle='rgba(90,160,200,0.18)'; ctx.lineWidth=0.5;
      ctx.beginPath(); ctx.moveTo(0,22); ctx.lineTo(OW,22); ctx.stroke();

      // 본문
      const txt = document.getElementById(isr?'rtxt':'ltxt').value || '';
      ctx.fillStyle='#1c2e26'; ctx.font='300 12px "Noto Serif KR",serif'; ctx.textBaseline='top';
      const maxW=OW-46; const lines=[];
      txt.split('\n').forEach(para => {
        let line='';
        for(const ch of para){
          const test=line+ch;
          if(ctx.measureText(test).width>maxW&&line){lines.push(line);line=ch;}
          else line=test;
        }
        lines.push(line);
      });
      lines.slice(0,6).forEach((l,i)=>ctx.fillText(l,40,26+i*22));

      // 스티커
      if(!isr && S.stickers.length) {
        const preview = document.getElementById('sticker-preview');
        const pw = preview.clientWidth || 292;
        const ph = preview.clientHeight || 120;
        S.stickers.forEach(st => {
          ctx.font='18px serif';
          ctx.fillText(st.emoji, (st.x/pw)*OW, (st.y/ph)*OH);
        });
      }

      // From.
      if(fromName) {
        ctx.fillStyle='#4a7a96'; ctx.font='300 11px "Noto Serif KR",serif';
        ctx.fillText('From. ' + fromName, OW-ctx.measureText('From. '+fromName).width-8, OH-14);
      }

      const img = new Image();
      img.onload = () => resolve(img);
      img.src = out.toDataURL('image/png');
    }
  });
}

// ── 바다 애니메이션 ────────────────────────────────────────────────
function startSea(canvasId, items) {
  if(S.seaRaf){ cancelAnimationFrame(S.seaRaf); S.seaRaf=null; }
  const canvas = document.getElementById(canvasId);
  const box    = canvas.parentElement;
  const dpr    = window.devicePixelRatio||1;
  const W      = box.clientWidth  || 390;
  const H      = box.clientHeight || window.innerHeight;
  canvas.width=W*dpr; canvas.height=H*dpr;
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);

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
    ctx.beginPath(); ctx.moveTo(W*.04,H*.38); ctx.bezierCurveTo(W*.09,H*.26,W*.21,H*.24,W*.30,H*.35); ctx.bezierCurveTo(W*.34,H*.39,W*.38,H*.41,W*.44,H*.40); ctx.lineTo(W*.44,H*.45); ctx.lineTo(W*.04,H*.45); ctx.closePath(); ctx.fill();
    for(const w of WV){
      ctx.beginPath(); ctx.strokeStyle=`rgba(255,255,255,${w.al})`; ctx.lineWidth=1;
      for(let x=0;x<=W;x+=2){ const y=H*w.ry+w.amp*Math.sin((x/W)*Math.PI*6+w.ph+t*w.spd*60); x===0?ctx.moveTo(x,y):ctx.lineTo(x,y); }
      ctx.stroke();
    }
    for(let i=0;i<14;i++){ const sx=((i*137+t*13)%(W+30))-15; const sy=H*.36+(i*41)%(H*.5); const sa=.18+.42*Math.abs(Math.sin(t*.06+i)); ctx.fillStyle=`rgba(255,255,255,${sa})`; ctx.beginPath(); ctx.arc(sx,sy,1,0,Math.PI*2); ctx.fill(); }
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
  S.senderImg = await capture('s');

  try {
    S.letterId = await saveLetter({ senderData: S.senderImg.src, replyData: null, mode: S.mode });
  } catch(e){ console.error('저장 실패:', e); }

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

// ── 수신인 답장 ───────────────────────────────────────────────────
window.goReply = function(){
  // 수신인 편지 작성 화면 — 탭은 텍스트/그림만
  document.getElementById('write-title').innerHTML='당신의 마음도<br>바다에 띄워 보세요';
  document.getElementById('write-sub').textContent='답장을 보내면 두 마음이 같은 바다 위에서 만납니다.';
  document.getElementById('send-btn-label').textContent='답장 띄우기';
  document.getElementById('send-main-btn').style.background='#a87020';
  document.getElementById('to-input').value='';
  document.getElementById('from-input').value='';
  // 꾸미기 탭 숨기기
  document.getElementById('bs').style.display='none';
  S.isReply=true;
  show('s-write');
};

window.doReply = async function(){
  const txt=document.getElementById('ltxt').value.trim();
  if(S.mode==='text'&&!txt){ document.getElementById('ltxt').focus(); return; }
  if(S.mode==='draw'&&!S.drawn) return;

  showLoading(true,'답장을 바다에 띄우는 중…');
  S.replyImg = await capture('s');

  if(S.letterId){
    try { await saveLetter({ id:S.letterId, senderData:S.senderImg?.src||null, replyData:S.replyImg.src, mode:S.mode }); }
    catch(e){ console.error('답장 저장 실패:',e); }
  }

  showLoading(false);
  launchSharedSea();
};

// ── 두 편지 함께 ──────────────────────────────────────────────────
function launchSharedSea(){
  show('s-shared');
  const items=[];
  if(S.senderImg) items.push({ img:S.senderImg, xr:.10, yr:.20, vx:.22, vy:-.05, angle:-.05, va:.00015, scaleW:.58, phase:0 });
  if(S.replyImg)  items.push({ img:S.replyImg,  xr:.42, yr:.38, vx:.18, vy:-.04, angle:.06,  va:-.00015, scaleW:.52, phase:1.8 });
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
  try {
    await saveApply({ name, phone, email, letterId: S.letterId||null });
  } catch(e){ console.error('응모 저장 실패:',e); }
  showLoading(false);
  show('s-apply-done');
};

// ── 처음으로 ──────────────────────────────────────────────────────
window.restartAll = function(){
  if(S.seaRaf){ cancelAnimationFrame(S.seaRaf); S.seaRaf=null; }
  S.senderImg=null; S.replyImg=null; S.drawn=false; S.rdrawn=false; S.letterId=null; S.isReply=false; S.stickers=[];
  document.getElementById('ltxt').value='';
  document.getElementById('to-input').value='';
  document.getElementById('from-input').value='';
  document.getElementById('sticker-layer').innerHTML='';
  if(S.dctx){ const c=document.getElementById('dc'); S.dctx.clearRect(0,0,c.width,c.height); }
  // 발신인 UI 복원
  document.getElementById('write-title').innerHTML='전하지 못한 마음을<br>바다에 띄워 보세요';
  document.getElementById('write-sub').textContent='그리운 누군가에게 편지를 쓰거나 그림을 그려 바다에 보내세요.';
  document.getElementById('send-btn-label').textContent='바다에 띄우기';
  document.getElementById('send-main-btn').style.background='';
  document.getElementById('bs').style.display='';
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
