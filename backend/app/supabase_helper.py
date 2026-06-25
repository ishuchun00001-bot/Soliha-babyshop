import logging
from typing import List, Dict, Any, Optional
from supabase import create_client, Client

from backend.app.config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_BUCKET

logger = logging.getLogger(__name__)

supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY and not SUPABASE_URL.startswith("https://your-project"):
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
else:
    logger.warning("SUPABASE_URL and SUPABASE_KEY are not configured correctly. Supabase calls will fail.")

# --- Storage Operations ---

async def upload_product_image(image_bytes: bytes, filename: str, mime_type: str) -> Optional[str]:
    if not supabase:
        logger.error("Supabase client not initialized. Cannot upload image.")
        return None
    try:
        # Upload the file to storage bucket
        bucket = supabase.storage.from_(SUPABASE_BUCKET)
        
        # Check if bucket exists, or we can just try to upload
        # Upload bytes directly
        res = bucket.upload(
            path=filename,
            file=image_bytes,
            file_options={"content-type": mime_type, "cache-control": "3600"}
        )
        
        # Get public URL
        public_url = bucket.get_public_url(filename)
        logger.info(f"Image uploaded to Supabase Storage: {public_url}")
        return public_url
    except Exception as e:
        logger.error(f"Error uploading image to Supabase Storage: {e}")
        return None

# --- Category Operations ---

def get_categories() -> List[Dict[str, Any]]:
    if not supabase: return []
    try:
        res = supabase.table("categories").select("*").order("name").execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error fetching categories: {e}")
        return []

def get_category_by_name(name: str) -> Optional[Dict[str, Any]]:
    if not supabase: return None
    try:
        res = supabase.table("categories").select("*").eq("name", name).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error fetching category: {e}")
        return None

def create_category(name: str) -> Optional[Dict[str, Any]]:
    if not supabase: return None
    try:
        res = supabase.table("categories").insert({"name": name}).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error creating category: {e}")
        return None

def delete_category(category_id: int) -> bool:
    if not supabase: return False
    try:
        res = supabase.table("categories").delete().eq("id", category_id).execute()
        return len(res.data) > 0 if res.data else True
    except Exception as e:
        logger.error(f"Error deleting category: {e}")
        return False

# --- Product Operations ---

def get_products(category_id: Optional[int] = None) -> List[Dict[str, Any]]:
    if not supabase: return []
    try:
        query = supabase.table("products").select("*").eq("is_active", True)
        if category_id:
            query = query.eq("category_id", category_id)
        res = query.order("created_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error fetching products: {e}")
        return []

