import os
import logging
import httpx
from typing import List, Dict, Any, Optional
from backend.app.config import OPENAI_API_KEY
from backend.app.openai_helper import get_gpt_response

logger = logging.getLogger(__name__)

INSTAGRAM_PAGE_ACCESS_TOKEN = os.getenv("INSTAGRAM_PAGE_ACCESS_TOKEN", "")
INSTAGRAM_BUSINESS_ACCOUNT_ID = os.getenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "")

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

async def publish_instagram_reel(video_url: str, caption: str) -> bool:
    """
    Publishes a Reel to Instagram Business Account.
    Steps:
    1. Create media container (with media_type=REELS)
    2. Poll for status to be 'FINISHED' (maximum 2.5 minutes)
    3. Publish the media container
    """
    if not INSTAGRAM_PAGE_ACCESS_TOKEN or not INSTAGRAM_BUSINESS_ACCOUNT_ID:
        logger.error("Instagram credentials not fully configured (token or business account ID).")
        return False

    import asyncio

    # Step 1: Create Container
    url_container = f"https://graph.facebook.com/v19.0/{INSTAGRAM_BUSINESS_ACCOUNT_ID}/media"
    payload = {
        "media_type": "REELS",
        "video_url": video_url,
        "caption": caption,
        "share_to_feed": "true",
        "access_token": INSTAGRAM_PAGE_ACCESS_TOKEN
    }

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(url_container, data=payload, timeout=15.0)
            if res.status_code != 200:
                logger.error(f"Failed to create Instagram media container. Code: {res.status_code}, Resp: {res.text}")
                return False
            
            container_id = res.json().get("id")
            if not container_id:
                logger.error("Container ID not found in response.")
                return False
                
            logger.info(f"Instagram media container created: {container_id}. Starting polling...")

            # Step 2: Poll for status
            # Check status every 5 seconds, up to 30 times (2.5 minutes max)
            status_finished = False
            for attempt in range(30):
                await asyncio.sleep(5)
                url_status = f"https://graph.facebook.com/v19.0/{container_id}?fields=status_code,status&access_token={INSTAGRAM_PAGE_ACCESS_TOKEN}"
                status_res = await client.get(url_status, timeout=10.0)
                if status_res.status_code == 200:
                    data = status_res.json()
                    status_code = data.get("status_code")
                    logger.info(f"Instagram container {container_id} polling attempt {attempt+1}: {status_code}")
                    if status_code == "FINISHED":
                        status_finished = True
                        break
                    elif status_code in ["ERROR", "EXPIRED"]:
                        logger.error(f"Instagram container processing failed. Code: {status_code}, details: {data}")
                        return False
                else:
                    logger.warning(f"Failed to check Instagram container status. Code: {status_res.status_code}")
            
            if not status_finished:
                logger.error(f"Instagram container {container_id} did not finish processing in time.")
                return False

            # Step 3: Publish Container
            url_publish = f"https://graph.facebook.com/v19.0/{INSTAGRAM_BUSINESS_ACCOUNT_ID}/media_publish"
            publish_payload = {
                "creation_id": container_id,
                "access_token": INSTAGRAM_PAGE_ACCESS_TOKEN
            }
            
            publish_res = await client.post(url_publish, data=publish_payload, timeout=15.0)
            if publish_res.status_code == 200:
                media_id = publish_res.json().get("id")
                logger.info(f"Successfully published Reel to Instagram. Media ID: {media_id}")
                return True
            else:
                logger.error(f"Failed to publish Instagram Reel. Code: {publish_res.status_code}, Resp: {publish_res.text}")
                return False

    except Exception as e:
        logger.error(f"Error publishing Instagram Reel: {e}")
        return False

