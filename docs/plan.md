# A2A Agent 통합 구현 계획

## 1. 개요

`@a2a-host.py`의 A2A 에이전트 기능을 `@ai-chatbot-main/` Next.js 프로젝트에 통합하여 A2A 프로토콜을 통한 다중 에이전트 대화 시스템을 구현합니다.

## 2. 현재 상황 분석

### 2.1 기존 @a2a-host.py 구조
- **HostAgent 클래스**: 다중 에이전트 오케스트레이션
- **RemoteAgentConnections**: 원격 에이전트와의 통신
- **Google ADK Runner**: 비동기 메시지 처리
- **Agent Card 관리**: 에이전트 등록 및 메타데이터 관리

### 2.2 @ai-chatbot-main/ 현재 상태
- Next.js 14 + AI SDK 기반 챗봇
- PostgreSQL + Drizzle ORM
- Auth.js 인증
- 단일 AI 모델 (Gemini/OpenAI) 통신

## 3. 단계별 구현 계획

### 3.1 Phase 1: 환경 설정 및 종속성 설치

#### 3.1.1 A2A SDK 설치
```bash
# A2A JavaScript SDK 설치
npm install @a2a/js-sdk

# 추가 종속성 설치
npm install ws uuid ajv
npm install @types/ws @types/uuid --save-dev
```

#### 3.1.2 환경 변수 설정
```env
# .env.local에 추가
A2A_HOST_PORT=3001
A2A_HOST_URL=http://localhost:3001
A2A_ENABLE_LOGGING=true
```

### 3.2 Phase 2: 데이터베이스 스키마 확장

#### 3.2.1 A2A 관련 테이블 추가
```sql
-- lib/db/schema.ts에 추가할 스키마

// A2A 에이전트 정보 테이블
export const a2aAgents = pgTable('a2a_agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  apiUrl: text('api_url').notNull(),
  agentCardUrl: text('agent_card_url').notNull(),
  isActive: boolean('is_active').default(true),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// A2A 대화 세션 테이블
export const a2aSessions = pgTable('a2a_sessions', {
  id: text('id').primaryKey(),
  chatId: text('chat_id').references(() => chat.id, { onDelete: 'cascade' }),
  hostAgentId: text('host_agent_id'),
  sessionState: json('session_state'), // A2A 세션 상태 저장
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// A2A 태스크 추적 테이블
export const a2aTasks = pgTable('a2a_tasks', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => a2aSessions.id),
  agentName: text('agent_name').notNull(),
  taskType: text('task_type').notNull(), // 'send_message', 'delegate', etc.
  taskState: text('task_state').notNull(), // 'pending', 'running', 'completed', 'failed'
  inputMessage: text('input_message'),
  outputMessage: text('output_message'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

#### 3.2.2 관계 정의 및 타입 추가
```typescript
// lib/db/schema.ts에 관계 정의 추가
export const a2aAgentRelations = relations(a2aAgents, ({ one, many }) => ({
  user: one(user, {
    fields: [a2aAgents.userId],
    references: [user.id],
  }),
  sessions: many(a2aSessions),
}));

export const a2aSessionRelations = relations(a2aSessions, ({ one, many }) => ({
  chat: one(chat, {
    fields: [a2aSessions.chatId],
    references: [chat.id],
  }),
  tasks: many(a2aTasks),
}));

// 타입 정의
export type A2AAgent = InferSelectModel<typeof a2aAgents>;
export type A2ASession = InferSelectModel<typeof a2aSessions>;
export type A2ATask = InferSelectModel<typeof a2aTasks>;
```

### 3.3 Phase 3: A2A Core 라이브러리 구현

#### 3.3.1 A2A 클라이언트 래퍼 구현
```typescript
// lib/a2a/client.ts
import { A2AClient, AgentCard, Message, Task } from '@a2a/js-sdk';

export interface A2AClientConfig {
  hostUrl: string;
  agentCard: AgentCard;
  httpTimeout?: number;
}

export class A2AClientWrapper {
  private client: A2AClient;
  private config: A2AClientConfig;

