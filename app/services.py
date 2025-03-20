from openai import AsyncOpenAI
from dotenv import load_dotenv
import os
import re
import json

load_dotenv()
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

class ChatService:
    def __init__(self):
        self.messages = []
        self.user_info = {"name": None, "address": None}

    async def extract_user_info(self, message: str) -> dict:
        # 이름과 주소를 추출하기 위한 시스템 메시지 개선
        system_message = {
            "role": "system",
            "content": """
사용자의 이름과 주소를 정확하게 추출해주세요.
- 이름: 성과 이름을 모두 포함
- 주소: 사용자가 언급한 모든 주소 정보

반드시 다음의 JSON 형식으로만 응답해주세요:
{'name': '추출된 이름', 'address': '추출된 주소'}

예시:
입력: "내 이름은 한이고 주소는 수원이야"
출력: {'name': '한', 'address': '수원'}

입력: "나는 김철수고 서울 강남구에 살아"
출력: {'name': '김철수', 'address': '서울 강남구'}
"""
        }
        
        try:
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    system_message,
                    {"role": "user", "content": message}
                ]
            )
            
            # AI의 응답에서 JSON 형식의 데이터 추출
            response_text = response.choices[0].message.content
            print(response_text)
            # 문자열에서 중괄호 안의 내용 추출
            
            match = re.search(r'\{.*\}', response_text)
            if match:
                json_str = match.group()
                print(f"추출된 JSON 문자열: {json_str}")
                
                # 작은따옴표를 큰따옴표로 변경
                json_str = json_str.replace("'", '"')
                info = json.loads(json_str)
                
                # 이름이나 주소가 빈 문자열이 아닐 때만 저장
                if info.get('name') and info['name'].strip():
                    self.user_info['name'] = info['name'].strip()
                if info.get('address') and info['address'].strip():
                    self.user_info['address'] = info['address'].strip()
                
                # 사용자 정보가 업데이트되면 콘솔에 출력
                if (info.get('name') and info['name'].strip()) or (info.get('address') and info['address'].strip()):
                    print("\n=== 사용자 정보 업데이트 ===")
                    print(f"이름: {self.user_info['name']}")
                    print(f"주소: {self.user_info['address']}")
                    print("========================\n")
                return self.user_info
        except Exception as e:
            print(f"사용자 정보 추출 중 오류 발생: {e}")
        return None

    async def get_chat_response(self, user_message: str) -> str:
        # 사용자 메시지 추가
        self.messages.append({"role": "user", "content": user_message})
        
        try:
            # 사용자 정보 추출 시도
            user_info = await self.extract_user_info(user_message)
            
            # API 호출
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": """
당신은 친절한 상담원입니다. 사용자가 이름이나 주소를 말하면 정중하게 확인해주세요.
확인할 때는 다음과 같은 형식으로 응답해주세요:

"네, 고객님의 정보를 확인해보겠습니다.
성함은 [이름] 맞으신가요?
주소는 [주소] 맞으신가요?"
"""
                    },
                    *self.messages
                ]
            )
            
            # AI 응답 저장
            ai_message = response.choices[0].message.content
            self.messages.append({"role": "assistant", "content": ai_message})
            
            # 사용자 정보가 추출되었다면 확인 메시지 추가
            if user_info:
                ai_message += f"\n\n입력하신 정보를 확인해드리겠습니다:\n이름: {user_info['name']}\n주소: {user_info['address']}"
            
            return ai_message
            
        except Exception as e:
            print(f"Error: {e}")
            return "죄송합니다. 오류가 발생했습니다."

    def get_chat_history(self):
        return self.messages

    def get_user_info(self):
        return self.user_info

    def clear_history(self):
        self.messages = []
        self.user_info = {"name": None, "address": None}