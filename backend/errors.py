"""Application errors. Messages here are shown to end users, so never put secrets in them."""


class AppError(Exception):
    def __init__(self, message: str, status_code: int = 500, code: str = "internal_error"):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
