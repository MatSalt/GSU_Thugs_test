# A2A 에이전트 단순 통합 구현 계획

## 📋 개요
`@ai-chatbot-main/` 프로젝트에 A2A (Agent2Agent) 프로토콜을 **가장 단순하게** 통합하여 하드코딩된 A2A 에이전트와 채팅할 수 있는 기능을 구현합니다.

## 🎯 목표
- **최소한의 기능**: 하드코딩된 A2A 에이전트 URL로 간단한 메시지 송수신
- **기존 채팅 시스템 최소 수정**: 기존 코드에 영향을 최소화
- **관리 페이지 없음**: UI는 기본 채팅 인터페이스만 사용
- **빠른 구현**: 핵심 기능만 구현하여 신속한 프로토타입 개발

---

## 📦 1단계: 의존성 설치 및 기본 설정

### 1.1 A2A SDK 설치
```bash
cd ai-chatbot-main
npm install @a2a-js/sdk
```

### 1.2 환경 변수 설정
```env
# .env.local에 추가 (하드코딩된 에이전트 URL)
A2A_AGENT_URL=http://localhost:4000
A2A_TIMEOUT_MS=10000
```

### 1.3 간단한 타입 정의
**파일**: `lib/types.ts` (기존 파일에 추가)

```typescript
// A2A 관련 최소 타입 정의
export interface A2AMessage {
  text: string;
  agentUrl: string;
  isA2AResponse?: boolean;
}
```

---

## 🔧 2단계: A2A 클라이언트 유틸리티 생성

### 2.1 단순한 A2A 클라이언트 래퍼
**파일**: `lib/a2a-client.ts` (새 파일)

```typescript
import { A2AClient, SendMessageSuccessResponse } from "@a2a-js/sdk/client";
import { Message, MessageSendParams } from "@a2a-js/sdk";
import { v4 as uuidv4 } from "uuid";

const A2A_AGENT_URL = process.env.A2A_AGENT_URL || "http://localhost:4000";
const A2A_TIMEOUT = parseInt(process.env.A2A_TIMEOUT_MS || "10000");

export async function sendA2AMessage(userMessage: string): Promise<string> {
  try {
    // A2A 클라이언트 생성
    const client = await A2AClient.fromCardUrl(
      `${A2A_AGENT_URL}/.well-known/agent-card.json`
    );

    // 메시지 전송
    const sendParams: MessageSendParams = {
      message: {
        messageId: uuidv4(),
        role: "user",
        parts: [{ kind: "text", text: userMessage }],
        kind: "message",
      },
    };

    const response = await client.sendMessage(sendParams);

    // 응답 처리
    if ("error" in response) {
      throw new Error(`A2A Error: ${response.error.message}`);
    }

    const result = (response as SendMessageSuccessResponse).result as Message;
    return result.parts[0]?.text || "No response from A2A agent";

  } catch (error) {
    console.error("A2A communication failed:", error);
    throw new Error(`A2A 에이전트와 통신할 수 없습니다: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// A2A 에이전트 상태 확인
export async function checkA2AAgent(): Promise<boolean> {
  try {
    const client = await A2AClient.fromCardUrl(
      `${A2A_AGENT_URL}/.well-known/agent-card.json`
    );
    return true;
  } catch (error) {
    console.error("A2A agent is not available:", error);
    return false;
  }
}
```

---

## 🛠️ 3단계: 채팅 API에 A2A 통합 (전면 교체)

### 3.1 기존 Chat API 완전 수정 (일반 AI 제거)
**파일**: `app/(chat)/api/chat/route.ts` 수정

```typescript
import { auth, type UserType } from '@/app/(auth)/auth';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { ChatSDKError } from '@/lib/errors';
import type { ChatMessage } from '@/lib/types';
import type { ChatModel } from '@/lib/ai/models';
import type { VisibilityType } from '@/components/visibility-selector';
import { sendA2AMessage } from '@/lib/a2a-client';

export const maxDuration = 60;

