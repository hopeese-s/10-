"""
ai_summarizer.py
Multimodal lecture summarizer using the modern google-genai SDK.
Consolidates all files from a lecture session (slides + audio) into a single Markdown brief.
"""
import logging
from typing import List, Tuple
from config import GEMINI_API_KEY, GEMINI_MODEL

logger = logging.getLogger("ai_summarizer")

_client = None

def _get_client():
    global _client
    if _client is not None:
        return _client
    if not GEMINI_API_KEY:
        return None
    try:
        from google import genai
        _client = genai.Client(api_key=GEMINI_API_KEY)
        return _client
    except Exception as e:
        logger.error(f"Failed to initialize google-genai client: {e}")
        return None

PROMPT = (
    "ช่วยสรุปเนื้อหาคร่าวๆ จากไฟล์การเรียนชุดนี้ (อาจมีทั้งสไลด์ รูปภาพ และไฟล์เสียงของคาบเดียวกัน) ให้กระชับ:\n"
    "1. หัวข้อหลักของการเรียนคาบนี้คืออะไร\n"
    "2. สรุปสาระสำคัญ 3-5 ข้อ\n"
    "3. สูตร ทฤษฎี หรือคำศัพท์สำคัญ (ถ้ามี)\n"
    "ตอบสั้นๆ กระชับ ได้ใจความ ภาษาไทย พร้อมจัดรูปแบบ Markdown ให้อ่านง่าย"
)


def summarize_session(
    file_paths_with_mime: List[Tuple[str, str]],
    session_label: str
) -> Tuple[str, str]:
    """
    Summarizes all session files collectively.
    Returns: (short_summary_text, full_markdown)
    """
    client = _get_client()

    if not client:
        warning_text = "⚠️ ยังไม่ได้ตั้งค่า GEMINI_API_KEY — อัปโหลดไฟล์ต้นฉบับเข้า Drive เรียบร้อยแล้ว (ไม่มีสรุป AI)"
        full_md = (
            f"# สรุปคาบเรียน: {session_label}\n\n"
            f"{warning_text}\n\n"
            f"*ไฟล์ต้นฉบับทั้งหมดถูกจัดเก็บเข้าสู่ Google Drive ในโฟลเดอร์วิชาเรียบร้อยแล้ว*\n"
        )
        return warning_text, full_md

    uploaded_files = []
    try:
        for path, mime in file_paths_with_mime:
            try:
                # Upload file to Gemini Files API
                up = client.files.upload(file=path, config={"mime_type": mime})
                uploaded_files.append(up)
                logger.info(f"Uploaded file to Gemini File API: {path} ({mime})")
            except Exception as up_err:
                logger.warning(f"Could not upload file {path} to Gemini: {up_err}")

        if not uploaded_files:
            # Fallback if no files could be uploaded to Gemini
            raise RuntimeError("No files could be processed by Gemini")

        logger.info(f"Generating summary with model '{GEMINI_MODEL}' for session '{session_label}'...")
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[*uploaded_files, PROMPT]
        )

        summary_text = (response.text or "").strip()
        full_md = (
            f"# สรุปคาบเรียน: {session_label}\n\n"
            f"{summary_text}\n\n"
            f"---\n"
            f"*สรุปโดยอัตโนมัติด้วย Google Gemini ({GEMINI_MODEL}) สำหรับเตรียมอ่านใน NotebookLM*\n"
        )
        return summary_text, full_md

    except Exception as e:
        logger.error(f"Gemini summarization failed for '{session_label}': {e}")
        error_text = "⚠️ ไม่สามารถสรุปเนื้อหาอัตโนมัติได้ (ไฟล์ต้นฉบับยังคงถูกจัดเก็บใน Drive ปลอดภัยครบถ้วน)"
        full_md = (
            f"# สรุปคาบเรียน: {session_label}\n\n"
            f"เกิดข้อผิดพลาดในการสรุป: {e}\n\n"
            f"*ไฟล์ต้นฉบับทั้งหมดถูกจัดเก็บเข้าสู่ Google Drive เรียบร้อยแล้ว สามารถนำเข้าสู่ NotebookLM ได้โดยตรง*\n"
        )
        return error_text, full_md
