from typing import Annotated, Optional
import uuid
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from jwt.exceptions import InvalidTokenError
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .config import Settings, get_settings
from .db.session import get_db
from .models.user import UserProfile

bearer_scheme = HTTPBearer()
optional_bearer_scheme = HTTPBearer(auto_error=False)


class CurrentUser(BaseModel):
    id: str
    email: str


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CurrentUser:
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
        )
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user_id: str | None = payload.get("sub")
    email: str | None = payload.get("email")

    if not user_id or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload missing required fields.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return CurrentUser(id=user_id, email=email)


def get_optional_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(optional_bearer_scheme)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Optional[CurrentUser]:
    """Like get_current_user but returns None instead of 401 when no/invalid token."""
    if credentials is None:
        return None
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
        user_id = payload.get("sub")
        email = payload.get("email")
        if user_id and email:
            return CurrentUser(id=user_id, email=email)
    except InvalidTokenError:
        pass
    return None


def require_patient_role(db: Session, user_id: str) -> None:
    """Verify the user has the patient role. Raises 403 if doctor or no role set."""
    from .models.user import UserProfile, UserRole

    profile = db.get(UserProfile, uuid.UUID(user_id))
    if profile is None or profile.role != UserRole.patient:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action is only available to patients.",
        )


def get_admin_user(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CurrentUser:
    """Verify that the current user has admin privileges."""
    profile = db.query(UserProfile).filter(UserProfile.id == current_user.id).first()

    if not profile or not profile.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )

    return current_user