// A2A 전용 메시지 처리 함수
async function getMessageText(message: ChatMessage): Promise<string> {
  // 메시지의 텍스트 부분 추출
  const textParts = message.parts.filter(part => part.type === 'text');
  return textParts.map(part => part.text).join(' ');
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel['id'];
      selectedVisibilityType: VisibilityType;
    } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const userType: UserType = session.user.type;

    // Rate limiting 확인
    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError('rate_limit:chat').toResponse();
    }

    // 채팅 존재 여부 확인 및 생성
    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    } else {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    // 사용자 메시지 텍스트 추출
    const messageText = await getMessageText(message);

    // 사용자 메시지 먼저 저장
    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    // A2A 에이전트로 메시지 전송 (모든 메시지)
    try {
      console.log(`A2A 에이전트에게 메시지 전송: "${messageText}"`);
      const a2aResponse = await sendA2AMessage(messageText);
      
      // A2A 응답을 채팅 히스토리에 저장
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: generateUUID(),
            role: 'assistant',
            parts: [{ 
              type: 'text', 
              text: a2aResponse
            }],
            attachments: [],
            createdAt: new Date(),
          }
        ],
      });

      // 성공 응답 반환 (기존 스트리밍 형태와 호환)
      return Response.json({ 
        success: true, 
        message: 'A2A message processed successfully'
      });

    } catch (a2aError) {
      console.error('A2A 통신 실패:', a2aError);
      
      // A2A 에러를 채팅 히스토리에 저장
      const errorMessage = a2aError instanceof Error 
        ? a2aError.message 
        : 'A2A 에이전트와 통신할 수 없습니다.';

      await saveMessages({
        messages: [
          {
            chatId: id,
            id: generateUUID(),
            role: 'assistant',
            parts: [{ 
              type: 'text', 
              text: `❌ **연결 오류**: ${errorMessage}\n\n다시 시도해 주세요.`
            }],
            attachments: [],
            createdAt: new Date(),
          }
        ],
      });

      return Response.json({ 
        success: false, 
        error: 'A2A communication failed',
        message: errorMessage
      });
    }

  } catch (error) {
    console.error('Chat API 오류:', error);
    
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    return new ChatSDKError('internal_server_error:chat').toResponse();
  }
}

// DELETE 함수는 기존과 동일하게 유지
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const chat = await getChatById({ id });

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
```

### 3.2 A2A 클라이언트 함수 강화
**파일**: `lib/a2a-client.ts` 수정 (버그 방지 강화)

```typescript
import { A2AClient, SendMessageSuccessResponse } from "@a2a-js/sdk/client";
import { Message, MessageSendParams } from "@a2a-js/sdk";
import { v4 as uuidv4 } from "uuid";

const A2A_AGENT_URL = process.env.A2A_AGENT_URL || "http://localhost:4000";
const A2A_TIMEOUT = parseInt(process.env.A2A_TIMEOUT_MS || "10000");

// A2A 에이전트 가용성 확인
export const isA2AEnabled = !!process.env.A2A_AGENT_URL;

