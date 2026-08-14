// ── firebase.js ───────────────────────────────────────────────────
//
// 🔧 설정 방법:
//   1. https://console.firebase.google.com 에서 프로젝트 선택
//   2. 웹 앱 설정값을 아래 FIREBASE_CONFIG 에 붙여넣기
//   3. Firestore → 규칙 탭에서 아래 규칙 적용 후 게시:
//
//   rules_version = '2';
//   service cloud.firestore {
//     match /databases/{database}/documents {
//       match /conversations/{cid} {
//         allow read, write: if true;
//         match /letters/{lid} { allow read, write: if true; }
//       }
//       match /applies/{id} { allow read, write: if true; }
//     }
//   }
//
// ※ 두 기기(보낸 사람·받는 사람)가 같은 바다를 실시간으로 함께 보려면
//   반드시 Firebase 설정이 필요합니다. 설정이 없으면 같은 브라우저 안에서만
//   동작하는 '로컬 모드'로 자동 전환됩니다(기기 간 공유 불가).
// ─────────────────────────────────────────────────────────────────

// ── Firebase 설정값 (콘솔에서 복사한 값으로 교체) ─────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAXxYu3FxeD8v5I10n8XRbPAzPz6fvN1sU",
  authDomain:        "momo-letter.firebaseapp.com",
  projectId:         "momo-letter",
  storageBucket:     "momo-letter.firebasestorage.app",
  messagingSenderId: "715586990451",
  appId:             "1:715586990451:web:6779e305d4d83f5dccd506",
  measurementId:     "G-MFWK4LRLLR",
};

const IS_CONFIGURED = FIREBASE_CONFIG.apiKey !== "여기에-붙여넣기";

// ── 구글 시트 실시간 연동 (선택) ──────────────────────────────────
//   1. 구글 시트 → 확장 프로그램 → Apps Script 에 google-apps-script.gs 내용 붙여넣기
//   2. 배포 → 새 배포 → 웹 앱 (실행: 나, 액세스: 모든 사용자) → URL 복사
//   3. 아래 SHEET_WEBHOOK_URL 에 그 URL 붙여넣기 (SHEET_TOKEN 은 스크립트와 동일하게)
//   ※ 비워두면 시트 연동은 꺼지고, Firestore·어드민만 동작합니다.
const SHEET_WEBHOOK_URL = "";                 // 예: https://script.google.com/macros/s/AKfy.../exec
const SHEET_TOKEN       = "momo-sheet-2026";  // Apps Script 의 TOKEN 과 반드시 동일

export function sheetEnabled(){ return !!SHEET_WEBHOOK_URL; }

// 시트로 레코드 전송 (fire-and-forget; 응답은 확인하지 않음)
function postToSheet(records){
  if(!SHEET_WEBHOOK_URL) return;
  try{
    fetch(SHEET_WEBHOOK_URL, {
      method:'POST', mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({ token: SHEET_TOKEN, records }),
    }).catch(()=>{});
  }catch(e){}
}

// (어드민) 현재 응모 전체를 시트로 한 번에 동기화
export async function syncAllToSheet(){
  if(!SHEET_WEBHOOK_URL) throw new Error('시트 URL이 설정되지 않았어요 (firebase.js 의 SHEET_WEBHOOK_URL)');
  const applies = await loadAllApplies();
  await fetch(SHEET_WEBHOOK_URL, {
    method:'POST', mode:'no-cors',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify({ token: SHEET_TOKEN, records: applies }),
  }).catch(()=>{});
  return applies.length;
}

// ── 로컬 메모리 저장소 (Firebase 미연결 시 사용) ──────────────────
//   구조: LOCAL_STORE[cid] = { letters: [ {img, at, from}, ... ] }
const LOCAL_STORE = {};

// ── Firebase 모듈 (연결된 경우만 로드) ───────────────────────────
let db = null;
let _doc, _setDoc, _collection, _addDoc, _getDocs, _query, _orderBy, _onSnapshot;

async function initFirebase() {
  if (!IS_CONFIGURED) {
    console.log('[Firebase] 설정값 없음 → 로컬 메모리 모드로 동작(기기 간 공유 불가)');
    return false;
  }
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const fs = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    _doc = fs.doc; _setDoc = fs.setDoc; _collection = fs.collection;
    _addDoc = fs.addDoc; _getDocs = fs.getDocs;
    _query = fs.query; _orderBy = fs.orderBy; _onSnapshot = fs.onSnapshot;
    const app = initializeApp(FIREBASE_CONFIG);
    db = fs.getFirestore(app);
    console.log('[Firebase] 연결 성공');
    return true;
  } catch (e) {
    _lastError = '연결 실패: ' + e.message;
    console.warn('[Firebase] 연결 실패 → 로컬 모드:', e.message);
    return false;
  }
}

const firebaseReady = initFirebase();

function makeId() { return 'momo_' + Math.random().toString(36).slice(2, 9); }
function sanitize(l) { return { img: l.img, at: l.at || Date.now(), from: l.from || '' }; }

