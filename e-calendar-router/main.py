"""
main.py
FastAPI Webhook Server for E-Calendar Auto Drive Router & AI Summary (v2)
"""
import os
import tempfile
import logging
from datetime import datetime
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.webhooks import (
    MessageEvent,
    FileMessageContent,
    AudioMessageContent,
    ImageMessageContent,
    TextMessageContent,
)

import config
import line_client
import schedule_service
import session_manager
import drive_service
import ai_summarizer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("main")

app = FastAPI(
    title="E-Calendar Auto Drive Router & AI Summary",
    version="2.0.0",
    description="LINE Webhook router that maps iPad study files to active E-Calendar courses, saves to Google Drive, and generates consolidated Gemini AI summaries."
)

MIME_MAP = {
    "pdf": "application/pdf",
    "m4a": "audio/mp4",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "e-calendar-router",
        "version": "2.0.0",
        "gemini_model": config.GEMINI_MODEL,
        "active_sessions": session_manager.get_active_sessions_count(),
        "timezone": config.TIMEZONE_NAME
    }


@app.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    signature = request.headers.get("X-Line-Signature", "")
    body = (await request.body()).decode("utf-8")

    try:
        events = line_client.parse_webhook(body, signature)
    except InvalidSignatureError:
        logger.warning("Rejected webhook request: Invalid X-Line-Signature")
        raise HTTPException(status_code=403, detail="Invalid signature")
    except Exception as parse_err:
        logger.error(f"Webhook parsing exception: {parse_err}")
        raise HTTPException(status_code=400, detail=str(parse_err))

    for event in events:
        if not isinstance(event, MessageEvent):
            continue

        # 1. Media and Document Messages (File, Audio, Image)
        if isinstance(event.message, (FileMessageContent, AudioMessageContent, ImageMessageContent)):
            # Fast Acknowledgment (<30s) to keep reply token valid and inform user
            subj_preview = schedule_service.resolve_current_subject()
            matched_code = subj_preview.get("matched_code", "UNSORTED")
            ack_msg = (
                f"📥 ได้รับไฟล์แล้ว! กำลังจับคู่วิชา: [{matched_code}]\n"
                f"⚡ กำลังบันทึกไฟล์เข้า Google Drive และรอรวบรวมไฟล์ในคาบเพื่อสรุป AI ให้อัตโนมัติครับ..."
            )
            line_client.reply_ack(event.reply_token, ack_msg)
            background_tasks.add_task(handle_file_event, event)

        # 2. Text Messages (Commands & Queries)
        elif isinstance(event.message, TextMessageContent):
            user_text = event.message.text.strip().lower()
            if any(k in user_text for k in ["ตาราง", "schedule", "คาบ", "เรียน"]):
                subj = schedule_service.resolve_current_subject()
                date_now = datetime.now(config.TZ)
                day_thai = date_now.strftime("%A")
                time_now = date_now.strftime("%H:%M")
                
                resp_text = (
                    f"📅 สถานะตารางเรียนปัจจุบัน ({day_thai} {time_now} น.):\n"
                    f"• คาบปัจจุบัน/ล่าสุด: {subj.get('matched_code', 'ไม่มีคาบเรียน')} ({subj.get('matched_name', 'นอกเวลาเรียน')})\n"
                    f"• โฟลเดอร์ Drive ปลายทาง: {subj.get('category')} / {subj.get('sub_category') or 'Root'}\n\n"
                    f"💡 สามารถส่งไฟล์สไลด์ PDF หรือไฟล์เสียงเข้ามาได้ทันที ระบบจะจัดเก็บและสรุปให้ตรงวิชาครับ"
                )
                line_client.reply_ack(event.reply_token, resp_text)
            else:
                help_text = (
                    f"👋 สวัสดีครับ! E-Calendar Study Space Router 📚\n\n"
                    f"📌 ส่งไฟล์เอกสาร PDF, บันทึกเสียงการสอน (m4a/mp3), หรือภาพสไลด์เข้ามาได้ทันที\n"
                    f"ระบบจะ:\n"
                    f"1. จับคู่วิชาตามตารางเรียน E-Calendar อัตโนมัติ\n"
                    f"2. เก็บไฟล์ขึ้น Google Drive ในโฟลเดอร์วิชา (โครงสร้างแบน พร้อมลากเข้า NotebookLM)\n"
                    f"3. สรุปเนื้อหาด้วย Google Gemini และแจ้งเตือนกลับในแชทนี้ครับ"
                )
                line_client.reply_ack(event.reply_token, help_text)

    return {"status": "received"}


