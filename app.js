// ── app.js : 앱 동작 로직 ────────────────────────────────────────
// firebase.js에서 saveLetter / loadLetter를 import해서 사용

import { saveLetter, loadLetter } from './firebase.js';

// ── 전역 상태 ──────────────────────────────────────────────────────
const S = {
  mode:     'text',   // 'text' | 'draw'
  rmode:    'text',
  dctx:     null,     // sender draw canvas context
  rdctx:    null,     // reply draw canvas context
  pen:      '#1c2e26',
  rpen:     '#1c2e26',
  sz:       4,
  rsz:      4,
  drawing:  false,
  rdrawing: false,
  lx: 0, ly: 0,
  rlx: 0, rly: 0,
  drawn:    false,
  rdrawn:   false,
  senderImg:  null,   // HTMLImageElement
  replyImg:   null,
  letterId:   null,   // Firebase 저장 후 받는 ID
  seaRaf:     null,
};

// ── 화면 전환 ──────────────────────────────────────────────────────
function show(id) {
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  document.getElementById(id).classList.add('on');
  window.scrollTo(0, 0);
}

function showLoading(on) {
  document.getElementById('loading').style.display = on ? 'flex' : 'none';
}

// ── 탭 전환 ────────────────────────────────────────────────────────
window.sw = function(m, who) {
  const r = who === 'r';
  if (r) S.rmode = m; else S.mode = m;
  const p = r ? 'r' : '';
  document.getElementById(p + 'tp-t').className = 'tab-pane' + (m === 'text' ? ' on' : '');
  document.getElementById(p + 'tp-d').className = 'tab-pane' + (m === 'draw' ? ' on' : '');
  document.getElementById(r ? 'rbt' : 'bt').className = 'mtab' + (m === 'text' ? ' on' : '');
  document.getElementById(r ? 'rbd' : 'bd').className = 'mtab' + (m === 'draw' ? ' on' : '');
  if (m === 'draw') initDC(r ? 'r' : 's');
};

// ── 그리기 캔버스 초기화 ───────────────────────────────────────────
function initDC(who) {
  const isr = who === 'r';
  if (isr && S.rdctx) return;
  if (!isr && S.dctx) return;

  const c   = document.getElementById(isr ? 'rdc' : 'dc');
  const dpr = window.devicePixelRatio || 1;
  const w   = c.getBoundingClientRect().width || 358;
  const h   = Math.round(w * 0.72);
  c.width   = w * dpr;
  c.height  = h * dpr;
  c.style.height = h + 'px';

  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (isr) S.rdctx = ctx; else S.dctx = ctx;

  const onDown = (ox, oy) => {
    if (isr) { S.rdrawing = true; S.rlx = ox; S.rly = oy; }
    else     { S.drawing  = true; S.lx  = ox; S.ly  = oy; }
  };
  const onMove = (ox, oy) => {
    if (isr) {
      if (!S.rdrawing) return;
      S.rdrawn = true;
      S.rdctx.strokeStyle = S.rpen;
      S.rdctx.lineWidth   = S.rsz;
      S.rdctx.beginPath();
      S.rdctx.moveTo(S.rlx, S.rly);
      S.rdctx.lineTo(ox, oy);
      S.rdctx.stroke();
      S.rlx = ox; S.rly = oy;
    } else {
      if (!S.drawing) return;
      S.drawn = true;
      S.dctx.strokeStyle = S.pen;
      S.dctx.lineWidth   = S.sz;
      S.dctx.beginPath();
      S.dctx.moveTo(S.lx, S.ly);
      S.dctx.lineTo(ox, oy);
      S.dctx.stroke();
      S.lx = ox; S.ly = oy;
    }
  };
  const onUp = () => { if (isr) S.rdrawing = false; else S.drawing = false; };

  c.addEventListener('mousedown',  e => onDown(e.offsetX, e.offsetY));
  c.addEventListener('mousemove',  e => onMove(e.offsetX, e.offsetY));
  c.addEventListener('mouseup',    onUp);
  c.addEventListener('mouseleave', onUp);
  c.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    const r = c.getBoundingClientRect();
    onDown(t.clientX - r.left, t.clientY - r.top);
  }, { passive: false });
  c.addEventListener('touchmove', e => {
    e.preventDefault();
    const t = e.touches[0];
    const r = c.getBoundingClientRect();
    onMove(t.clientX - r.left, t.clientY - r.top);
  }, { passive: false });
  c.addEventListener('touchend', e => { e.preventDefault(); onUp(); }, { passive: false });
}

