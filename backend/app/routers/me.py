from typing import Annotated
from fastapi import APIRouter, Depends
from ..dependencies import CurrentUser, get_current_user

router = APIRouter()


@router.get("/me")
def get_me(current_user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
    return current_user
