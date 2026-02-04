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
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Feedback');

    // Support both JSON and form data
    var data;
    if (e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (jsonError) {
        // Not JSON, try form parameters
        data = e.parameter || {};
      }
    } else {
      data = e.parameter || {};
    }

    sheet.appendRow([
      new Date().toISOString(),
      data.errorMessage || '',
      data.language || 'unknown',
      data.userAgent || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'Feedback API is running' }))
    .setMimeType(ContentService.MimeType.JSON);
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

## 3. 웹사이트에 URL 설정

`js/analyzer.js` 파일에서 `FEEDBACK_API_URL` 값을 복사한 URL로 변경:

```javascript
var FEEDBACK_API_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';
```

## 4. 테스트

1. 웹사이트에서 분석 실패하는 오류 입력
2. "이 오류 제보하기" 버튼 클릭
3. Google Sheets에서 데이터 확인

## 보안 참고사항

- Google Apps Script URL은 공개되지만, POST 요청만 받으므로 안전
- 스프레드시트 자체는 비공개로 유지됨
- 민감한 정보는 수집하지 않음 (오류 메시지만)
