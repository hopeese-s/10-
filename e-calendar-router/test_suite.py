"""
test_suite.py
Automated verification test suite for E-Calendar Auto Drive Router & AI Summary (v2)
Tests:
1. Schedule Resolver (Active class, Grace period, Off-schedule)
2. Asia/Bangkok Timezone Handling
3. Session Manager Debounce & Grouping
4. LINE Webhook HMAC-SHA256 Signature Verification
5. Healthcheck Endpoint
"""
import os
import sys
import hmac
import hashlib
import base64
import asyncio
from datetime import datetime
from zoneinfo import ZoneInfo

# Ensure current directory is in PYTHONPATH and stdout is UTF-8
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

import config
import schedule_service
import session_manager
import line_client
from main import app

BANGKOK_TZ = ZoneInfo("Asia/Bangkok")


def test_schedule_resolution():
    print("─── Test 1: Schedule Resolution & Grace Period ───")
    # Test Wednesday 10:00 (In class: SCMA101 09:00 - 11:00)
    dt_in_class = datetime(2026, 9, 2, 10, 0, tzinfo=BANGKOK_TZ)
    res1 = schedule_service.resolve_current_subject(dt_in_class)
    assert res1["matched_code"] == "SCMA101", f"Expected SCMA101, got {res1['matched_code']}"
    assert res1["category"] == "Mathematics", f"Expected Mathematics, got {res1['category']}"
    print("  ✅ [PASS] Active class match: Wednesday 10:00 -> SCMA101 (Mathematics)")

    # Test Wednesday 11:20 (Grace period: ended at 11:00, 20 mins ago <= 30 mins)
    dt_grace = datetime(2026, 9, 2, 11, 20, tzinfo=BANGKOK_TZ)
    res2 = schedule_service.resolve_current_subject(dt_grace)
    assert res2["matched_code"] == "SCMA101", f"Expected SCMA101 via grace period, got {res2['matched_code']}"
    assert res2["category"] == "Mathematics", f"Expected Mathematics, got {res2['category']}"
    print("  ✅ [PASS] Grace period match: Wednesday 11:20 (+20m) -> SCMA101 (Mathematics)")

    # Test Wednesday 12:00 (Past grace period: ended at 11:00, 60 mins ago > 30 mins)
    dt_off = datetime(2026, 9, 2, 12, 0, tzinfo=BANGKOK_TZ)
    res3 = schedule_service.resolve_current_subject(dt_off)
    assert res3["matched_code"] == "UNSORTED", f"Expected UNSORTED, got {res3['matched_code']}"
    assert res3["category"] == "00_General_Unsorted", f"Expected 00_General_Unsorted, got {res3['category']}"
    print("  ✅ [PASS] Off-schedule match: Wednesday 12:00 (+60m) -> UNSORTED (00_General_Unsorted)")

    # Test Friday 10:30 (Lab class: SCPY111 09:30 - 12:30)
    dt_lab = datetime(2026, 9, 4, 10, 30, tzinfo=BANGKOK_TZ)
    res4 = schedule_service.resolve_current_subject(dt_lab)
    assert res4["matched_code"] == "SCPY111", f"Expected SCPY111, got {res4['matched_code']}"
    assert res4["category"] == "Lab", f"Expected Lab, got {res4['category']}"
    assert res4["sub_category"] == "Physics_Lab", f"Expected Physics_Lab, got {res4['sub_category']}"
    print("  ✅ [PASS] Lab class match: Friday 10:30 -> SCPY111 (Lab / Physics_Lab)")


