import os
import logging
import httpx
from typing import List, Dict, Any, Optional
from backend.app.config import OPENAI_API_KEY
from backend.app.openai_helper import get_gpt_response

logger = logging.getLogger(__name__)

INSTAGRAM_PAGE_ACCESS_TOKEN = os.getenv("INSTAGRAM_PAGE_ACCESS_TOKEN", "")

# Temporary in-memory chat history for Instagram users
instagram_chat_histories: Dict[str, List[Dict[str, str]]] = {}

async def send_instagram_message(recipient_id: str, text: str) -> bool:
    """
    Sends a Direct Message to an Instagram user using the Facebook Graph API.
    """
    if not INSTAGRAM_PAGE_ACCESS_TOKEN:
        logger.error("INSTAGRAM_PAGE_ACCESS_TOKEN is not configured.")
        return False

    url = f"https://graph.facebook.com/v19.0/me/messages?access_token={INSTAGRAM_PAGE_ACCESS_TOKEN}"
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": text}
    }

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(url, json=payload, timeout=10.0)
            if res.status_code == 200:
                logger.info(f"Successfully sent Instagram DM to {recipient_id}")
                return True
            else:
                logger.error(f"Failed to send Instagram DM. Code: {res.status_code}, Response: {res.text}")
                return False
    except Exception as e:
        logger.error(f"Error sending Instagram message: {e}")
        return False

async def handle_instagram_user_message(sender_id: str, message_text: str) -> Optional[str]:
    """
    Handles a message from an Instagram user, updates their history,
    queries GPT for a response, and saves assistant reply in history.
    """
    if not OPENAI_API_KEY:
        logger.error("OPENAI_API_KEY is not configured.")
        return None

    # Retrieve or initialize history
    if sender_id not in instagram_chat_histories:
        instagram_chat_histories[sender_id] = []
        
    history = instagram_chat_histories[sender_id]
    history.append({"role": "user", "content": message_text})

    # Keep history bounded
    if len(history) > 20:
        history = history[-10:]

    try:
        # Generate reply using GPT
        reply = await get_gpt_response(message_text, history=history)
        history.append({"role": "assistant", "content": reply})
        instagram_chat_histories[sender_id] = history
        return reply
    except Exception as e:
        logger.error(f"Error generating GPT response for Instagram user {sender_id}: {e}")
        return None
