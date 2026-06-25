import os
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from backend.app.config import TELEGRAM_BOT_TOKEN, ADMIN_USERNAMES, ADMIN_PASSWORD, UPLOAD_DIR, STATIC_DIR
from backend.app.database import SessionLocal, init_db
from backend.app import crud
from backend.app.bot import bot, dp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI Lifespan (Startup / Shutdown)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Startup: Initialize Database
    logger.info("Initializing Database...")
    init_db()
    
    db = SessionLocal()
    try:
        crud.ensure_admins_exist(db, ADMIN_USERNAMES)
        logger.info(f"Admins initialized in DB: {ADMIN_USERNAMES}")
    except Exception as e:
        logger.error(f"Error ensuring admins exist: {e}")
    finally:
        db.close()
        
    # 2. Startup: Start Telegram Bot
    logger.info("Starting Telegram Bot...")
    # Delete webhook to prevent conflict with polling
    await bot.delete_webhook(drop_pending_updates=True)
    polling_task = asyncio.create_task(dp.start_polling(bot))
    
    # 3. Startup: Start Channel Post Scheduler (every 15 minutes)
    from backend.app.bot import post_random_product_to_channel
    async def channel_post_scheduler():
        logger.info("Channel posting scheduler started (waiting 30 seconds before first run)...")
        await asyncio.sleep(30)
        while True:
            try:
                logger.info("Triggering scheduled channel post...")
                await post_random_product_to_channel()
            except Exception as ex:
                logger.error(f"Error in channel scheduler: {ex}")
            await asyncio.sleep(900) # 900 seconds = 15 minutes
            
    scheduler_task = asyncio.create_task(channel_post_scheduler())
    
    # 3.5 Startup: Start customer notification poller
    async def customer_notification_poll_task():
        logger.info("Customer order status notification poll task started...")
        await asyncio.sleep(45) # Wait 45 seconds before starting
        while True:
            try:
                from backend.app.supabase_helper import supabase
                if supabase:
                    res = supabase.table("orders").select("id, status, telegram_id").eq("customer_notified", False).not_.is_("telegram_id", "null").execute()
                    if res.data:
                        for order in res.data:
                            order_id = order["id"]
                            status_str = order["status"]
                            tg_id = order["telegram_id"]
                            
                            status_emoji = "🟡"
                            if status_str == "Qabul qilindi": status_emoji = "🟢"
                            elif status_str == "Yetkazilmoqda": status_emoji = "🚚"
                            elif status_str == "Yakunlandi": status_emoji = "✅"
                            elif status_str == "Bekor qilindi": status_emoji = "❌"
                            
                            msg = (
                                f"📦 Sizning #{order_id}-sonli buyurtmangiz statusi yangilandi:\n"
                                f"Holati: {status_emoji} {status_str}"
                            )
                            try:
                                await bot.send_message(tg_id, msg)
                                logger.info(f"Customer notified for order #{order_id} status '{status_str}'")
                            except Exception as tg_ex:
                                logger.error(f"Could not send bot message to customer {tg_id}: {tg_ex}")
                            
                            # Mark as notified in Supabase
                            supabase.table("orders").update({"customer_notified": True}).eq("id", order_id).execute()
            except Exception as e:
                logger.error(f"Error in customer notification poll task: {e}")
            await asyncio.sleep(10) # check every 10 seconds

    notification_task = asyncio.create_task(customer_notification_poll_task())
    
    # 3.6 Startup: Start admin order notification poller
    async def admin_notification_poll_task():
        logger.info("Admin order notification poll task started...")
        await asyncio.sleep(15) # Wait 15 seconds after startup before first check
        while True:
            try:
                from backend.app.supabase_helper import supabase
                from backend.app.bot import notify_admins_of_order
                if supabase:
                    res = supabase.table("orders").select("*, order_items(*)").eq("admin_notified", False).execute()
                    if res.data:
                        for order in res.data:
                            order_id = order["id"]
                            items = order.get("order_items", [])
                            logger.info(f"New order detected for admin notification: #{order_id}")
                            try:
                                await notify_admins_of_order(order, items)
                                supabase.table("orders").update({"admin_notified": True}).eq("id", order_id).execute()
                                logger.info(f"Admins notified for order #{order_id}")
                            except Exception as notify_ex:
                                logger.error(f"Failed to notify admins for order #{order_id}: {notify_ex}")
            except Exception as e:
                logger.error(f"Error in admin notification poll task (if 'admin_notified' column is missing, please add it): {e}")
            await asyncio.sleep(10) # check every 10 seconds

    admin_notification_task = asyncio.create_task(admin_notification_poll_task())
    
    yield  # Runs FastAPI application
    
    # 4. Shutdown: Stop Tasks
    logger.info("Stopping Telegram Bot and background tasks...")
    polling_task.cancel()
    scheduler_task.cancel()
    notification_task.cancel()
    admin_notification_task.cancel()
    try:
        await asyncio.gather(polling_task, scheduler_task, notification_task, admin_notification_task, return_exceptions=True)
    except Exception:
        pass
    await bot.session.close()
    logger.info("Cleanup complete.")

