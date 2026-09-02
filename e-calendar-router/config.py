import os
import sys
from zoneinfo import ZoneInfo
from dotenv import load_dotenv

# Load local .env file if available
load_dotenv()

LINE_CHANNEL_ACCESS_TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "")
LINE_CHANNEL_SECRET = os.environ.get("LINE_CHANNEL_SECRET", "")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
# Latest active Google GenAI model (e.g. gemini-2.5-flash, gemini-2.0-flash)
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

GOOGLE_SERVICE_ACCOUNT_JSON = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")
GOOGLE_DRIVE_PARENT_ID = os.environ.get("GOOGLE_DRIVE_PARENT_ID", "")

ECALENDAR_BACKUP_URL = os.environ.get("ECALENDAR_BACKUP_URL", "https://e-calen.up.railway.app/api/backup")
ECALENDAR_SCHEDULE_URL = os.environ.get("ECALENDAR_SCHEDULE_URL", "https://e-calen.up.railway.app/api/schedule")
ECALENDAR_SYNC_KEY = os.environ.get("ECALENDAR_SYNC_KEY", "1")

SCHEDULE_CACHE_TTL_SECONDS = int(os.environ.get("SCHEDULE_CACHE_TTL_SECONDS", "300"))
SESSION_DEBOUNCE_SECONDS = int(os.environ.get("SESSION_DEBOUNCE_SECONDS", "150"))
GRACE_PERIOD_MINUTES = int(os.environ.get("GRACE_PERIOD_MINUTES", "30"))

TIMEZONE_NAME = os.environ.get("TIMEZONE", "Asia/Bangkok")
try:
    TZ = ZoneInfo(TIMEZONE_NAME)
except Exception:
    TZ = ZoneInfo("Asia/Bangkok")

# Category mapping supporting aliases and actual course codes
CATEGORY_MAP = {
    # Aliases
    "MATH": {"category": "Mathematics", "sub": None},
    "PHY": {"category": "Physics", "sub": None},
    "CHEM": {"category": "Chemistry", "sub": None},
    "BIO": {"category": "Biology", "sub": None},
    "EGBI100": {"category": "EGBI100", "sub": None},
    "COMPRO": {"category": "Computer_Programming", "sub": None},
    "PHY_LAB": {"category": "Lab", "sub": "Physics_Lab"},
    "CHEM_LAB": {"category": "Lab", "sub": "Chemistry_Lab"},
    "BIO_LAB": {"category": "Lab", "sub": "Biology_Lab"},

    # Official E-Calendar curriculum course codes
    "SCMA101": {"category": "Mathematics", "sub": None},
    "SCPY161": {"category": "Physics", "sub": None},
    "SCCH161": {"category": "Chemistry", "sub": None},
    "SCSL190": {"category": "Biology", "sub": None},
    "EGBI122": {"category": "Computer_Programming", "sub": None},
    "SCPY111": {"category": "Lab", "sub": "Physics_Lab"},
    "SCCH169": {"category": "Lab", "sub": "Chemistry_Lab"},
    "SCBE102": {"category": "Lab", "sub": "Biology_Lab"},
    "LAEN182": {"category": "00_General_Unsorted", "sub": None},
}

UNSORTED = {"category": "00_General_Unsorted", "sub": None}
