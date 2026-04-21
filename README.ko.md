<p align="center">
  <img src="web/public/icons/icon-512.png" width="120" alt="milmil logo" />
</p>

<h1 align="center">milmil</h1>

<p align="center">
  셀프 호스팅 애니메이션 미디어 서버<br/>
  <sub>미디어 라이브러리 관리, 신작 캘린더, 트렌딩 애니메이션, 탄막 재생</sub>
</p>

<p align="center">
  <a href="README.en.md">English</a> | <a href="README.ja.md">日本語</a> | 한국어 | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文（台灣）</a> | <a href="README.md">粵語</a>
</p>

<p align="center">
  <a href="#기능">기능</a> &bull;
  <a href="#스크린샷">스크린샷</a> &bull;
  <a href="#빠른-시작">빠른 시작</a> &bull;
  <a href="#배포">배포</a> &bull;
  <a href="#설정">설정</a> &bull;
  <a href="#개발">개발</a> &bull;
  <a href="#라이선스">라이선스</a>
</p>

---

## 스크린샷

<p align="center">
  <img src="docs/screenshots/home.png" width="800" alt="홈 — 추천 캐러셀, 오늘의 일정, 트렌딩" />
</p>

<p align="center">
  <img src="docs/screenshots/discover.png" width="800" alt="디스커버 — 현재 인기작, 장르 필터" />
</p>

<p align="center">
  <img src="docs/screenshots/schedule.png" width="800" alt="신작 캘린더 — 요일별 신작 애니메이션" />
</p>

<p align="center">
  <img src="docs/screenshots/detail.png" width="800" alt="애니메이션 상세 — 에피소드 목록, 캐릭터, 예고편" />
</p>

<p align="center">
  <img src="docs/screenshots/watch.png" width="800" alt="시청 — 광둥어 탄막 오버레이가 있는 플레이어" />
</p>

---

## 기능

### 라이브러리 관리
- **다중 소스 스토리지** — 로컬 파일 시스템, SMB, SFTP, rclone을 통한 40개 이상의 클라우드 백엔드
- **자동 스캔** — FFmpeg 메타데이터 추출이 포함된 구성 가능한 스캔 간격
- **파일 매칭** — 다중 제공자 애니메이션 식별 (DandanPlay 해시, Bangumi, TMDB, AniList)
- **에피소드 해석** — 여러 소스에서 자동 에피소드 메타데이터 보강

### 디스커버
- **신작 캘린더** — 요일별 신작 애니메이션
- **트렌딩** — Bangumi의 인기 애니메이션 순위
- **검색** — 애니메이션 데이터베이스 전체 텍스트 검색
- **장르 및 태그 탐색** — 장르, 연도, 시즌, 형식, 점수로 필터링

### 재생
- **다이렉트 스트리밍** — 호환 형식의 byte-range 요청
- **컨테이너 리먹싱** — 트랜스코딩 없이 MKV를 MP4로
- **HLS 트랜스코딩** — FFmpeg 기반 적응형 스트리밍 (세션 캐싱 포함)
- **탄막** — DandanPlay의 탄막 코멘트 오버레이
- **자막 지원** — 내장 및 외부 자막 트랙
- **시청 진행률** — 자동 위치 저장 및 이어보기
- **외부 플레이어 지원** — Jellyfin 호환 API로 Infuse, VLC, Kodi, mpv 연결, LAN 자동 검색 지원

### 다운로드
- **내장 torrent 클라이언트** — anacrolix/torrent (구성 가능한 시딩)
- **HTTP 다운로드** — 이어받기 지원의 직접 파일 다운로드
- **RSS 자동 다운로드** — 정규식 필터, 해상도/자막 그룹 설정으로 애니메이션 구독
- **토렌트 검색** — Nyaa, DMHY, Mikan, Bangumi.moe, ACG.rip 통합 검색
- **다운로드 후 파이프라인** — 완료 후 자동 스캔, 매칭, 해석

