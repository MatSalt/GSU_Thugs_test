import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  smoothStream,
  stepCountIs,
  streamText,
} from 'ai';
import { auth, type UserType } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { convertToUIMessages, generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';
import { ChatSDKError } from '@/lib/errors';
import type { ChatMessage } from '@/lib/types';
import type { ChatModel } from '@/lib/ai/models';
import type { VisibilityType } from '@/components/visibility-selector';
import { google } from '@ai-sdk/google';
import { sendA2AMessage } from '@/lib/a2a-client';

export const maxDuration = 60;

async function getMessageText(message: ChatMessage): Promise<string> {
  const textParts = message.parts.filter(part => part.type === 'text');
  return textParts.map(part => part.text).join(' ');
}

let globalStreamContext: ResumableStreamContext | null = null;

export function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes('REDIS_URL')) {
        console.log(
          ' > Resumable streams are disabled due to missing REDIS_URL',
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel['id'];
      selectedVisibilityType: VisibilityType;
    } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError('rate_limit:chat').toResponse();
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    } else {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    // const messagesFromDb = await getMessagesByChatId({ id });
    // const uiMessages = [...convertToUIMessages(messagesFromDb), message];

    // const { longitude, latitude, city, country } = geolocation(request);

    // const requestHints: RequestHints = {
    //   longitude,
    //   latitude,
    //   city,
    //   country,
    // };

    ///////////////////////////////////
    const messageText = await getMessageText(message);

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


    try {
      console.log('A2A 에이전트로 메시지 전송: ', messageText);
      const a2aResponse = await sendA2AMessage(messageText);

      // A2A 응답을 채팅 히스토리에 저장
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: generateUUID(),
            role: 'assistant',
            parts: [{ type: 'text', text: a2aResponse }],
            attachments: [],
            createdAt: new Date(),
          }
        ],
      });

      // 성공 응답 반환 (기존 스트리밍 형태와 호환)
      return Response.json({
        success: true,
        message: 'A2A message processed successfully'
      });

    } catch (a2aError) {
      console.error('A2A 통신 실패:', a2aError);

      const errorMessage = a2aError instanceof Error
        ? a2aError.message
        : 'A2A 에이전트와 통신할 수 없습니다.';

      await saveMessages({
        messages: [
          {
            chatId: id,
            id: generateUUID(),
            role: 'assistant',
            parts: [{ type: 'text', text: errorMessage }],
            attachments: [],
            createdAt: new Date(),
          }
        ],
      });

      return Response.json({
        success: false,
        error: 'A2A communication failed',
        message: errorMessage
      });
    }

  } catch (error) {
    console.error('Chat API 오류:', error);

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    return new ChatSDKError('bad_request:api').toResponse();
  }
}

///////////////////////////////////

// const streamId = generateUUID();
// await createStreamId({ streamId, chatId: id });

// const stream = createUIMessageStream({
//   execute: ({ writer: dataStream }) => {
//     const result = streamText({
//       model: myProvider.languageModel(selectedChatModel),
//       system: systemPrompt({ selectedChatModel, requestHints }),
//       messages: convertToModelMessages(uiMessages),
//       stopWhen: stepCountIs(5),
//       experimental_activeTools:
//         selectedChatModel === 'chat-model-reasoning'
//           ? []
//           : [
//             'google_search',
//             'createDocument',
//             'updateDocument',
//             'requestSuggestions',
//           ],
//       experimental_transform: smoothStream({ chunking: 'word' }),
//       tools: {
//         google_search: google.tools.googleSearch({}),
//         createDocument: createDocument({ session, dataStream }),
//         updateDocument: updateDocument({ session, dataStream }),
//         requestSuggestions: requestSuggestions({
//           session,
//           dataStream,
//         }),
//       },
//       experimental_telemetry: {
//         isEnabled: isProductionEnvironment,
//         functionId: 'stream-text',
//       },
//     });

//     result.consumeStream();

//     dataStream.merge(
//       result.toUIMessageStream({
//         sendReasoning: true,
//       }),
//     );
//   },
//   generateId: generateUUID,
//   onFinish: async ({ messages }) => {
//     await saveMessages({
//       messages: messages.map((message) => ({
//         id: message.id,
//         role: message.role,
//         parts: message.parts,
//         createdAt: new Date(),
//         attachments: [],
//         chatId: id,
//       })),
//     });
//   },
//   onError: () => {
//     return 'Oops, an error occurred!';
//   },
// });

// const streamContext = getStreamContext();

// if (streamContext) {
//   return new Response(
//     await streamContext.resumableStream(streamId, () =>
//       stream.pipeThrough(new JsonToSseTransformStream()),
//     ),
//   );
// } else {
//   return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
// }
// } catch (error) {
//   if (error instanceof ChatSDKError) {
//     return error.toResponse();
//   }
// }
// }

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const chat = await getChatById({ id });

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
