/**
 * 모모 편지 이벤트 — 응모 데이터를 구글 시트에 실시간으로 쌓는 스크립트
 * ────────────────────────────────────────────────────────────────
 * 설치 방법
 *  1) 데이터를 받을 구글 시트를 새로 하나 만든다.
 *  2) 상단 메뉴  확장 프로그램(Extensions) → Apps Script  클릭.
 *  3) 기본 코드(Code.gs)를 지우고, 이 파일 내용을 통째로 붙여넣는다.
 *  4) 아래 TOKEN 값을 firebase.js 의 SHEET_TOKEN 과 똑같이 맞춘다.
 *  5) 우측 상단  배포(Deploy) → 새 배포(New deployment)
 *       - 유형: 웹 앱(Web app)
 *       - 실행 계정(Execute as): 나(Me)
 *       - 액세스 권한(Who has access): 모든 사용자(Anyone)
 *     → 배포하면 나오는  웹 앱 URL(.../exec) 을 복사.
 *  6) 그 URL 을 firebase.js 의 SHEET_WEBHOOK_URL 에 붙여넣고 배포하면 끝.
 *  ※ 코드를 수정하면 반드시 "배포 관리 → 편집 → 새 버전"으로 재배포해야 반영됩니다.
 * ────────────────────────────────────────────────────────────────
 */

const TOKEN = "momo-sheet-2026";   // firebase.js 의 SHEET_TOKEN 과 동일하게!
const SHEET_NAME = "응모자";        // 데이터가 쌓일 시트 탭 이름
const HEADERS = ["applyId", "이름", "연락처", "이메일", "유입경로", "매체", "캠페인", "편지참여", "대화ID", "응모시각"];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.token !== TOKEN) {
      return json({ ok: false, error: "invalid token" });
    }
    const records = Array.isArray(data.records) ? data.records
                  : (data.records ? [data.records] : []);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) sh = ss.insertSheet(SHEET_NAME);
    if (sh.getLastRow() === 0) sh.appendRow(HEADERS);

    // 이미 들어있는 키 수집(중복 방지) — applyId 또는 (연락처|시각)
    const existing = {};
    const last = sh.getLastRow();
    if (last > 1) {
      const vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
      vals.forEach(function (r) {
        if (r[0]) existing[r[0]] = true;                 // applyId
        existing[(r[2] || "") + "|" + (r[7] || "")] = true; // 연락처|시각
      });
    }

    const rows = [];
    records.forEach(function (r) {
      const when = r.createdAt ? new Date(r.createdAt) : new Date();
      const keyA = r.applyId || "";
      const keyB = (r.phone || "") + "|" + when;
      if ((keyA && existing[keyA]) || existing[keyB]) return; // 중복 skip
      rows.push([
        keyA,
        r.name || "",
        r.phone || "",
        r.email || "",
        r.referral || "direct",
        r.refMedium || "",
        r.refCampaign || "",
        r.sentLetter ? "참여" : "미참여",
        r.convId || "",
        when
      ]);
      if (keyA) existing[keyA] = true;
      existing[keyB] = true;
    });

    if (rows.length) {
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
    }
    return json({ ok: true, added: rows.length });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// 브라우저에서 URL 을 그냥 열었을 때 확인용
function doGet() {
  return json({ ok: true, msg: "momo letter event sheet webhook is running" });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