app = FastAPI(title="Soliha Baby Shop API", lifespan=lifespan)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Admin Auth Helper
def verify_admin_token(token: str = None):
    # Check if header matches our admin password
    if not token or token != ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Noto'g'ri admin paroli"
        )
    return True

# --- HTML Page Routes ---

@app.get("/")
def read_root():
    # Redirect to index.html under static files
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Soliha Baby Shop do'koniga xush kelibsiz! index.html topilmadi."}

@app.get("/admin")
def read_admin():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Admin panel sahifasi topilmadi."}

@app.get("/login")
def read_login():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Login sahifasi topilmadi."}

# --- API Endpoints ---

# Admin Authentication
@app.post("/api/admin/login")
def admin_login(payload: dict):
    password = payload.get("password")
    if password == ADMIN_PASSWORD:
        return {"success": True, "token": ADMIN_PASSWORD}
    raise HTTPException(status_code=400, detail="Noto'g'ri parol kiritildi!")

# Categories
@app.get("/api/categories")
def list_categories(db: Session = Depends(get_db)):
    return crud.get_categories(db)

@app.post("/api/categories")
def create_category(payload: dict, token: Optional[str] = Form(None), db: Session = Depends(get_db)):
    # Verify auth
    verify_admin_token(payload.get("token"))
    name = payload.get("name")
    if not name:
         raise HTTPException(status_code=400, detail="Kategoriya nomi kiritilishi shart")
    db_cat = crud.get_category_by_name(db, name)
    if db_cat:
        raise HTTPException(status_code=400, detail="Bunday kategoriya allaqachon mavjud")
    return crud.create_category(db, name)

@app.delete("/api/categories/{category_id}")
def delete_category(category_id: int, token: str = "", db: Session = Depends(get_db)):
    verify_admin_token(token)
    success = crud.delete_category(db, category_id)
    if not success:
        raise HTTPException(status_code=404, detail="Kategoriya topilmadi")
    return {"success": True}

# Products
@app.get("/api/products")
def list_products(category_id: Optional[int] = None, db: Session = Depends(get_db)):
    if category_id:
        return crud.get_products_by_category(db, category_id)
    return crud.get_products(db)

@app.get("/api/admin/products")
def list_all_products_admin(token: str = "", db: Session = Depends(get_db)):
    verify_admin_token(token)
    return crud.get_all_products_raw(db)

@app.post("/api/admin/analyze-image")
async def api_analyze_image(
    image: UploadFile = File(...),
    token: str = Form(...),
    db: Session = Depends(get_db)
):
    verify_admin_token(token)
    
    # Read file bytes
    content = await image.read()
    mime_type = image.content_type or "image/png"
    
    # Call OpenAI helper
    from backend.app.openai_helper import analyze_product_image
    data = await analyze_product_image(content, mime_type)
    return data

@app.post("/api/products")
async def create_product(
    name: str = Form(...),
    description: str = Form(None),
    price: float = Form(...),
    category_id: int = Form(...),
    sizes: str = Form(None),
    stock: int = Form(10),
    image: Optional[UploadFile] = File(None),
    token: str = Form(...),
    db: Session = Depends(get_db)
):
    verify_admin_token(token)
    
    # Save Image if provided
    image_url = None
    if image:
        import time
        # Generate clean unique file name
        ext = os.path.splitext(image.filename)[1]
        if not ext:
            ext = ".png" # default fallback
        filename = f"{int(time.time())}_{name.replace(' ', '_').lower()}{ext}"
        filepath = UPLOAD_DIR / filename
        
        # Write bytes
        content = await image.read()
        with open(filepath, "wb") as f:
            f.write(content)
            
        # Store web path
        image_url = f"/static/uploads/{filename}"
        
    return crud.create_product(
        db=db,
        name=name,
        description=description,
        price=price,
        category_id=category_id,
        sizes=sizes,
        image_url=image_url,
        stock=stock
    )

