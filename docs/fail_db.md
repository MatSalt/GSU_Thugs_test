# AI 응답 스트리밍 실패 및 에러 데이터베이스

## 개요
AI 채팅 응답이 화면에 실시간으로 표시되지 않는 문제를 해결하기 위한 모든 시도와 실패 사례를 기록합니다.

---

## 1. 초기 문제 상황

### 문제 정의
- **현상**: AI 응답(`a2aResponse`)이 DB에 성공적으로 저장되지만, 채팅 UI에서 수동 새로고침 없이는 표시되지 않음
- **목표**: AI 응답이 실시간으로 스트리밍되어 화면에 타이핑 효과로 표시되도록 구현
- **기술 스택**: Next.js App Router, Vercel AI SDK (`ai: 5.0.0-beta.6`), `useChat` 훅

---

## 2. 실패한 해결 시도들

### 2.1 클라이언트 측 새로고침 시도

#### 시도 1: `router.refresh()` 사용
```typescript
// chat.tsx에서 useChat의 onFinish 콜백에 추가
onFinish: () => {
  router.refresh();
}
```
**실패 원인**: `onFinish`는 스트리밍이 완료된 후에만 호출되므로 실시간 표시 불가

#### 시도 2: `useEffect`로 상태 감지
```typescript
useEffect(() => {
  if (status === 'idle' && previousStatus === 'loading') {
    router.refresh();
  }
}, [status]);
```
**실패 원인**: `useChat`의 `status`가 예상대로 업데이트되지 않음

#### 시도 3: `onResponse` 콜백 사용
```typescript
onResponse: (response) => {
  console.log('Response received:', response);
  router.refresh();
}
```
**실패 원인**: `onResponse`가 신뢰성 있게 호출되지 않음

### 2.2 서버 측 스트리밍 구현 시도

#### 시도 4: `StreamingTextResponse` 사용
```typescript
return new StreamingTextResponse(stream);
```
**실패 원인**: `StreamingTextResponse`가 현재 AI SDK 버전에서 deprecated됨

#### 시도 5: 수동 `ReadableStream` 생성 (1차)
```typescript
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue(`0:${JSON.stringify(a2aResponse)}\n`);
    controller.close();
  }
});
return new Response(stream, {
  headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }
});
```
**실패 원인**: AI SDK의 데이터 프로토콜을 올바르게 구현하지 못함

#### 시도 6: AI SDK 데이터 프로토콜 구현
```typescript
// 0: 신호 (메시지 초기화)
controller.enqueue(`0:${JSON.stringify({id: messageId, role: 'assistant', content: ''})}\n`);

// 1: 신호 (텍스트 델타)
for (const char of a2aResponse) {
  controller.enqueue(`1:"${char}"\n`);
}
```
**실패 원인**: `useChat` 훅이 수동으로 생성한 스트림을 올바르게 처리하지 못함

### 2.3 `createUIMessageStream` 사용 시도

#### 시도 7: `writer.write()` 사용
```typescript
const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    const a2aResponse = await sendA2AMessage(messageText);
    
    for (const char of a2aResponse) {
      writer.write({
        type: 'text-delta',
        textDelta: char,
      });
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    return { role: 'assistant', parts: [{ type: 'text', text: a2aResponse }] };
  }
});
```
**에러**: `TypeError: Cannot read properties of undefined (reading 'text')`
**실패 원인**: `writer.write()` API가 현재 AI SDK 베타 버전과 호환되지 않음

#### 시도 8: `dataStream.merge()` + `ReadableStream` 조합
```typescript
const responseStream = new ReadableStream({
  start(controller) {
    for (const char of a2aResponse) {
      controller.enqueue({
        type: 'text-delta',
        textDelta: char,
      });
    }
    controller.close();
  }
});

dataStream.merge(responseStream);
```
**에러**: 동일한 `TypeError: Cannot read properties of undefined (reading 'text')`
**실패 원인**: `ReadableStream`의 `controller.enqueue()` 형태가 AI SDK가 기대하는 형태와 다름

---

## 3. 에러 분석 및 원인 파악

### 3.1 주요 에러들

#### 에러 1: `TypeError: Failed to fetch`
- **발생 위치**: 클라이언트 (`lib/utils.ts:34`)
- **원인**: 서버가 500 에러로 응답을 종료하여 클라이언트가 응답을 받지 못함
- **근본 원인**: 서버 측 스트리밍 에러