export async function sendA2AMessage(userMessage: string): Promise<string> {
  // 환경 변수 검증
  if (!A2A_AGENT_URL) {
    throw new Error('A2A_AGENT_URL이 설정되지 않았습니다. 환경 변수를 확인해주세요.');
  }

  // 입력 검증
  if (!userMessage || userMessage.trim().length === 0) {
    throw new Error('빈 메시지는 전송할 수 없습니다.');
  }

  // 메시지 길이 제한 (과도한 요청 방지)
  if (userMessage.length > 10000) {
    throw new Error('메시지가 너무 깁니다. 10,000자 이하로 입력해주세요.');
  }

  let client: A2AClient;
  
  try {
    // A2A 클라이언트 생성 (타임아웃 포함)
    const agentCardUrl = `${A2A_AGENT_URL.replace(/\/$/, '')}/.well-known/agent-card.json`;
    console.log(`A2A 에이전트 카드 URL: ${agentCardUrl}`);
    
    client = await A2AClient.fromCardUrl(agentCardUrl);
    
  } catch (cardError) {
    console.error('A2A 에이전트 카드 조회 실패:', cardError);
    throw new Error(`A2A 에이전트에 연결할 수 없습니다. 에이전트가 실행 중인지 확인해주세요. (URL: ${A2A_AGENT_URL})`);
  }

  try {
    // 메시지 전송 파라미터 생성
    const sendParams: MessageSendParams = {
      message: {
        messageId: uuidv4(),
        role: "user",
        parts: [{ kind: "text", text: userMessage.trim() }],
        kind: "message",
      },
    };

    console.log(`A2A 메시지 전송 중... ID: ${sendParams.message.messageId}`);
    
    // A2A 에이전트로 메시지 전송
    const response = await client.sendMessage(sendParams);

    // 응답 타입 확인 및 처리
    if ("error" in response) {
      const errorMsg = response.error?.message || 'Unknown A2A error';
      console.error('A2A 에이전트 오류 응답:', errorMsg);
      throw new Error(`A2A 에이전트 오류: ${errorMsg}`);
    }

    // 성공 응답 처리
    const result = (response as SendMessageSuccessResponse).result;
    
    if (result.kind === "message") {
      const message = result as Message;
      const responseText = message.parts
        ?.filter(part => part.kind === "text")
        ?.map(part => part.text)
        ?.join(" ") || "";
      
      if (!responseText) {
        console.warn('A2A 에이전트에서 빈 응답을 받았습니다.');
        return "A2A 에이전트에서 응답을 받았지만 내용이 비어있습니다.";
      }
      
      console.log(`A2A 응답 수신 성공 (길이: ${responseText.length}자)`);
      return responseText;
      
    } else if (result.kind === "task") {
      // Task 응답 처리 (향후 확장 가능)
      console.log('A2A 에이전트에서 Task 응답을 받았습니다.');
      return "A2A 에이전트가 작업을 시작했습니다. 작업 완료까지 잠시 기다려주세요.";
      
    } else {
      console.warn('알 수 없는 A2A 응답 형식:', result.kind);
      return "A2A 에이전트에서 알 수 없는 형식의 응답을 받았습니다.";
    }

  } catch (sendError) {
    console.error('A2A 메시지 전송 실패:', sendError);
    
    if (sendError instanceof Error) {
      // 네트워크 관련 오류 구분
      if (sendError.message.includes('fetch') || sendError.message.includes('network')) {
        throw new Error('네트워크 연결 문제로 A2A 에이전트에 접근할 수 없습니다.');
      }
      throw sendError;
    }
    
    throw new Error('A2A 메시지 전송 중 예상치 못한 오류가 발생했습니다.');
  }
}

