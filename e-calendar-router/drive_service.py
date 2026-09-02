"""
drive_service.py
Google Drive integration:
- Service account authentication (JSON string or file)
- Flat subject folder structure (NotebookLM-friendly, no subfolder nesting by date)
- Folder ID caching to avoid unnecessary API round-trips
- Resumable media uploader
"""
import os
import json
import logging
from typing import Optional, Dict
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

from config import GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_DRIVE_PARENT_ID

logger = logging.getLogger("drive_service")

SCOPES = ["https://www.googleapis.com/auth/drive.file"]

_folder_cache: Dict[str, str] = {}
_drive_service = None


def _get_service():
    """Initializes and caches Google Drive v3 client."""
    global _drive_service
    if _drive_service is not None:
        return _drive_service

    if GOOGLE_SERVICE_ACCOUNT_JSON:
        trimmed = GOOGLE_SERVICE_ACCOUNT_JSON.strip()
        if trimmed.startswith("{"):
            info = json.loads(trimmed)
            creds = Credentials.from_service_account_info(info, scopes=SCOPES)
        elif os.path.exists(trimmed):
            creds = Credentials.from_service_account_file(trimmed, scopes=SCOPES)
        else:
            raise ValueError(f"GOOGLE_SERVICE_ACCOUNT_JSON is neither valid JSON nor existing file: {trimmed[:20]}...")
    elif os.path.exists("service_account.json"):
        creds = Credentials.from_service_account_file("service_account.json", scopes=SCOPES)
    else:
        raise RuntimeError("No Google Service Account credentials found (check GOOGLE_SERVICE_ACCOUNT_JSON or service_account.json)")

    _drive_service = build("drive", "v3", credentials=creds, cache_discovery=False)
    return _drive_service


def find_or_create_folder(name: str, parent_id: str) -> str:
    """Finds or creates a Google Drive folder by name inside parent_id."""
    cache_key = f"{parent_id}:{name}"
    if cache_key in _folder_cache:
        return _folder_cache[cache_key]

    service = _get_service()
    query = (
        f"'{parent_id}' in parents and name = '{name}' "
        "and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    )

    try:
        res = service.files().list(q=query, fields="files(id, name)").execute()
        items = res.get("files", [])
        if items:
            folder_id = items[0]["id"]
            _folder_cache[cache_key] = folder_id
            return folder_id

        # Create folder
        meta = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id]
        }
        folder = service.files().create(body=meta, fields="id").execute()
        folder_id = folder["id"]
        _folder_cache[cache_key] = folder_id
        logger.info(f"Created Google Drive folder: '{name}' (ID: {folder_id})")
        return folder_id

    except Exception as e:
        logger.error(f"Error finding/creating folder '{name}': {e}")
        raise


def resolve_subject_folder(category: str, sub_category: Optional[str] = None) -> str:
    """
    Resolves the subject folder ID in Google Drive.
    Flat hierarchy: Files live directly in the subject folder (no date subfolder),
    which is optimal for NotebookLM bulk file selection.
    """
    if not GOOGLE_DRIVE_PARENT_ID:
        raise RuntimeError("GOOGLE_DRIVE_PARENT_ID is not configured")

    parent = find_or_create_folder(category, GOOGLE_DRIVE_PARENT_ID)
    if sub_category:
        parent = find_or_create_folder(sub_category, parent)
    return parent


def upload_file(local_path: str, drive_filename: str, mime_type: str, folder_id: str) -> str:
    """Uploads a local file to Google Drive and returns a clickable view link."""
    service = _get_service()
    meta = {
        "name": drive_filename,
        "parents": [folder_id]
    }
    media = MediaFileUpload(local_path, mimetype=mime_type, resumable=True)

    try:
        file = service.files().create(
            body=meta,
            media_body=media,
            fields="id, webViewLink, webContentLink"
        ).execute()

        file_id = file.get("id")
        link = file.get("webViewLink") or f"https://drive.google.com/file/d/{file_id}/view"
        logger.info(f"Uploaded '{drive_filename}' to Drive (ID: {file_id})")
        return link

    except Exception as e:
        logger.error(f"Failed to upload file '{drive_filename}' to Drive: {e}")
        raise
