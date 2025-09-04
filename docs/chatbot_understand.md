# @ai-chatbot-main/ A2A Agent 등록 및 사용 플로우 상세 분석

## 1. 전체 흐름 개요
@ai-chatbot-main/에서 A2A Agent를 등록하고 사용하는 과정은 다음과 같습니다:

1. 사용자가 '/agents' 페이지에서 "Add New Agent" 버튼 클릭
2. Agent URL 입력 후 "Fetch Agent Info" 버튼으로 Agent Card 정보 가져오기 (서버사이드 검증)
3. Agent 정보 확인 후 "Register Agent" 버튼으로 등록
4. 등록된 Agent는 데이터베이스에 저장되지만, **현재 대화에서는 직접 사용되지 않음**

⚠️ **중요**: 현재 구현에서는 A2A Agent 등록 기능만 있고, 실제 대화에서 등록된 Agent를 활용하는 기능은 아직 구현되지 않았습니다.

## 2. 파일별 상세 역할

### 2.1 Agent 관리 페이지 - app/(chat)/agents/page.tsx
**파일**: `ai-chatbot-main/app/(chat)/agents/page.tsx`
- **역할**: A2A Agent 관리 페이지의 메인 컴포넌트
- **관련 코드**:
  ```typescript
  export default function AgentsPage() {
    const { data: agents, error, isLoading } = useSWR('/api/agents', fetcher)  // 10행: Agent 목록 조회
    
    return (
      <div className="h-full flex flex-col p-4 md:p-6 gap-6">
        <header>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">
              A2A Agent Management  // 17행: 페이지 제목
            </h1>
            <AgentRegistrationDialog />  // 19행: Agent 등록 다이얼로그
          </div>
        </header>
        <main className="flex-1">
          {agents && <AgentList agents={agents} />}  // 34행: Agent 목록 표시
        </main>
      </div>
    )
  }
  ```

### 2.2 Agent 등록 다이얼로그 - components/agent-registration-dialog.tsx
**파일**: `ai-chatbot-main/components/agent-registration-dialog.tsx`

#### 2.2.1 상태 관리 (27-32행)
```typescript
export function AgentRegistrationDialog() {
  const [open, setOpen] = useState(false)           // 다이얼로그 열림/닫힘
  const [url, setUrl] = useState('')                // Agent URL 입력값
  const [isFetchingCard, setIsFetchingCard] = useState(false)  // Agent Card 조회 중
  const [isSaving, setIsSaving] = useState(false)   // Agent 저장 중
  const [agentCard, setAgentCard] = useState<AgentCard | null>(null)  // Agent Card 정보
  const [error, setError] = useState<string | null>(null)  // 에러 메시지
}
```

#### 2.2.2 Agent Card 정보 조회 함수 (42-66행)
```typescript
const handleFetchCard = async () => {
  setError(null)
  setAgentCard(null)
  if (!url) {
    setError('Please enter a URL.')
    return
  }
  setIsFetchingCard(true)
  try {
    const res = await fetch('/api/agents/validate', {  // 51행: 서버사이드 검증 API 호출
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const result = await res.json()
    if (!res.ok) {
      throw new Error(result.error || 'Could not fetch agent information from the URL.')
    }
    setAgentCard(result)  // 60행: Agent Card 정보 저장
  } catch (e) {
    setError((e as Error).message)
  } finally {
    setIsFetchingCard(false)
  }
}
```

#### 2.2.3 Agent 저장 함수 (68-94행)
```typescript
const handleSave = async () => {
  if (!url || !agentCard) return
  setIsSaving(true)
  setError(null)
  try {
    const res = await fetch('/api/agents', {  // 73행: Agent 등록 API 호출
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        name: agentCard.name,
        description: agentCard.description,
      }),
    })
    const result = await res.json()
    if (!res.ok) {
      throw new Error(result.error || 'Failed to register agent.')
    }
    toast({ type: 'success', description: 'Agent registered successfully!' })  // 86행: 성공 메시지
    mutate('/api/agents')  // 87행: Agent 목록 갱신
    setOpen(false)  // 88행: 다이얼로그 닫기
  } catch (e) {
    setError((e as Error).message)
  } finally {
    setIsSaving(false)
  }
}
```

### 2.3 Agent Card 검증 API - app/(chat)/api/agents/validate/route.ts
**파일**: `ai-chatbot-main/app/(chat)/api/agents/validate/route.ts`
- **역할**: 서버사이드에서 Agent Card를 가져와서 검증하는 API

