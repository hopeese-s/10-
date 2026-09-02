"""
schedule_service.py
Fetches live class schedule from E-Calendar app (single source of truth)
with in-memory TTL caching, Asia/Bangkok timezone accuracy, and 30-minute grace period.
"""
import time
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
import httpx

from config import (
    ECALENDAR_SCHEDULE_URL,
    ECALENDAR_BACKUP_URL,
    ECALENDAR_SYNC_KEY,
    SCHEDULE_CACHE_TTL_SECONDS,
    GRACE_PERIOD_MINUTES,
    TZ,
    CATEGORY_MAP,
    UNSORTED,
)

logger = logging.getLogger("schedule_service")

# Default BME curriculum fallback if both live endpoint and cache fail
DEFAULT_BME_CURRICULUM = [
    {"day": "Monday", "start": "09:30", "end": "12:30", "code": "SCPY161", "name": "General Physics I"},
    {"day": "Monday", "start": "13:30", "end": "17:30", "code": "EGBI122", "name": "Computer Programming"},
    {"day": "Tuesday", "start": "08:30", "end": "10:30", "code": "LAEN182", "name": "English for General Academic Purposes"},
    {"day": "Tuesday", "start": "13:30", "end": "16:30", "code": "SCBE102", "name": "General Biology Laboratory 1"},
    {"day": "Tuesday", "start": "17:40", "end": "18:40", "code": "EGBI100", "name": "BME in the Real World"},
    {"day": "Wednesday", "start": "09:00", "end": "11:00", "code": "SCMA101", "name": "Mathematics I"},
    {"day": "Thursday", "start": "09:30", "end": "12:30", "code": "SCSL190", "name": "Wonderful Life (Biology)"},
    {"day": "Thursday", "start": "13:30", "end": "16:30", "code": "SCCH161", "name": "General Chemistry"},
    {"day": "Friday", "start": "09:30", "end": "12:30", "code": "SCPY111", "name": "Physics Laboratory I"},
    {"day": "Friday", "start": "13:30", "end": "16:30", "code": "SCCH169", "name": "Chemistry Laboratory"},
]

_cache: Dict[str, Any] = {"data": None, "fetched_at": 0}


def _normalize_curriculum_list(items: list) -> List[Dict[str, Any]]:
    """Converts raw list of courses into standard schema: [{'day': 'Wednesday', 'start': '09:00', 'end': '11:00', 'code': 'SCMA101'}]"""
    day_name_map = {
        "monday": "Monday", "tuesday": "Tuesday", "wednesday": "Wednesday",
        "thursday": "Thursday", "friday": "Friday", "saturday": "Saturday", "sunday": "Sunday"
    }
    normalized = []
    for ev in items:
        if not isinstance(ev, dict):
            continue
        raw_day = str(ev.get("day") or ev.get("weekday") or "").lower().strip()
        day = day_name_map.get(raw_day, raw_day.capitalize() if raw_day else "")
        start = str(ev.get("start") or ev.get("start_time") or "").strip()
        end = str(ev.get("end") or ev.get("end_time") or "").strip()
        code = str(ev.get("code") or ev.get("subject_code") or ev.get("title") or "").strip()

        if day and start and end and code:
            normalized.append({
                "day": day,
                "start": start,
                "end": end,
                "code": code,
                "name": ev.get("name") or ev.get("title") or code
            })
    return normalized