def test_signature_verification():
    print("─── Test 2: Webhook HMAC Signature Security ───")
    test_secret = "test_line_channel_secret_12345"
    os.environ["LINE_CHANNEL_SECRET"] = test_secret
    config.LINE_CHANNEL_SECRET = test_secret

    import json
    payload = {
        "destination": "Utest12345678",
        "events": [
            {
                "replyToken": "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA",
                "type": "message",
                "mode": "active",
                "timestamp": 1693650000000,
                "source": {
                    "type": "user",
                    "userId": "U4af4980629abcdef"
                },
                "webhookEventId": "01FZ74A0TDDPYRVKNK77XDT3VQ",
                "deliveryContext": {
                    "isRedelivery": False
                },
                "message": {
                    "id": "325708",
                    "type": "text",
                    "text": "hello",
                    "quoteToken": "q3g89e_token"
                }
            }
        ]
    }
    body = json.dumps(payload)

    # Calculate correct signature
    correct_sig = base64.b64encode(
        hmac.new(test_secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8")

    # 1. Valid Signature Test
    events = line_client.parse_webhook(body, correct_sig)
    assert len(events) == 1
    assert events[0].message.text == "hello"
    print("  ✅ [PASS] Valid signature accepted and parsed successfully")

    # 2. Invalid Signature Test (Must reject)
    rejected = False
    try:
        line_client.parse_webhook(body, "invalid_forged_signature_xyz")
    except line_client.InvalidSignatureError:
        rejected = True
    except Exception as e:
        rejected = ("signature" in str(e).lower())

    assert rejected, "Security failure: Invalid signature was not rejected!"
    print("  ✅ [PASS] Forged / invalid signature rejected (HTTP 403 Security Guarantee)")


async def test_session_debounce():
    print("─── Test 3: Multi-File Session Debounce & Grouping ───")
    # Set short debounce for testing (0.4 seconds)
    config.SESSION_DEBOUNCE_SECONDS = 0.4
    session_manager.SESSION_DEBOUNCE_SECONDS = 0.4
    session_manager.clear_all()

    subject_info = {
        "date_str": "2026-09-02",
        "matched_code": "SCMA101",
        "category": "Mathematics",
        "sub_category": None
    }

    flushed_files = []

    async def on_flush(key, subj, files):
        flushed_files.extend(files)

    # 1. Add File 1 (Slide PDF)
    await session_manager.add_file(
        subject_info,
        {"filename": "Slide_Calc.pdf", "mime_type": "application/pdf"},
        on_flush
    )

    # 2. Add File 2 (Audio m4a) after 0.2s (within 0.4s debounce window)
    await asyncio.sleep(0.2)
    await session_manager.add_file(
        subject_info,
        {"filename": "Audio_Lecture.m4a", "mime_type": "audio/mp4"},
        on_flush
    )

    # At 0.3s, flush should NOT have happened yet because countdown was reset
    await asyncio.sleep(0.1)
    assert len(flushed_files) == 0, f"Flush triggered too early! Expected 0 files, got {len(flushed_files)}"
    print("  ✅ [PASS] Debounce timer reset on second file arrival")

    # Wait for debounce to finish (0.4s after second file)
    await asyncio.sleep(0.5)
    assert len(flushed_files) == 2, f"Expected 2 consolidated files, got {len(flushed_files)}"
    assert flushed_files[0]["filename"] == "Slide_Calc.pdf"
    assert flushed_files[1]["filename"] == "Audio_Lecture.m4a"
    print("  ✅ [PASS] Grouped both files into 1 consolidated session flush")


def test_fastapi_endpoints():
    print("─── Test 4: FastAPI Webhook & Healthcheck Endpoints ───")
    from starlette.testclient import TestClient
    client = TestClient(app)

    # 1. Healthcheck test
    health_res = client.get("/health")
    assert health_res.status_code == 200, f"Expected 200, got {health_res.status_code}"
    health_json = health_res.json()
    assert health_json["status"] == "ok"
    assert health_json["service"] == "e-calendar-router"
    print("  ✅ [PASS] GET /health responded with 200 OK and valid status")

    # 2. Webhook invalid signature test
    bad_res = client.post(
        "/webhook",
        content='{"events":[]}',
        headers={"X-Line-Signature": "invalid_signature_xyz"}
    )
    assert bad_res.status_code == 403, f"Expected 403 Forbidden for bad signature, got {bad_res.status_code}"
    print("  ✅ [PASS] POST /webhook rejected forged request with HTTP 403")


def main():
    print("\n" + "=" * 60)
    print("🚀 Running E-Calendar Auto Drive Router v2 Test Suite")
    print("=" * 60 + "\n")

    test_schedule_resolution()
    print()
    test_signature_verification()
    print()
    asyncio.run(test_session_debounce())
    print()
    test_fastapi_endpoints()

    print("\n" + "=" * 60)
    print("🎉 ALL 4 TEST SUITES PASSED SUCCESSFULLY! (Zero Failures)")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
