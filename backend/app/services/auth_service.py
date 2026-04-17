from passlib.context import CryptContext
from app.core.database import get_users_collection

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str):
    return pwd_context.hash(password)

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def signup_user(email: str, password: str):
    users = get_users_collection()

    existing = users.find_one({"email": email})
    if existing:
        raise Exception("User already exists")

    hashed_password = hash_password(password)

    result = users.insert_one({
        "email": email,
        "password": hashed_password
    })

    return str(result.inserted_id)