// 펜 색상 변경
window.pc = function(el, who) {
  const isr = who === 'r';
  if (isr) S.rpen = el.dataset.c; else S.pen = el.dataset.c;
  const container = document.getElementById(isr ? 'rtp-d' : 'tp-d');
  container.querySelectorAll('.cdot').forEach(d => d.classList.remove('on'));
  el.classList.add('on');
};

// 캔버스 지우기
window.clr = function(who) {
  const isr = who === 'r';
  const c   = document.getElementById(isr ? 'rdc' : 'dc');
  const ctx = isr ? S.rdctx : S.dctx;
  if (ctx) ctx.clearRect(0, 0, c.width, c.height);
  if (isr) S.rdrawn = false; else S.drawn = false;
};

// 브러시 크기
document.getElementById('bsr') .addEventListener('input', function() { S.sz  = +this.value; });
document.getElementById('rbsr').addEventListener('input', function() { S.rsz = +this.value; });

// ── 편지 캡처 → HTMLImageElement ──────────────────────────────────
function capture(who) {
  return new Promise(resolve => {
    const isr     = who === 'r';
    const m       = isr ? S.rmode : S.mode;
    const hasDraw = isr ? S.rdrawn : S.drawn;

    if (m === 'draw') {
      // 그림: 획만 (배경 투명)
      const src = document.getElementById(isr ? 'rdc' : 'dc');
      const out = document.createElement('canvas');
      out.width = src.width; out.height = src.height;
      out.getContext('2d').drawImage(src, 0, 0);
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = out.toDataURL('image/png');

    } else {
      // 텍스트: 편지지에 렌더링
      const OW = 320, OH = 200;
      const out = document.createElement('canvas');
      out.width = OW; out.height = OH;
      const ctx = out.getContext('2d');

      // 종이 배경
      ctx.fillStyle = '#fefcf5';
      ctx.fillRect(0, 0, OW, OH);

      // 줄선
      ctx.strokeStyle = 'rgba(180,160,120,0.20)';
      ctx.lineWidth = 0.6;
      for (let y = 28; y < OH; y += 22) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(OW, y); ctx.stroke();
      }

      // 여백선
      ctx.strokeStyle = 'rgba(200,150,130,0.25)';
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(32, OH); ctx.stroke();

      // 텍스트
      const txt = document.getElementById(isr ? 'rtxt' : 'ltxt').value || '';
      ctx.fillStyle = '#1c2e26';
      ctx.font = '300 13px "Noto Serif KR", serif';
      ctx.textBaseline = 'top';
      const maxW = OW - 46;
      const lines = [];
      txt.split('\n').forEach(para => {
        let line = '';
        for (const ch of para) {
          const test = line + ch;
          if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = ch; }
          else line = test;
        }
        lines.push(line);
      });
      lines.slice(0, 7).forEach((l, i) => ctx.fillText(l, 40, 8 + i * 24));

      const img = new Image();
      img.onload = () => resolve(img);
      img.src = out.toDataURL('image/png');
    }
  });
}