### 컬렉션
- **시청 상태** — 예정, 시청 중, 완료, 일시중지, 중단
- **사용자 평가** — 개인 평가 시스템
- **최근 기록** — 마지막으로 시청한 곳에서 이어보기
- **Bangumi & AniList 동기화** — OAuth 기반 리스트 동기화

### 시스템
- **PWA** — 오프라인 지원이 포함된 설치 가능한 프로그레시브 웹 앱
- **i18n** — 영어, 일본어, 한국어, 간체 중국어, 번체 중국어 (대만/홍콩)
- **알림** — WebSocket 기반 실시간 푸시 (다운로드/스캔 이벤트)
- **이중 인증** — TOTP 기반 2FA
- **설정 내보내기/가져오기** — 전체 설정 백업

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 백엔드 | Go 1.26, Echo v4, SQLite / PostgreSQL |
| 프론트엔드 | React 19, TanStack Router, Tailwind CSS v4 |
| 상태 관리 | Zustand (UI), TanStack Query (서버) |
| 번들러 | Vite 8, Bun |
| 스타일링 | Tailwind CSS v4, shadcn/ui, Hugeicons |
| 애니메이션 | Motion (Framer Motion) |
| i18n | Lingui v5 |
| 비디오 | Video.js, FFmpeg |
| PWA | Serwist |
| 캐시 | Redis (선택 사항, 인메모리 폴백) |
| 테스트 | Vitest, Playwright, Go testing |
| 린팅 | Biome, Lefthook, Commitlint |

---

## 빠른 시작

### 사전 요구 사항

- Go 1.26+
- Bun 1.3+
- FFmpeg (트랜스코딩 및 미디어 정보용)
- Redis (선택 사항)

### 개발 모드

```bash
# 도구 설치
make setup

# API + 프론트엔드를 핫 리로드로 시작
make dev
```

API는 `http://localhost:8080`, 프론트엔드는 `http://localhost:5173`에서 실행됩니다.

### Docker

```bash
docker-compose up -d
```

---

## 배포

### Docker Compose (프로덕션)

```bash
# 환경 변수 파일을 복사하고 편집
cp .env.example .env

# 모든 서비스 시작
docker-compose -f docker-compose.prod.yml up -d
```

**서비스:**
- **PostgreSQL 16** — 데이터베이스
- **Redis 7** — 캐시
- **milmil-api** — Go 백엔드 (포트 8080)
- **milmil-web** — React 프론트엔드, Nginx 경유 (포트 3000)

### 리버스 프록시

HTTPS를 위해 Nginx 또는 Caddy 뒤에 배치:

```nginx
server {
    listen 443 ssl;
    server_name anime.example.com;

    location / {
        proxy_pass http://localhost:3000;
    }

    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /ws {
        proxy_pass http://localhost:8080;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## 설정

### 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DATABASE_URL` | `sqlite://data/milmil.db` | 데이터베이스 연결 문자열 |
| `REDIS_URL` | — | Redis URL (개발 시 선택 사항) |
| `JWT_SECRET` | — | JWT 서명 키 (최소 32자, 필수) |
| `MILMIL_ENCRYPTION_KEY` | — | 스토리지 자격 증명용 AES-256 키 |
| `API_PORT` | `8080` | API 서버 포트 |
| `DATA_DIR` | `./data` | 다운로드 및 트랜스코드 캐시 |
| `TORRENT_LISTEN_PORT` | `42069` | Torrent DHT/peer 포트 |
| `SEED_RATIO` | `1.0` | Torrent 시드 비율 목표 |
| `SEED_TIME_MINUTES` | `60` | Torrent 시드 시간 |
| `DANDANPLAY_APP_ID` | — | DandanPlay API 자격 증명 |
| `DANDANPLAY_APP_SECRET` | — | DandanPlay API 자격 증명 |
| `DEBUG` | `0` | 디버그 로깅 활성화 |