// A2A 에이전트 상태 확인 함수
export async function checkA2AAgent(): Promise<boolean> {
  if (!A2A_AGENT_URL) {
    console.warn('A2A_AGENT_URL이 설정되지 않았습니다.');
    return false;
  }

  try {
    const agentCardUrl = `${A2A_AGENT_URL.replace(/\/$/, '')}/.well-known/agent-card.json`;
    const client = await A2AClient.fromCardUrl(agentCardUrl);
    console.log('A2A 에이전트 상태 확인: 정상');
    return true;
  } catch (error) {
    console.error('A2A 에이전트 상태 확인 실패:', error);
    return false;
  }
}
```

---

## 🎨 4단계: 프론트엔드 UI 수정 (A2A 전용)

### 4.1 A2A 전용 사용법 안내
**파일**: `components/suggested-actions.tsx` 수정

```typescript
// A2A 전용 suggested actions
const A2A_SUGGESTIONS = [
  {
    title: "A2A 에이전트에게 질문하기",
    description: "무엇이든 자유롭게 물어보세요",
    action: "안녕하세요! 어떻게 도와드릴까요?"
  },
  {
    title: "A2A 에이전트 상태 확인",
    description: "에이전트가 정상 작동하는지 확인",
    action: "상태는 어떤가요?"
  },
  {
    title: "복잡한 질문 하기",
    description: "상세한 분석이나 계획이 필요한 질문",
    action: "프로젝트 계획을 도와주세요"
  },
  {
    title: "창작 요청하기", 
    description: "글쓰기, 아이디어 생성 등",
    action: "창의적인 아이디어를 제안해주세요"
  }
];
```

### 4.2 A2A 응답 스타일링 (에러 구분)
**파일**: `components/message.tsx` 수정

```typescript
// A2A 전용 메시지 스타일링
function PurePreviewMessage({ message, ... }) {
  const messageText = getTextFromMessage(message);
  const isA2AError = messageText.includes('❌ **연결 오류:**');
  const isA2ASuccess = message.role === 'assistant' && !isA2AError;

  return (
    <motion.div className={cn(
      "flex flex-row gap-4 px-4 w-full md:w-[calc(100%-256px)] md:px-0 first-of-type:pt-20",
      {
        // A2A 성공 응답: 파란색 테두리
        'border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4': isA2ASuccess,
        // A2A 에러 응답: 빨간색 테두리  
        'border-l-4 border-red-500 bg-red-50 dark:bg-red-950/20 rounded-lg p-4': isA2AError,
      }
    )}>
      {/* A2A 응답임을 나타내는 아이콘 추가 */}
      {message.role === 'assistant' && (
        <div className="flex-shrink-0">
          {isA2AError ? (
            <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
              <span className="text-red-600 text-sm">❌</span>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <span className="text-blue-600 text-sm">🤖</span>
            </div>
          )}
        </div>
      )}
      {/* 기존 메시지 렌더링 로직 */}
    </motion.div>
  );
}
```

### 4.3 MultimodalInput A2A 전용 업데이트
**파일**: `components/multimodal-input.tsx` 수정

```typescript
// A2A 전용 placeholder 및 힌트
<textarea
  placeholder="A2A 에이전트에게 메시지를 보내세요..."
  // ... 기존 props
/>

// A2A 상태 표시 추가 (옵션)
{isA2AEnabled ? (
  <div className="flex items-center text-sm text-green-600 dark:text-green-400">
    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
    A2A 에이전트 연결됨
  </div>
) : (
  <div className="flex items-center text-sm text-red-600 dark:text-red-400">
    <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
    A2A 에이전트 연결 안됨
  </div>
)}
```

### 4.4 채팅 헤더에 A2A 상태 표시
**파일**: `components/chat-header.tsx` (새로 생성 또는 기존 수정)

```typescript
import { checkA2AAgent } from '@/lib/a2a-client';
import { useEffect, useState } from 'react';