#### 2.3.1 Agent Card 조회 함수 (9-41행)
```typescript
async function getAgentCard(url: string) {
  try {
    // URL 프로토콜 확인
    let agentUrl = url
    if (!agentUrl.startsWith('http://') && !agentUrl.startsWith('https://')) {
      agentUrl = 'http://' + agentUrl  // 14행: 프로토콜 자동 추가
    }
    
    // trailing slash 제거하여 이중 슬래시 방지
    agentUrl = agentUrl.replace(/\/$/, '')  // 18행: 이중 슬래시 방지
    
    // Agent Card 경로 추가
    const agentCardUrl = `${agentUrl}${AGENT_CARD_WELL_KNOWN_PATH}`  // 21행: /.well-known/agent-card.json 경로 추가
    
    const response = await fetch(agentCardUrl)  // 23행: HTTP GET 요청
    if (!response.ok) {
      return null
    }
    const card = await response.json()  // 27행: JSON 파싱
    // Agent Card 유효성 검증
    if (card.name && card.description && card.api_url) {
      return {
        name: card.name,
        description: card.description,
        api_url: card.api_url  // 33행: Agent Card 정보 반환
      }
    }
    return null
  } catch (error) {
    console.error('Failed to fetch agent card:', error)
    return null
  }
}
```

#### 2.3.2 검증 API 엔드포인트 (47-82행)
```typescript
export const POST = auth(async (req) => {
  if (!req.auth?.user?.id) {
    return new Response('Unauthorized', { status: 401 })  // 48행: 인증 확인
  }

  const body = await req.json()
  const parsed = ValidateSchema.safeParse(body)  // 53행: 입력 검증

  if (!parsed.success) {
    return NextResponse.json({ 
      error: 'Invalid input',
      details: parsed.error.errors 
    }, { status: 400 })
  }

  const { url } = parsed.data

  // URL 형식 검증 (localhost, http, https 허용)
  const isValidUrl = url.includes('localhost') || url.startsWith('http://') || url.startsWith('https://')  // 65행: URL 형식 검증
  if (!isValidUrl) {
    return NextResponse.json({
      error: 'Please enter a valid URL (e.g., http://localhost:10000 or https://example.com)'
    }, { status: 400 })
  }

  const agentCard = await getAgentCard(url)  // 72행: Agent Card 조회

  if (!agentCard) {
    return NextResponse.json(
      { error: 'Failed to retrieve a valid AgentCard from the URL. Please check if the agent is running and accessible.' },
      { status: 400 }
    )
  }

  return NextResponse.json(agentCard, { status: 200 })  // 81행: Agent Card 정보 반환
})
```

### 2.4 Agent 관리 API - app/(chat)/api/agents/route.ts
**파일**: `ai-chatbot-main/app/(chat)/api/agents/route.ts`

#### 2.4.1 Agent 목록 조회 (GET 엔드포인트, 10-17행)
```typescript
export const GET = auth(async (req) => {
  if (!req.auth?.user?.id) {
    return new Response('Unauthorized', { status: 401 })  // 12행: 인증 확인
  }
  const userId = req.auth.user.id
  const agents = await getAgentsByUserId(userId)  // 15행: 사용자의 Agent 목록 조회
  return NextResponse.json(agents)  // 16행: Agent 목록 반환
})
```

#### 2.4.2 Agent 등록 (POST 엔드포인트, 59-92행)
```typescript
export const POST = auth(async (req) => {
  if (!req.auth?.user?.id) {
    return new Response('Unauthorized', { status: 401 })  // 61행: 인증 확인
  }
  const userId = req.auth.user.id

  const body = await req.json()
  const parsed = PostSchema.safeParse(body)  // 66행: 입력 검증

  if (!parsed.success) {
    return NextResponse.json({ 
      error: 'Invalid input',
      details: parsed.error.errors 
    }, { status: 400 })
  }

  const { url, name, description } = parsed.data

  try {
    const newAgent = await createAgent({  // 78행: 데이터베이스에 Agent 생성
      userId,
      url,
      name,
      description: description || null
    })
    return NextResponse.json(newAgent, { status: 201 })  // 84행: 생성된 Agent 정보 반환
  } catch (error) {
    // URL 중복 등 제약 조건 위반 처리
    return NextResponse.json(
      { error: 'This agent URL is already registered.' },
      { status: 409 }
    )
  }
})
```

### 2.5 Agent 삭제 API - app/(chat)/api/agents/[id]/route.ts
**파일**: `ai-chatbot-main/app/(chat)/api/agents/[id]/route.ts`

```typescript
export const DELETE = auth(
  async (req, { params }: { params: { id: string } }) => {
    if (!req.auth?.user?.id) {
      return new Response('Unauthorized', { status: 401 })  // 8행: 인증 확인
    }
    const userId = req.auth.user.id
    const agentId = params.id  // 11행: URL 파라미터에서 Agent ID 추출

    try {
      await deleteAgentById(agentId, userId)  // 14행: Agent 삭제 (소유자 확인 포함)
      return NextResponse.json({ success: true }, { status: 200 })  // 15행: 성공 응답
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to delete agent.' },
        { status: 500 }
      )
    }
  }
)
```