def _fetch_schedule_from_api() -> List[Dict[str, Any]]:
    """Tries fetching from /api/schedule first, then falls back to /api/backup."""
    # 1. Primary endpoint: /api/schedule
    try:
        with httpx.Client(timeout=6.0) as client:
            resp = client.get(
                ECALENDAR_SCHEDULE_URL,
                params={"sync_key": ECALENDAR_SYNC_KEY}
            )
            if resp.status_code == 200:
                data = resp.json()
                curriculum = data.get("curriculum")
                if isinstance(curriculum, list) and len(curriculum) > 0:
                    normalized = _normalize_curriculum_list(curriculum)
                    if normalized:
                        return normalized
    except Exception as e:
        logger.warning(f"Failed to fetch from {ECALENDAR_SCHEDULE_URL}: {e}")

    # 2. Secondary endpoint: /api/backup
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(
                ECALENDAR_BACKUP_URL,
                params={"sync_key": ECALENDAR_SYNC_KEY}
            )
            if resp.status_code == 200:
                raw = resp.json()
                # If raw is the whole store dict: {"1": {...}, ...}
                curriculum = []
                if isinstance(raw, dict):
                    user_data = raw.get(ECALENDAR_SYNC_KEY) or raw.get("1") or {}
                    curriculum = user_data.get("curriculum") or raw.get("curriculum") or []
                elif isinstance(raw, list):
                    curriculum = raw

                if isinstance(curriculum, list) and len(curriculum) > 0:
                    normalized = _normalize_curriculum_list(curriculum)
                    if normalized:
                        return normalized
    except Exception as e:
        logger.warning(f"Failed to fetch from {ECALENDAR_BACKUP_URL}: {e}")

    # 3. Fallback to default BME curriculum
    logger.info("Using DEFAULT_BME_CURRICULUM fallback.")
    return DEFAULT_BME_CURRICULUM


def get_schedule(force_refresh: bool = False) -> List[Dict[str, Any]]:
    """Returns normalized schedule with caching."""
    now_ts = time.time()
    if (
        not force_refresh
        and _cache["data"] is not None
        and (now_ts - _cache["fetched_at"]) < SCHEDULE_CACHE_TTL_SECONDS
    ):
        return _cache["data"]

    try:
        schedule = _fetch_schedule_from_api()
        _cache["data"] = schedule
        _cache["fetched_at"] = now_ts
        return schedule
    except Exception as e:
        if _cache["data"] is not None:
            logger.warning(f"Error refreshing schedule, using cached data: {e}")
            return _cache["data"]
        logger.error(f"Error fetching schedule: {e}, falling back to static default")
        return DEFAULT_BME_CURRICULUM


def resolve_current_subject(target_dt: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Identifies the active subject based on current Bangkok time.
    Includes a 30-minute grace period after class finishes.
    """
    now = target_dt or datetime.now(TZ)
    day_str = now.strftime("%A")
    time_str = now.strftime("%H:%M")
    date_str = now.strftime("%Y-%m-%d")

    schedule = get_schedule()
    today_classes = [c for c in schedule if c["day"].lower() == day_str.lower()]

    matched_code: Optional[str] = None
    matched_class: Optional[Dict[str, Any]] = None

    # 1. Check if currently inside class time
    for cls in today_classes:
        if cls["start"] <= time_str <= cls["end"]:
            matched_code = cls["code"]
            matched_class = cls
            break

    # 2. Check if within grace period after class ended
    if matched_code is None:
        for cls in today_classes:
            try:
                end_dt = datetime.strptime(f"{date_str} {cls['end']}", "%Y-%m-%d %H:%M")
                end_dt = end_dt.replace(tzinfo=TZ)
                minutes_since_end = (now - end_dt).total_seconds() / 60
                if 0 <= minutes_since_end <= GRACE_PERIOD_MINUTES:
                    matched_code = cls["code"]
                    matched_class = cls
                    break
            except Exception:
                continue

    if matched_code is None:
        course_info = UNSORTED
    else:
        # Check CATEGORY_MAP for exact match or normalized prefix
        course_info = CATEGORY_MAP.get(matched_code)
        if not course_info:
            # Try upper / stripped match
            clean_code = matched_code.upper().replace(" ", "")
            course_info = CATEGORY_MAP.get(clean_code, UNSORTED)

    return {
        "category": course_info["category"],
        "sub_category": course_info.get("sub"),
        "matched_code": matched_code or "UNSORTED",
        "matched_name": matched_class.get("name") if matched_class else "General Files",
        "date_str": date_str,
        "time_str": time_str,
        "is_unsorted": (matched_code is None)
    }
