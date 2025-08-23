import { z } from 'zod';
import { generateObject } from 'ai';
import { auth } from '@/app/(auth)/auth';
import { myProvider } from '@/lib/ai/providers';
import { ChatSDKError } from '@/lib/errors';
import { NextResponse } from 'next/server';

export const maxDuration = 30;

const recommendationsRequestBodySchema = z.object({
  lastMessage: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const json = await request.json();
    const { lastMessage } = recommendationsRequestBodySchema.parse(json);

    const { object: result } = await generateObject({
      model: myProvider.languageModel('chat-model'),
      system: `You are a stock investment expert. Based on the user's last question or the AI's last answer, recommend five questions that the user might be curious about next.

- Return only a concise list of questions.
- Example: { "recommendations": ["Question 1", "Question 2", "Question 3", "Question 4", "Question 5"] }
- Do not add any other explanations.`,
      prompt: lastMessage,
      schema: z.object({
        recommendations: z.array(z.string()).describe('Array of 5 recommended questions'),
      }),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new ChatSDKError('bad_request:api', error.message).toResponse();
    }
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    // For other unexpected errors
    console.error(error);
    return new ChatSDKError('internal_server_error:api').toResponse();
  }
}
