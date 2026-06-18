// ── app.js ────────────────────────────────────────────────────────
import { saveLetter, loadLetter, saveApply } from './firebase.js';

const S = {
  mode:'text',
  dctx:null, pen:'#1c2e26', sz:4,
  drawing:false, lx:0, ly:0, drawn:false,
  stickers:[],
  senderImg:null, replyImg:null,
  letterId:null, shareUrl:'',
  seaRaf:null, isReply:false,
  previewRaf:null,
};

// ── 화면 전환 ─────────────────────────────────────────────────────
function show(id){
  document.querySelectorAll('.scr').forEach(s=>s.classList.remove('on'));
  document.getElementById(id).classList.add('on');
  window.scrollTo(0,0);
}
function showLoading(on,msg='편지를 바다에 띄우는 중…'){
  document.getElementById('loading').style.display=on?'flex':'none';
  document.getElementById('loading-msg').textContent=msg;
}

// ── 탭 전환 ──────────────────────────────────────────────────────
window.sw=function(m){
  S.mode=m;
  ['bt','bd','bs'].forEach(id=>document.getElementById(id)?.classList.remove('on'));
  document.getElementById({text:'bt',draw:'bd',sticker:'bs'}[m])?.classList.add('on');
  ['tp-t','tp-d','tp-s'].forEach(id=>document.getElementById(id).className='tab-pane');
  document.getElementById({text:'tp-t',draw:'tp-d',sticker:'tp-s'}[m]).className='tab-pane on';
  if(m==='draw') initDC();
  if(m==='sticker') { initPreviewCanvas(); drawPreview(); }
};

// ── 그리기 캔버스 ─────────────────────────────────────────────────
function initDC(){
  if(S.dctx) return;
  const c=document.getElementById('dc');
  const dpr=window.devicePixelRatio||1;
  const w=c.getBoundingClientRect().width||358;
  const h=Math.round(w*0.72);
  c.width=w*dpr; c.height=h*dpr; c.style.height=h+'px';
  const ctx=c.getContext('2d'); ctx.scale(dpr,dpr);
  ctx.lineCap='round'; ctx.lineJoin='round';
  S.dctx=ctx;
  const dn=(ox,oy)=>{S.drawing=true;S.lx=ox;S.ly=oy;};
  const dm=(ox,oy)=>{
    if(!S.drawing)return; S.drawn=true;
    ctx.strokeStyle=S.pen; ctx.lineWidth=S.sz;
    ctx.beginPath(); ctx.moveTo(S.lx,S.ly); ctx.lineTo(ox,oy); ctx.stroke();
    S.lx=ox; S.ly=oy;
  };
  const du=()=>S.drawing=false;
  c.addEventListener('mousedown',e=>dn(e.offsetX,e.offsetY));
  c.addEventListener('mousemove',e=>dm(e.offsetX,e.offsetY));
  c.addEventListener('mouseup',du); c.addEventListener('mouseleave',du);
  c.addEventListener('touchstart',e=>{e.preventDefault();const t=e.touches[0];const r=c.getBoundingClientRect();dn(t.clientX-r.left,t.clientY-r.top);},{passive:false});
  c.addEventListener('touchmove',e=>{e.preventDefault();const t=e.touches[0];const r=c.getBoundingClientRect();dm(t.clientX-r.left,t.clientY-r.top);},{passive:false});
  c.addEventListener('touchend',e=>{e.preventDefault();du();},{passive:false});
  document.getElementById('bsr').addEventListener('input',function(){S.sz=+this.value;});
}
window.pc=function(el){
  S.pen=el.dataset.c;
  document.getElementById('tp-d').querySelectorAll('.cdot').forEach(d=>d.classList.remove('on'));
  el.classList.add('on');
};
window.clr=function(){
  if(S.dctx){const c=document.getElementById('dc');S.dctx.clearRect(0,0,c.width,c.height);}
  S.drawn=false;
};