  constructor(config: A2AClientConfig) {
    this.config = config;
    this.client = new A2AClient({
      hostUrl: config.hostUrl,
      agentCard: config.agentCard,
      timeout: config.httpTimeout || 30000,
    });
  }

  async sendMessage(
    targetAgent: string,
    message: string,
    contextId?: string,
    taskId?: string
  ): Promise<Message | Task> {
    try {
      const messagePayload = {
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: message }],
        messageId: crypto.randomUUID(),
        contextId,
        taskId,
      };

      const response = await this.client.sendMessage({
        id: crypto.randomUUID(),
        message: messagePayload,
        configuration: {
          acceptedOutputModes: ['text', 'text/plain'],
        },
      });

      return response;
    } catch (error) {
      console.error('A2A message send failed:', error);
      throw error;
    }
  }

  async getAgentCard(url: string): Promise<AgentCard> {
    return await this.client.getAgentCard(url);
  }

  async validateAgent(url: string): Promise<boolean> {
    try {
      const card = await this.getAgentCard(url);
      return !!(card.name && card.description && card.api_url);
    } catch {
      return false;
    }
  }
}
```

#### 3.3.2 Host Agent 관리자 구현
```typescript
// lib/a2a/host-manager.ts
import { A2AClientWrapper } from './client';
import { A2AAgent, A2ASession, A2ATask } from '@/lib/db/schema';

export interface HostAgentConfig {
  userId: string;
  sessionId: string;
  registeredAgents: A2AAgent[];
}

export class HostAgentManager {
  private clients: Map<string, A2AClientWrapper> = new Map();
  private config: HostAgentConfig;
  private currentSession?: A2ASession;

  constructor(config: HostAgentConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    // 등록된 에이전트들에 대한 클라이언트 초기화
    for (const agent of this.config.registeredAgents) {
      try {
        const client = new A2AClientWrapper({
          hostUrl: agent.apiUrl,
          agentCard: {
            name: agent.name,
            description: agent.description || '',
            api_url: agent.apiUrl,
          },
        });

        // 에이전트 유효성 검사
        const isValid = await client.validateAgent(agent.agentCardUrl);
        if (isValid) {
          this.clients.set(agent.name, client);
        } else {
          console.warn(`Agent ${agent.name} validation failed`);
        }
      } catch (error) {
        console.error(`Failed to initialize agent ${agent.name}:`, error);
      }
    }
  }

  getAvailableAgents(): string[] {
    return Array.from(this.clients.keys());
  }

