from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles  # 추가
from fastapi.responses import FileResponse   # 추가
from pathlib import Path                     # 추가
from .models import ChatMessage, ChatResponse, ChatHistory, UserInfo
from .services import ChatService
app = FastAPI()


# 정적 파일 디렉토리 마운트
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 실제 운영 환경에서는 구체적인 도메인 지정
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 채팅 서비스 인스턴스 생성
chat_service = ChatService()

@app.get("/")
async def read_root():
    return FileResponse('app/static/index.html')

@app.post("/chat", response_model=ChatResponse)
async def chat(message: ChatMessage):
    response = await chat_service.get_chat_response(message.message)
    return ChatResponse(response=response)

@app.get("/history", response_model=ChatHistory)
async def get_history():
    return ChatHistory(messages=chat_service.get_chat_history())

@app.post("/clear")
async def clear_history():
    chat_service.clear_history()
    return {"message": "대화 기록이 초기화되었습니다."}

@app.get("/user-info", response_model=UserInfo)
async def get_user_info():
    return chat_service.get_user_info()