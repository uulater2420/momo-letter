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

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ▼ Firebase 콘솔에서 복사한 설정값 붙여넣기 ▼
const firebaseConfig = {
  apiKey:            "여기에-붙여넣기",
  authDomain:        "여기에-붙여넣기",
  projectId:         "여기에-붙여넣기",
  storageBucket:     "여기에-붙여넣기",
  messagingSenderId: "여기에-붙여넣기",
  appId:             "여기에-붙여넣기",
};
// ▲ ──────────────────────────────────────────────────────────── ▲

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

function makeId(){ return 'momo_' + Math.random().toString(36).slice(2,9); }

/** 편지 저장 / 업데이트 */
export async function saveLetter({ id, senderData, replyData, mode }){
  const letterId = id || makeId();
  const ref = doc(db, 'letters', letterId);
  if(id){
    await updateDoc(ref, { replyData, replyMode: mode, repliedAt: Date.now() });
  } else {
    await setDoc(ref, { senderData, replyData: null, mode, createdAt: Date.now() });
  }
  return letterId;
}

/** 편지 불러오기 */
export async function loadLetter(id){
  const snap = await getDoc(doc(db, 'letters', id));
  return snap.exists() ? snap.data() : null;
}

/** 이벤트 응모 저장 */
export async function saveApply({ name, phone, email, letterId }){
  await addDoc(collection(db, 'applies'), {
    name, phone, email: email||'', letterId: letterId||'',
    createdAt: Date.now(),
  });
}

/**
 * 편지 실시간 감지 — 답장이 도착하면 콜백 호출
 * @param {string} id
 * @param {function} callback - (data) => void
 * @returns {function} unsubscribe
 */
export function watchLetter(id, callback){
  const ref = doc(db, 'letters', id);
  return onSnapshot(ref, (snap) => {
    if(snap.exists()) callback(snap.data());
  });
}
