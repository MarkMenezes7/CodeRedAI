from fastapi import APIRouter
from pydantic import BaseModel
from app.services.auth_service import signup_user

router = APIRouter()

class SignupRequest(BaseModel):
    email: str
    password: str

@router.post("/signup")
def signup(data: SignupRequest):
    user_id = signup_user(data.email, data.password)

    return {
        "success": True,
        "message": "User created",
        "user_id": user_id
    }