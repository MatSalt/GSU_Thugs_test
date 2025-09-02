# 제품 요구사항 명세서 (PRD)

## 프로젝트명: 리니아 (Rinia)

---

## 1. 개요 (Overview)

### 1.1. 목적 (Purpose)
* 주식투자 초보자들이 AI 챗봇에게 효과적으로 질문할 수 있도록 가이드하는 서비스
* 투자 관련 질문의 품질을 향상시켜 더 정확하고 유용한 답변을 받을 수 있도록 지원
* 주식투자 학습의 진입장벽을 낮추고 체계적인 학습 경험 제공

---

## 2. 요구사항 (Requirements)

### 2.1. 기능적 요구사항
* *시스템이 반드시 수행해야 하는 기능들을 상세하게 기술합니다.*

#### AI 채팅 기능
* 사용자는 AI 챗봇과 실시간으로 대화할 수 있어야 한다.
* AI는 주식투자 관련 질문에 대해 정확하고 유용한 답변을 제공해야 한다.
* 대화 기록이 저장되어 이전 대화 내용을 참조할 수 있어야 한다.

#### RAG (Retrieval-Augmented Generation) 기능
* AI는 인터넷에서 최신 주식투자 정보를 실시간으로 검색하여 가져올 수 있어야 한다.
* 검색된 정보를 바탕으로 정확하고 시의적절한 답변을 생성해야 한다.
* 정보 출처를 명시하여 사용자가 답변의 신뢰성을 판단할 수 있어야 한다.

#### 맞춤형 질문 추천 기능
* 사용자의 투자 경험 수준, 관심 분야, 투자 목표에 맞는 적절한 질문 예시를 추천해야 한다.
* 사용자의 학습 진도에 따라 단계별로 질문을 제안해야 한다.
* 개인 상황(나이, 소득, 투자 가능 금액 등)을 고려한 맞춤형 질문을 생성해야 한다.

#### A2A (Agent-to-Agent) 통신 기능
* 사용자는 다양한 A2A agent들을 시스템에 등록하여 활용할 수 있어야 한다.
* 각 A2A agent는 고유한 기능과 전문성을 제공해야 한다 (예: 주식 분석, 포트폴리오 관리, 리스크 평가 등).
* 등록된 agent들과의 통신을 통해 더욱 정확하고 전문적인 투자 조언을 받을 수 있어야 한다.
* A2A agent 등록 시 AgentCard 정보를 자동으로 조회하여 유효성을 검증해야 한다.
* 등록된 agent들의 목록을 관리하고 필요에 따라 제거할 수 있어야 한다.

---

## 3. 페이지 구성
* *웹 애플리케이션의 주요 페이지들과 각 페이지의 기능을 정의합니다.*

### 3.1. 채팅 페이지 (메인)
* *사용자가 사이트에 접속하면 바로 보이는 AI 챗봇과의 대화 페이지*
* *MVP에서는 별도의 메인 페이지 없이 바로 채팅 기능을 제공*
* *왼쪽 사이드바에 이전 대화 기록들을 표시*
* *오른쪽 사이드바에 사용자 맞춤형 추천 질문들을 표시*
* *추천 질문을 클릭하면 바로 AI 챗봇에게 해당 질문을 전송*

### 3.2. A2A Agent 관리 페이지
* *등록된 A2A agent들을 관리하고 새로운 agent를 등록할 수 있는 페이지*
* *Agent 목록 테이블: 등록된 agent들의 이름, 설명, 조직, 기능 등을 표시*
* *Agent 등록 기능: URL을 입력하여 새로운 A2A agent를 등록*
* *Agent 정보 검증: 등록 전 agent의 AgentCard 정보를 조회하여 유효성 검증*
* *Agent 제거 기능: 더 이상 필요하지 않은 agent를 시스템에서 제거*

---

## 4. 기술 스택
* *프로젝트 개발에 사용될 기술들을 정의합니다.*