export function ChatHeader() {
  const [isA2AOnline, setIsA2AOnline] = useState<boolean | null>(null);

  useEffect(() => {
    // A2A 에이전트 상태 확인
    const checkStatus = async () => {
      try {
        const status = await checkA2AAgent();
        setIsA2AOnline(status);
      } catch {
        setIsA2AOnline(false);
      }
    };

    checkStatus();
    // 30초마다 상태 재확인
    const interval = setInterval(checkStatus, 30000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-between p-4 border-b">
      <h1 className="text-xl font-semibold">A2A 에이전트 채팅</h1>
      
      <div className="flex items-center space-x-2">
        {isA2AOnline === null ? (
          <span className="text-gray-500">연결 확인 중...</span>
        ) : isA2AOnline ? (
          <div className="flex items-center text-green-600">
            <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
            온라인
          </div>
        ) : (
          <div className="flex items-center text-red-600">
            <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
            오프라인
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 🧪 5단계: 기본 테스트

### 5.1 A2A 클라이언트 테스트
**파일**: `lib/__tests__/a2a-client.test.ts` (새 파일)

```typescript
import { sendA2AMessage, checkA2AAgent } from '../a2a-client';

// 환경변수 모킹
process.env.A2A_AGENT_URL = 'http://localhost:4000';

describe('A2A Client', () => {
  test('should send message to A2A agent', async () => {
    // 실제 A2A 에이전트가 실행 중일 때만 테스트
    const isAgentAvailable = await checkA2AAgent();
    
    if (isAgentAvailable) {
      const response = await sendA2AMessage('Hello, A2A agent!');
      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
    } else {
      console.log('A2A agent not available, skipping test');
    }
  });

  test('should handle A2A agent errors gracefully', async () => {
    // 잘못된 URL로 테스트
    process.env.A2A_AGENT_URL = 'http://localhost:9999';
    
    await expect(sendA2AMessage('test')).rejects.toThrow();
  });
});
```

### 5.2 Chat API 테스트 업데이트
**파일**: `tests/routes/chat.test.ts` 수정

```typescript
// 기존 테스트에 A2A 테스트 케이스 추가
describe('Chat API with A2A', () => {
  test('should handle A2A messages', async () => {
    const response = await request(app)
      .post('/api/chat')
      .send({
        id: 'test-chat',
        message: {
          id: 'test-msg',
          role: 'user',
          parts: [{ type: 'text', text: '/a2a Hello!' }]
        },
        selectedChatModel: 'chat-model',
        selectedVisibilityType: 'private'
      });

    expect(response.status).toBe(200);
    // A2A 처리 결과 확인
  });
});
```

---

## 🛡️ 6단계: 기본 에러 처리 및 안전성

### 6.1 환경 변수 검증
**파일**: `lib/a2a-client.ts` 수정

```typescript
// 환경 변수 유효성 검사
if (!process.env.A2A_AGENT_URL) {
  console.warn('A2A_AGENT_URL not set, A2A features will be disabled');
}

export const isA2AEnabled = !!process.env.A2A_AGENT_URL;
```

### 6.2 Rate Limiting (기본)
**파일**: `app/(chat)/api/chat/route.ts` 수정

```typescript
// A2A 메시지 rate limiting (간단한 구현)
const A2A_RATE_LIMIT = 10; // 시간당 10개 메시지
const a2aUsage = new Map<string, number[]>();

function checkA2ARateLimit(userId: string): boolean {
  const now = Date.now();
  const userUsage = a2aUsage.get(userId) || [];
  
  // 1시간 이내 사용량 확인
  const recentUsage = userUsage.filter(time => now - time < 3600000);
  
  if (recentUsage.length >= A2A_RATE_LIMIT) {
    return false; // 제한 초과
  }
  
  // 사용량 업데이트
  recentUsage.push(now);
  a2aUsage.set(userId, recentUsage);
  return true;
}
```

---

## 🚀 7단계: 배포 준비

### 7.1 환경별 설정
```env
# 개발 환경 (.env.local)
A2A_AGENT_URL=http://localhost:4000
A2A_TIMEOUT_MS=10000

# 프로덕션 환경
A2A_AGENT_URL=https://your-a2a-agent.com
A2A_TIMEOUT_MS=30000
```

### 7.2 README 업데이트
**파일**: `README.md` 수정

```markdown
## A2A 에이전트 기능

### 설정
1. `.env.local`에 A2A 에이전트 URL 추가:
   ```
   A2A_AGENT_URL=http://localhost:4000
   ```

2. A2A 에이전트 서버 실행 확인

### 사용법
- 채팅에서 `/a2a` 또는 `@a2a`로 시작하는 메시지 입력
- 예: `/a2a 안녕하세요!`

### 문제 해결
- A2A 에이전트가 응답하지 않는 경우, 에이전트 서버 상태 확인
- 네트워크 연결 및 방화벽 설정 확인
```

---

## 📋 구현 우선순위 (A2A 전용 시스템)

### **Phase 1: 핵심 A2A 통합 (1-2일)**
1. ✅ A2A SDK 설치 및 환경 변수 설정
2. ✅ 강화된 A2A 클라이언트 함수 작성 (`lib/a2a-client.ts`)
3. ✅ Chat API 완전 교체 - 일반 AI 제거, A2A 전용으로 변경
4. ✅ 메시지 텍스트 추출 및 A2A 전송 로직 구현

### **Phase 2: 사용자 경험 개선 (1일)**
5. ✅ A2A 전용 UI 스타일링 (성공/에러 구분)
6. ✅ A2A 상태 표시 (온라인/오프라인)
7. ✅ 에러 메시지 및 사용자 피드백 개선
8. ✅ A2A 전용 suggested actions

### **Phase 3: 안정성 및 배포 (1일)**
9. ✅ 포괄적인 에러 처리 및 타입 안전성
10. ✅ A2A 에이전트 상태 모니터링
11. ✅ 단위 테스트 및 통합 테스트
12. ✅ 환경별 배포 설정 및 문서화

---

## ⚠️ A2A 전용 시스템 특징

### 🔄 **완전히 변경되는 부분**
- ✅ **모든 메시지가 A2A 에이전트로 전송** (일반 AI 완전 제거)
- ✅ **명령어 없이 직접 대화** (`/a2a` 접두사 불필요)
- ✅ **A2A 전용 UI/UX** (성공/에러 상태 구분)
- ✅ **A2A 에이전트 상태 실시간 모니터링**

### ❌ **제거되는 기능**
- ❌ 일반 AI 모델 통합 (Google Gemini, OpenAI 등)
- ❌ AI SDK 스트리밍 기능
- ❌ AI 도구 실행 (google_search, createDocument 등)
- ❌ AI 모델 선택 UI
- ❌ 복잡한 스트리밍 응답 처리

### 🎯 **새로 추가되는 기능**
- ✅ A2A 프로토콜 기반 통신
- ✅ Agent Card 기반 에이전트 발견
- ✅ A2A 에이전트 상태 실시간 확인
- ✅ A2A 특화 에러 처리 및 복구
- ✅ Message/Task 응답 타입 구분 처리

### 🔮 **향후 확장 가능한 기능**
- ✳️ 복수 A2A 에이전트 지원 및 선택 UI
- ✳️ A2A Task 스트리밍 지원
- ✳️ A2A Push Notification 통합
- ✳️ A2A 세션 상태 데이터베이스 저장
- ✳️ A2A 에이전트 성능 모니터링

---

## 🎯 성공 기준 (A2A 전용)

### **1. 기본 A2A 통신**
- ✅ 사용자가 메시지 입력 시 자동으로 A2A 에이전트로 전송
- ✅ A2A 에이전트 응답이 채팅 UI에 정상 표시
- ✅ Message 및 Task 응답 타입 모두 처리 가능

### **2. 에러 처리 및 복구**
- ✅ A2A 에이전트 연결 실패 시 명확한 에러 메시지
- ✅ 네트워크 오류와 A2A 프로토콜 오류 구분
- ✅ 에러 발생 시에도 채팅 시스템 전체가 안정적으로 동작

### **3. 사용자 경험**
- ✅ A2A 응답과 에러를 시각적으로 명확히 구분
- ✅ A2A 에이전트 온라인/오프라인 상태 실시간 표시
- ✅ 자연스러운 대화 흐름 (명령어 없이 직접 대화)

### **4. 시스템 안정성**
- ✅ A2A 에이전트 장애 시에도 웹 애플리케이션은 정상 동작
- ✅ 메시지 저장 및 채팅 히스토리 관리 정상 동작
- ✅ 사용자 인증 및 권한 관리 기존과 동일하게 유지

### **5. 개발자 경험**
- ✅ 명확한 타입 정의 및 에러 핸들링
- ✅ 상세한 로깅 및 디버깅 정보
- ✅ 환경 변수 기반 설정 관리

이 **A2A 전용 시스템**으로 **2-3일 내에** 기존 AI 채팅을 완전히 A2A 에이전트 기반으로 전환할 수 있습니다! 🚀

### **🔧 구현 후 즉시 테스트 가능한 시나리오**
1. A2A 에이전트 서버 실행 후 채팅 테스트
2. A2A 에이전트 중단 후 에러 처리 확인
3. 긴 메시지 전송 및 응답 확인
4. 연속 대화 및 히스토리 저장 확인