// ── 바다 애니메이션 ────────────────────────────────────────────────
function startSea(canvasId, items) {
  if (S.seaRaf) { cancelAnimationFrame(S.seaRaf); S.seaRaf = null; }

  const canvas = document.getElementById(canvasId);
  const box    = canvas.parentElement;
  const dpr    = window.devicePixelRatio || 1;
  const W      = box.clientWidth  || 390;
  const H      = box.clientHeight || window.innerHeight;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // 편지 객체 생성
  const letters = items.map(it => {
    const iw = it.img.naturalWidth  || 320;
    const ih = it.img.naturalHeight || 200;
    const sw = W * it.scaleW;
    const sh = sw * (ih / iw);
    return {
      img: it.img,
      x: it.xr * W, y: it.yr * H,
      vx: it.vx, vy: it.vy,
      angle: it.angle, va: it.va,
      sw, sh,
      alpha: 0, phase: it.phase,
    };
  });

  const WV = [
    { ry:.48, amp:7, spd:.007, ph:0.0, al:.08 },
    { ry:.57, amp:5, spd:.010, ph:1.1, al:.06 },
    { ry:.65, amp:9, spd:.006, ph:2.3, al:.10 },
    { ry:.74, amp:5, spd:.012, ph:.8,  al:.06 },
    { ry:.83, amp:8, spd:.008, ph:1.9, al:.08 },
  ];
  let t = 0;

  function drawBg() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0,   '#b8e0f5');
    g.addColorStop(.35, '#70c0de');
    g.addColorStop(.7,  '#3aa8cc');
    g.addColorStop(1,   '#1e7ea8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 섬 실루엣
    ctx.fillStyle = 'rgba(100,180,210,.18)';
    ctx.beginPath();
    ctx.moveTo(W*.04, H*.38);
    ctx.bezierCurveTo(W*.09, H*.26, W*.21, H*.24, W*.30, H*.35);
    ctx.bezierCurveTo(W*.34, H*.39, W*.38, H*.41, W*.44, H*.40);
    ctx.lineTo(W*.44, H*.45); ctx.lineTo(W*.04, H*.45);
    ctx.closePath(); ctx.fill();

    // 파도선
    for (const w of WV) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,255,255,${w.al})`;
      ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += 2) {
        const y = H * w.ry + w.amp * Math.sin((x / W) * Math.PI * 6 + w.ph + t * w.spd * 60);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 반짝임
    for (let i = 0; i < 14; i++) {
      const sx = ((i * 137 + t * 13) % (W + 30)) - 15;
      const sy = H * .36 + (i * 41) % (H * .5);
      const sa = .18 + .42 * Math.abs(Math.sin(t * .06 + i));
      ctx.fillStyle = `rgba(255,255,255,${sa})`;
      ctx.beginPath(); ctx.arc(sx, sy, 1, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawLetter(l) {
    const bY = Math.sin(t * .04 + l.phase) * 4;
    const bA = Math.sin(t * .03 + l.phase) * .030;
    ctx.save();
    ctx.globalAlpha = l.alpha;
    ctx.translate(l.x + l.sw / 2, l.y + l.sh / 2 + bY);
    ctx.rotate(l.angle + bA);
    ctx.shadowColor   = 'rgba(0,50,100,.15)';
    ctx.shadowBlur    = 8;
    ctx.shadowOffsetY = 3;
    ctx.drawImage(l.img, -l.sw / 2, -l.sh / 2, l.sw, l.sh);
    ctx.restore();
  }

  function frame() {
    t++;
    ctx.clearRect(0, 0, W, H);
    drawBg();
    for (const l of letters) {
      if (l.alpha < .93) l.alpha = Math.min(.93, l.alpha + .011);
      drawLetter(l);
      l.x += l.vx; l.y += l.vy; l.angle += l.va;
      // 화면 내 바운스
      if (l.x < W * .04 || l.x > W * .70) l.vx *= -1;
      if (l.y < H * .06 || l.y > H * .62) l.vy *= -1;
    }
    S.seaRaf = requestAnimationFrame(frame);
  }
  frame();
}

// ── 발신인 : 편지 보내기 ───────────────────────────────────────────
window.doSend = async function() {
  const txt = document.getElementById('ltxt').value.trim();
  if (S.mode === 'text' && !txt) {
    const ta = document.getElementById('ltxt');
    ta.style.outline = '2px solid rgba(180,60,40,0.4)';
    ta.focus();
    setTimeout(() => ta.style.outline = '', 1500);
    return;
  }
  if (S.mode === 'draw' && !S.drawn) return;

  showLoading(true);
  S.senderImg = await capture('s');

  // Firebase에 저장
  try {
    S.letterId = await saveLetter({
      senderData: S.senderImg.src,
      replyData:  null,
      mode:       S.mode,
    });
  } catch (e) {
    console.error('저장 실패:', e);
  }

  showLoading(false);

  document.getElementById('sea-msg').textContent = '편지가 바다 위를 떠다니고 있어요 ✦';
  document.getElementById('sea-sub').textContent = '잠시 감상해 보세요';
  document.getElementById('share-btn').style.display  = 'block';
  document.getElementById('reply-btn').style.display  = 'none';

  show('s-sea');
  startSea('seaC', [{
    img: S.senderImg,
    xr: .30, yr: .20,
    vx: .30,  vy: -.07,
    angle: -.04, va: .00018,
    scaleW: .65, phase: 0,
  }]);
};

// ── 공유 링크 ──────────────────────────────────────────────────────
window.goShare = function() {
  const id  = S.letterId || 'preview';
  const url = `${location.origin}${location.pathname}?id=${id}`;
  document.getElementById('slink-txt').textContent = url;
  document.getElementById('slink').dataset.url = url;
  show('s-share');
};

window.copyLink = function() {
  const url = document.getElementById('slink').dataset.url || '';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      document.getElementById('copyhint').textContent = '✓ 복사되었습니다!';
      setTimeout(() => {
        document.getElementById('copyhint').textContent = '탭하면 클립보드에 복사돼요';
      }, 2000);
    });
  }
};

window.goSea = function() { show('s-sea'); };

// ── 수신인 : 답장 ──────────────────────────────────────────────────
window.goReply = function() { show('s-reply'); };

window.doReply = async function() {
  const txt = document.getElementById('rtxt').value.trim();
  if (S.rmode === 'text' && !txt) { document.getElementById('rtxt').focus(); return; }
  if (S.rmode === 'draw' && !S.rdrawn) return;

  showLoading(true);
  S.replyImg = await capture('r');

  // Firebase 업데이트
  if (S.letterId) {
    try {
      await saveLetter({
        id:         S.letterId,
        senderData: S.senderImg?.src || null,
        replyData:  S.replyImg.src,
        mode:       S.rmode,
      });
    } catch (e) {
      console.error('답장 저장 실패:', e);
    }
  }

  showLoading(false);
  launchSharedSea();
};

// ── 두 편지 함께 바다 ──────────────────────────────────────────────
function launchSharedSea() {
  show('s-shared');
  const items = [];
  if (S.senderImg) items.push({
    img: S.senderImg,
    xr:.10, yr:.20, vx:.22, vy:-.05, angle:-.05, va:.00015, scaleW:.58, phase:0,
  });
  if (S.replyImg) items.push({
    img: S.replyImg,
    xr:.42, yr:.38, vx:.18, vy:-.04, angle:.06, va:-.00015, scaleW:.52, phase:1.8,
  });
  startSea('sharedC', items);
}

// ── 처음으로 ───────────────────────────────────────────────────────
window.restartAll = function() {
  if (S.seaRaf) { cancelAnimationFrame(S.seaRaf); S.seaRaf = null; }
  S.senderImg = null; S.replyImg = null;
  S.drawn = false; S.rdrawn = false;
  S.letterId = null;
  document.getElementById('ltxt').value = '';
  document.getElementById('rtxt').value = '';
  if (S.dctx)  { const c = document.getElementById('dc');  S.dctx.clearRect(0, 0, c.width, c.height); }
  if (S.rdctx) { const c = document.getElementById('rdc'); S.rdctx.clearRect(0, 0, c.width, c.height); }
  show('s-write');
};

// ── URL 파라미터 확인 (수신인 랜딩) ───────────────────────────────
async function init() {
  const params = new URLSearchParams(location.search);
  const id     = params.get('id');

  if (id) {
    // 수신인 플로우
    S.letterId = id;
    showLoading(true);

    try {
      const data = await loadLetter(id);
      if (data && data.senderData) {
        const img = new Image();
        img.onload = () => {
          S.senderImg = img;
          showLoading(false);
          document.getElementById('sea-msg').textContent = '누군가의 편지가 도착했어요 ✦';
          document.getElementById('sea-sub').textContent = '잠시 감상해 보세요';
          document.getElementById('reply-btn').style.display  = 'block';
          document.getElementById('share-btn').style.display  = 'none';
          show('s-sea');
          startSea('seaC', [{
            img: S.senderImg,
            xr:.30, yr:.20, vx:.25, vy:-.06, angle:-.04, va:.00018, scaleW:.65, phase:0,
          }]);
        };
        img.src = data.senderData;
      } else {
        showLoading(false);
        show('s-write');
      }
    } catch (e) {
      console.error('불러오기 실패:', e);
      showLoading(false);
      show('s-write');
    }
  }
  // 발신인 플로우: 기본 s-write 유지
}

init();
