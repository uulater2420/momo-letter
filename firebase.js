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
const firebaseConfig = {
  apiKey: "AIzaSyAXxYu3FxeD8v5Il0n8XRbPAzPz6fvNlsU",
  authDomain: "momo-letter.firebaseapp.com",
  projectId: "momo-letter",
  storageBucket: "momo-letter.firebasestorage.app",
  messagingSenderId: "715586990451",
  appId: "1:715586990451:web:6779e305d4d83f5dccd506",
  measurementId: "G-MFWK4LRLLR"
};

const IS_CONFIGURED = FIREBASE_CONFIG.apiKey !== "여기에-붙여넣기";

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
    console.warn('[Firebase] 연결 실패 → 로컬 모드:', e.message);
    return false;
  }
}

const firebaseReady = initFirebase();

function makeId() { return 'momo_' + Math.random().toString(36).slice(2, 9); }
function sanitize(l) { return { img: l.img, at: l.at || Date.now(), from: l.from || '' }; }

// ── 대화 만들기 (첫 편지로 새 대화 생성) ──────────────────────────
export async function createConversation(firstLetter) {
  const cid = makeId();
  await firebaseReady;
  if (db) {
    try {
      await _setDoc(_doc(db, 'conversations', cid), { createdAt: Date.now() });
      await _addDoc(_collection(db, 'conversations', cid, 'letters'), sanitize(firstLetter));
      return cid;
    } catch (e) {
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
      await _addDoc(_collection(db, 'conversations', cid, 'letters'), sanitize(letter));
      return;
    } catch (e) {
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
      const snap = await _getDocs(q);
      return { letters: snap.docs.map(d => d.data()) };
    } catch (e) {
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

// ── 이벤트 응모 저장 ──────────────────────────────────────────────
export async function saveApply({ name, phone, email, convId }) {
  await firebaseReady;
  if (db) {
    try {
      await _addDoc(_collection(db, 'applies'), {
        name, phone, email: email || '', convId: convId || '',
        createdAt: Date.now(),
      });
      return;
    } catch (e) {
      console.warn('[saveApply] Firebase 실패:', e.message);
    }
  }
  console.log('[응모 데이터 로컬]', { name, phone, email, convId });
}
