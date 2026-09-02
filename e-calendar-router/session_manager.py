"""
session_manager.py
Debounce/grouping engine:
Collects incoming files (slides, audio memos, photos) belonging to the same lecture
and triggers a single consolidated Gemini summary when debounce timer expires.
"""
import asyncio
import logging
from typing import Dict, Any, Callable

from config import SESSION_DEBOUNCE_SECONDS

logger = logging.getLogger("session_manager")

_sessions: Dict[str, Dict[str, Any]] = {}


def _session_key(subject_info: Dict[str, Any]) -> str:
    """Unique key identifying a specific lecture session on a given date."""
    date_str = subject_info.get("date_str", "UNKNOWN")
    matched_code = subject_info.get("matched_code", "UNSORTED")
    return f"{date_str}_{matched_code}"


async def add_file(
    subject_info: Dict[str, Any],
    file_entry: Dict[str, Any],
    on_flush: Callable
):
    """
    Registers a new file into the session group.
    Resets debounce countdown (default 150 seconds).
    """
    key = _session_key(subject_info)

    if key not in _sessions:
        _sessions[key] = {
            "files": [],
            "subject_info": subject_info,
            "task": None
        }

    _sessions[key]["files"].append(file_entry)
    file_count = len(_sessions[key]["files"])
    logger.info(f"Added file to session '{key}' (Total queued: {file_count})")

    # Cancel previous debounce timer if running
    if _sessions[key]["task"] and not _sessions[key]["task"].done():
        _sessions[key]["task"].cancel()
        logger.info(f"Reset debounce countdown for session '{key}' ({SESSION_DEBOUNCE_SECONDS}s)")

    async def _debounced_flush():
        try:
            await asyncio.sleep(SESSION_DEBOUNCE_SECONDS)
            session_data = _sessions.pop(key, None)
            if not session_data or not session_data.get("files"):
                return

            files = session_data["files"]
            subj = session_data.get("subject_info", subject_info)
            logger.info(f"Debounce expired for session '{key}'. Processing {len(files)} file(s)...")
            await on_flush(key, subj, files)
        except asyncio.CancelledError:
            # Expected when cancelled by incoming new file
            pass
        except Exception as e:
            logger.error(f"Error executing on_flush for session '{key}': {e}", exc_info=True)

    _sessions[key]["task"] = asyncio.create_task(_debounced_flush())


def get_active_sessions_count() -> int:
    """Returns number of active pending debouncing sessions."""
    return len(_sessions)


def clear_all():
    """Cancels and clears all active sessions (used for testing/shutdown)."""
    for key, data in list(_sessions.items()):
        task = data.get("task")
        if task and not task.done():
            task.cancel()
    _sessions.clear()
