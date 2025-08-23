# 리니아 (Rinia) - 주식투자 AI 챗봇 가이드

## 📋 프로젝트 개요

리니아는 주식투자 초보자들이 AI 챗봇에게 효과적으로 질문할 수 있도록 가이드하는 서비스입니다.

### 🎯 주요 기능
- **AI 채팅 기능**: OpenAI GPT-4 기반 주식투자 전문 챗봇
- **RAG 기능**: 실시간 주식투자 정보 검색 및 제공
- **맞춤형 질문 추천**: 사용자 상황에 맞는 투자 질문 예시 제공
- **대화 기록 관리**: 이전 대화 내용 저장 및 참조

### 🏗️ 기술 스택
- **프론트엔드**: Next.js 15.3.0, React 19.0.0, TypeScript 5.6.3
- **스타일링**: Tailwind CSS 3.4.1, shadcn/ui
- **백엔드**: Next.js Server Actions, Auth.js
- **AI/ML**: Vercel AI SDK, OpenAI GPT-4
- **데이터베이스**: PostgreSQL (Neon), Drizzle ORM
- **배포**: Vercel

## 🚀 빠른 시작

### 1. 저장소 클론
```bash
git clone <repository-url>
cd rinia
```

### 2. 의존성 설치
```bash
# pnpm 설치 (권장)
npm install -g pnpm

# 의존성 설치
pnpm install
```

### 3. 환경 변수 설정
`.env.local` 파일을 생성하고 다음 환경 변수들을 설정하세요:

```env
# 인증 시크릿 (필수)
AUTH_SECRET=your_auth_secret_here

# OpenAI API 키 (필수)
OPENAI_API_KEY=your_openai_api_key_here

# 데이터베이스 연결 (필수)
POSTGRES_URL=your_postgres_database_url

# Vercel Blob Storage (선택사항)
BLOB_READ_WRITE_TOKEN=your_blob_token_here

# Redis URL (선택사항)
REDIS_URL=your_redis_url_here
```

#### 환경 변수 획득 방법
- **AUTH_SECRET**: [generate-secret.vercel.app](https://generate-secret.vercel.app/32)에서 생성
- **OPENAI_API_KEY**: [OpenAI Console](https://platform.openai.com/api-keys)에서 발급
- **POSTGRES_URL**: [Neon](https://neon.tech) 또는 [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)에서 생성

### 4. 데이터베이스 마이그레이션
```bash
# 데이터베이스 테이블 생성
pnpm db:migrate
```

### 5. 개발 서버 실행
```bash
# 개발 서버 시작
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)으로 접속하여 애플리케이션을 확인하세요.

## 📁 프로젝트 구조

```
rinia/
├── app/                    # Next.js App Router
│   ├── (auth)/            # 인증 관련 페이지
│   ├── (chat)/            # 채팅 관련 페이지
│   └── api/               # API 라우트
├── components/            # React 컴포넌트
├── lib/                   # 유틸리티 및 설정
│   ├── ai/               # AI 관련 설정
│   ├── db/               # 데이터베이스 설정
│   └── utils/            # 유틸리티 함수
├── artifacts/            # AI 아티팩트 (문서, 코드 등)
└── tests/                # 테스트 파일
```

## 🔧 개발 가이드

### 사용 가능한 스크립트
```bash
# 개발 서버 실행
pnpm dev

# 프로덕션 빌드
pnpm build

# 프로덕션 서버 실행
pnpm start

# 린트 검사
pnpm lint

# 코드 포맷팅
pnpm format

# 테스트 실행
pnpm test

# 데이터베이스 관련
pnpm db:generate    # 마이그레이션 파일 생성
pnpm db:migrate     # 마이그레이션 실행
pnpm db:studio      # Drizzle Studio 실행
```

### 데이터베이스 관리
```bash
# 새로운 마이그레이션 생성
pnpm db:generate

# 마이그레이션 실행
pnpm db:migrate

# 데이터베이스 스튜디오 실행
pnpm db:studio
```

## 🎨 커스터마이징

### AI 모델 변경
`lib/ai/providers.ts`에서 AI 모델을 변경할 수 있습니다:

```typescript
// OpenAI GPT-4 사용
'chat-model': openai('gpt-4'),
```

### 시스템 프롬프트 수정
`lib/ai/prompts.ts`에서 챗봇의 시스템 프롬프트를 수정할 수 있습니다.

### UI 테마 변경
`app/globals.css`와 `tailwind.config.ts`에서 테마를 커스터마이징할 수 있습니다.

## 🚀 배포

### Vercel 배포 (권장)
1. [Vercel](https://vercel.com)에 계정 생성
2. GitHub 저장소 연결
3. 환경 변수 설정
4. 자동 배포

### 수동 배포
```bash
# 프로덕션 빌드
pnpm build

# 프로덕션 서버 실행
pnpm start
```

## 🧪 테스트

```bash
# E2E 테스트 실행
pnpm test

# 특정 테스트 실행
pnpm test:e2e
```

## 📚 API 문서

### 주요 API 엔드포인트
- `POST /api/chat` - 채팅 메시지 전송
- `GET /api/chat/[id]/stream` - 실시간 스트림 응답
- `GET /api/history` - 대화 기록 조회
- `POST /api/auth/[...nextauth]` - 인증 처리

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 `LICENSE` 파일을 참조하세요.

## 📞 지원

문제가 발생하거나 질문이 있으시면 [Issues](../../issues)를 통해 문의해주세요.

---

**리니아** - 주식투자 초보자를 위한 AI 챗봇 가이드