#### 에러 2: `TypeError: Cannot read properties of undefined (reading 'text')`
- **발생 위치**: 서버 (`route.ts`)
- **원인**: AI SDK 내부에서 스트림 데이터 처리 중 `undefined` 객체의 `text` 속성에 접근 시도
- **근본 원인**: AI SDK가 기대하는 데이터 형태와 실제 전송되는 데이터 형태 불일치

#### 에러 3: `dataStream.append is not a function`
- **발생 위치**: 서버 (`route.ts`)
- **원인**: AI SDK 버전 변경으로 인한 API 변경
- **해결**: `dataStream.append()` → `writer.write()` 변경

### 3.2 디버깅 과정

#### 디버깅 로그 추가
```typescript
console.log('[DEBUG] writer 객체:', writer);
console.log('[DEBUG] a2aResponse type:', typeof a2aResponse);
console.log('[DEBUG] a2aResponse value:', a2aResponse);
```

**발견사항**:
- `writer` 객체가 올바르게 전달됨
- `a2aResponse`가 유효한 문자열로 반환됨
- 모든 문자별 스트림 전송이 성공적으로 완료됨
- **하지만 AI SDK 내부에서 에러 발생**

---

## 4. 성공한 해결책

### 최종 해결: `dataStream.append()` 사용
```typescript
const stream = createUIMessageStream({
  execute: async ({ writer: dataStream }) => {
    try {
      const a2aResponse = await sendA2AMessage(messageText);
      
      // 문자 단위로 스트리밍하여 dataStream에 직접 전송
      for (let i = 0; i < a2aResponse.length; i++) {
        const char = a2aResponse[i];
        
        dataStream.append({
          type: 'text-delta',
          textDelta: char,
        });
        
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      return { role: 'assistant', parts: [{ type: 'text', text: a2aResponse }] };
    } catch (a2aError) {
      const errorMessage = a2aError instanceof Error ? a2aError.message : 'A2A 에이전트와 통신할 수 없습니다.';
      
      dataStream.append({
        type: 'text-delta',
        textDelta: errorMessage,
      });
      
      return { role: 'assistant', parts: [{ type: 'text', text: errorMessage }] };
    }
  }
});
```

**성공 요인**:
- AI SDK의 내부 메서드 `dataStream.append()` 사용
- 복잡한 `ReadableStream` 생성 없이 직접 데이터 전송
- 베타 버전에서 안정적인 API 활용

---

## 5. 학습된 교훈

### 5.1 기술적 교훈
1. **AI SDK 베타 버전의 불안정성**: 공식 문서와 실제 동작이 다를 수 있음
2. **API 호환성**: `writer.write()` vs `dataStream.append()` vs `dataStream.merge()` 각각 다른 동작
3. **스트림 처리**: 복잡한 스트림 생성보다 내부 메서드 활용이 더 안정적
4. **디버깅의 중요성**: 정밀한 로깅을 통한 문제 원인 파악

### 5.2 프로세스 교훈
1. **단계적 접근**: 클라이언트 → 서버 → API 호환성 순서로 문제 해결
2. **원본 코드 참조**: `route_origin.ts`의 성공 사례 분석이 핵심
3. **베타 버전 대응**: 공식 문서보다 실제 동작하는 코드 패턴 우선

---

## 6. 미래 개선 사항

### 6.1 안정성 개선
- AI SDK 안정 버전으로 업그레이드 검토
- 에러 처리 로직 강화
- 타입 안정성 개선

### 6.2 성능 최적화
- 스트리밍 딜레이 조정 (현재 10ms)
- 메모리 사용량 최적화
- 응답 시간 개선

### 6.3 모니터링
- 스트리밍 성공률 모니터링
- 에러 발생 패턴 분석
- 사용자 경험 지표 추적

---

## 7. 참고 자료

- [Vercel AI SDK 공식 문서](https://ai-sdk.dev/)
- [Next.js App Router 문서](https://nextjs.org/docs/app)
- [Web Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)
- 프로젝트 내 `docs/route_origin.ts` (성공 사례)
- 프로젝트 내 `docs/diff.md` (해결 과정 상세 기록)
