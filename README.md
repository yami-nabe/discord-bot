# Discord.js 봇

Discord.js를 사용한 기본적인 디스코드 봇입니다.

## 설치 방법

1. 의존성 설치:
```bash
npm install
```

2. Discord Developer Portal에서 봇 생성:
   - [Discord Developer Portal](https://discord.com/developers/applications)에 접속
   - "New Application" 클릭
   - 봇 이름 입력 후 생성
   - "Bot" 섹션에서 "Add Bot" 클릭
   - 토큰 복사

3. 환경 변수 설정:
   - `.env` 파일을 생성하고 다음 내용 추가:
   ```
   DISCORD_TOKEN=your_discord_bot_token_here
   ```

4. 봇을 서버에 초대:
   - OAuth2 > URL Generator에서 "bot" 스코프 선택
   - 필요한 권한 선택 (Send Messages, Read Message History 등)
   - 생성된 URL로 봇을 서버에 초대

## 실행 방법

개발 모드 (자동 재시작):
```bash
npm run dev
```

프로덕션 모드:
```bash
npm start
```

## 기본 기능

- `!ping`: 봇이 "Pong!"으로 응답

## 프로젝트 구조

```
discord-bot-new/
├── index.js          # 메인 봇 파일
├── config.js         # 설정 파일
├── package.json      # 프로젝트 의존성
└── README.md        # 프로젝트 설명
```

## 추가 개발

이 기본 뼈대를 바탕으로 원하는 기능을 추가할 수 있습니다:

1. 새로운 명령어 추가
2. 이벤트 핸들러 추가
3. 슬래시 명령어 구현
4. 데이터베이스 연동
5. 음성 채널 기능

## 주의사항

- 봇 토큰을 절대 공개하지 마세요
- `.env` 파일을 `.gitignore`에 추가하세요
- 봇에 필요한 최소한의 권한만 부여하세요 