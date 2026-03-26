from __future__ import annotations

from fastapi import APIRouter, File, UploadFile, Request
from fastapi.responses import FileResponse, JSONResponse

router = APIRouter(prefix="/api", tags=["files"])


@router.post("/upload")
async def upload_file_api(request: Request, file: UploadFile = File(...)):
    storage_service = request.app.state.storage_service
    data = await file.read()
    saved = storage_service.save_upload(file.filename, data)
    return {
        "success": True,
        "filename": saved["filename"],
        "original_name": file.filename,
        "url": saved["url"],
        "size": saved["size"],
        "content_type": file.content_type,
    }


@router.get("/uploads/{filename}")
async def get_upload_file(filename: str, request: Request):
    storage_service = request.app.state.storage_service
    file_path = storage_service.get_upload_path(filename)
    if not file_path.exists():
        return JSONResponse({"error": "文件不存在"}, status_code=404)
    return FileResponse(file_path)


@router.get("/files/{filename}")
async def get_report_file(filename: str, request: Request):
    storage_service = request.app.state.storage_service
    file_path = storage_service.get_report_path(filename)
    if not file_path.exists():
        return JSONResponse({"error": "文件不存在"}, status_code=404)
    return FileResponse(file_path, filename=filename)
