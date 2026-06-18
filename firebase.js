// ── firebase.js : 데이터 저장/불러오기 ──────────────────────────
//
// 🔧 설정 방법:
//   1. https://console.firebase.google.com 접속
//   2. 프로젝트 생성 → 웹 앱 추가
//   3. 아래 firebaseConfig 값을 복사해서 붙여넣기
//   4. Firebase 콘솔 → Firestore Database → 규칙(Rules) 탭에서 아래 규칙 적용:
//
//      rules_version = '2';
//      service cloud.firestore {
//        match /databases/{database}/documents {
//          match /letters/{letterId} {
//            allow read, write: if true;
//          }
//        }
//      }
//
// ─────────────────────────────────────────────────────────────────

import { initializeApp }              from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc, updateDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ▼ 여기에 Firebase 콘솔에서 복사한 설정값 붙여넣기 ▼
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

// ID 생성 (예: "momo_abc123")
function makeId() {
  return 'momo_' + Math.random().toString(36).slice(2, 9);
}

/**
 * 편지 저장 / 업데이트
 * @param {Object} payload - { id?, senderData, replyData, mode }
 * @returns {string} letterId
 */
export async function saveLetter({ id, senderData, replyData, mode }) {
  const letterId = id || makeId();
  const ref      = doc(db, 'letters', letterId);

  if (id) {
    // 기존 문서 업데이트 (답장)
    await updateDoc(ref, {
      replyData:   replyData,
      replyMode:   mode,
      repliedAt:   Date.now(),
    });
  } else {
    // 새 문서 생성 (발신)
    await setDoc(ref, {
      senderData:  senderData,
      replyData:   null,
      mode:        mode,
      createdAt:   Date.now(),
    });
  }

  return letterId;
}

/**
 * 편지 불러오기
 * @param {string} id
 * @returns {Object|null}
 */
export async function loadLetter(id) {
  const ref  = doc(db, 'letters', id);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}