// ── 꾸미기 미리보기 캔버스 ───────────────────────────────────────
// 편지 내용(텍스트 or 그림)을 실시간으로 보여주면서 스티커를 올릴 수 있음
function initPreviewCanvas(){
  const wrap=document.getElementById('preview-wrap')||document.querySelector('.preview-wrap');
  const c=document.getElementById('preview-canvas');
  if(c._init) return;
  c._init=true;
  const w=wrap.clientWidth||320;
  const h=Math.round(w*0.68);
  c.width=w; c.height=h;
  c.style.height=h+'px';
}

function drawPreview(){
  const c=document.getElementById('preview-canvas');
  if(!c||!c.width) return;
  const W=c.width, H=c.height;
  const ctx=c.getContext('2d');
  const toName  =document.getElementById('to-input')?.value.trim()||'';
  const fromName=document.getElementById('from-input')?.value.trim()||'';

  // 편지지 배경
  ctx.fillStyle='#fefcf5'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(180,160,120,0.20)'; ctx.lineWidth=0.6;
  for(let y=32;y<H;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  ctx.strokeStyle='rgba(200,150,130,0.20)'; ctx.lineWidth=0.7;
  ctx.beginPath();ctx.moveTo(28,0);ctx.lineTo(28,H);ctx.stroke();

  // To.
  if(toName){ctx.fillStyle='#4a7a96';ctx.font='300 10px "Noto Serif KR",serif';ctx.textBaseline='top';ctx.fillText('To. '+toName,32,4);}
  ctx.strokeStyle='rgba(90,160,200,0.15)';ctx.lineWidth=0.5;
  ctx.beginPath();ctx.moveTo(0,18);ctx.lineTo(W,18);ctx.stroke();

  // 내용: drawn이 있으면 그림 우선, 없으면 텍스트
  if(S.drawn){
    const dc=document.getElementById('dc');
    if(dc) ctx.drawImage(dc,0,18,W,H-30);
  } else {
    const txt=document.getElementById('ltxt').value||'';
    const maxW=W-36;
    let fontSize=12;
    const wrapLines=sz=>{
      ctx.font=`300 ${sz}px "Noto Serif KR",serif`;
      const lines=[];
      txt.split('\n').forEach(p=>{let l='';for(const ch of p){const t=l+ch;if(ctx.measureText(t).width>maxW&&l){lines.push(l);l=ch;}else l=t;}lines.push(l);});
      return lines;
    };
    let lines=wrapLines(fontSize);
    const lh=()=>fontSize*1.7;
    while(lines.length>6&&fontSize>8){fontSize-=0.5;lines=wrapLines(fontSize);}
    while(lines.length<=2&&lh()*lines.length<(H-48)*0.6&&fontSize<15){fontSize+=0.5;lines=wrapLines(fontSize);}
    ctx.fillStyle='#1c2e26';
    ctx.font=`300 ${fontSize}px "Noto Serif KR",serif`;
    ctx.textBaseline='top';
    const totalH=lines.slice(0,6).length*lh();
    const startY=20+(H-48-totalH)/2;
    lines.slice(0,6).forEach((l,i)=>ctx.fillText(l,34,startY+i*lh()));
  }

  // From.
  if(fromName){
    ctx.fillStyle='#4a7a96';ctx.font='300 10px "Noto Serif KR",serif';
    const fw=ctx.measureText('From. '+fromName).width;
    ctx.fillText('From. '+fromName,W-fw-6,H-13);
  }
}

// textarea 입력시 꾸미기 탭 미리보기 동기화
window.syncPreview=function(){
  if(S.mode==='sticker') drawPreview();
};

// ── 스티커 ────────────────────────────────────────────────────────
window.addSticker=function(emoji){
  // 꾸미기 탭이 아니면 자동 전환
  if(S.mode!=='sticker'){ sw('sticker'); setTimeout(()=>doAddSticker(emoji),50); return; }
  doAddSticker(emoji);
};
function doAddSticker(emoji){
  initPreviewCanvas(); drawPreview();
  const layer=document.getElementById('sticker-layer');
  const wrap =document.querySelector('.preview-wrap');
  const el=document.createElement('div');
  el.className='placed-sticker'; el.textContent=emoji;
  const bw=wrap.clientWidth-40, bh=wrap.clientHeight-40;
  const x=10+Math.random()*Math.max(0,bw);
  const y=8 +Math.random()*Math.max(0,bh);
  el.style.left=x+'px'; el.style.top=y+'px';
  const ref={emoji,x,y};
  S.stickers.push(ref);
  layer.appendChild(el);
  makeDraggable(el,ref);
}
function makeDraggable(el,ref){
  let ox=0,oy=0;
  const onDown=(cx,cy)=>{ox=cx-el.offsetLeft;oy=cy-el.offsetTop;};
  const onMove=(cx,cy)=>{const nx=cx-ox,ny=cy-oy;el.style.left=nx+'px';el.style.top=ny+'px';ref.x=nx;ref.y=ny;};
  el.addEventListener('mousedown',e=>{
    e.preventDefault();onDown(e.clientX,e.clientY);
    const mm=e2=>onMove(e2.clientX,e2.clientY);
    const mu=()=>{window.removeEventListener('mousemove',mm);window.removeEventListener('mouseup',mu);};
    window.addEventListener('mousemove',mm);window.addEventListener('mouseup',mu);
  });
  el.addEventListener('touchstart',e=>{e.preventDefault();const t=e.touches[0];onDown(t.clientX,t.clientY);},{passive:false});
  el.addEventListener('touchmove', e=>{e.preventDefault();const t=e.touches[0];onMove(t.clientX,t.clientY);},{passive:false});
}
window.clearStickers=function(){
  document.getElementById('sticker-layer').innerHTML='';
  S.stickers=[];
  drawPreview();
};
window.toggleAgreeDetail=function(){
  const d=document.getElementById('agree-detail');
  d.style.display=d.style.display==='none'?'block':'none';
};

// ── 편지 캡처 → HTMLImageElement ─────────────────────────────────
function capture(){
  return new Promise(resolve=>{
    const OW=320,OH=220;
    const out=document.createElement('canvas');
    out.width=OW;out.height=OH;
    const ctx=out.getContext('2d');
    const toName  =document.getElementById('to-input')?.value.trim()||'';
    const fromName=document.getElementById('from-input')?.value.trim()||'';

    // 편지지
    ctx.fillStyle='#fefcf5';ctx.fillRect(0,0,OW,OH);
    ctx.strokeStyle='rgba(180,160,120,0.20)';ctx.lineWidth=0.6;
    for(let y=36;y<OH;y+=22){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(OW,y);ctx.stroke();}
    ctx.strokeStyle='rgba(200,150,130,0.22)';ctx.lineWidth=0.7;
    ctx.beginPath();ctx.moveTo(32,0);ctx.lineTo(32,OH);ctx.stroke();

    // To.
    if(toName){ctx.fillStyle='#4a7a96';ctx.font='300 11px "Noto Serif KR",serif';ctx.textBaseline='top';ctx.fillText('To. '+toName,38,5);}
    ctx.strokeStyle='rgba(90,160,200,0.18)';ctx.lineWidth=0.5;
    ctx.beginPath();ctx.moveTo(0,22);ctx.lineTo(OW,22);ctx.stroke();

    if(S.drawn){
      // 그림: 편지지 위에 오버레이 (mode가 sticker로 바뀌어도 drawn이면 그림 우선)
      const dc=document.getElementById('dc');
      ctx.drawImage(dc,0,22,OW,OH-36);
    } else {
      // 텍스트: 자동 크기 조정
      const txt=document.getElementById('ltxt').value||'';
      const maxW=OW-48; const areaH=OH-56;
      const wrapLines=sz=>{
        ctx.font=`300 ${sz}px "Noto Serif KR",serif`;
        const lines=[];
        txt.split('\n').forEach(p=>{let l='';for(const ch of p){const t=l+ch;if(ctx.measureText(t).width>maxW&&l){lines.push(l);l=ch;}else l=t;}lines.push(l);});
        return lines;
      };
      let fs=14; let lines=wrapLines(fs); const lh=()=>fs*1.75;
      while((lines.length>6||lines.length*lh()>areaH)&&fs>9){fs-=0.5;lines=wrapLines(fs);}
      while(lines.length<=3&&lines.length*lh()<areaH*0.65&&fs<16){fs+=0.5;lines=wrapLines(fs);}
      ctx.fillStyle='#1c2e26';ctx.font=`300 ${fs}px "Noto Serif KR",serif`;ctx.textBaseline='top';
      const lhv=lh(), totalH=lines.slice(0,6).length*lhv;
      const startY=26+(areaH-totalH)/2;
      lines.slice(0,6).forEach((l,i)=>ctx.fillText(l,40,startY+i*lhv));
    }

    // 스티커 — preview-wrap 기준 비율로 매핑
    if(S.stickers.length){
      const wrap=document.querySelector('.preview-wrap');
      const pw=wrap?.clientWidth||320, ph=wrap?.clientHeight||218;
      S.stickers.forEach(st=>{
        const sz=Math.round(OW/pw*26);
        ctx.font=`${sz}px serif`;
        ctx.fillText(st.emoji,(st.x/pw)*OW,(st.y/ph)*OH+sz*0.8);
      });
    }

    // From.
    if(fromName){
      ctx.fillStyle='#4a7a96';ctx.font='300 11px "Noto Serif KR",serif';
      const fw=ctx.measureText('From. '+fromName).width;
      ctx.fillText('From. '+fromName,OW-fw-8,OH-14);
    }

    const img=new Image();
    img.onload=()=>resolve(img);
    img.src=out.toDataURL('image/png');
  });
}

// ── 바다 애니메이션 ───────────────────────────────────────────────
function startSea(canvasId,items){
  if(S.seaRaf){cancelAnimationFrame(S.seaRaf);S.seaRaf=null;}
  const canvas=document.getElementById(canvasId);
  const box=canvas.parentElement;
  const dpr=window.devicePixelRatio||1;
  const W=box.clientWidth||390, H=box.clientHeight||window.innerHeight;
  canvas.width=W*dpr;canvas.height=H*dpr;
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);

  const letters=items.map(it=>{
    const iw=it.img.naturalWidth||320,ih=it.img.naturalHeight||220;
    const sw=W*it.scaleW,sh=sw*(ih/iw);
    return{img:it.img,x:it.xr*W,y:it.yr*H,vx:it.vx,vy:it.vy,angle:it.angle,va:it.va,sw,sh,alpha:0,phase:it.phase};
  });

  const WV=[
    {ry:.48,amp:7,spd:.007,ph:0,al:.08},{ry:.57,amp:5,spd:.010,ph:1.1,al:.06},
    {ry:.65,amp:9,spd:.006,ph:2.3,al:.10},{ry:.74,amp:5,spd:.012,ph:.8,al:.06},
    {ry:.83,amp:8,spd:.008,ph:1.9,al:.08},
  ];
  let t=0;

  function drawBg(){
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#b8e0f5');g.addColorStop(.35,'#70c0de');g.addColorStop(.7,'#3aa8cc');g.addColorStop(1,'#1e7ea8');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
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
    const bY=Math.sin(t*.04+l.phase)*4,bA=Math.sin(t*.03+l.phase)*.030;
    ctx.save();ctx.globalAlpha=l.alpha;
    ctx.translate(l.x+l.sw/2,l.y+l.sh/2+bY);ctx.rotate(l.angle+bA);
    ctx.shadowColor='rgba(0,50,100,.15)';ctx.shadowBlur=8;ctx.shadowOffsetY=3;
    ctx.drawImage(l.img,-l.sw/2,-l.sh/2,l.sw,l.sh);
    ctx.restore();
  }

  function frame(){
    t++;ctx.clearRect(0,0,W,H);drawBg();
    for(const l of letters){
      if(l.alpha<.93)l.alpha=Math.min(.93,l.alpha+.011);
      drawLetter(l);
      l.x+=l.vx;l.y+=l.vy;l.angle+=l.va;
      if(l.x<W*.04||l.x>W*.70)l.vx*=-1;
      if(l.y<H*.06||l.y>H*.62)l.vy*=-1;
    }
    S.seaRaf=requestAnimationFrame(frame);
  }
  frame();
}

