'use client';

import { motion } from 'framer-motion';
import { Button } from './ui/button';
import { memo } from 'react';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { VisibilityType } from './visibility-selector';
import type { ChatMessage } from '@/lib/types';

interface SuggestedActionsProps {
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  selectedVisibilityType: VisibilityType;
}

function PureSuggestedActions({
  chatId,
  sendMessage,
  selectedVisibilityType,
}: SuggestedActionsProps) {
  const suggestedActions = [
    {
      title: '최근 워런버핏 포트폴리오 변동 사항',
      label: '유나이티드헬스 그룹 신규 매수!',
      action: '워런 버핏(버크셔 해서웨이)의 가장 최근 포트폴리오 변동 내역은 무엇인가요?',
    },
    {
      title: '시장 조정 가능성 발견',
      label: `S&P 500의 선행 주가수익비율(P/E Ratio) 22배 돌파`,
      action: `현재 S&P 500 지수는 역사적 평균과 비교했을 때 고평가 상태인가요?`,
    },
    {
      title: '강릉에 가뭄 발생',
      label: `드라이아이스 관련 주가 상승 가능성`,
      action: `가뭄이 발생했을때 드라이아이스 주가가 오르는 이유를 설명해줘.`,
    },
    {
      title: '금리가 인하되면 수혜를 받는 종목',
      label: '증권사는 금리 인하로 인한 증시 활황의 직접적인 수혜',
      action: '금리 인하 시기에 일반적으로 주가가 상승하는 대표적인 업종과 종목은 무엇인가요?',
    },
  ];

  return (
    <div
      data-testid="suggested-actions"
      className="grid sm:grid-cols-2 gap-2 w-full"
    >
      {suggestedActions.map((suggestedAction, index) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          key={`suggested-action-${suggestedAction.title}-${index}`}
          className={index > 1 ? 'hidden sm:block' : 'block'}
        >
          <Button
            variant="ghost"
            onClick={async () => {
              window.history.replaceState({}, '', `/chat/${chatId}`);

              sendMessage({
                role: 'user',
                parts: [{ type: 'text', text: suggestedAction.action }],
              });
            }}
            className="text-left border rounded-xl px-4 py-3.5 text-sm flex-1 gap-1 sm:flex-col w-full h-auto justify-start items-start"
          >
            <span className="font-medium">{suggestedAction.title}</span>
            <span className="text-muted-foreground">
              {suggestedAction.label}
            </span>
          </Button>
        </motion.div>
      ))}
    </div>
  );
}

export const SuggestedActions = memo(
  PureSuggestedActions,
  (prevProps, nextProps) => {
    if (prevProps.chatId !== nextProps.chatId) return false;
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType)
      return false;

    return true;
  },
);