### 2.6 Agent 목록 컴포넌트 - components/agent-list.tsx
**파일**: `ai-chatbot-main/components/agent-list.tsx`

#### 2.6.1 Agent 삭제 함수 (40-55행)
```typescript
export function AgentList({ agents }: AgentListProps) {
  const handleDelete = async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}`, {  // 42행: Agent 삭제 API 호출
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('Failed to delete agent.')
      }

      toast({ type: 'success', description: 'Agent deleted successfully.' })  // 50행: 성공 메시지
      mutate('/api/agents')  // 51행: Agent 목록 갱신
    } catch (error) {
      toast({ type: 'error', description: (error as Error).message })
    }
  }
}
```

#### 2.6.2 Agent 목록 테이블 렌더링 (57-111행)
```typescript
return (
  <div className="rounded-md border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>        // 62행: Agent 이름 컬럼
          <TableHead>Description</TableHead> // 63행: Agent 설명 컬럼
          <TableHead>URL</TableHead>         // 64행: Agent URL 컬럼
          <TableHead className="text-right">Actions</TableHead>  // 65행: 액션 컬럼
        </TableRow>
      </TableHeader>
      <TableBody>
        {agents.length > 0 ? (
          agents.map((agent) => (
            <TableRow key={agent.id}>
              <TableCell className="font-medium">{agent.name}</TableCell>      // 72행: Agent 이름 표시
              <TableCell>{agent.description}</TableCell>                       // 73행: Agent 설명 표시
              <TableCell className="text-muted-foreground">{agent.url}</TableCell>  // 74행: Agent URL 표시
              <TableCell className="text-right">
                <AlertDialog>  // 76행: 삭제 확인 다이얼로그
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <TrashIcon />  // 79행: 삭제 아이콘
                    </Button>
                  </AlertDialogTrigger>
                  {/* 삭제 확인 다이얼로그 내용 */}
                </AlertDialog>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={4} className="h-24 text-center">
              No agents registered yet.  // 103행: Agent가 없을 때 메시지
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  </div>
)
```

### 2.7 데이터베이스 스키마 - lib/db/schema.ts
**파일**: `ai-chatbot-main/lib/db/schema.ts`

#### 2.7.1 Agents 테이블 정의 (223-232행)
```typescript
export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().notNull(),           // 224행: Agent 고유 ID
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),  // 227행: 사용자 ID (외래키, 캐스케이드 삭제)
  url: text('url').notNull().unique(),             // 228행: Agent URL (유니크 제약)
  name: text('name').notNull(),                    // 229행: Agent 이름
  description: text('description'),                // 230행: Agent 설명 (선택적)
  createdAt: timestamp('created_at').defaultNow().notNull()  // 231행: 생성 시간
});
```

#### 2.7.2 Agent 관계 정의 (234-239행)
```typescript
export const agentRelations = relations(agents, ({ one }) => ({
  user: one(user, {  // 235행: Agent와 User 간의 관계 정의
    fields: [agents.userId],
    references: [user.id]
  })
}));
```

### 2.8 데이터베이스 쿼리 - lib/db/queries.ts
**파일**: `ai-chatbot-main/lib/db/queries.ts`

#### 2.8.1 Agent 생성 함수 (538-549행)
```typescript
export async function createAgent(
  agentData: Omit<typeof agents.$inferInsert, 'id' | 'createdAt'>  // 539행: id와 createdAt 제외한 Agent 데이터
) {
  const newAgent = await db
    .insert(agents)
    .values({
      id: `agent_${nanoid()}`,  // 544행: 고유 ID 생성 (agent_ 접두사 + nanoid)
      ...agentData
    })
    .returning()  // 547행: 생성된 Agent 정보 반환
  return newAgent[0]
}
```

#### 2.8.2 사용자별 Agent 목록 조회 (551-556행)
```typescript
export async function getAgentsByUserId(userId: string) {
  return await db.query.agents.findMany({
    where: (a, { eq }) => eq(a.userId, userId),      // 553행: 특정 사용자의 Agent만 조회
    orderBy: (a, { desc }) => desc(a.createdAt)      // 554행: 생성일 역순 정렬
  })
}
```

#### 2.8.3 Agent 삭제 함수 (558-563행)
```typescript
export async function deleteAgentById(id: string, userId: string) {
  await db
    .delete(agents)
    .where(and(eq(agents.id, id), eq(agents.userId, userId)))  // 561행: Agent ID와 사용자 ID 모두 확인
  return { success: true }
}
```

## 3. 대화에서의 Agent 사용 (현재 미구현)

⚠️ **현재 상태**: A2A Agent 등록 기능은 완성되었지만, 실제 대화에서 등록된 Agent를 활용하는 기능은 아직 구현되지 않았습니다.

### 3.1 현재 대화 처리 - app/(chat)/api/chat/route.ts
**파일**: `ai-chatbot-main/app/(chat)/api/chat/route.ts`

현재 대화 API는 등록된 A2A Agent와 연동되지 않고, 일반적인 AI 도구들만 사용합니다:

```typescript
const stream = createUIMessageStream({
  execute: ({ writer: dataStream }) => {
    const result = streamText({
      model: myProvider.languageModel(selectedChatModel),  // 155행: Google Gemini 모델 사용
      system: systemPrompt({ selectedChatModel, requestHints }),
      messages: convertToModelMessages(uiMessages),
      // 현재 사용되는 도구들 (A2A Agent 없음)
      experimental_activeTools: [
        'google_search',      // 163행: Google 검색
        'createDocument',     // 164행: 문서 생성
        'updateDocument',     // 165행: 문서 업데이트
        'requestSuggestions', // 166행: 제안 요청
      ],
      tools: {
        google_search: google.tools.googleSearch({}),  // 170행: Google 검색 도구
        createDocument: createDocument({ session, dataStream }),
        updateDocument: updateDocument({ session, dataStream }),
        requestSuggestions: requestSuggestions({ session, dataStream }),
      },
    });
  }
});
```

### 3.2 향후 구현이 필요한 부분

1. **Agent 통합 도구 개발**: 등록된 A2A Agent를 AI 도구로 변환하는 로직
2. **Agent 호출 메커니즘**: Agent의 API 엔드포인트로 요청을 전송하는 기능
3. **Agent 응답 처리**: Agent로부터 받은 응답을 대화 스트림에 통합
4. **Agent 선택 UI**: 사용자가 특정 Agent를 선택할 수 있는 인터페이스

## 4. 핵심 차이점: @ui/ vs @ai-chatbot-main/

### 4.1 아키텍처 차이점

| 항목 | @ui/ (Python/Mesop) | @ai-chatbot-main/ (Next.js) |
|------|---------------------|------------------------------|
| **Agent 사용** | ✅ 실제 A2A 프레임워크와 연동 | ❌ 등록만 가능, 사용 미구현 |
| **Agent 저장** | 메모리 (재시작 시 초기화) | PostgreSQL (영구 저장) |
| **Agent Card 조회** | 프론트엔드 + 백엔드 이중 검증 | 백엔드에서만 검증 |
| **Host Agent** | ADK Host Manager로 Agent 관리 | 해당 개념 없음 |
| **대화 연동** | Host Runner를 통한 Agent 호출 | 일반 AI 도구만 사용 |

### 4.2 등록 과정 비교

#### @ui/의 등록 과정:
1. 프론트엔드에서 Agent Card 조회
2. 사용자 확인 후 백엔드로 전송
3. 백엔드에서 다시 Agent Card 조회 (이중 검증)
4. Host Agent에 등록 + 메모리 저장
5. 즉시 대화에서 사용 가능

#### @ai-chatbot-main/의 등록 과정:
1. 백엔드에서만 Agent Card 조회
2. 사용자 확인 후 데이터베이스에 저장
3. **대화에서 사용 불가** (미구현)

## 5. 핵심 포인트

1. **등록 vs 사용**: 현재는 Agent 등록만 가능하고, 실제 대화에서는 사용되지 않음
2. **서버사이드 검증**: CORS 문제를 피하기 위해 Agent Card 조회를 서버에서 수행
3. **데이터베이스 저장**: @ui/와 달리 PostgreSQL에 영구 저장
4. **사용자별 관리**: 각 사용자가 자신만의 Agent 목록을 관리
5. **표준 경로 사용**: `/.well-known/agent-card.json` A2A 표준 준수
6. **URL 중복 방지**: 동일한 Agent URL은 한 번만 등록 가능
7. **미완성 기능**: A2A Agent를 실제 대화에서 활용하는 부분은 아직 구현되지 않음

## 6. 향후 개발 방향

A2A Agent를 실제 대화에서 사용하려면 다음과 같은 개발이 필요합니다:

1. **Agent 도구 변환**: 등록된 Agent를 AI SDK의 tool 형태로 변환
2. **Agent API 호출**: Agent의 `api_url`로 실제 요청 전송
3. **응답 스트리밍**: Agent 응답을 대화 스트림에 통합
4. **Agent 선택 UI**: 사용자가 특정 Agent를 활성화/비활성화할 수 있는 기능
5. **에러 처리**: Agent 호출 실패 시 적절한 fallback 처리