// ── 발신인 보내기 ─────────────────────────────────────────────────
window.doSend=async function(){
  const txt=document.getElementById('ltxt').value.trim();
  if(S.mode==='text'&&!txt){
    const ta=document.getElementById('ltxt');
    ta.style.outline='2px solid rgba(180,60,40,0.4)';ta.focus();
    setTimeout(()=>ta.style.outline='',1500);return;
  }
  if(S.mode==='draw'&&!S.drawn) return;

  showLoading(true);
  S.senderImg=await capture();

  try{ S.letterId=await saveLetter({senderData:S.senderImg.src,replyData:null,mode:S.mode}); }
  catch(e){ console.error('저장 실패:',e); }

  // 공유 URL 미리 생성
  S.shareUrl=`${location.origin}${location.pathname}?id=${S.letterId||'preview'}`;

  showLoading(false);
  document.getElementById('sea-msg').textContent='편지가 바다 위를 떠다니고 있어요 ✦';
  document.getElementById('sea-sub').textContent='잠시 감상해 보세요';
  document.getElementById('share-btn').style.display='block';
  document.getElementById('reply-btn').style.display='none';
  document.getElementById('apply-from-sea-btn').style.display='block';
  show('s-sea');
  startSea('seaC',[{img:S.senderImg,xr:.30,yr:.20,vx:.30,vy:-.07,angle:-.04,va:.00018,scaleW:.65,phase:0}]);
};

