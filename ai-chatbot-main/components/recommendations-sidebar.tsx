'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
} from '@/components/ui/sidebar';
import { SparklesIcon } from '@/components/icons';

interface Recommendation {
  category: string;
  questions: string[];
}

const sampleRecommendations: Recommendation[] = [
  {
    category: '투자의 기초',
    questions: [
      '주식 투자를 시작하려면 무엇부터 해야 하나요?',
      '적은 금액으로도 시작할 수 있는 주식은 무엇인가요?',
      '주식 계좌는 어떻게 만드나요?',
    ],
  },
  {
    category: '기업 분석',
    questions: [
      '삼성전자의 현재 주가 전망은 어떤가요?',
      '재무제표에서 가장 중요하게 봐야 할 것은 무엇인가요?',
      '특정 기업의 경쟁사는 어떻게 찾나요?',
    ],
  },
  {
    category: '시장 동향',
    questions: [
      '최근 미국 증시가 하락하는 이유는 무엇인가요?',
      '금리 인상이 주식 시장에 미치는 영향은 무엇인가요?',
      '앞으로 유망한 투자 분야는 어디일까요?',
    ],
  },
];

export function RecommendationsSidebar() {
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
        {sampleRecommendations.map((group) => (
          <div key={group.category} className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold text-muted-foreground">
              {group.category}
            </h4>
            <div className="flex flex-col gap-2">
              {group.questions.map((question) => (
                <button
                  key={question}
                  className="text-sm text-left p-2 rounded-md bg-muted hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
