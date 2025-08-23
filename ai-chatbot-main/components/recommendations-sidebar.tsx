'use client';

import { useParams, useRouter } from 'next/navigation';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { ChatMessage } from '@/lib/types';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
} from '@/components/ui/sidebar';
import { SparklesIcon } from '@/components/icons';
import { useEffect, useState, useRef } from 'react';

const sampleRecommendations: string[] = [
  '주식 투자를 시작하려면 무엇부터 해야 하나요?',
  '적은 금액으로도 시작할 수 있는 주식은 무엇인가요?',
  '주식 계좌는 어떻게 만드나요?',
  '삼성전자의 현재 주가 전망은 어떤가요?',
  '재무제표에서 가장 중요하게 봐야 할 것은 무엇인가요?',
];

interface RecommendationsSidebarProps {
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  messages: ChatMessage[];
}

export function RecommendationsSidebar({ sendMessage, messages }: RecommendationsSidebarProps) {
  const { id } = useParams();
  const router = useRouter();
  const [recommendedQuestions, setRecommendedQuestions] = useState<string[]>(sampleRecommendations);
  const [isLoading, setIsLoading] = useState(false);
  const lastMessageLengthRef = useRef(0);
  const lastMessageRoleRef = useRef<string | null>(null);

  useEffect(() => {
    const fetchRecommendations = async () => {
      const lastMessage = messages[messages.length - 1];

      if (!lastMessage || lastMessage.role !== 'assistant') {
        return;
      }

      const textPart = lastMessage.parts.find(part => part.type === 'text');
      if (!textPart || typeof textPart.text !== 'string' || textPart.text.trim() === '') {
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch('/api/recommendations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ lastMessage: textPart.text }),
        });

        if (!response.ok) {
          throw new Error('Failed to fetch recommendations');
        }

        const data = await response.json();
        if (data.recommendations && data.recommendations.length > 0) {
          setRecommendedQuestions(data.recommendations);
        }
      } catch (error) {
        console.error('Failed to fetch recommendations:', error);
        setRecommendedQuestions(sampleRecommendations);
      } finally {
        setIsLoading(false);
      }
    };

    const lastMessage = messages[messages.length - 1];
    
    if (!lastMessage) {
      setRecommendedQuestions(sampleRecommendations);
      return;
    }

    // Check if this is a new assistant message or if the message content has stabilized
    const currentMessageLength = lastMessage.parts.reduce((total, part) => {
      return total + (part.type === 'text' ? part.text.length : 0);
    }, 0);

    const isNewAssistantMessage = lastMessage.role === 'assistant' && 
                                 lastMessageRoleRef.current !== 'assistant';
    
    const isMessageStabilized = lastMessage.role === 'assistant' && 
                               lastMessageRoleRef.current === 'assistant' &&
                               currentMessageLength === lastMessageLengthRef.current;

    // Only fetch recommendations when:
    // 1. A new assistant message starts, OR
    // 2. The assistant message content has stabilized (no more streaming)
    if (isNewAssistantMessage || isMessageStabilized) {
      // Add a small delay to ensure the message is fully complete
      const timer = setTimeout(fetchRecommendations, 1000);
      return () => clearTimeout(timer);
    }

    // Update refs for next comparison
    lastMessageLengthRef.current = currentMessageLength;
    lastMessageRoleRef.current = lastMessage.role;
  }, [messages]);

  return (
    <Sidebar side="right" className="group-data-[side=right]:border-l-0 hidden md:flex">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row gap-2 items-center">
            <SparklesIcon size={18} />
            <h3 className="text-lg font-semibold">추천 질문</h3>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="flex flex-col gap-4 p-4">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recommendedQuestions.map((question) => (
              <button
                key={question}
                className="text-sm text-left p-2 rounded-md bg-muted hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                onClick={async () => {
                  if (id) {
                    window.history.replaceState({}, '', `/chat/${id}`);
                  }

                  sendMessage({
                    role: 'user',
                    parts: [{ type: 'text', text: question }],
                  });
                }}
              >
                {question}
              </button>
            ))}
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