def get_product(product_id: int) -> Optional[Dict[str, Any]]:
    if not supabase: return None
    try:
        res = supabase.table("products").select("*").eq("id", product_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error fetching product {product_id}: {e}")
        return None

def create_product(name: str, description: str, price: float, category_id: int, sizes: str = None, image_url: str = None, stock: int = 10) -> Optional[Dict[str, Any]]:
    if not supabase: return None
    try:
        data = {
            "name": name,
            "description": description,
            "price": float(price),
            "category_id": int(category_id),
            "sizes": sizes,
            "image_url": image_url,
            "stock": int(stock),
            "is_active": True
        }
        res = supabase.table("products").insert(data).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error creating product: {e}")
        return None

def delete_product(product_id: int) -> bool:
    if not supabase: return False
    try:
        # Soft delete by setting is_active to False
        res = supabase.table("products").update({"is_active": False}).eq("id", product_id).execute()
        return len(res.data) > 0 if res.data else True
    except Exception as e:
        logger.error(f"Error deleting product {product_id}: {e}")
        return False

# --- Order Operations ---

def create_order(customer_name: str, customer_phone: str, address: str, delivery_method: str, total_amount: float, items_data: List[Dict[str, Any]], telegram_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    if not supabase: return None
    try:
        # Insert Order
        order_data = {
            "customer_name": customer_name,
            "customer_phone": customer_phone,
            "address": address,
            "delivery_method": delivery_method,
            "total_amount": float(total_amount),
            "status": "Yangi",
            "telegram_id": telegram_id
        }
        order_res = supabase.table("orders").insert(order_data).execute()
        if not order_res.data:
            return None
        order = order_res.data[0]
        order_id = order["id"]
        
        # Insert Order Items
        items_to_insert = []
        for item in items_data:
            items_to_insert.append({
                "order_id": order_id,
                "product_id": item["product_id"],
                "size": item.get("size"),
                "quantity": item.get("quantity", 1),
                "price": float(item["price"])
            })
            
            # Decrement product stock if possible
            try:
                prod = get_product(item["product_id"])
                if prod:
                    new_stock = max(0, prod["stock"] - item.get("quantity", 1))
                    supabase.table("products").update({"stock": new_stock}).eq("id", item["product_id"]).execute()
            except Exception as ex:
                logger.error(f"Failed to update product stock: {ex}")
                
        if items_to_insert:
            supabase.table("order_items").insert(items_to_insert).execute()
            
        return order
    except Exception as e:
        logger.error(f"Error creating order: {e}")
        return None

def get_orders() -> List[Dict[str, Any]]:
    if not supabase: return []
    try:
        # Join order items and products
        res = supabase.table("orders").select("*, order_items(*, products(*))").order("created_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error fetching orders: {e}")
        return []

def get_order(order_id: int) -> Optional[Dict[str, Any]]:
    if not supabase: return None
    try:
        res = supabase.table("orders").select("*, order_items(*, products(*))").eq("id", order_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error fetching order {order_id}: {e}")
        return None

def get_user_orders(telegram_id: int) -> List[Dict[str, Any]]:
    if not supabase: return []
    try:
        res = supabase.table("orders").select("*").eq("telegram_id", telegram_id).order("created_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error fetching user orders: {e}")
        return []

def update_order_status(order_id: int, status: str) -> Optional[Dict[str, Any]]:
    if not supabase: return None
    try:
        res = supabase.table("orders").update({"status": status}).eq("id", order_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error updating order status: {e}")
        return None

# --- Admin Registration (Checks/Saves telegram_id mapped to username) ---

def update_admin_telegram_id(username: str, telegram_id: int) -> bool:
    if not supabase: return False
    try:
        # Check if table exists/holds admins, or we can use a dedicated table 'admin_users'
        # Let's check if the table exists by doing select
        try:
            res = supabase.table("admin_users").select("*").eq("username", username).execute()
            if res.data:
                supabase.table("admin_users").update({"telegram_id": telegram_id}).eq("username", username).execute()
            else:
                supabase.table("admin_users").insert({"username": username, "telegram_id": telegram_id}).execute()
            return True
        except Exception:
            # If table admin_users doesn't exist, we skip or log. Let's create it if we need to.
            logger.warning("admin_users table not available in Supabase. Skipping admin_id mapping.")
            return False
    except Exception as e:
        logger.error(f"Error mapping admin ID: {e}")
        return False

def get_registered_admins_telegram_ids() -> List[int]:
    if not supabase: return []
    try:
        res = supabase.table("admin_users").select("telegram_id").not_.is_("telegram_id", "null").execute()
        return [item["telegram_id"] for item in res.data] if res.data else []
    except Exception as e:
        logger.error(f"Error fetching admin IDs: {e}")
        return []

# --- Scheduled Video Operations ---

def create_scheduled_video(video_url: str, caption: str, hashtags: str, scheduled_at: str) -> Optional[Dict[str, Any]]:
    if not supabase: return None
    try:
        data = {
            "video_url": video_url,
            "caption": caption,
            "hashtags": hashtags,
            "scheduled_at": scheduled_at,
            "is_posted": False
        }
        res = supabase.table("scheduled_videos").insert(data).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error creating scheduled video: {e}")
        return None

def get_pending_scheduled_videos() -> List[Dict[str, Any]]:
    if not supabase: return []
    try:
        from datetime import datetime, timezone
        now_str = datetime.now(timezone.utc).isoformat()
        res = supabase.table("scheduled_videos")\
            .select("*")\
            .eq("is_posted", False)\
            .lte("scheduled_at", now_str)\
            .execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error fetching pending scheduled videos: {e}")
        return []

def mark_video_as_posted(video_id: int) -> bool:
    if not supabase: return False
    try:
        res = supabase.table("scheduled_videos").update({"is_posted": True}).eq("id", video_id).execute()
        return len(res.data) > 0 if res.data else True
    except Exception as e:
        logger.error(f"Error marking video as posted: {e}")
        return False