// ── 공유 ─────────────────────────────────────────────────────────
window.goShare=async function(){
  const url=S.shareUrl||location.href;

  // Web Share API: 모바일에서 카카오/인스타/문자 등 앱 선택창 바로 표시
  if(navigator.share){
    try{
      await navigator.share({
        title:'모모와 다락방의 수상한 요괴들 — 편지 이벤트',
        text:'바다 위에 떠다니는 편지가 도착했어요. 열어보세요 ✦',
        url,
      });
      return; // 공유 성공 시 링크 화면 안 띄워도 됨
    }catch(e){
      if(e.name==='AbortError') return; // 사용자가 취소한 경우
    }
  }

  // 폴백: Web Share 미지원 환경 (PC 등) → 링크 복사 화면
  document.getElementById('slink-txt').textContent=url;
  document.getElementById('slink').dataset.url=url;
  show('s-share');
};

window.copyLink=function(){
  const url=document.getElementById('slink')?.dataset.url||S.shareUrl||location.href;
  if(navigator.clipboard) navigator.clipboard.writeText(url).then(()=>{
    document.getElementById('copyhint').textContent='✓ 복사되었습니다!';
    setTimeout(()=>document.getElementById('copyhint').textContent='탭하면 복사돼요',2000);
  });
};
window.shareKakao=function(){ window.goShare(); };
window.shareInstagram=function(){ window.goShare(); };
window.goSea=function(){ show('s-sea'); };

