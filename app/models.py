from pydantic import BaseModel
from typing import List, Optional

class ChatMessage(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str

class ChatHistory(BaseModel):
    messages: List[dict]

class UserInfo(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None