# @ui/ A2A Agent 등록 및 사용 플로우 상세 분석

## 1. 전체 흐름 개요
@ui/ 데모에서 A2A Agent를 등록하고 사용하는 과정은 다음과 같은 단계로 진행됩니다:

1. 사용자가 '/agents' 페이지에서 "Add Agent" 버튼 클릭
2. Agent 주소(URL) 입력 후 "Read" 버튼으로 Agent Card 정보 가져오기
3. Agent 정보 확인 후 "Save" 버튼으로 등록
4. 등록된 Agent는 대화에서 사용 가능

## 2. 파일별 상세 역할

### 2.1 진입점 - main.py
**파일**: `demo/ui/main.py`
- **역할**: 웹 애플리케이션의 메인 진입점
- **관련 코드**:
  ```python
  @me.page(path='/agents', title='Agents', ...)
  def another_page():
      api_key_dialog()
      agent_list_page(me.state(AppState))  # Agent 목록 페이지 호출
  ```

### 2.2 Agent 목록 페이지 - pages/agent_list.py
**파일**: `demo/ui/pages/agent_list.py`

#### 2.2.1 페이지 렌더링 (15-69행)
```python
def agent_list_page(app_state: AppState) -> None:
    agents = asyncio.run(ListRemoteAgents())  # 22행: 등록된 Agent 목록 조회
    agents_list(agents)  # 23행: Agent 목록 표시
```

#### 2.2.2 Agent 등록 다이얼로그
- **30-34행**: Agent 주소 입력 필드
  ```python
  me.input(
      label='Agent Address',
      on_blur=set_agent_address,  # 입력값을 state에 저장
      placeholder='localhost:10000',
  )
  ```

#### 2.2.3 Agent 정보 읽기 버튼 (64-65행)
```python
if not state.agent_name:
    me.button('Read', on_click=load_agent_info)  # Agent Card 정보 가져오기
```

#### 2.2.4 Agent Card 정보 로드 함수 (76-102행)
```python
async def load_agent_info(e: me.ClickEvent) -> None:
    state = me.state(AgentState)
    try:
        agent_card_response = get_agent_card(state.agent_address)  # 80행: 핵심!
        # Agent Card 정보를 state에 저장
        state.agent_name = agent_card_response.name
        state.agent_description = agent_card_response.description
        # ... 기타 정보
    except Exception as e:
        state.error = f'Cannot connect to agent as {state.agent_address}'
```

#### 2.2.5 Agent 저장 함수 (109-116행)
```python
async def save_agent(e: me.ClickEvent) -> None:
    state = me.state(AgentState)
    await AddRemoteAgent(state.agent_address)  # 111행: 백엔드에 등록 요청
```

### 2.3 Agent Card 유틸리티 - utils/agent_card.py
**파일**: `demo/ui/utils/agent_card.py`
- **핵심 역할**: Agent Card JSON 파일을 HTTP로 가져오는 함수

```python
def get_agent_card(remote_agent_address: str) -> AgentCard:
    if not remote_agent_address.startswith(('http://', 'https://')):
        remote_agent_address = 'http://' + remote_agent_address  # 10행: 프로토콜 추가
    
    agent_card = requests.get(
        f'{remote_agent_address}{AGENT_CARD_WELL_KNOWN_PATH}'  # 12행: /.well-known/agent-card.json 경로로 요청
    )
    return AgentCard(**agent_card.json())  # 14행: JSON을 AgentCard 객체로 변환
```

### 2.4 백엔드 서비스 - state/host_agent_service.py
**파일**: `demo/ui/state/host_agent_service.py`

#### 2.4.1 Agent 목록 조회 (74-81행)
```python
async def ListRemoteAgents():
    client = ConversationClient(server_url)  # 백엔드 클라이언트 생성
    response = await client.list_agents(ListAgentRequest())
    return response.result
```

#### 2.4.2 Agent 등록 (83-89행)
```python
async def AddRemoteAgent(path: str):
    client = ConversationClient(server_url)  # 백엔드 클라이언트 생성
    await client.register_agent(RegisterAgentRequest(params=path))  # 86행: 등록 요청
```

### 2.5 백엔드 서버 - service/server/server.py
**파일**: `demo/ui/service/server/server.py`

#### 2.5.1 Agent 등록 엔드포인트 (76행)
```python
app.add_api_route('/agent/register', self._register_agent, methods=['POST'])
```

#### 2.5.2 Agent 등록 처리 (180-184행)
```python
async def _register_agent(self, request: Request):
    message_data = await request.json()
    url = message_data['params']  # 182행: URL 파라미터 추출
    self.manager.register_agent(url)  # 183행: 매니저에 등록 위임
    return RegisterAgentResponse()
```

### 2.6 Agent 매니저 - service/server/adk_host_manager.py
**파일**: `demo/ui/service/server/adk_host_manager.py`