  async delegateToAgent(
    agentName: string,
    message: string,
    contextId?: string
  ): Promise<{
    success: boolean;
    response?: string;
    taskId?: string;
    error?: string;
  }> {
    const client = this.clients.get(agentName);
    if (!client) {
      return {
        success: false,
        error: `Agent ${agentName} not available`,
      };
    }

    try {
      const response = await client.sendMessage(
        agentName,
        message,
        contextId
      );

      if ('parts' in response) {
        // Message 타입 응답
        const textParts = response.parts
          .filter(part => part.type === 'text')
          .map(part => 'text' in part ? part.text : '')
          .join('');

        return {
          success: true,
          response: textParts,
        };
      } else {
        // Task 타입 응답
        return {
          success: true,
          taskId: response.id,
          response: response.status.message?.parts
            ?.filter(part => part.type === 'text')
            .map(part => 'text' in part ? part.text : '')
            .join('') || 'Task created',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async processUserMessage(message: string): Promise<{
    agentName?: string;
    response: string;
    requiresDelegation: boolean;
  }> {
    // 사용자 메시지 분석 및 적절한 에이전트 선택 로직
    const availableAgents = this.getAvailableAgents();
    
    if (availableAgents.length === 0) {
      return {
        response: "현재 사용 가능한 A2A 에이전트가 없습니다.",
        requiresDelegation: false,
      };
    }

    // 간단한 키워드 기반 에이전트 선택 (실제로는 더 정교한 로직 필요)
    const selectedAgent = this.selectBestAgent(message, availableAgents);
    
    if (selectedAgent) {
      const result = await this.delegateToAgent(selectedAgent, message);
      
      if (result.success) {
        return {
          agentName: selectedAgent,
          response: result.response || "작업이 완료되었습니다.",
          requiresDelegation: true,
        };
      } else {
        return {
          response: `에이전트 ${selectedAgent}와의 통신에 실패했습니다: ${result.error}`,
          requiresDelegation: false,
        };
      }
    }

    return {
      response: "적절한 에이전트를 찾을 수 없습니다.",
      requiresDelegation: false,
    };
  }

  private selectBestAgent(message: string, availableAgents: string[]): string | null {
    // 실제로는 더 정교한 에이전트 선택 로직이 필요
    // 메시지 내용, 에이전트 능력, 과거 성과 등을 고려
    
    // 임시로 첫 번째 에이전트 반환
    return availableAgents[0] || null;
  }
}
```

### 3.4 Phase 4: 데이터베이스 쿼리 함수 구현

#### 3.4.1 A2A 에이전트 관련 쿼리
```typescript
// lib/db/queries.ts에 추가
import { a2aAgents, a2aSessions, a2aTasks } from './schema';

// A2A 에이전트 CRUD
export async function createA2AAgent({
  id,
  name,
  description,
  apiUrl,
  agentCardUrl,
  userId,
}: {
  id: string;
  name: string;
  description?: string;
  apiUrl: string;
  agentCardUrl: string;
  userId: string;
}) {
  const [agent] = await db
    .insert(a2aAgents)
    .values({
      id,
      name,
      description,
      apiUrl,
      agentCardUrl,
      userId,
    })
    .returning();

  return agent;
}

export async function getA2AAgentsByUserId({ userId }: { userId: string }) {
  return await db
    .select()
    .from(a2aAgents)
    .where(and(eq(a2aAgents.userId, userId), eq(a2aAgents.isActive, true)))
    .orderBy(desc(a2aAgents.createdAt));
}

export async function deleteA2AAgentById({ id, userId }: { id: string; userId: string }) {
  const [agent] = await db
    .update(a2aAgents)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(a2aAgents.id, id), eq(a2aAgents.userId, userId)))
    .returning();

  return agent;
}

// A2A 세션 관리
export async function createA2ASession({
  id,
  chatId,
  hostAgentId,
  sessionState,
}: {
  id: string;
  chatId: string;
  hostAgentId?: string;
  sessionState?: any;
}) {
  const [session] = await db
    .insert(a2aSessions)
    .values({
      id,
      chatId,
      hostAgentId,
      sessionState,
    })
    .returning();

  return session;
}

export async function getA2ASessionByChatId({ chatId }: { chatId: string }) {
  const [session] = await db
    .select()
    .from(a2aSessions)
    .where(and(eq(a2aSessions.chatId, chatId), eq(a2aSessions.isActive, true)));

  return session;
}

export async function updateA2ASessionState({
  sessionId,
  sessionState,
}: {
  sessionId: string;
  sessionState: any;
}) {
  const [session] = await db
    .update(a2aSessions)
    .set({ sessionState, updatedAt: new Date() })
    .where(eq(a2aSessions.id, sessionId))
    .returning();

  return session;
}

// A2A 태스크 추적
export async function createA2ATask({
  id,
  sessionId,
  agentName,
  taskType,
  taskState,
  inputMessage,
  metadata,
}: {
  id: string;
  sessionId: string;
  agentName: string;
  taskType: string;
  taskState: string;
  inputMessage?: string;
  metadata?: any;
}) {
  const [task] = await db
    .insert(a2aTasks)
    .values({
      id,
      sessionId,
      agentName,
      taskType,
      taskState,
      inputMessage,
      metadata,
    })
    .returning();

  return task;
}

export async function updateA2ATaskState({
  taskId,
  taskState,
  outputMessage,
  metadata,
}: {
  taskId: string;
  taskState: string;
  outputMessage?: string;
  metadata?: any;
}) {
  const [task] = await db
    .update(a2aTasks)
    .set({
      taskState,
      outputMessage,
      metadata,
      updatedAt: new Date(),
    })
    .where(eq(a2aTasks.id, taskId))
    .returning();

  return task;
}

export async function getA2ATasksBySessionId({ sessionId }: { sessionId: string }) {
  return await db
    .select()
    .from(a2aTasks)
    .where(eq(a2aTasks.sessionId, sessionId))
    .orderBy(desc(a2aTasks.createdAt));
}
```

### 3.5 Phase 5: API 엔드포인트 구현

#### 3.5.1 A2A 에이전트 관리 API
```typescript
// app/(chat)/api/a2a/agents/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { 
  createA2AAgent, 
  getA2AAgentsByUserId, 
  deleteA2AAgentById 
} from '@/lib/db/queries';
import { A2AClientWrapper } from '@/lib/a2a/client';
import { nanoid } from 'nanoid';
import { z } from 'zod';

const CreateAgentSchema = z.object({
  agentCardUrl: z.string().url(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const agents = await getA2AAgentsByUserId({ userId: session.user.id });
    return NextResponse.json(agents);
  } catch (error) {
    console.error('Failed to get A2A agents:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = await request.json();
    const { agentCardUrl } = CreateAgentSchema.parse(body);

    // Agent Card 유효성 검사
    const client = new A2AClientWrapper({
      hostUrl: 'temp',
      agentCard: { name: 'temp', description: '', api_url: 'temp' },
    });

    const agentCard = await client.getAgentCard(agentCardUrl);
    
    if (!agentCard.name || !agentCard.api_url) {
      return NextResponse.json(
        { error: 'Invalid agent card' },
        { status: 400 }
      );
    }

    // 에이전트 저장
    const newAgent = await createA2AAgent({
      id: nanoid(),
      name: agentCard.name,
      description: agentCard.description,
      apiUrl: agentCard.api_url,
      agentCardUrl,
      userId: session.user.id,
    });

    return NextResponse.json(newAgent, { status: 201 });
  } catch (error) {
    console.error('Failed to create A2A agent:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }

    return new Response('Internal Server Error', { status: 500 });
  }
}
```

#### 3.5.2 A2A 에이전트 개별 관리 API
```typescript
// app/(chat)/api/a2a/agents/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { deleteA2AAgentById } from '@/lib/db/queries';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const deletedAgent = await deleteA2AAgentById({
      id,
      userId: session.user.id,
    });

    if (!deletedAgent) {
      return new Response('Agent not found', { status: 404 });
    }

    return NextResponse.json(deletedAgent);
  } catch (error) {
    console.error('Failed to delete A2A agent:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
```

### 3.6 Phase 6: 채팅 시스템과 A2A 통합

#### 3.6.1 채팅 API 수정
```typescript
// app/(chat)/api/chat/route.ts 수정
import { HostAgentManager } from '@/lib/a2a/host-manager';
import { 
  getA2AAgentsByUserId, 
  getA2ASessionByChatId, 
  createA2ASession 
} from '@/lib/db/queries';

// POST 함수 내부에 A2A 로직 추가
export async function POST(request: Request) {
  // ... 기존 코드 ...

  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  // A2A 에이전트 확인
  const a2aAgents = await getA2AAgentsByUserId({ userId: session.user.id });
  const hasA2AAgents = a2aAgents.length > 0;

  if (hasA2AAgents) {
    // A2A 세션 확인 또는 생성
    let a2aSession = await getA2ASessionByChatId({ chatId: id });
    
    if (!a2aSession) {
      a2aSession = await createA2ASession({
        id: generateUUID(),
        chatId: id,
        hostAgentId: session.user.id,
      });
    }

    // Host Agent Manager 초기화
    const hostManager = new HostAgentManager({
      userId: session.user.id,
      sessionId: a2aSession.id,
      registeredAgents: a2aAgents,
    });

    await hostManager.initialize();

    // 사용자 메시지를 A2A 시스템으로 처리
    const userMessageText = message.parts
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join(' ');

    const a2aResult = await hostManager.processUserMessage(userMessageText);

    if (a2aResult.requiresDelegation && a2aResult.agentName) {
      // A2A 에이전트로부터 응답을 받은 경우, 해당 응답을 반환
      const stream = createUIMessageStream({
        execute: ({ writer: dataStream }) => {
          dataStream.write({
            type: 'data-appendMessage',
            data: JSON.stringify({
              id: generateUUID(),
              role: 'assistant',
              parts: [{ type: 'text', text: a2aResult.response }],
              createdAt: new Date(),
            }),
          });
        },
        generateId: generateUUID,
        onFinish: async ({ messages }) => {
          await saveMessages({
            messages: messages.map((message) => ({
              id: message.id,
              role: message.role,
              parts: message.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
          });
        },
      });

      return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
    }
  }

  // A2A 처리가 없거나 실패한 경우 기존 AI 모델로 처리
  // ... 기존 AI 모델 처리 코드 ...
}
```

### 3.7 Phase 7: 프론트엔드 컴포넌트 구현

#### 3.7.1 A2A 에이전트 관리 페이지
```typescript
// app/(chat)/a2a/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { fetcher } from '@/lib/utils';
import { A2AAgentList } from '@/components/a2a/agent-list';
import { A2AAgentRegistrationDialog } from '@/components/a2a/agent-registration-dialog';

export default function A2APage() {
  const [showRegistrationDialog, setShowRegistrationDialog] = useState(false);
  
  const { 
    data: agents = [], 
    error, 
    isLoading,
    mutate 
  } = useSWR('/api/a2a/agents', fetcher);

  const handleAgentRegistered = () => {
    mutate();
    setShowRegistrationDialog(false);
  };

  const handleAgentDeleted = () => {
    mutate();
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6 gap-6">
      <header>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">A2A Agents</h1>
            <p className="text-muted-foreground">
              Manage your registered A2A agents
            </p>
          </div>
          <Button onClick={() => setShowRegistrationDialog(true)}>
            Add A2A Agent
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {isLoading ? (
          <div>Loading agents...</div>
        ) : error ? (
          <div>Error loading agents: {error.message}</div>
        ) : (
          <A2AAgentList 
            agents={agents} 
            onAgentDeleted={handleAgentDeleted}
          />
        )}
      </main>

      <A2AAgentRegistrationDialog
        open={showRegistrationDialog}
        onOpenChange={setShowRegistrationDialog}
        onAgentRegistered={handleAgentRegistered}
      />
    </div>
  );
}
```

#### 3.7.2 A2A 에이전트 등록 다이얼로그
```typescript
// components/a2a/agent-registration-dialog.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoaderIcon } from '@/components/icons';
import { toast } from '@/components/toast';

interface A2AAgentRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAgentRegistered: () => void;
}

export function A2AAgentRegistrationDialog({
  open,
  onOpenChange,
  onAgentRegistered,
}: A2AAgentRegistrationDialogProps) {
  const [agentCardUrl, setAgentCardUrl] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetState = () => {
    setAgentCardUrl('');
    setError(null);
    setIsRegistering(false);
  };

  const handleRegister = async () => {
    if (!agentCardUrl) {
      setError('Please enter an agent card URL.');
      return;
    }

    setIsRegistering(true);
    setError(null);

    try {
      const response = await fetch('/api/a2a/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentCardUrl }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to register agent');
      }

      toast({
        type: 'success',
        description: `Agent "${result.name}" registered successfully!`,
      });

      onAgentRegistered();
      resetState();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) resetState();
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Register A2A Agent</DialogTitle>
          <DialogDescription>
            Enter the agent card URL to register a new A2A agent.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="agentCardUrl">Agent Card URL</Label>
            <Input
              id="agentCardUrl"
              type="url"
              placeholder="https://example.com/.well-known/agent-card.json"
              value={agentCardUrl}
              onChange={(e) => setAgentCardUrl(e.target.value)}
              disabled={isRegistering}
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 mt-2">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isRegistering}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleRegister}
            disabled={!agentCardUrl || isRegistering}
          >
            {isRegistering && <LoaderIcon size={16} />}
            <span className={isRegistering ? "ml-2" : ""}>
              Register Agent
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

#### 3.7.3 A2A 에이전트 목록 컴포넌트
```typescript
// components/a2a/agent-list.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { TrashIcon, LoaderIcon } from '@/components/icons';
import { toast } from '@/components/toast';
import type { A2AAgent } from '@/lib/db/schema';

interface A2AAgentListProps {
  agents: A2AAgent[];
  onAgentDeleted: () => void;
}

export function A2AAgentList({ agents, onAgentDeleted }: A2AAgentListProps) {
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);

  const handleDelete = async (agent: A2AAgent) => {
    setDeletingAgentId(agent.id);

    try {
      const response = await fetch(`/api/a2a/agents/${agent.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete agent');
      }

      toast({
        type: 'success',
        description: `Agent "${agent.name}" deleted successfully!`,
      });

      onAgentDeleted();
    } catch (error) {
      toast({
        type: 'error',
        description: error instanceof Error ? error.message : 'Failed to delete agent',
      });
    } finally {
      setDeletingAgentId(null);
    }
  };

  if (agents.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No A2A agents registered yet. Click "Add A2A Agent" to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {agents.map((agent) => (
        <Card key={agent.id}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-lg">{agent.name}</CardTitle>
              <CardDescription>{agent.description}</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDelete(agent)}
              disabled={deletingAgentId === agent.id}
            >
              {deletingAgentId === agent.id ? (
                <LoaderIcon size={16} />
              ) : (
                <TrashIcon size={16} />
              )}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div>
                <span className="font-medium">API URL:</span> {agent.apiUrl}
              </div>
              <div>
                <span className="font-medium">Agent Card:</span> {agent.agentCardUrl}
              </div>
              <div>
                <span className="font-medium">Registered:</span>{' '}
                {new Date(agent.createdAt).toLocaleDateString()}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

### 3.8 Phase 8: 사이드바 네비게이션 추가

#### 3.8.1 사이드바에 A2A 페이지 링크 추가
```typescript
// components/app-sidebar.tsx 수정
import { PlusIcon, MessageIcon, MoreIcon } from './icons';

export function AppSidebar({ user }: { user: User | undefined }) {
  return (
    <Sidebar className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <VercelIcon />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Chat SDK</span>
                  <span className="truncate text-xs">by Vercel</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/">
                <PlusIcon size={16} />
                <span>New Chat</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          
          {/* A2A 페이지 링크 추가 */}
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/a2a">
                <MessageIcon size={16} />
                <span>A2A Agents</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {user && <SidebarHistory user={user} />}
      </SidebarContent>

      <SidebarFooter>
        {user && <SidebarUserNav user={user} />}
      </SidebarFooter>
    </Sidebar>
  );
}
```

### 3.9 Phase 9: 테스팅 및 디버깅

#### 3.9.1 단위 테스트 작성
```typescript
// tests/a2a/host-manager.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HostAgentManager } from '@/lib/a2a/host-manager';

describe('HostAgentManager', () => {
  let hostManager: HostAgentManager;

  beforeEach(() => {
    hostManager = new HostAgentManager({
      userId: 'test-user',
      sessionId: 'test-session',
      registeredAgents: [
        {
          id: 'agent-1',
          name: 'Test Agent',
          description: 'A test agent',
          apiUrl: 'http://localhost:9999',
          agentCardUrl: 'http://localhost:9999/.well-known/agent-card.json',
          isActive: true,
          userId: 'test-user',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      ],
    });
  });

  it('should initialize with registered agents', async () => {
    vi.spyOn(hostManager, 'initialize').mockResolvedValue();
    
    await hostManager.initialize();
    
    const availableAgents = hostManager.getAvailableAgents();
    expect(availableAgents).toContain('Test Agent');
  });

  it('should process user messages and delegate to appropriate agents', async () => {
    vi.spyOn(hostManager, 'delegateToAgent').mockResolvedValue({
      success: true,
      response: 'Test response from agent',
    });

    const result = await hostManager.processUserMessage('Hello, test message');
    
    expect(result.requiresDelegation).toBe(true);
    expect(result.response).toBe('Test response from agent');
  });
});
```

#### 3.9.2 통합 테스트
```typescript
// tests/a2a/integration.test.ts
import { describe, it, expect } from 'vitest';
import { createA2AAgent, getA2AAgentsByUserId } from '@/lib/db/queries';

describe('A2A Integration Tests', () => {
  it('should create and retrieve A2A agents', async () => {
    const agentData = {
      id: 'test-agent-id',
      name: 'Integration Test Agent',
      description: 'An agent for integration testing',
      apiUrl: 'http://localhost:9999',
      agentCardUrl: 'http://localhost:9999/.well-known/agent-card.json',
      userId: 'test-user-id',
    };

    await createA2AAgent(agentData);
    
    const agents = await getA2AAgentsByUserId({ userId: 'test-user-id' });
    
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('Integration Test Agent');
  });
});
```

### 3.10 Phase 10: 배포 준비

#### 3.10.1 환경 변수 문서화
```markdown
# A2A Environment Variables

## Required Variables
- `A2A_HOST_PORT`: Port for A2A host service (default: 3001)
- `A2A_HOST_URL`: URL for A2A host service (e.g., http://localhost:3001)
- `A2A_ENABLE_LOGGING`: Enable A2A logging (true/false)

## Optional Variables
- `A2A_HTTP_TIMEOUT`: HTTP timeout for A2A requests (default: 30000ms)
- `A2A_MAX_AGENTS_PER_USER`: Maximum agents per user (default: 10)
```

#### 3.10.2 Docker 설정 업데이트 (필요시)
```dockerfile
# Dockerfile에 A2A 관련 설정 추가
FROM node:18-alpine

# A2A 포트 노출
EXPOSE 3000 3001

# A2A 환경 변수 설정
ENV A2A_HOST_PORT=3001
ENV A2A_HOST_URL=http://localhost:3001
```

## 4. 구현 우선순위

### 4.1 High Priority (필수)
1. Phase 2: 데이터베이스 스키마 확장
2. Phase 3: A2A Core 라이브러리 구현
3. Phase 4: 데이터베이스 쿼리 함수 구현
4. Phase 5: API 엔드포인트 구현

### 4.2 Medium Priority (중요)
5. Phase 6: 채팅 시스템과 A2A 통합
6. Phase 7: 프론트엔드 컴포넌트 구현
7. Phase 8: 사이드바 네비게이션 추가

### 4.3 Low Priority (선택사항)
8. Phase 9: 테스팅 및 디버깅
9. Phase 10: 배포 준비

## 5. 예상 이슈 및 해결 방안

### 5.1 A2A SDK 호환성
- **이슈**: JavaScript A2A SDK와 Python 구현 간의 차이점
- **해결**: A2A 프로토콜 스펙을 정확히 따르고, 필요시 커스텀 래퍼 구현

### 5.2 비동기 처리
- **이슈**: A2A 에이전트와의 비동기 통신 처리
- **해결**: Promise 기반 처리와 적절한 타임아웃 설정

### 5.3 에러 핸들링
- **이슈**: A2A 에이전트 응답 실패 시 처리
- **해결**: 적절한 폴백 메커니즘과 사용자 알림

### 5.4 보안
- **이슈**: 외부 A2A 에이전트와의 통신 보안
- **해결**: HTTPS 강제, 인증 토큰 관리, 요청 검증

## 6. 성능 최적화 방안

### 6.1 캐싱
- A2A 에이전트 카드 정보 캐싱
- 자주 사용되는 에이전트 응답 캐싱

### 6.2 연결 풀링
- A2A 클라이언트 연결 재사용
- HTTP 연결 풀링

### 6.3 비동기 처리
- 에이전트 응답 대기 시 UI 블로킹 방지
- 백그라운드에서 에이전트 상태 확인

## 7. 모니터링 및 로깅

### 7.1 로깅
- A2A 요청/응답 로깅
- 에이전트 상태 변화 로깅
- 에러 발생 시 상세 로깅

### 7.2 메트릭스
- A2A 요청 성공률
- 에이전트 응답 시간
- 활성 에이전트 수

이 계획을 단계별로 따라 구현하면 `@a2a-host.py`의 기능을 `@ai-chatbot-main/`에 성공적으로 통합할 수 있습니다.
