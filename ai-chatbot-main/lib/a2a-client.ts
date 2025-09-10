import {A2AClient, SendMessageSuccessResponse} from '@a2a-js/sdk/client';
import {Message, MessageSendParams} from '@a2a-js/sdk';
import {v4 as uuidv4} from 'uuid';

const A2A_AGENT_URL = process.env.A2A_AGENT_URL || 'http://localhost:4000';
const A2A_TIMEOUT = parseInt(process.env.A2A_TIMEOUT_MS || '10000');

export const isA2AEnabled = !!process.env.A2A_AGENT_URL;

export async function sendA2AMessage(userMessage: string) : Promise<string> {
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
        
        //응답처리
        if ("error" in response) {
            throw new Error(`A2A Error: ${response.error.message}`);
        }

        const result = (response as SendMessageSuccessResponse).result;
        
        // 디버깅을 위한 로그 추가
        // console.log("A2A 응답 구조:", JSON.stringify(result, null, 2));
        
        // Task 형태의 응답에서 artifacts의 결과 추출
        if (result.kind === "task") {
            // 1. artifacts에서 응답 확인 (최신 응답 패턴)
            if (result.artifacts && Array.isArray(result.artifacts) && result.artifacts.length > 0) {
                const artifact = result.artifacts[0];
                if (artifact.parts && Array.isArray(artifact.parts) && artifact.parts.length > 0) {
                    const responseText = artifact.parts[0]?.text;
                    if (responseText) {
                        // console.log("artifacts에서 응답 추출:", responseText);
                        return responseText;
                    }
                }
            }
            
            // 2. status.message에서 응답 확인 (이전 응답 패턴)
            if (result.status?.message?.parts) {
                const agentMessage = result.status.message;
                console.log("status.message에서 응답 추출:", agentMessage);
                
                if (agentMessage.parts && Array.isArray(agentMessage.parts) && agentMessage.parts.length > 0) {
                    return agentMessage.parts[0]?.text || "No response from A2A agent";
                }
            }
        }
        
        // Message 형태의 응답 처리 (기존 로직)
        if (result.kind === "message" && result.parts) {
            if (Array.isArray(result.parts) && result.parts.length > 0) {
                return result.parts[0]?.text || "No response from A2A agent";
            }
        }
        
        // 예상하지 못한 응답 형태
        console.log("예상하지 못한 응답 형태, 전체 result 반환");
        return JSON.stringify(result, null, 2);

        } catch (error) {
          console.error("A2A communication failed:", error);
          throw new Error(`A2A 에이전트와 통신할 수 없습니다: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
}

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