async def handle_file_event(event):
    """Processes downloaded media file: immediately saves to Drive, then queues for debounce."""
    message = event.message
    user_id = getattr(event.source, "user_id", "")
    message_id = message.id

    ext = _infer_ext(message)
    mime_type = MIME_MAP.get(ext, "application/octet-stream")

    # 1. Download raw content from LINE Content API
    try:
        content = line_client.download_content(message_id)
    except Exception as dl_err:
        logger.error(f"Failed to download LINE media {message_id}: {dl_err}")
        return

    tmp_path = os.path.join(tempfile.gettempdir(), f"{message_id}.{ext}")
    with open(tmp_path, "wb") as f:
        f.write(content)

    # 2. Resolve Course & Drive Folder
    subject_info = schedule_service.resolve_current_subject()
    category = subject_info["category"]
    sub_category = subject_info.get("sub_category")

    folder_id = None
    try:
        folder_id = drive_service.resolve_subject_folder(category, sub_category)
    except Exception as f_err:
        logger.warning(f"Could not resolve Drive folder (check credentials): {f_err}")

    # 3. Construct standard flat Drive filename
    now = datetime.now(config.TZ)
    now_prefix = now.strftime("%Y-%m-%d_%H%M")
    type_labels = {
        "pdf": "Slide",
        "m4a": "Audio",
        "mp3": "Audio",
        "wav": "Audio",
        "jpg": "Image",
        "png": "Image",
        "jpeg": "Image",
    }
    file_type_label = type_labels.get(ext, "File")
    original_name = getattr(message, "file_name", None)
    clean_original = ""
    if original_name:
        clean_original = "_" + "".join(c for c in original_name if c.isalnum() or c in "._- ")[:30]

    drive_filename = f"{now_prefix}_{file_type_label}{clean_original}_{message_id[:6]}.{ext}"

    # 4. Upload raw original file to Google Drive IMMEDIATELY (Safety First)
    file_drive_link = None
    if folder_id:
        try:
            file_drive_link = drive_service.upload_file(tmp_path, drive_filename, mime_type, folder_id)
            logger.info(f"Safely uploaded original file to Drive: {drive_filename}")
        except Exception as up_err:
            logger.error(f"Immediate Drive upload failed: {up_err}")

    # 5. Register with Session Manager for grouping and debounced Gemini summary
    file_entry = {
        "local_path": tmp_path,
        "mime_type": mime_type,
        "drive_filename": drive_filename,
        "drive_link": file_drive_link,
        "message_id": message_id
    }

    async def on_flush(session_key, subj_info, files):
        await finalize_session(session_key, subj_info, files, folder_id, user_id)

    await session_manager.add_file(subject_info, file_entry, on_flush)


async def finalize_session(session_key, subject_info, files, folder_id, user_id):
    """Executes when debounce countdown expires: summarizes all files with Gemini, uploads .md, pushes to LINE."""
    md_path = None
    try:
        pairs = [(f["local_path"], f["mime_type"]) for f in files if os.path.exists(f["local_path"])]
        label = f"{subject_info.get('matched_code', 'General')} - {subject_info.get('matched_name', '')} ({subject_info.get('date_str')})"

        # 1. AI Summarization
        short_summary, full_md = ai_summarizer.summarize_session(pairs, label)

        # 2. Write Markdown file
        now = datetime.now(config.TZ)
        time_prefix = now.strftime("%Y-%m-%d_%H%M")
        md_filename = f"{time_prefix}_AI_Brief_Summary.md"
        md_path = os.path.join(tempfile.gettempdir(), f"{session_key}_{md_filename}")
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(full_md)

        # 3. Upload Summary to Google Drive
        summary_drive_link = None
        if folder_id and os.path.exists(md_path):
            try:
                summary_drive_link = drive_service.upload_file(
                    md_path, md_filename, "text/markdown", folder_id
                )
            except Exception as e:
                logger.error(f"Failed to upload summary markdown to Drive: {e}")

        # 4. Push message to LINE
        if user_id:
            reply_lines = [
                f"🎓 สรุปคาบเรียน: {label}",
                f"📁 บันทึกไฟล์แล้วทั้งหมด {len(files)} รายการ",
                f"",
                f"📝 สรุปย่อ:",
                f"{short_summary[:350]}",
                f""
            ]
            if summary_drive_link:
                reply_lines.append(f"📄 อ่านสรุปฉบับเต็ม (.md): {summary_drive_link}")
            line_client.push_summary(user_id, "\n".join(reply_lines))

    except Exception as e:
        logger.error(f"Error finalizing session {session_key}: {e}", exc_info=True)

    finally:
        # 5. Clean up temporary files on disk to prevent storage accumulation
        for f in files:
            loc = f.get("local_path")
            if loc and os.path.exists(loc):
                try:
                    os.remove(loc)
                except Exception:
                    pass
        if md_path and os.path.exists(md_path):
            try:
                os.remove(md_path)
            except Exception:
                pass


def _infer_ext(message) -> str:
    """Infers file extension from LINE message object."""
    file_name = getattr(message, "file_name", None)
    if file_name and "." in file_name:
        return file_name.rsplit(".", 1)[-1].lower()

    type_name = message.__class__.__name__
    if "Audio" in type_name:
        return "m4a"
    if "Image" in type_name:
        return "jpg"
    return "pdf"
