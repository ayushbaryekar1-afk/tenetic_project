import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from errors import AppError
from routes import chat, health

logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title=f"{settings.app_name} API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.code, "message": exc.message})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    fields = {str(part) for err in exc.errors() for part in err.get("loc", ())}
    if "message" in fields:
        message = "Enter a message between 1 and 4000 characters."
    elif "conversation_id" in fields:
        message = "The conversation ID is not valid."
    else:
        message = "The request was not valid."
    return JSONResponse(status_code=422, content={"error": "validation_error", "message": message})


app.include_router(health.router)
app.include_router(chat.router)