### 4.1. 프론트엔드
* **Next.js 15.3.0-canary.31** (App Router) - React 기반 풀스택 프레임워크
  * [공식 문서](https://nextjs.org/docs)
* **React 19.0.0-rc** - 사용자 인터페이스 라이브러리
  * [공식 문서](https://react.dev/learn)
* **TypeScript 5.6.3** - 타입 안전성
  * [공식 문서](https://www.typescriptlang.org/docs/)
* **Tailwind CSS 3.4.1** - 스타일링
  * [공식 문서](https://tailwindcss.com/docs)
* **shadcn/ui** - UI 컴포넌트 라이브러리 (Radix UI 기반)
  * [공식 문서](https://ui.shadcn.com/docs)
* **AI SDK 5.0.0-beta.6** - AI 기능 구현을 위한 Vercel SDK
  * [공식 문서](https://sdk.vercel.ai/docs)
* **Framer Motion 11.3.19** - 애니메이션
  * [공식 문서](https://www.framer.com/motion/introduction/)

### 4.2. 백엔드
* **Next.js Server Actions** - 서버 사이드 액션
  * [공식 문서](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
* **Auth.js (NextAuth) 5.0.0-beta.25** - 인증 시스템
  * [공식 문서](https://authjs.dev/)

### 4.3. AI/ML
* **AI SDK 5.0.0-beta.6** - 다양한 LLM 제공자 지원
  * [공식 문서](https://sdk.vercel.ai/docs)
* **@ai-sdk/xai 2.0.0-beta.2** - xAI 모델 지원
  * [공식 문서](https://sdk.vercel.ai/docs/reference/ai-sdk-xai)
* **기본 모델**: OpenAI GPT-4
  * [모델 정보](https://platform.openai.com/docs/models)
* **RAG 기능** - 실시간 정보 검색 및 생성 (추가 구현 필요)
* **A2A (Agent-to-Agent) 프로토콜** - 다중 agent 간 통신 및 협업
  * [A2A 공식 문서](https://google.github.io/A2A/)
  * **AgentCard 표준** - agent 정보 및 기능 메타데이터 정의
  * **멀티모달 통신** - 텍스트, 이미지, 데이터 등 다양한 형태의 정보 교환
  * **실시간 스트리밍** - agent 간 비동기 통신 및 상태 업데이트

### 4.4. 데이터베이스
* **SQLite 3.50.4** - 로컬 파일 기반 데이터베이스
  * [공식 문서](https://www.sqlite.org/docs.html)
* **Drizzle ORM 0.44.4** - TypeScript 기반 ORM
  * [공식 문서](https://orm.drizzle.team/docs/overview)
* **drizzle-kit 0.31.4** - 데이터베이스 마이그레이션 도구
  * [공식 문서](https://orm.drizzle.team/kit-docs/overview)

### 4.5. 인프라/배포
* **로컬 개발 환경** - Next.js 개발 서버
* **배포** - 추후 결정 (Vercel, AWS, GCP 등 고려)
  * [Vercel 공식 문서](https://vercel.com/docs)

---

## 5. API 명세
* *프로젝트에서 사용되는 API 엔드포인트들을 정의합니다.*

### 5.1. 채팅 API
* **POST `/api/chat`** - 새로운 채팅 메시지 전송 및 AI 응답 생성
* **GET `/api/chat/[id]/stream`** - 채팅 스트림 실시간 응답

### 5.2. 사용자 관리 API
* **POST `/api/auth/[...nextauth]`** - NextAuth 인증 핸들러 (로그인/로그아웃)
* **GET `/api/auth/guest`** - 게스트 사용자 로그인

### 5.3. 대화 기록 API
* **GET `/api/history`** - 사용자의 채팅 기록 조회 (페이지네이션 지원)
  * Query Parameters: `limit`, `starting_after`, `ending_before`

### 5.4. 추천 질문 API
* **POST `/api/recommendations/questions`** - 사용자 프로필 기반 질문 추천
* **GET `/api/recommendations/categories`** - 투자 카테고리별 질문 목록

### 5.5. A2A Agent 관리 API
* **POST `/api/agents/register`** - 새로운 A2A agent 등록
  * Request Body: `{ "url": "localhost:10000" }`
  * Response: `{ "success": true, "agent_id": "uuid" }`
* **GET `/api/agents/list`** - 등록된 A2A agent 목록 조회
  * Response: `{ "agents": [AgentCard] }`
* **DELETE `/api/agents/[id]`** - 등록된 A2A agent 제거
  * Response: `{ "success": true }`
* **GET `/api/agents/[id]/info`** - 특정 agent의 상세 정보 조회
  * Response: `{ "agent": AgentCard }`

---

## 6. 개발 단계
* *Vercel AI Chatbot 템플릿을 기반으로 한 단계별 개발 계획*

### 6.1. Phase 1: 템플릿 기반 프로젝트 설정 (3-5일)

#### 6.1.1. Vercel AI Chatbot 템플릿 클론 및 설정
- [ ] `npx create-ai-chatbot@latest` 명령어로 프로젝트 생성
- [ ] 환경 변수 설정 (`.env.local` 파일 생성)
  - [ ] `AUTH_SECRET`: 인증 시크릿 키
  - [ ] `OPENAI_API_KEY`: OpenAI API 키
  - [ ] `POSTGRES_URL`: 데이터베이스 연결 (SQLite로 대체 예정)
- [ ] 기본 의존성 설치 및 개발 서버 실행

#### 6.1.2. 데이터베이스 설정 변경
- [ ] Neon Postgres → SQLite + Drizzle ORM으로 변경
- [ ] `drizzle.config.ts` 설정 수정
- [ ] 기존 마이그레이션 파일들을 SQLite 스키마로 변환

### 6.2. Phase 2: 기본 채팅 기능 커스터마이징 (1-2주)

#### 6.2.1. AI 모델 설정 변경
- [ ] 기본 xAI Grok → OpenAI GPT-4로 변경
- [ ] `lib/ai/providers.ts`에서 모델 설정 수정
- [ ] `lib/ai/models.ts`에서 사용 가능한 모델 목록 업데이트

#### 6.2.2. 채팅 인터페이스 리니아 맞춤화
- [ ] `components/chat.tsx` 수정하여 주식투자 전문 챗봇으로 변경
- [ ] `lib/ai/prompts.ts`에서 시스템 프롬프트를 주식투자 가이드용으로 수정
- [ ] 메시지 스타일링 및 UI 컴포넌트 조정

#### 6.2.3. 기본 사이드바 구조 구현
- [ ] `components/app-sidebar.tsx` 수정
- [ ] 왼쪽 사이드바: 대화 기록 (`components/sidebar-history.tsx`)
- [ ] 오른쪽 사이드바: 추천 질문 (새로 구현)

### 6.3. Phase 3: RAG 기능 구현 (2-3주)

#### 6.3.1. 웹 검색 도구 추가
- [ ] `lib/ai/tools/` 폴더에 새로운 검색 도구 생성
- [ ] 주식투자 관련 뉴스 및 정보 검색 API 연동
- [ ] 검색 결과를 AI 응답에 통합하는 로직 구현

#### 6.3.2. 실시간 정보 처리
- [ ] 검색된 정보의 신뢰성 검증 로직
- [ ] 정보 출처 표시 및 링크 제공
- [ ] 주식 시장 데이터 실시간 업데이트

### 6.4. Phase 4: 맞춤형 질문 추천 시스템 (2-3주)

#### 6.4.1. 사용자 프로필 시스템 구현
- [ ] `lib/db/schema.ts`에 사용자 프로필 테이블 추가
- [ ] 투자 경험 수준, 관심 분야, 투자 목표 저장 기능
- [ ] 사용자 학습 진도 추적 시스템

#### 6.4.2. 추천 알고리즘 개발
- [ ] `lib/ai/tools/`에 질문 추천 도구 생성
- [ ] 사용자 상황 기반 질문 생성 로직
- [ ] 투자 카테고리별 질문 템플릿 데이터베이스 구축

#### 6.4.3. 오른쪽 사이드바 UI 구현
- [ ] `components/` 폴더에 추천 질문 컴포넌트 생성
- [ ] 추천 질문 클릭 시 자동으로 채팅에 전송
- [ ] 실시간 추천 질문 업데이트

### 6.5. Phase 5: 고급 기능 및 최적화 (1-2주)

#### 6.5.1. 메시지 관리 기능
- [ ] `components/message.tsx` 수정하여 주식투자 관련 메시지 스타일링
- [ ] 투표 시스템 활용하여 답변 품질 평가
- [ ] 메시지 편집 및 재생성 기능

#### 6.5.2. 아티팩트 시스템 활용
- [ ] `components/artifact.tsx`를 활용하여 주식 차트, 분석 보고서 생성
- [ ] 투자 포트폴리오 시뮬레이션 도구
- [ ] 주식 분석 결과 시각화

#### 6.5.3. 성능 최적화
- [ ] `lib/db/queries.ts`에서 데이터베이스 쿼리 최적화
- [ ] 캐싱 전략 구현
- [ ] 코드 분할 및 번들 최적화

### 6.6. Phase 6: 테스트 및 배포 (1주)

#### 6.6.1. 테스트 구현
- [ ] `tests/` 폴더의 기존 테스트를 리니아 기능에 맞게 수정
- [ ] E2E 테스트 시나리오 작성
- [ ] 사용자 시나리오 기반 테스트 케이스

#### 6.6.2. 배포 준비
- [ ] Vercel 배포 설정
- [ ] 환경 변수 관리
- [ ] 프로덕션 데이터베이스 설정

#### 6.6.3. 문서화 및 최종 점검
- [ ] README.md 업데이트
- [ ] API 문서 작성
- [ ] 사용자 가이드 작성

---

## 7. 참고 자료
* *프로젝트 개발 및 구현에 참고할 수 있는 핵심 자료들*

### 7.1. Vercel AI Chatbot 템플릿
* **[GitHub 저장소](https://github.com/vercel/ai-chatbot)** - 기본 템플릿 소스코드 및 문서

* **[Chat SDK 공식 문서](https://chat-sdk.dev/docs/getting-started/overview)** - 상세한 개발 가이드

---