#### 2.6.1 Agent 등록 실제 처리 (437-444행)
```python
def register_agent(self, url):
    agent_data = get_agent_card(url)  # 438행: Agent Card 정보 다시 가져오기
    if not agent_data.url:
        agent_data.url = url  # 440행: URL 설정
    self._agents.append(agent_data)  # 441행: 메모리에 저장
    self._host_agent.register_agent_card(agent_data)  # 442행: A2A 프레임워크에 등록
```

### 2.7 Agent 목록 표시 - components/agent_list.py
**파일**: `demo/ui/components/agent_list.py`
- **역할**: 등록된 Agent들을 테이블 형태로 표시
- **84-87행**: "Add Agent" 버튼 클릭 시 다이얼로그 열기

## 3. 핵심 데이터 플로우

### 3.1 Agent Card 정보 가져오기
1. **입력**: `http://localhost:10000` (사용자가 입력한 Agent 주소)
2. **utils/agent_card.py**: `http://` 프로토콜 확인 후 `/.well-known/agent-card.json` 경로 추가
3. **HTTP 요청**: `http://localhost:10000/.well-known/agent-card.json` 
4. **응답**: Agent Card JSON 데이터
5. **변환**: JSON → AgentCard 객체
6. **UI 표시**: Agent 이름, 설명, 기능 등 정보 표시

### 3.2 Agent 등록 과정
1. **프론트엔드**: `save_agent()` 함수에서 `AddRemoteAgent(url)` 호출
2. **클라이언트 레이어**: `ConversationClient`를 통해 `/agent/register` API 호출
3. **백엔드 서버**: `_register_agent()` 함수에서 URL 파라미터 추출
4. **매니저 레이어**: `ADKHostManager.register_agent()` 에서 실제 등록 처리
5. **중복 검증**: `get_agent_card()` 다시 호출하여 Agent Card 정보 재확인
6. **저장**: 메모리와 A2A 프레임워크에 Agent 정보 저장

## 4. 사용 시 동작

등록된 Agent는 다음과 같이 사용됩니다:
- 대화 페이지에서 메시지 전송 시 등록된 Agent들이 응답 가능
- A2A 프레임워크를 통해 Agent 간 통신 수행
- Agent의 capability에 따라 다양한 입출력 모드 지원

## 5. 등록된 A2A Agent 사용 과정

### 5.1 대화에서 메시지 전송
**파일**: `demo/ui/components/conversation.py`

#### 5.1.1 사용자 메시지 입력 (131-141행)
```python
me.input(
    label='How can I help you?',
    on_blur=on_blur,
    on_enter=send_message_enter,  # 엔터 키로 전송
)
# Send 버튼으로도 전송 가능
with me.content_button(on_click=send_message_button):
    me.icon(icon='send')
```

#### 5.1.2 메시지 전송 함수 (31-64행)
```python
async def send_message(message: str, message_id: str = ''):
    # 1. 현재 대화 찾기
    c = next((x for x in await ListConversations() 
             if x.conversation_id == state.conversation_id), None)
    
    # 2. Message 객체 생성
    request = Message(
        message_id=message_id,
        context_id=state.conversation_id,  # 대화 ID
        role=Role.user,                    # 사용자 역할
        parts=[Part(root=TextPart(text=message))]  # 텍스트 내용
    )
    
    # 3. UI 상태 업데이트 (즉시 표시)
    app_state.messages.append(convert_message_to_state(request))
    
    # 4. 백엔드로 메시지 전송 (핵심!)
    await SendMessage(request)
```

### 5.2 백엔드 메시지 처리
**파일**: `demo/ui/service/server/server.py`

#### 5.2.1 메시지 처리 엔드포인트 (90-118행)
```python
async def _send_message(self, request: Request):
    message_data = await request.json()
    message = Message(**message_data['params'])
    
    # 메시지를 매니저에 전달하여 처리 (핵심!)
    if isinstance(self.manager, ADKHostManager):
        # ADK를 사용하여 스레드에서 처리
        t = threading.Thread(
            target=lambda: self.manager.process_message_threadsafe(message, loop)
        )
    else:
        # 일반 비동기 처리
        t = threading.Thread(
            target=lambda: asyncio.run(self.manager.process_message(message))
        )
    t.start()  # 백그라운드 처리 시작
```

### 5.3 ADK Host Manager에서 Agent 처리
**파일**: `demo/ui/service/server/adk_host_manager.py`

#### 5.3.1 메시지 처리 시작 (144-182행)
```python
async def process_message(self, message: Message):
    # 1. 메시지를 pending 목록에 추가
    self._pending_message_ids.append(message.message_id)
    
    # 2. 대화와 메시지 저장
    conversation = self.get_conversation(message.context_id)
    self._messages.append(message)
    if conversation:
        conversation.messages.append(message)
    
    # 3. 사용자 이벤트 추가
    self.add_event(Event(
        id=str(uuid.uuid4()),
        actor='user',
        content=message,
        timestamp=datetime.datetime.utcnow().timestamp(),
    ))
    
    # 4. 세션 상태 업데이트
    session = await self._session_service.get_session(
        app_name='A2A', 
        user_id='test_user', 
        session_id=message.context_id
    )
    
    # 5. ADK 이벤트 추가
    await self._session_service.append_event(session, ADKEvent(...))
```