### 외부 연동 (선택 사항)

| 서비스 | 용도 | 설정 |
|--------|------|------|
| **Bangumi** | 애니메이션 메타데이터, OAuth 동기화 | 설정 > 연동 |
| **AniList** | 대체 메타데이터 소스, OAuth 동기화 | 설정 > 연동 |
| **DandanPlay** | 파일 매칭, 탄막 코멘트 | 환경 변수 또는 설정 페이지 |
| **TMDB** | TV 프로그램 상호 참조 | 설정 > 연동 |

---

## 개발

### 프로젝트 구조

```
milmil/
  api/                    # Go 백엔드
    cmd/server/           # 엔트리 포인트
    internal/
      api/                # HTTP 핸들러 + 라우터
      auth/               # JWT + 2FA
      cache/              # Redis / 인메모리
      config/             # 환경 설정
      db/                 # 데이터베이스 설정 + 마이그레이션
      downloader/         # Torrent + HTTP 엔진
      ffmpeg/             # 트랜스코딩
      integration/        # Bangumi, AniList, DandanPlay, TMDB
      matcher/            # 다중 제공자 애니메이션 매처
      metadata/           # 메타데이터 보강
      notification/       # 이벤트 알림
      resolver/           # 에피소드 리졸버
      rss/                # RSS 피드 파서
      scanner/            # 라이브러리 파일 스캐너
      storage/            # SMB/SFTP/로컬 제공자
      store/              # SQLc 생성 쿼리
      torrent/            # 토렌트 검색 제공자
      worker/             # 백그라운드 작업
      ws/                 # WebSocket hub
    migrations/           # SQL 마이그레이션
  web/                    # React 프론트엔드
    src/
      components/         # UI 컴포넌트
      hooks/              # 커스텀 훅
      lib/                # API 클라이언트, 유틸리티
      locales/            # i18n 번역 (6개 언어)
      pages/              # 페이지 컴포넌트
      routes/             # TanStack Router 정의
      store/              # Zustand stores
      styles/             # 글로벌 CSS + 테마
    e2e/                  # Playwright 테스트
```

### 명령어

```bash
# 개발
make dev              # 양쪽 서버를 핫 리로드로 시작
make dev-api          # API만 (air 사용)
make dev-web          # 프론트엔드만 (Vite 사용)

# 빌드
make build            # 프로덕션 프론트엔드 빌드

# 테스트
make test             # 모든 테스트 실행 (Go + 프론트엔드)
cd web && bun run test:run      # 프론트엔드 단위 테스트
cd web && bun run test:e2e      # Playwright E2E 테스트

# 품질
make lint             # Go vet + Biome lint
cd web && bun run check:all     # 타입 체크 + lint + 포맷 + 테스트

# i18n
cd web && bun run i18n:extract  # 번역 문자열 추출
cd web && bun run i18n:compile  # 번역 컴파일
```

### 데이터베이스

- **개발:** SQLite (제로 설정)
- **프로덕션:** PostgreSQL 16+
- **마이그레이션:** golang-migrate로 시작 시 자동 적용
- **쿼리:** SQL-first, sqlc 코드 생성

---

## 지원 언어

- English
- 日本語 (ja)
- 한국어 (ko)
- 简体中文 (zh-CN)
- 繁體中文 — 台灣 (zh-TW)
- 繁體中文 — 香港 (zh-HK)

---

## Star History

<a href="https://star-history.com/#milmil-dev/milmil&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=milmil-dev/milmil&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=milmil-dev/milmil&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=milmil-dev/milmil&type=Date" />
 </picture>
</a>

---

## 라이선스

milmil은 [GNU Affero General Public License v3.0](LICENSE) 하에 라이선스됩니다.

이는 milmil을 자유롭게 사용, 수정 및 배포할 수 있지만, 수정된 버전을 네트워크 서비스로 실행하는 경우 해당 서비스 사용자에게 소스 코드를 제공해야 함을 의미합니다.
