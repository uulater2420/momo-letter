// ── animation.js : 편지 접힘 → 봉투 → 배 출항 애니메이션 ─────────

export function playFoldAnimation(letterImg, onComplete) {
  const canvas = document.getElementById('animC');
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

  // ── 배경 ─────────────────────────────────────────────────────────
  function drawBg(seaRise = 0) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0,   '#b8e0f5');
    g.addColorStop(0.35,'#70c0de');
    g.addColorStop(0.7, '#3aa8cc');
    g.addColorStop(1,   '#1e7ea8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 파도
    for (let wi = 0; wi < 3; wi++) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,255,255,${0.06 + wi * 0.02})`;
      ctx.lineWidth = 1;
      const baseY = H * (0.55 + wi * 0.08) - seaRise;
      for (let x = 0; x <= W; x += 3) {
        const y = baseY + 6 * Math.sin((x / W) * Math.PI * 5 + wi * 1.2 + Date.now() * 0.002);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // ── 편지지 그리기 ─────────────────────────────────────────────────
  const LW = 200, LH = 140; // 편지 표시 크기
  const cx = W / 2, cy = H * 0.38;

  function drawLetter(scaleY = 1, alpha = 1) {
    if (!letterImg) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(1, scaleY);
    ctx.translate(-LW / 2, -LH / 2);
    ctx.shadowColor   = 'rgba(0,50,100,0.2)';
    ctx.shadowBlur    = 12;
    ctx.shadowOffsetY = 4;
    ctx.drawImage(letterImg, 0, 0, LW, LH);
    ctx.restore();
  }

  // ── 봉투 그리기 ──────────────────────────────────────────────────
  const EW = 180, EH = 120;
  function drawEnvelope(openness = 0, alpha = 1, ox = cx, oy = cy) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ox, oy);

    // 봉투 몸통
    ctx.shadowColor   = 'rgba(0,50,100,0.18)';
    ctx.shadowBlur    = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle   = '#fefcf5';
    ctx.strokeStyle = 'rgba(90,160,200,0.4)';
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    ctx.roundRect(-EW/2, -EH/2, EW, EH, 4);
    ctx.fill(); ctx.stroke();

    // 봉투 내부 V선
    ctx.strokeStyle = 'rgba(180,160,120,0.25)';
    ctx.lineWidth   = 0.8;
    ctx.beginPath();
    ctx.moveTo(-EW/2, -EH/2);
    ctx.lineTo(0, EH * 0.08);
    ctx.lineTo(EW/2, -EH/2);
    ctx.stroke();

    // 봉투 플랩 (openness: 0=닫힘, 1=열림)
    ctx.shadowBlur = 0;
    const flapH = EH * 0.45;
    const angle = openness * Math.PI;
    ctx.save();
    ctx.translate(0, -EH/2);
    ctx.scale(1, Math.cos(angle));
    ctx.fillStyle   = '#f5f0e8';
    ctx.strokeStyle = 'rgba(90,160,200,0.35)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(-EW/2, 0);
    ctx.lineTo(0, flapH);
    ctx.lineTo(EW/2, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // 봉인 스탬프
    ctx.fillStyle = 'rgba(200,80,60,0.55)';
    ctx.beginPath();
    ctx.arc(0, EH * 0.12, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '9px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', 0, EH * 0.12);

    ctx.restore();
  }

  // ── 배 그리기 ─────────────────────────────────────────────────────
  function drawBoat(bx, by, scale = 1, envAlpha = 1) {
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(scale, scale);

    // 선체
    ctx.fillStyle   = '#e8d5a0';
    ctx.strokeStyle = 'rgba(120,90,40,0.6)';
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.quadraticCurveTo(-34, 12, 0, 15);
    ctx.quadraticCurveTo(34, 12, 30, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // 돛대
    ctx.strokeStyle = 'rgba(100,70,30,0.7)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -2); ctx.lineTo(0, -44);
    ctx.stroke();

    // 돛
    ctx.fillStyle   = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = 'rgba(90,120,160,0.35)';
    ctx.lineWidth   = 0.8;
    ctx.beginPath();
    ctx.moveTo(2, -4); ctx.lineTo(2, -42);
    ctx.lineTo(26, -18); ctx.closePath();
    ctx.fill(); ctx.stroke();

    // 배 위에 봉투
    if(envAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = envAlpha;
      ctx.translate(0, -18);
      ctx.scale(0.28, 0.28);
      ctx.translate(-EW/2, -EH/2);
      ctx.fillStyle = '#fefcf5';
      ctx.strokeStyle = 'rgba(90,160,200,0.4)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(0, 0, EW, EH, 4);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  // ── 애니메이션 단계 ───────────────────────────────────────────────
  // Phase 0: 편지 보이기 (0~40f)
  // Phase 1: 편지 접히기 - 세로로 납작해짐 (40~80f)
  // Phase 2: 봉투 등장 + 편지 흡수 (80~130f)
  // Phase 3: 봉투 닫힘 (130~170f)
  // Phase 4: 배 등장 (170~210f)
  // Phase 5: 봉투 → 배 위로 (210~250f)
  // Phase 6: 배 출항 (250~330f)
  // Phase 7: 페이드아웃 (330~370f)

  let frame = 0;
  const TOTAL = 370;

  function ease(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }
  function clamp(v, lo=0, hi=1) { return Math.max(lo, Math.min(hi, v)); }
  function progress(start, end) { return ease(clamp((frame - start) / (end - start))); }

  let rafId;
  function animate() {
    ctx.clearRect(0, 0, W, H);
    drawBg(frame > 250 ? (frame - 250) * 0.3 : 0);

    if (frame < 80) {
      // Phase 0-1: 편지 접히기
      const foldP = progress(40, 80);
      drawLetter(1 - foldP * 0.92, 1 - foldP * 0.3);

    } else if (frame < 170) {
      // Phase 2-3: 봉투 등장 + 닫힘
      const showP  = progress(80, 110);
      const closeP = progress(130, 170);
      drawEnvelope(1 - closeP, showP);

    } else if (frame < 250) {
      // Phase 4-5: 배 등장 + 봉투 배 위로
      const boatP = progress(170, 210);
      const envP  = progress(210, 250);
      const boatY = H * 0.72 - boatP * H * 0.15;
      drawEnvelope(0, clamp(1 - envP * 2), cx, cy - envP * (cy - boatY + 22));
      drawBoat(W * 0.45, boatY, 0.7 + boatP * 0.3, envP);

    } else if (frame < 370) {
      // Phase 6-7: 배 출항 + 페이드
      const sailP  = progress(250, 330);
      const fadeP  = progress(330, 370);
      const boatX  = W * 0.45 + sailP * W * 0.6;
      const boatY  = H * 0.57 - sailP * H * 0.18;
      const boatSc = 1 - sailP * 0.6;
      drawBoat(boatX, boatY, boatSc, 1);
      if (fadeP > 0) {
        ctx.fillStyle = `rgba(176,224,245,${fadeP})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    frame++;
    if (frame < TOTAL) {
      rafId = requestAnimationFrame(animate);
    } else {
      onComplete && onComplete();
    }
  }

  rafId = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(rafId);
}
