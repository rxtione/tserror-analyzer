# Google Sheets 피드백 수집 설정 가이드

## 1. Google Sheets 생성

1. [Google Sheets](https://sheets.google.com)에서 새 스프레드시트 생성
2. 시트 이름을 `Feedback`으로 변경
3. 첫 번째 행에 헤더 추가:
   - A1: `Timestamp`
   - B1: `Error Message`
   - C1: `Language`
   - D1: `User Agent`

## 2. Google Apps Script 설정

1. 스프레드시트에서 **확장 프로그램 > Apps Script** 클릭
2. 아래 코드를 복사해서 붙여넣기:

```javascript
function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Feedback');
    var data = e.parameter || {};

    // Only save if there's error message data
    if (data.errorMessage) {
      sheet.appendRow([
        new Date().toISOString(),
        decodeURIComponent(data.errorMessage || ''),
        data.language || 'unknown',
        decodeURIComponent(data.userAgent || '')
      ]);
    }

    // Return 1x1 transparent pixel (for image beacon)
    return ContentService
      .createTextOutput('')
      .setMimeType(ContentService.MimeType.TEXT);

  } catch (error) {
    return ContentService
      .createTextOutput('')
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

function doPost(e) {
  return doGet(e);
}
```

3. **배포 > 새 배포** 클릭
4. 유형: **웹 앱** 선택
5. 설정:
   - 설명: `Feedback API`
   - 실행 사용자: `나`
   - 액세스 권한: `모든 사용자`
6. **배포** 클릭
7. **웹 앱 URL** 복사 (예: `https://script.google.com/macros/s/xxx.../exec`)

## 3. 기존 배포 업데이트 (이미 배포한 경우)

1. Apps Script 편집기에서 코드 수정
2. **배포 > 배포 관리** 클릭
3. 연필 아이콘(수정) 클릭
4. 버전: **새 버전** 선택
5. **배포** 클릭

## 4. 웹사이트에 URL 설정

`js/analyzer.js` 파일에서 `FEEDBACK_API_URL` 값을 복사한 URL로 변경:

```javascript
var FEEDBACK_API_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';
```

## 5. 테스트

1. 웹사이트에서 분석 실패하는 오류 입력
2. "이 오류 제보하기" 버튼 클릭
3. Google Sheets에서 데이터 확인

## 보안 참고사항

- Google Apps Script URL은 공개되지만, 스프레드시트는 비공개
- 민감한 정보는 수집하지 않음 (오류 메시지만)
- Image beacon 방식으로 CORS/Mixed Content 문제 없음