// ── 수신인 답장 ───────────────────────────────────────────────────
window.goReply=function(){
  document.getElementById('write-title').innerHTML='당신의 마음도<br>바다에 띄워 보세요';
  document.getElementById('write-sub').textContent='답장을 보내면 두 마음이 같은 바다 위에서 만납니다.';
  document.getElementById('send-btn-label').textContent='답장 띄우기';
  document.getElementById('send-main-btn').style.background='#a87020';
  document.getElementById('to-input').value='';
  document.getElementById('from-input').value='';
  // 텍스트 탭으로 초기화
  sw('text');
  S.drawn=false; S.stickers=[];
  document.getElementById('sticker-layer').innerHTML='';
  S.isReply=true;
  show('s-write');
};

// 수신인 답장 보내기는 doSend에서 isReply 분기
const _origDoSend=window.doSend;
window.doSend=async function(){
  if(!S.isReply){ await _origDoSend(); return; }
  const txt=document.getElementById('ltxt').value.trim();
  if(S.mode==='text'&&!txt){document.getElementById('ltxt').focus();return;}
  if(S.mode==='draw'&&!S.drawn)return;

  showLoading(true,'답장을 바다에 띄우는 중…');
  S.replyImg=await capture();

  if(S.letterId){
    try{await saveLetter({id:S.letterId,senderData:S.senderImg?.src||null,replyData:S.replyImg.src,mode:S.mode});}
    catch(e){console.error('답장 저장 실패:',e);}
  }
  showLoading(false);

  // 두 편지 함께 바다에
  show('s-shared');
  const items=[];
  if(S.senderImg) items.push({img:S.senderImg,xr:.06,yr:.14,vx:.22,vy:-.05,angle:-.05,va:.00015,scaleW:.54,phase:0});
  if(S.replyImg)  items.push({img:S.replyImg, xr:.38,yr:.36,vx:.19,vy:-.04,angle:.06, va:-.00015,scaleW:.50,phase:1.8});
  startSea('sharedC',items);
};

