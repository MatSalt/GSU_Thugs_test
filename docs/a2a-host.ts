import { v4 as uuidv4 } from 'uuid';
import type { 
  AgentCard, 
  Message, 
  MessageSendParams, 
  MessageSendConfiguration,
  Task, 
  TaskState,
  Part,
  TextPart,
  DataPart,
  FilePart,
  TaskArtifactUpdateEvent,
  TaskStatusUpdateEvent
} from '@a2a-js/sdk';
import { A2AClient } from '@a2a-js/sdk/client';

// Remote Agent Connection 관리 클래스
class RemoteAgentConnection {
  private client: A2AClient;
  private card: AgentCard;

  constructor(client: A2AClient, card: AgentCard) {
    this.client = client;
    this.card = card;
  }

  async sendMessage(
    request: MessageSendParams, 
    taskCallback?: TaskUpdateCallback
  ): Promise<Message | Task> {
    try {
      const response = await this.client.sendMessage(request);
      
      if ('error' in response) {
        throw new Error(`Failed to send message: ${response.error.message}`);
      }

      const result = response.result;
      
      // 콜백이 있으면 호출
      if (taskCallback && result.kind === 'task') {
        await taskCallback(result as Task);
      }

      return result;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  getCard(): AgentCard {
    return this.card;
  }
}

// Task 업데이트 콜백 타입
type TaskUpdateCallback = (task: Task) => Promise<void>;

// Context 인터페이스 (ADK Context 대체)
interface Context {
  state: Record<string, any>;
  saveArtifact?: (fileId: string, data: any) => Promise<void>;
  actions?: {
    skipSummarization?: boolean;
    escalate?: boolean;
  };
}

// Parts 변환 함수들
async function convertParts(parts: Part[], context: Context): Promise<any[]> {
  const results: any[] = [];
  for (const part of parts) {
    const converted = await convertPart(part, context);
    results.push(converted);
  }
  return results;
}

async function convertPart(part: Part, context: Context): Promise<any> {
  switch (part.kind) {
    case 'text':
      return (part as TextPart).text;
      
    case 'data':
      return (part as DataPart).data;
      
    case 'file':
      const filePart = part as FilePart;
      const fileId = filePart.name;
      const fileBytes = Buffer.from(filePart.bytes, 'base64');
      
      // 파일 데이터를 컨텍스트에 저장
      if (context.saveArtifact) {
        await context.saveArtifact(fileId, {
          mimeType: filePart.mimeType,
          data: fileBytes
        });
      }
      
      if (context.actions) {
        context.actions.skipSummarization = true;
        context.actions.escalate = true;
      }
      
      return { data: { 'artifact-file-id': fileId } } as DataPart;
      
    default:
      return `Unknown type: ${part.kind}`;
  }
}

// Host Agent 클래스
export class HostAgent {
  private remoteAgentConnections: Map<string, RemoteAgentConnection> = new Map();
  private cards: Map<string, AgentCard> = new Map();
  private agents: string = '';
  private taskCallback?: TaskUpdateCallback;

  constructor(taskCallback?: TaskUpdateCallback) {
    this.taskCallback = taskCallback;
  }

  // 원격 에이전트들을 초기화
  async initialize(remoteAgentAddresses: string[]): Promise<void> {
    for (const address of remoteAgentAddresses) {
      console.log(`Registering agent at ${address}`);
      
      try {
        // Agent Card URL로 클라이언트 생성
        const cardUrl = `${address}/.well-known/agent-card.json`;
        const client = await A2AClient.fromCardUrl(cardUrl);
        
        // Agent Card 가져오기
        const cardResponse = await fetch(cardUrl);
        if (!cardResponse.ok) {
          throw new Error(`Failed to fetch agent card from ${cardUrl}`);
        }
        const card: AgentCard = await cardResponse.json();
        
        // 연결 생성 및 저장
        const connection = new RemoteAgentConnection(client, card);
        this.remoteAgentConnections.set(card.name, connection);
        this.cards.set(card.name, card);
        
      } catch (error) {
        console.error(`Failed to register agent at ${address}:`, error);
      }
    }
    
    // 에이전트 정보 문자열 업데이트
    this.updateAgentsString();
  }

  // Agent Card 직접 등록
  async registerAgentCard(card: AgentCard): Promise<void> {
    try {
      const client = await A2AClient.fromCardUrl(`${card.url}/.well-known/agent-card.json`);
      const connection = new RemoteAgentConnection(client, card);
      
      this.remoteAgentConnections.set(card.name, connection);
      this.cards.set(card.name, card);
      
      this.updateAgentsString();
    } catch (error) {
      console.error(`Failed to register agent card for ${card.name}:`, error);
      throw error;
    }
  }

  // 에이전트 정보 문자열 업데이트
  private updateAgentsString(): void {
    const agentInfoList = this.listRemoteAgents().map(agent => JSON.stringify(agent));
    this.agents = agentInfoList.join('\n');
  }

  // 원격 에이전트 목록 반환
  listRemoteAgents(): Array<{ name: string; description: string }> {
    if (this.remoteAgentConnections.size === 0) {
      return [];
    }

    const remoteAgentInfo: Array<{ name: string; description: string }> = [];
    for (const card of this.cards.values()) {
      remoteAgentInfo.push({
        name: card.name,
        description: card.description
      });
    }
    return remoteAgentInfo;
  }

  // 메시지 전송
  async sendMessage(
    agentName: string, 
    message: string, 
    context: Context
  ): Promise<any[]> {
    if (!this.remoteAgentConnections.has(agentName)) {
      throw new Error(`Agent ${agentName} not found`);
    }

    const state = context.state;
    state['agent'] = agentName;
    
    const client = this.remoteAgentConnections.get(agentName);
    if (!client) {
      throw new Error(`Client not available for ${agentName}`);
    }

    const taskId = state['task_id'] || null;
    const contextId = state['context_id'] || null;
    let messageId = state['message_id'] || null;

    if (!messageId) {
      messageId = uuidv4();
    }

    const request: MessageSendParams = {
      id: uuidv4(),
      message: {
        kind: 'message',
        role: 'user',
        parts: [{ kind: 'text', text: message } as TextPart],
        messageId: messageId,
        contextId: contextId,
        taskId: taskId,
      },
      configuration: {
        acceptedOutputModes: ['text', 'text/plain'],
      } as MessageSendConfiguration,
    };

    const response = await client.sendMessage(request, this.taskCallback);

    if (response.kind === 'message') {
      return await convertParts((response as Message).parts, context);
    }

    const task = response as Task;
    
    // 세션 상태 업데이트
    const completedStates: TaskState[] = ['completed', 'canceled', 'failed', 'unknown'];
    state['session_active'] = !completedStates.includes(task.status.state);
    
    if (task.contextId) {
      state['context_id'] = task.contextId;
    }
    state['task_id'] = task.id;

    // 작업 상태에 따른 처리
    if (task.status.state === 'input_required') {
      if (context.actions) {
        context.actions.skipSummarization = true;
        context.actions.escalate = true;
      }
    } else if (task.status.state === 'canceled') {
      throw new Error(`Agent ${agentName} task ${task.id} is cancelled`);
    } else if (task.status.state === 'failed') {
      throw new Error(`Agent ${agentName} task ${task.id} failed`);
    }

    const responseResults: any[] = [];
    
    // 작업 메시지 처리
    if (task.status.message) {
      const messageParts = await convertParts(task.status.message.parts, context);
      responseResults.push(...messageParts);
    }
    
    // 아티팩트 처리
    if (task.artifacts) {
      for (const artifact of task.artifacts) {
        const artifactParts = await convertParts(artifact.parts, context);
        responseResults.push(...artifactParts);
      }
    }

    return responseResults;
  }

  // 현재 상태 확인
  checkState(context: Context): { active_agent: string } {
    const state = context.state;
    
    if (
      state['context_id'] &&
      state['session_active'] &&
      state['agent']
    ) {
      return { active_agent: state['agent'] };
    }
    
    return { active_agent: 'None' };
  }

  // 루트 지시사항 생성
  getRootInstruction(context: Context): string {
    const currentAgent = this.checkState(context);
    
    return `You are an expert delegator that can delegate the user request to the
appropriate remote agents.

Discovery:
- You can use \`list_remote_agents\` to list the available remote agents you
can use to delegate the task.

Execution:
- For actionable requests, you can use \`send_message\` to interact with remote agents to take action.

Be sure to include the remote agent name when you respond to the user.

Please rely on tools to address the request, and don't make up the response. If you are not sure, please ask the user for more details.
Focus on the most recent parts of the conversation primarily.

Agents:
${this.agents}

Current agent: ${currentAgent.active_agent}
`;
  }

  // 모델 콜백 전처리
  beforeModelCallback(context: Context): void {
    const state = context.state;
    if (!state['session_active']) {
      state['session_active'] = true;
    }
  }
}

// 사용 예제 함수
export async function main(): Promise<void> {
  const hostAgent = new HostAgent();
  
  // 비동기 초기화
  await hostAgent.initialize([
    'http://localhost:9999', 
    'http://localhost:10000'
  ]);

  console.log('Host Agent initialized successfully!');
  console.log('Available agents:', hostAgent.listRemoteAgents());

  // 예제 컨텍스트 생성
  const context: Context = {
    state: {
      session_active: false,
      context_id: uuidv4(),
      task_id: uuidv4(),
    },
    actions: {}
  };

  // 예제 메시지 전송
  try {
    const agents = hostAgent.listRemoteAgents();
    if (agents.length > 0) {
      const firstAgentName = agents[0].name;
      console.log(`Sending message to ${firstAgentName}...`);
      
      const response = await hostAgent.sendMessage(
        firstAgentName,
        'Hello, world!',
        context
      );
      
      console.log('Response:', response);
    }
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

// 스크립트로 실행될 때
if (require.main === module) {
  main().catch(console.error);
}
