// ── firebase.js ───────────────────────────────────────────────────
//
// 🔧 설정 방법:
//   1. https://console.firebase.google.com 에서 프로젝트 선택
//   2. 웹 앱 설정값을 아래 firebaseConfig에 붙여넣기
//   3. Firestore → 규칙 탭에서 아래 규칙 적용 후 게시:
//
//   rules_version = '2';
//   service cloud.firestore {
//     match /databases/{database}/documents {
//       match /letters/{id}  { allow read, write: if true; }
//       match /applies/{id}  { allow read, write: if true; }
//     }
//   }
// ─────────────────────────────────────────────────────────────────

// ── Firebase 설정값 ────────────────────────────────────────────────
// 아래 값을 Firebase 콘솔에서 복사한 값으로 교체하세요
const firebaseConfig = {
  apiKey: "AIzaSyAXxYu3FxeD8v5Il0n8XRbPAzPz6fvNlsU",
  authDomain: "momo-letter.firebaseapp.com",
  projectId: "momo-letter",
  storageBucket: "momo-letter.firebasestorage.app",
  messagingSenderId: "715586990451",
  appId: "1:715586990451:web:6779e305d4d83f5dccd506",
  measurementId: "G-MFWK4LRLLR"
};

// ── Firebase 연결 여부 자동 감지 ──────────────────────────────────
// 설정값이 없으면 로컬 메모리 모드로 자동 전환 (개발/테스트용)
const IS_CONFIGURED = FIREBASE_CONFIG.apiKey !== "여기에-붙여넣기";

// ── 로컬 메모리 저장소 (Firebase 미연결 시 사용) ──────────────────
const LOCAL_STORE = {};

// ── Firebase 모듈 (연결된 경우만 로드) ───────────────────────────
let db = null;
let _doc, _setDoc, _getDoc, _updateDoc, _collection, _addDoc, _onSnapshot;

async function initFirebase() {
  if (!IS_CONFIGURED) {
    console.log('[Firebase] 설정값 없음 → 로컬 메모리 모드로 동작');
    return false;
  }
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const fs = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    _doc = fs.doc; _setDoc = fs.setDoc; _getDoc = fs.getDoc;
    _updateDoc = fs.updateDoc; _collection = fs.collection;
    _addDoc = fs.addDoc; _onSnapshot = fs.onSnapshot;
    const app = initializeApp(FIREBASE_CONFIG);
    db = fs.getFirestore(app);
    console.log('[Firebase] 연결 성공');
    return true;
  } catch(e) {
    console.warn('[Firebase] 연결 실패 → 로컬 모드:', e.message);
    return false;
  }
}

// Firebase 초기화 (비동기, 앱 로딩과 병렬)
const firebaseReady = initFirebase();

function makeId() { return 'momo_' + Math.random().toString(36).slice(2, 9); }

// ── saveLetter ────────────────────────────────────────────────────
export async function saveLetter({ id, senderData, replyData, mode }) {
  const letterId = id || makeId();
  await firebaseReady;

  if (db) {
    try {
      const ref = _doc(db, 'letters', letterId);
      if (id) {
        await _updateDoc(ref, { replyData, replyMode: mode, repliedAt: Date.now() });
      } else {
        await _setDoc(ref, { senderData, replyData: null, mode, createdAt: Date.now() });
      }
    } catch(e) {
      console.warn('[saveLetter] Firebase 실패, 로컬 저장:', e.message);
      // Firebase 실패해도 로컬에 저장해서 앱은 계속 동작
      LOCAL_STORE[letterId] = LOCAL_STORE[letterId] || {};
      if (id) { LOCAL_STORE[letterId].replyData = replyData; }
      else     { LOCAL_STORE[letterId] = { senderData, replyData: null, mode, createdAt: Date.now() }; }
    }
  } else {
    // 로컬 메모리 저장
    LOCAL_STORE[letterId] = LOCAL_STORE[letterId] || {};
    if (id) { LOCAL_STORE[letterId].replyData = replyData; }
    else     { LOCAL_STORE[letterId] = { senderData, replyData: null, mode, createdAt: Date.now() }; }
  }

  return letterId;
}

// ── loadLetter ────────────────────────────────────────────────────
export async function loadLetter(id) {
  await firebaseReady;

  if (db) {
    try {
      const snap = await _getDoc(_doc(db, 'letters', id));
      if (snap.exists()) return snap.data();
    } catch(e) {
      console.warn('[loadLetter] Firebase 실패, 로컬 확인:', e.message);
    }
  }
  // 로컬 폴백
  return LOCAL_STORE[id] || null;
}

// ── saveApply ─────────────────────────────────────────────────────
export async function saveApply({ name, phone, email, letterId }) {
  await firebaseReady;

  if (db) {
    try {
      await _addDoc(_collection(db, 'applies'), {
        name, phone, email: email || '', letterId: letterId || '',
        createdAt: Date.now(),
      });
      return;
    } catch(e) {
      console.warn('[saveApply] Firebase 실패:', e.message);
    }
  }
  // 로컬 로그 (Firebase 없을 때)
  console.log('[응모 데이터 로컬]', { name, phone, email, letterId });
}

// ── watchLetter (실시간 감지) ─────────────────────────────────────
export function watchLetter(id, callback) {
  if (db && _onSnapshot) {
    try {
      const ref = _doc(db, 'letters', id);
      return _onSnapshot(ref, snap => {
        if (snap.exists()) callback(snap.data());
      });
    } catch(e) {
      console.warn('[watchLetter] Firebase 실패:', e.message);
    }
  }
  // 로컬: 폴링으로 대체 (2초마다 확인)
  const timer = setInterval(() => {
    const data = LOCAL_STORE[id];
    if (data) callback(data);
  }, 2000);
  return () => clearInterval(timer);
}
