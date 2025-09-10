# A2A 응답 통합을 위한 최종 해결 계획 (System Prompt 통합 방식)

## 1. 문제 상황 분석 (Current Situation Analysis)

-   **현재 상태**: `ai-chatbot-main/app/(chat)/api/chat/route.ts`가 원본 상태로 복원됨
-   **목표**: A2A 에이전트 응답을 기존 AI 시스템에 자연스럽게 통합
-   **핵심 아이디어**: 기존의 성공적인 `streamText()` 패턴을 그대로 활용하면서, system prompt를 통해 A2A 응답을 출력하도록 지시
-   **장점**: 
    - 기존 검증된 스트리밍 시스템 100% 활용
    - 복잡한 스트림 조작 없이 안전한 구현
    - AI SDK와의 완벽한 호환성 보장

## 2. 해결 전략: System Prompt 통합 방식

-   **1단계**: A2A 응답을 먼저 받아옵니다.
-   **2단계**: System prompt에 "A2A 응답을 그대로 출력하라"는 지시를 추가합니다.
-   **3단계**: 기존 `streamText()` 패턴을 그대로 활용하여 스트리밍합니다.

## 3. 상세 구현 계획 (Detailed Implementation Plan)

### **1단계: A2A 헬퍼 함수 추가**

**파일: `ai-chatbot-main/app/(chat)/api/chat/route.ts`**

-   `sendA2AMessage` 임포트 및 메시지 텍스트 추출 함수 추가

    ```typescript
    import { sendA2AMessage } from '@/lib/a2a-client';

    // 메시지에서 텍스트 추출하는 헬퍼 함수
    async function getMessageText(message: ChatMessage): Promise<string> {
      const textParts = message.parts.filter(part => part.type === 'text');
      return textParts.map(part => part.text).join(' ');
    }
    ```

### **2단계: A2A 응답 받기**

**파일: `ai-chatbot-main/app/(chat)/api/chat/route.ts`**

-   사용자 메시지 저장 후, A2A 에이전트로부터 응답을 받습니다.

    ```typescript
    // 사용자 메시지 저장
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

    // A2A 에이전트로부터 응답 받기 (에러 처리 포함)
    const messageText = await getMessageText(message);
    let a2aResponse: string;
    try {
      a2aResponse = await sendA2AMessage(messageText);
    } catch (a2aError) {
      console.error('A2A 에이전트 통신 실패:', a2aError);
      a2aResponse = 'A2A 에이전트와 통신할 수 없습니다. 잠시 후 다시 시도해주세요.';
    }
    ```

### **3단계: System Prompt 수정**

**파일: `ai-chatbot-main/app/(chat)/api/chat/route.ts`**

-   기존 `systemPrompt` 대신 A2A 응답을 출력하도록 지시하는 커스텀 시스템 프롬프트 사용

    ```typescript
    // A2A 응답을 그대로 출력하도록 지시하는 시스템 프롬프트 생성
    const a2aSystemPrompt = `당신은 도움이 되는 AI 어시스턴트입니다. 다음 메시지를 정확히 그대로 출력해주세요:

"${a2aResponse}"

위 메시지를 수정, 추가, 변경 없이 정확히 그대로 출력하세요.`;

    const stream = createUIMessageStream({
      execute: ({ writer: dataStream }) => {
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: a2aSystemPrompt,
          messages: convertToModelMessages(uiMessages),
          stopWhen: stepCountIs(5),
          experimental_activeTools: [], // 도구 비활성화로 순수 텍스트 출력 보장
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        result.consumeStream();

        dataStream.merge(
          result.toUIMessageStream({
            sendReasoning: true,
          }),
        );
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
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });
    ```

### **4단계: 완전한 코드 구조**

**파일: `ai-chatbot-main/app/(chat)/api/chat/route.ts`**

-   전체 코드 구조를 보여주는 완전한 예시

    ```typescript
    // ... 기존 코드 (imports, auth, validation 등) ...

    // 사용자 메시지 저장
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

    // A2A 에이전트로부터 응답 받기 (에러 처리 포함)
    const messageText = await getMessageText(message);
    let a2aResponse: string;
    try {
      a2aResponse = await sendA2AMessage(messageText);
    } catch (a2aError) {
      console.error('A2A 에이전트 통신 실패:', a2aError);
      a2aResponse = 'A2A 에이전트와 통신할 수 없습니다. 잠시 후 다시 시도해주세요.';
    }

    // A2A 응답을 그대로 출력하도록 지시하는 시스템 프롬프트 생성
    const a2aSystemPrompt = `당신은 도움이 되는 AI 어시스턴트입니다. 다음 메시지를 정확히 그대로 출력해주세요:

"${a2aResponse}"

위 메시지를 수정, 추가, 변경 없이 정확히 그대로 출력하세요.`;

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    const stream = createUIMessageStream({
      execute: ({ writer: dataStream }) => {
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: a2aSystemPrompt,
          messages: convertToModelMessages(uiMessages),
          stopWhen: stepCountIs(5),
          experimental_activeTools: [], // 도구 비활성화로 순수 텍스트 출력 보장
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        result.consumeStream();

        dataStream.merge(
          result.toUIMessageStream({
            sendReasoning: true,
          }),
        );
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
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });

    // ... 기존 streamContext 처리 코드 ...
    ```

### **5단계: 테스트 및 검증**

**테스트 항목:**
1. A2A 응답이 올바르게 스트리밍되는가?
2. 기존 스트리밍 시스템과 충돌이 없는가?
3. `onFinish` 콜백을 통해 응답이 DB에 저장되는가?
4. 에러 상황에서도 적절한 메시지가 표시되는가?

## 4. 기대 효과 (Expected Outcome)

-   **안정성**: 기존 검증된 `streamText()` 패턴을 그대로 활용하여 최대한 안전함
-   **호환성**: AI SDK와 100% 호환되는 방식으로 구현
-   **사용자 경험**: A2A 응답이 자연스럽게 타이핑되어 표시됨
-   **유지보수성**: 기존 코드 구조를 거의 변경하지 않아 향후 업데이트 용이
-   **에러 처리**: A2A 통신 실패 시에도 적절한 대체 메시지 제공

## 5. 구현 전략의 장점 (Implementation Strategy Advantages)

1. **기존 시스템 활용**: 성공적으로 작동하는 `streamText()` 패턴을 그대로 사용
2. **최소한의 변경**: 기존 코드 구조를 거의 건드리지 않음
3. **프롬프트 기반**: 복잡한 스트림 조작 대신 간단한 프롬프트 지시 활용
4. **AI SDK 호환**: Vercel AI SDK의 표준 방식을 완전히 따름
5. **테스트 용이**: 각 단계별로 독립적으로 테스트 가능
