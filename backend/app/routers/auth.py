"""Authentication router — signup and login with bcrypt + self-issued JWTs."""

import uuid
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db.session import get_db
from app.models.user import User, UserProfile
from app.schemas.user import SignupRequest

router = APIRouter(prefix="/auth", tags=["auth"])


class AuthRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _create_token(user_id: str, email: str, secret: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(
    body: SignupRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AuthResponse:
    existing = db.execute(
        select(User).where(User.email == body.email)
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=body.email,
        password_hash=_hash_password(body.password),
    )
    db.add(user)

    # Create profile immediately with signup data
    profile = UserProfile(
        id=user_id,
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        phone_number=body.phone_number.strip(),
        mascot_health=80,
        role=None,  # Set later in RoleSelectionPage
    )
    db.add(profile)
    db.commit()
    db.refresh(user)

    token = _create_token(str(user.id), user.email, settings.jwt_secret)
    return AuthResponse(
        token=token,
        user={"id": str(user.id), "email": user.email},
    )


@router.post("/login", response_model=AuthResponse)
def login(
    body: AuthRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AuthResponse:
    user = db.execute(
        select(User).where(User.email == body.email)
    ).scalar_one_or_none()

    if not user or not _verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    token = _create_token(str(user.id), user.email, settings.jwt_secret)
    return AuthResponse(
        token=token,
        user={"id": str(user.id), "email": user.email},
    )