// ── 응모 ─────────────────────────────────────────────────────────
window.goApply=function(){show('s-apply');};
window.doApply=async function(){
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
  try{await saveApply({name,phone,email,letterId:S.letterId||null});}
  catch(e){console.error('응모 저장 실패:',e);}
  showLoading(false);
  show('s-apply-done');
};

// ── 처음으로 ─────────────────────────────────────────────────────
window.restartAll=function(){
  if(S.seaRaf){cancelAnimationFrame(S.seaRaf);S.seaRaf=null;}
  Object.assign(S,{senderImg:null,replyImg:null,drawn:false,letterId:null,shareUrl:'',isReply:false,stickers:[],mode:'text'});
  ['ltxt','to-input','from-input'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('sticker-layer').innerHTML='';
  if(S.dctx){const c=document.getElementById('dc');S.dctx.clearRect(0,0,c.width,c.height);}
  document.getElementById('write-title').innerHTML='전하지 못한 마음을<br>바다에 띄워 보세요';
  document.getElementById('write-sub').textContent='그리운 누군가에게 편지를 써서 바다에 보내보세요.';
  document.getElementById('send-btn-label').textContent='바다에 띄우기';
  document.getElementById('send-main-btn').style.background='';
  sw('text');
  show('s-write');
};

// ── URL 파라미터 (수신인 랜딩) ───────────────────────────────────
async function init(){
  const id=new URLSearchParams(location.search).get('id');
  if(!id) return;
  S.letterId=id; S.isReply=true;
  showLoading(true,'편지를 불러오는 중…');
  try{
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
        document.getElementById('apply-from-sea-btn').style.display='block';
        show('s-sea');
        startSea('seaC',[{img:S.senderImg,xr:.30,yr:.20,vx:.25,vy:-.06,angle:-.04,va:.00018,scaleW:.65,phase:0}]);
      };
      img.src=data.senderData;
    } else showLoading(false);
  }catch(e){console.error('불러오기 실패:',e);showLoading(false);}
}
init();