@app.delete("/api/products/{product_id}")
def delete_product(product_id: int, token: str = "", db: Session = Depends(get_db)):
    verify_admin_token(token)
    success = crud.delete_product(db, product_id)
    if not success:
        raise HTTPException(status_code=404, detail="Mahsulot topilmadi")
    return {"success": True}

# Orders
@app.get("/api/orders")
def get_orders(token: str = "", db: Session = Depends(get_db)):
    verify_admin_token(token)
    orders = crud.get_orders(db)
    # Format response with items included
    res = []
    for order in orders:
        items = []
        for it in order.items:
            items.append({
                "product_id": it.product_id,
                "name": it.product.name if it.product else "O'chirilgan mahsulot",
                "size": it.size,
                "quantity": it.quantity,
                "price": it.price
            })
        res.append({
            "id": order.id,
            "customer_name": order.customer_name,
            "customer_phone": order.customer_phone,
            "address": order.address,
            "delivery_method": order.delivery_method,
            "total_amount": order.total_amount,
            "status": order.status,
            "created_at": order.created_at,
            "items": items
        })
    return res

@app.post("/api/orders")
async def place_order(payload: dict, db: Session = Depends(get_db)):
    # Order payload from WebApp/Mini-site
    customer_name = payload.get("customer_name")
    customer_phone = payload.get("customer_phone")
    address = payload.get("address")
    delivery_method = payload.get("delivery_method", "delivery")
    items = payload.get("items", []) # [{"product_id": int, "size": str, "quantity": int, "price": float}]
    
    if not customer_name or not customer_phone or not address or not items:
         raise HTTPException(status_code=400, detail="Kerakli ma'lumotlar to'liq kiritilmadi")
         
    total_amount = sum(it["price"] * it.get("quantity", 1) for it in items)
    
    # Save order
    order = crud.create_order(
        db=db,
        customer_name=customer_name,
        customer_phone=customer_phone,
        address=address,
        delivery_method=delivery_method,
        total_amount=total_amount,
        items_data=items,
        telegram_id=None # ordered from browser, no direct telegram_id initially
    )
    
    # Send telegram notification to admins
    from backend.app.bot import notify_admins_of_order
    await notify_admins_of_order(order, items)
    
    return {"success": True, "order_id": order.id}

@app.put("/api/orders/{order_id}/status")
async def update_order_status(order_id: int, payload: dict, db: Session = Depends(get_db)):
    verify_admin_token(payload.get("token"))
    status_str = payload.get("status")
    if not status_str:
        raise HTTPException(status_code=400, detail="Status kiritilmadi")
        
    order = crud.update_order_status(db, order_id, status_str)
    if not order:
        raise HTTPException(status_code=404, detail="Buyurtma topilmadi")
        
    # Notify customer via Telegram if ordered via bot
    if order.telegram_id:
        try:
            status_emoji = "🟡"
            if status_str == "Qabul qilindi": status_emoji = "🟢"
            elif status_str == "Yetkazilmoqda": status_emoji = "🚚"
            elif status_str == "Yakunlandi": status_emoji = "✅"
            elif status_str == "Bekor qilindi": status_emoji = "❌"
            
            cust_msg = (
                f"📦 Sizning #{order.id}-sonli buyurtmangiz statusi yangilandi:\n"
                f"Holati: {status_emoji} {status_str}"
            )
            await bot.send_message(order.telegram_id, cust_msg)
        except Exception as e:
            logger.error(f"Could not notify user of status update: {e}")
            
    return {"success": True}

# Stats for Admin Dashboard
@app.get("/api/stats")
def get_stats(token: str = "", db: Session = Depends(get_db)):
    verify_admin_token(token)
    orders = db.query(crud.Order).all()
    products = db.query(crud.Product).all()
    categories = db.query(crud.Category).all()
    
    total_sales = sum(o.total_amount for o in orders if o.status != "Bekor qilindi")
    total_orders = len(orders)
    pending_orders = len([o for o in orders if o.status == "Yangi"])
    total_products = len(products)
    
    return {
        "total_sales": total_sales,
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "total_products": total_products,
        "total_categories": len(categories)
    }

# Mount static files (MUST be mounted at the end so it doesn't override API routes)
app.mount("/", StaticFiles(directory=STATIC_DIR), name="static")
