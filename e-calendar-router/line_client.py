"""
line_client.py
Encapsulates LINE Messaging API (v3 SDK):
- Webhook HMAC signature verification
- Fast acknowledgment reply (<30s)
- Long-running async push notification
- Binary content downloader from LINE Content API
"""
import logging
from typing import Optional
from linebot.v3 import WebhookParser
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.messaging import (
    Configuration,
    ApiClient,
    MessagingApi,
    MessagingApiBlob,
    ReplyMessageRequest,
    PushMessageRequest,
    TextMessage,
)
import config

logger = logging.getLogger("line_client")


def _get_parser():
    secret = config.LINE_CHANNEL_SECRET
    if not secret:
        raise RuntimeError("LINE_CHANNEL_SECRET is not configured on server")
    return WebhookParser(secret)


def _get_config():
    token = config.LINE_CHANNEL_ACCESS_TOKEN
    if not token:
        return None
    return Configuration(access_token=token)


def parse_webhook(body: str, signature: str):
    """Parses events and validates cryptographic HMAC signature."""
    parser = _get_parser()
    return parser.parse(body, signature)


def reply_ack(reply_token: str, text: str = "📥 รับไฟล์แล้ว กำลังจัดหมวดหมู่วิชาและสรุปให้อยู่นะ..."):
    """Replies immediately (<30 seconds) to prevent LINE token expiration."""
    cfg = _get_config()
    if not cfg or not reply_token:
        logger.warning("Skipping reply_ack: LINE not configured or missing reply_token")
        return

    try:
        with ApiClient(cfg) as client:
            api = MessagingApi(client)
            api.reply_message(
                ReplyMessageRequest(
                    reply_token=reply_token,
                    messages=[TextMessage(text=text)]
                )
            )
            logger.info("Delivered fast ack reply successfully")
    except Exception as e:
        logger.error(f"reply_ack error: {e}")


def push_summary(user_id: str, text: str):
    """Sends AI summary and Google Drive link via Push API after debounce completes."""
    cfg = _get_config()
    if not cfg or not user_id:
        logger.warning("Skipping push_summary: LINE not configured or missing user_id")
        return

    try:
        with ApiClient(cfg) as client:
            api = MessagingApi(client)
            api.push_message(
                PushMessageRequest(
                    to=user_id,
                    messages=[TextMessage(text=text)]
                )
            )
            logger.info(f"Delivered push summary to {user_id} successfully")
    except Exception as e:
        logger.error(f"push_summary error: {e}")


def download_content(message_id: str) -> bytes:
    """Downloads media binary from LINE Content API."""
    cfg = _get_config()
    if not cfg:
        raise RuntimeError("LINE_CHANNEL_ACCESS_TOKEN is not configured")

    with ApiClient(cfg) as client:
        api_blob = MessagingApiBlob(client)
        content_bytes = api_blob.get_message_content(message_id)
        if isinstance(content_bytes, bytes):
            return content_bytes
        # In case the response is a file-like stream
        if hasattr(content_bytes, "read"):
            return content_bytes.read()
        return bytes(content_bytes)
