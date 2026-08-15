# GitHub Pages 배포

1. 새 Public repository 생성
2. 이 폴더의 **압축을 푼 내용 전체** 업로드
3. Google Cloud Console에서 YouTube Data API v3 활성화 후 API Key 생성
4. GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret
5. Name: `YOUTUBE_API_KEY`, Secret: 발급받은 API Key
6. Actions 탭 → `Refresh ShortsRadar` → Run workflow 한 번 실행
7. Settings → Pages → Build and deployment → Source: Deploy from a branch
8. Branch: `main`, Folder: `/ (root)` → Save
9. 수 분 후 Pages 주소에서 사이트 확인

매일 09:15 KST에 자동 갱신됩니다.