// ── 진단용 상태 ──────────────────────────────────────────────────
let _lastError = '';
function tmo(p, ms){ return Promise.race([ p, new Promise((_, rej)=>setTimeout(()=>rej(new Error('네트워크 시간 초과')), ms)) ]); }

// 현재 연결 상태를 앱이 화면에 표시할 수 있도록 제공
export async function getStatus(){
  await firebaseReady;
  return { configured: IS_CONFIGURED, connected: !!db, lastError: _lastError };
}

// ── 대화 만들기 (첫 편지로 새 대화 생성) ──────────────────────────
export async function createConversation(firstLetter) {
  const cid = makeId();
  await firebaseReady;
  if (db) {
    try {
      await tmo((async () => {
        await _setDoc(_doc(db, 'conversations', cid), { createdAt: Date.now() });
        await _addDoc(_collection(db, 'conversations', cid, 'letters'), sanitize(firstLetter));
      })(), 8000);
      _lastError = '';
      return cid;
    } catch (e) {
      _lastError = '저장 실패: ' + e.message;
      console.warn('[createConversation] Firebase 실패, 로컬 저장:', e.message);
    }
  }
  LOCAL_STORE[cid] = { letters: [sanitize(firstLetter)] };
  return cid;
}

// ── 편지 추가 (기존 대화에 이어 붙이기) ───────────────────────────
export async function addLetter(cid, letter) {
  await firebaseReady;
  if (db) {
    try {
      await tmo(_addDoc(_collection(db, 'conversations', cid, 'letters'), sanitize(letter)), 8000);
      _lastError = '';
      return;
    } catch (e) {
      _lastError = '저장 실패: ' + e.message;
      console.warn('[addLetter] Firebase 실패, 로컬 저장:', e.message);
    }
  }
  LOCAL_STORE[cid] = LOCAL_STORE[cid] || { letters: [] };
  LOCAL_STORE[cid].letters.push(sanitize(letter));
}

// ── 대화 불러오기 (편지 전체, 시간순) ─────────────────────────────
export async function loadConversation(cid) {
  await firebaseReady;
  if (db) {
    try {
      const q = _query(_collection(db, 'conversations', cid, 'letters'), _orderBy('at'));
      const snap = await tmo(_getDocs(q), 8000);
      _lastError = '';
      return { letters: snap.docs.map(d => d.data()) };
    } catch (e) {
      _lastError = '불러오기 실패: ' + e.message;
      console.warn('[loadConversation] Firebase 실패, 로컬 확인:', e.message);
    }
  }
  return LOCAL_STORE[cid] || { letters: [] };
}

// ── 대화 실시간 감시 (편지가 추가될 때마다 콜백) ──────────────────
export function watchConversation(cid, callback) {
  if (db && _onSnapshot) {
    try {
      const q = _query(_collection(db, 'conversations', cid, 'letters'), _orderBy('at'));
      return _onSnapshot(q, snap => callback(snap.docs.map(d => d.data())));
    } catch (e) {
      console.warn('[watchConversation] Firebase 실패:', e.message);
    }
  }
  // 로컬: 폴링(편지 수가 바뀔 때만 콜백)
  let last = -1;
  const timer = setInterval(() => {
    const c = LOCAL_STORE[cid];
    if (c && c.letters.length !== last) { last = c.letters.length; callback(c.letters); }
  }, 1200);
  return () => clearInterval(timer);
}

// ── (어드민) 응모 전체 불러오기 ───────────────────────────────────
export async function loadAllApplies() {
  await firebaseReady;
  if (db) {
    try {
      const q = _query(_collection(db, 'applies'), _orderBy('createdAt', 'desc'));
      const snap = await _getDocs(q);
      _lastError = '';
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      _lastError = '응모 조회 실패: ' + e.message;
      console.warn('[loadAllApplies] 실패:', e.message);
      throw e;
    }
  }
  return [];
}

// ── 이벤트 응모 저장 ──────────────────────────────────────────────
export async function saveApply({ applyId, name, phone, email, convId, referral, sentLetter }) {
  await firebaseReady;
  const record = {
    applyId: applyId || ('a_' + Date.now() + '_' + Math.random().toString(36).slice(2,7)),
    name, phone, email: email || '',
    convId: convId || '',
    referral: referral || 'direct',
    sentLetter: !!sentLetter,
    createdAt: Date.now(),
  };
  let ok = false;
  if (db) {
    try {
      await tmo(_addDoc(_collection(db, 'applies'), record), 8000);
      _lastError = ''; ok = true;
    } catch (e) {
      _lastError = '응모 저장 실패: ' + e.message;
      console.warn('[saveApply] Firebase 실패:', e.message);
    }
  }
  if (!ok) console.log('[응모 데이터 로컬]', record);
  postToSheet([record]);   // 구글 시트로도 실시간 전송(설정된 경우)
}