#### 5.3.2 등록된 Agent들과 상호작용 (183-219행)
```python
# 6. 등록된 Agent들에게 메시지 전달 및 응답 처리 (핵심!)
async for event in self._host_runner.run_async(
    user_id=self.user_id,
    session_id=context_id,
    new_message=self.adk_content_from_message(message),  # 메시지 변환
):
    # 7. Agent로부터 받은 이벤트 처리
    if event.actions.state_delta and 'task_id' in event.actions.state_delta:
        task_id = event.actions.state_delta['task_id']
    
    # 8. 이벤트를 시스템 이벤트로 변환 저장
    self.add_event(Event(
        id=event.id,
        actor=event.author,  # Agent 이름
        content=await self.adk_content_to_message(event.content, context_id, task_id),
        timestamp=event.timestamp,
    ))
    final_event = event

# 9. 최종 응답 메시지 생성
if final_event:
    final_event.content.role = 'model'  # Agent 응답으로 설정
    response = await self.adk_content_to_message(
        final_event.content, context_id, task_id
    )
    self._messages.append(response)  # 응답 메시지 저장
    
    if conversation and response:
        conversation.messages.append(response)  # 대화에 추가
```

### 5.4 Host Agent와 등록된 Agent들의 연동

#### 5.4.1 Host Agent 초기화 (94-101행)
```python
def _initialize_host(self):
    agent = self._host_agent.create_agent()  # Host Agent 생성
    self._host_runner = Runner(
        app_name=self.app_name,
        agent=agent,  # 등록된 Agent들을 포함한 Host Agent
        artifact_service=self._artifact_service,
        session_service=self._session_service,
        memory_service=self._memory_service,
    )
```

#### 5.4.2 Agent 등록 시 Host Agent 업데이트 (437-444행)
```python
def register_agent(self, url):
    agent_data = get_agent_card(url)  # Agent Card 정보 가져오기
    if not agent_data.url:
        agent_data.url = url
    self._agents.append(agent_data)  # 메모리에 저장
    
    # 핵심: Host Agent에 새로운 Agent 등록
    self._host_agent.register_agent_card(agent_data)
    
    # Host Agent 재초기화 (새로운 Agent 포함)
    self._initialize_host()
```

#### 5.4.3 Task Callback을 통한 Agent 응답 처리 (230-249행)
```python
def task_callback(self, task: TaskCallbackArg, agent_card: AgentCard):
    """등록된 Agent가 Task를 수행할 때 호출되는 콜백"""
    self.emit_event(task, agent_card)
    
    if isinstance(task, TaskStatusUpdateEvent):
        # Agent가 Task 상태 업데이트를 보낸 경우
        current_task = self.add_or_get_task(task)
        current_task.status = task.status
        self.attach_message_to_task(task.status.message, current_task.id)
        self.insert_message_history(current_task, task.status.message)
        self.update_task(current_task)
        
    elif isinstance(task, TaskArtifactUpdateEvent):
        # Agent가 파일이나 아티팩트를 업데이트한 경우
        current_task = self.add_or_get_task(task)
        self.process_artifact_event(current_task, task)
        self.update_task(current_task)
```

### 5.5 실제 사용 플로우 요약

1. **사용자**: 대화 페이지에서 메시지 입력
2. **프론트엔드**: `send_message()` 함수로 Message 객체 생성 및 전송
3. **백엔드 서버**: `_send_message()` 엔드포인트에서 메시지 수신
4. **ADK Host Manager**: `process_message()`에서 메시지 처리 시작
5. **Host Agent**: 등록된 Agent들에게 메시지 전달
6. **등록된 Agent들**: 각자의 역할에 따라 Task 수행
7. **Task Callback**: Agent들의 응답을 `task_callback()`으로 수신
8. **응답 처리**: Agent 응답을 Message로 변환하여 대화에 추가
9. **UI 업데이트**: 프론트엔드에서 Agent 응답 표시

## 6. 핵심 포인트

1. **이중 검증**: 프론트엔드에서 한 번, 백엔드에서 한 번 더 Agent Card를 가져와서 검증
2. **표준 경로**: `/.well-known/agent-card.json` 경로를 A2A 표준으로 사용
3. **프로토콜 자동 추가**: `http://`가 없으면 자동으로 추가
4. **메모리 저장**: 등록된 Agent 정보는 서버 메모리에 저장되어 재시작 시 초기화
5. **A2A 프레임워크 연동**: 단순 저장이 아닌 실제 A2A 에이전트 시스템에 등록
6. **Host Agent 역할**: 등록된 모든 Agent들을 관리하고 메시지를 적절한 Agent에게 라우팅
7. **비동기 처리**: Agent 응답은 백그라운드에서 비동기로 처리되어 UI 블로킹 방지
8. **Task 기반**: Agent들은 Task 단위로 작업을 수행하고 결과를 콜백으로 전달
