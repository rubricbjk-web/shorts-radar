# ShortsRadar

최근 7/14/30일 동안 조회가 빠르게 붙은 YouTube Shorts 후보를 수집하고, 제목·썸네일 문구·성과지표·콘텐츠 패턴을 분석하는 정적 웹사이트입니다.

## 핵심 기능
- 최근 30일 Shorts 후보 TOP100
- 조회수 / VPH / 일평균 조회수 / 구독자 대비 조회수
- 장르 자동 분류
- 제목 훅 패턴 통계
- Tesseract.js 기반 썸네일 OCR (한국어+영어)
- 자막 존재 여부 표시
- 대본 수동 저장 및 훅/구조 메모
- 관심목록, 제외 채널, CSV 내보내기
- GitHub Actions로 매일 자동 갱신

## 중요한 제한
YouTube Data API는 임의의 타 채널 영상의 실제 자막 본문을 API 키만으로 다운로드할 수 없습니다. ShortsRadar는 `contentDetails.caption`으로 자막 존재 여부만 확인합니다. 대본 자동 수집은 별도 합법적/권한 있는 transcript 공급원을 연결할 때 확장하도록 설계했습니다.
