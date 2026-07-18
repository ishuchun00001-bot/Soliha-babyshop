import os
import io
import time
import random
import logging
from aiogram import Bot, Dispatcher, Router, html, F
from aiogram.fsm.context import FSMContext
from aiogram.types import (
    Message, ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup, 
    InlineKeyboardButton, CallbackQuery, WebAppInfo, ChatMemberUpdated
)
from aiogram.filters import Command, ChatMemberUpdatedFilter, JOIN_TRANSITION, LEAVE_TRANSITION
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage

from backend.app.config import TELEGRAM_BOT_TOKEN, ADMIN_USERNAMES, TELEGRAM_CHANNEL_ID
from backend.app import supabase_helper
from backend.app.openai_helper import get_gpt_response, analyze_product_image, generate_video_post_caption, generate_dalle_image, create_infographics

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

bot = Bot(token=TELEGRAM_BOT_TOKEN)
dp = Dispatcher(storage=MemoryStorage())
router = Router()

# States for checkout
class CheckoutStates(StatesGroup):
    waiting_for_name = State()
    waiting_for_phone = State()
    waiting_for_address = State()

# States for photo-based product uploading
class ProductUploadStates(StatesGroup):
    waiting_for_name = State()
    waiting_for_price = State()
    waiting_for_sizes = State()
    waiting_for_category = State()

# States for scheduled video uploading
class VideoUploadStates(StatesGroup):
    waiting_for_video = State()
    waiting_for_caption = State()
    waiting_for_time = State()

# Helper keyboard creators
def get_main_keyboard(is_admin=False):
    webapp_url = os.getenv("WEBAPP_URL", "")
    
    # First row has Catalog and WebApp
    first_row = [KeyboardButton(text="🛍️ Katalog")]
    if webapp_url.startswith("https://"):
        first_row.append(KeyboardButton(text="🌐 Mini Do'kon", web_app=WebAppInfo(url=webapp_url)))
        
    if is_admin:
        kb = [
            first_row,
            [KeyboardButton(text="🎁 Aksiya"), KeyboardButton(text="🎥 Video rejalashtirish")],
            [KeyboardButton(text="⚙️ Admin Panel Havolasi")]
        ]
    else:
        kb = [
            first_row,
            [KeyboardButton(text="🎁 Aksiya")]
        ]
    return ReplyKeyboardMarkup(keyboard=kb, resize_keyboard=True)

def get_categories_keyboard():
    categories = supabase_helper.get_categories()
    buttons = []
    for cat in categories:
        buttons.append([InlineKeyboardButton(text=cat["name"], callback_data=f"cat_{cat['id']}")])
    buttons.append([InlineKeyboardButton(text="❌ Yopish", callback_data="close_catalog")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)

def get_upload_categories_keyboard():
    categories = supabase_helper.get_categories()
    buttons = []
    for cat in categories:
        buttons.append([InlineKeyboardButton(text=cat["name"], callback_data=f"upload_cat_{cat['id']}")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)

def get_upload_confirm_keyboard():
    categories = supabase_helper.get_categories() or []
    buttons = []
    
    # 1. Category buttons (rows of 2)
    row = []
    for cat in categories:
        row.append(InlineKeyboardButton(text=f"📁 {cat['name']}", callback_data=f"upload_cat_{cat['id']}"))
        if len(row) == 2:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
        
    # 2. Edit buttons
    buttons.append([
        InlineKeyboardButton(text="✏️ Nomni tahrirlash", callback_data="upload_edit_name"),
        InlineKeyboardButton(text="✏️ Narxni tahrirlash", callback_data="upload_edit_price")
    ])
    buttons.append([
        InlineKeyboardButton(text="✏️ O'lchamlarni tahrirlash", callback_data="upload_edit_sizes")
    ])
    
    return InlineKeyboardMarkup(inline_keyboard=buttons)

async def send_confirm_menu(message_or_callback, state: FSMContext):
    data = await state.get_data()
    name = data.get("name", "Noma'lum")
    price = data.get("price", 120000)
    sizes = data.get("sizes", "92, 98, 104")
    description = data.get("description", "Tavsif mavjud emas")
    
    price_str = f"{price:,.0f} so'm".replace(",", " ")
    
    text = (
        f"🤖 {html.bold('OpenAI tahlil natijasi:')}\n\n"
        f"🛍️ {html.bold('Nomi:')} {name}\n"
        f"💵 {html.bold('Taxminiy narxi:')} {price_str}\n"
        f"📏 {html.bold('O\'lchamlar:')} {sizes}\n"
        f"📝 {html.bold('Tavsif:')} {description}\n\n"
        f"Toifani tanlang va mahsulotni saytga joylang 👇\n"
        f"(Tugmalar orqali ma'lumotlarni tahrirlashingiz mumkin)"
    )
    
    kb = get_upload_confirm_keyboard()
    
    if isinstance(message_or_callback, CallbackQuery):
        try:
            await message_or_callback.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
        except Exception:
            await message_or_callback.message.answer(text, reply_markup=kb, parse_mode="HTML")
    else:
        await message_or_callback.answer(text, reply_markup=kb, parse_mode="HTML")

import json
# Path to save the last posted product ID
LAST_POSTED_FILE = os.path.join(os.path.dirname(__file__), "last_posted_product.json")

def get_last_posted_id():
    if os.path.exists(LAST_POSTED_FILE):
        try:
            with open(LAST_POSTED_FILE, "r") as f:
                data = json.load(f)
                return data.get("last_posted_id")
        except Exception:
            pass
    return None

def save_last_posted_id(prod_id):
    try:
        with open(LAST_POSTED_FILE, "w") as f:
            json.dump({"last_posted_id": prod_id}, f)
    except Exception as e:
        logger.error(f"Failed to save last posted product ID: {e}")

# Channel posting helper (posts products sequentially starting from the oldest/first product)
async def post_random_product_to_channel():
    if not TELEGRAM_CHANNEL_ID:
        logger.warning("TELEGRAM_CHANNEL_ID is not configured. Skipping automatic channel post.")
        return False
        
    try:
        products = supabase_helper.get_products()
        if not products:
            logger.info("No products found in Supabase for channel post.")
            return False
            
        # Sort products by ID in ascending order (from the very beginning)
        products = sorted(products, key=lambda x: x["id"])
        
        # Get the last posted ID
        last_id = get_last_posted_id()
        
        # Find the next product to post
        next_prod = None
        if last_id is not None:
            # Find the product after last_id
            for i, p in enumerate(products):
                if p["id"] == last_id:
                    # Next one is i+1
                    if i + 1 < len(products):
                        next_prod = products[i + 1]
                    break
            
        # If last_id is not found in products list, or we reached the end, start from index 0
        if next_prod is None:
            next_prod = products[0]
            
        prod = next_prod
        bot_info = await bot.get_me()
        bot_username = bot_info.username
        
        webapp_url = os.getenv("WEBAPP_URL", "")
        site_link = webapp_url if webapp_url.startswith("https://") else "https://mustafa-kids.vercel.app/" # fallback
        
        import html as py_html
        name_esc = py_html.escape(prod['name'])
        desc_esc = py_html.escape(prod.get('description') or 'Mavjud emas')
        sizes_esc = py_html.escape(prod['sizes']) if prod.get("sizes") else ""
        
        size_str = f"\n📏 O'lchamlar: {sizes_esc}" if sizes_esc else ""
        
        caption_text = (
            f"🌟 {html.bold('DO\'KONIMIZDA YANGI MAHSULOT!')} 🌟\n\n"
            f"👶👗 {html.bold(name_esc)}\n"
            f"📝 Tavsif: {desc_esc}\n"
            f"💵 Narxi: {html.bold(f'{prod['price']:,.0f}')} so'm{size_str}\n\n"
            f"🛍 Buyurtma berish va do'konga o'tish uchun quyidagi tugmadan foydalaning 👇"
        )
        
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="🌐 Mini-Saytda ko'rish", url=site_link)
            ]
        ])
        
        if prod.get("image_url"):
            await bot.send_photo(TELEGRAM_CHANNEL_ID, photo=prod["image_url"], caption=caption_text, parse_mode="HTML", reply_markup=kb)
            logger.info(f"Product {prod['name']} (ID: {prod['id']}) successfully posted to channel sequentially.")
            save_last_posted_id(prod["id"])
            return True
            
        await bot.send_message(TELEGRAM_CHANNEL_ID, caption_text, parse_mode="HTML", reply_markup=kb)
        logger.info(f"Product {prod['name']} (ID: {prod['id']}) successfully posted to channel sequentially as text.")
        save_last_posted_id(prod["id"])
        return True
    except Exception as e:
        logger.error(f"Error posting product sequentially to channel: {e}")
        return False

# --- Admin Photo Uploader Flow ---

@router.message(F.photo)
async def handle_admin_photo_upload(message: Message, state: FSMContext):
    user = message.from_user
    username = user.username
    is_admin = username and username.lower() in [u.lower() for u in ADMIN_USERNAMES]
    
    if not is_admin:
        return
        
    photo = message.photo[-1]
    file_info = await bot.get_file(photo.file_id)
    
    progress_msg = await message.answer("⏳ Rasm yuklab olinmoqda...")
    
    file_io = io.BytesIO()
    await bot.download(file_info, destination=file_io, timeout=120)
    image_bytes = file_io.getvalue()
    
    # Save image bytes in FSM Context
    await state.update_data(image_bytes=image_bytes, file_name=f"{int(time.time())}.jpg")
    
    await progress_msg.delete()
    await message.answer("Mahsulot rasmi qabul qilindi. 📝 Iltimos, kiyim nomini kiriting:")
    await state.set_state(ProductUploadStates.waiting_for_name)


@router.message(ProductUploadStates.waiting_for_name)
async def process_upload_name(message: Message, state: FSMContext):
    name = message.text.strip()
    if not name:
        await message.answer("Iltimos, kiyim nomini yozing:")
        return
        
    await state.update_data(name=name)
    await message.answer("💵 Iltimos, sotish narxini kiriting (faqat raqamda, masalan: 100000):")
    await state.set_state(ProductUploadStates.waiting_for_price)


@router.message(ProductUploadStates.waiting_for_price)
async def process_upload_price(message: Message, state: FSMContext):
    price_text = "".join([c for c in message.text if c.isdigit()])
    if not price_text:
        await message.answer("Iltimos, narxni faqat raqamda kiriting (masalan: 95000):")
        return
        
    price = float(price_text)
    await state.update_data(price=price)
    
    await message.answer(
        "📏 Mahsulot o'lchamlarini kiriting (masalan: '92, 98, 104').\n"
        "Agar o'lcham bo'lmasa, /skip buyrug'ini yuboring:"
    )
    await state.set_state(ProductUploadStates.waiting_for_sizes)


@router.message(ProductUploadStates.waiting_for_sizes)
@router.message(Command("skip"))
async def process_upload_sizes(message: Message, state: FSMContext):
    sizes = None
    if message.text and not message.text.startswith("/skip"):
        sizes = message.text.strip()
        
    await state.update_data(sizes=sizes)
    
    kb = get_upload_categories_keyboard()
    if not kb.inline_keyboard:
        await message.answer("Tizimda kategoriyalar mavjud emas. Avval kategoriyalar qo'shing.")
        await state.clear()
        return
        
    await message.answer("Toifani tanlang:", reply_markup=kb)
    await state.set_state(ProductUploadStates.waiting_for_category)


@router.callback_query(F.data.startswith("upload_cat_"))
async def process_upload_category(callback: CallbackQuery, state: FSMContext):
    cat_id = int(callback.data.split("_")[2])
    await state.update_data(category_id=cat_id)
    
    data = await state.get_data()
    image_bytes = data["image_bytes"]
    file_name = data["file_name"]
    prod_name = data["name"]
    price = data["price"]
    sizes = data.get("sizes")
    category_id = cat_id
    
    # Description set as a clean fallback without AI Vision study
    prod_desc = f"{prod_name}. Sifatli va qulay bolalar kiyimi."
    prod_stock = 10
    
    await callback.message.delete()
    progress_msg = await callback.message.answer("✨ Mahsulot infografikasi chizilmoqda...")
    
    try:
        # Bypassing DALL-E generation entirely! Directly use the uploaded original photo.
        final_bytes = image_bytes
        
        try:
            infographic_bytes = create_infographics(final_bytes, prod_name, price, sizes)
        except Exception as info_err:
            logger.error(f"Failed to generate infographics: {info_err}")
            infographic_bytes = final_bytes
            
        await progress_msg.edit_text("📤 Saytga yuklanmoqda...")
        public_url = await supabase_helper.upload_product_image(infographic_bytes, file_name, "image/jpeg")
        if not public_url:
            await progress_msg.edit_text("❌ Rasmni yuklashda xatolik yuz berdi. Supabase Storage sozlamalarini tekshiring.")
            await state.clear()
            return
            
        product = supabase_helper.create_product(
            name=prod_name,
            description=prod_desc,
            price=price,
            category_id=category_id,
            sizes=sizes,
            image_url=public_url,
            stock=prod_stock
        )
        
        if product:
            import html as py_html
            name_esc = py_html.escape(prod_name)
            sizes_esc = py_html.escape(sizes) if sizes else '—'
            desc_esc = py_html.escape(prod_desc)
            await progress_msg.edit_text(
                f"✅ {html.bold('Mahsulot muvaffaqiyatli saqlandi!')}\n\n"
                f"🛍️ Nomi: {name_esc}\n"
                f"💵 Narxi: {price:,.0f} so'm\n"
                f"📏 O'lchamlar: {sizes_esc}\n"
                f"📝 Tavsif: {desc_esc}\n\n"
                f"Mahsulot saytda faol va kanalga reklama qilinadi.",
                parse_mode="HTML"
            )
            
            # Post to channel automatically
            await post_random_product_to_channel()
        else:
            await progress_msg.edit_text("❌ Mahsulot ma'lumotlarini bazaga saqlashda xato yuz berdi.")
            
    except Exception as e:
        logger.error(f"Error creating product from bot: {e}")
        await progress_msg.edit_text(f"❌ Xatolik yuz berdi: {str(e)}")
    await state.clear()

# --- Video Scheduling Handlers ---

@router.message(F.text == "🎥 Video rejalashtirish")
@router.message(Command("schedule_video"))
async def start_video_scheduler(message: Message, state: FSMContext):
    user = message.from_user
    username = user.username
    is_admin = username and username.lower() in [u.lower() for u in ADMIN_USERNAMES]
    
    if not is_admin:
        await message.answer("Kechirasiz, siz admin emassiz.")
        return
        
    await message.answer("📹 Iltimos, rejalashtiriladigan videoni yuboring:")
    await state.set_state(VideoUploadStates.waiting_for_video)

@router.message(VideoUploadStates.waiting_for_video)
async def process_video_upload(message: Message, state: FSMContext):
    if not message.video:
        await message.answer("❌ Iltimos, videofayl yuboring:")
        return
        
    file_id = message.video.file_id
    progress_msg = await message.answer("⏳ Video yuklab olinmoqda va Supabase Storage'ga yuklanmoqda. Iltimos kuting...")
    
    try:
        # Get video file info
        file_info = await bot.get_file(file_id)
        
        # Download video to memory bytes with increased timeout (180 seconds)
        file_io = io.BytesIO()
        await bot.download(file_info, destination=file_io, timeout=180)
        video_bytes = file_io.getvalue()
        
        # Upload to Supabase Storage
        filename = f"video_{int(time.time())}.mp4"
        public_url = await supabase_helper.upload_video_to_storage(video_bytes, filename, "video/mp4")
        
        if not public_url:
            await progress_msg.edit_text("❌ Videoni yuklashda xatolik yuz berdi. Supabase Storage sozlamalarini tekshiring.")
            await state.clear()
            return
            
        await state.update_data(video_url=file_id, instagram_video_url=public_url)
        await progress_msg.edit_text(
            "✅ Video muvaffaqiyatli saqlandi!\n\n"
            "📝 Endi video haqida qisqacha ma'lumot yozing (masalan: 'Chiroyli bolalar pijamasi keldi, narxi 85,000 so'm, Zarafshon bo'ylab yetkazib berish bepul').\n"
            "Men u uchun GPT yordamida chiroyli matn va heshteglarni tayyorlayman:"
        )
        await state.set_state(VideoUploadStates.waiting_for_caption)
        
    except Exception as e:
        logger.error(f"Error processing video upload in bot: {e}")
        await progress_msg.edit_text(f"❌ Xatolik yuz berdi: {str(e)}")
        await state.clear()

@router.message(VideoUploadStates.waiting_for_caption)
async def process_video_caption(message: Message, state: FSMContext):
    brief_prompt = message.text.strip()
    
    progress_msg = await message.answer("🪄 Sun'iy intellekt (GPT) matn va heshteglarni generatsiya qilmoqda. Iltimos kuting...")
    
    try:
        # Call GPT helper to generate caption and hashtags
        ai_data = await generate_video_post_caption(brief_prompt)
        caption = ai_data.get("caption", brief_prompt)
        hashtags = ai_data.get("hashtags", "")
        
        await state.update_data(caption=caption, hashtags=hashtags)
        
        import html as py_html
        caption_esc = py_html.escape(caption)
        hashtags_esc = py_html.escape(hashtags)
        await progress_msg.edit_text(
            f"✨ {html.bold('GPT TAVSIFI VA HESHTEGLARI:')}\n\n"
            f"{caption_esc}\n\n"
            f"{html.italic(hashtags_esc)}\n\n"
            f"📅 {html.bold('Ushbu video qachon joylashtirilsin?')}\n"
            f"Format: YYYY-MM-DD HH:MM (masalan: 2026-06-25 15:30)\n"
            f"Yoki daqiqalarda: '15 daqiqadan keyin' deb yozing:",
            parse_mode="HTML"
        )
        await state.set_state(VideoUploadStates.waiting_for_time)
        
    except Exception as e:
        logger.error(f"Error generating caption in bot: {e}")
        await progress_msg.edit_text(
            "❌ Matn yaratishda xatolik yuz berdi. Iltimos, o'zingiz tavsif matnini kiriting:"
        )
        await state.update_data(caption=brief_prompt, hashtags="#mustafakids #mk_mustafa_kids")
        await state.set_state(VideoUploadStates.waiting_for_time)

@router.message(VideoUploadStates.waiting_for_time)
async def process_video_time(message: Message, state: FSMContext):
    text = message.text.strip()
    from datetime import datetime, timedelta, timezone
    
    parsed_time = None
    
    if "daqiqadan keyin" in text.lower() or "minutdan keyin" in text.lower():
        digits = "".join([c for c in text if c.isdigit()])
        if digits:
            minutes = int(digits)
            parsed_time = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    else:
        try:
            dt = datetime.strptime(text, "%Y-%m-%d %H:%M")
            parsed_time = dt - timedelta(hours=5) # convert UTC+5 local to UTC
            parsed_time = parsed_time.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
            
    if not parsed_time:
        await message.answer(
            "❌ Format noto'g'ri! Iltimos quyidagi formatlardan birida kiriting:\n"
            "- YYYY-MM-DD HH:MM (masalan: 2026-06-25 15:30)\n"
            "- X daqiqadan keyin (masalan: 10 daqiqadan keyin)"
        )
        return
        
    data = await state.get_data()
    video_url = data.get("video_url")
    instagram_video_url = data.get("instagram_video_url")
    caption = data.get("caption", "")
    hashtags = data.get("hashtags", "")
    
    res = supabase_helper.create_scheduled_video(
        video_url=video_url,
        instagram_video_url=instagram_video_url,
        caption=caption,
        hashtags=hashtags,
        scheduled_at=parsed_time.isoformat()
    )
    
    if res:
        local_time = parsed_time + timedelta(hours=5)
        local_time_str = local_time.strftime("%Y-%m-%d %H:%M")
        await message.answer(
            f"✅ Video muvaffaqiyatli rejalashtirildi!\n\n"
            f"📅 Joylashtirish vaqti: {local_time_str} (Zarafshon vaqti bilan)\n"
            f"📝 Tavsif: {caption}\n"
            f"🏷 Heshteglar: {hashtags}\n\n"
            f"Rejalashtirilgan vaqtda ushbu video ham Telegram kanalga, ham Instagram Reels'ga yuklanadi!"
        )
    else:
        await message.answer("❌ Videoni bazaga saqlashda xatolik yuz berdi! Iltimos qayta urinib ko'ring.")
        
    await state.clear()


# --- Customer Menu Handlers (Supabase integration) ---

@router.message(Command("start"))
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    user = message.from_user
    username = user.username
    is_admin = False
    
    if username and username.lower() in [u.lower() for u in ADMIN_USERNAMES]:
        # Save admin telegram_id
        supabase_helper.update_admin_telegram_id(username, message.from_user.id)
        is_admin = True
        logger.info(f"Admin registered: {username} ({message.from_user.id})")
            
    # Deep link arguments e.g. /start prod_12 or /start ref_12345
    args = message.text.split()
    referred_by_id = None
    if len(args) > 1:
        if args[1].startswith("prod_"):
            try:
                prod_id = int(args[1].split("_")[1])
                prod = supabase_helper.get_product(prod_id)
                if prod and prod.get("is_active", True):
                    size_str = f"\n📏 O'lchamlar: {prod['sizes']}" if prod.get("sizes") else ""
                    prod_text = (
                        f"👶👗 {html.bold(prod['name'])}\n"
                        f"📝 Tavsif: {prod.get('description') or 'Mavjud emas'}\n"
                        f"💵 Narxi: {prod['price']:,.0f} so'm{size_str}\n"
                        f"📦 Omborda: {prod['stock']} dona\n"
                    )
                    
                    kb = InlineKeyboardMarkup(inline_keyboard=[
                        [InlineKeyboardButton(text="🛒 Savatga qo'shish", callback_data=f"add_{prod['id']}")]
                    ])
                    
                    await message.answer(f"Siz tanlagan mahsulot: \n\n")
                    if prod.get("image_url"):
                        await message.answer_photo(photo=prod["image_url"], caption=prod_text, parse_mode="HTML", reply_markup=kb)
                    else:
                        await message.answer(prod_text, parse_mode="HTML", reply_markup=kb)
                else:
                    await message.answer("Kechirasiz, mahsulot topilmadi yoki sotuvda tugagan.")
            except Exception as e:
                logger.error(f"Error handling deep link: {e}")
        elif args[1].startswith("ref_"):
            try:
                referred_by_id = int(args[1].split("_")[1])
            except Exception as e:
                logger.error(f"Error parsing ref link ID: {e}")

    # Register user in database and check if it's a new referral
    referrer_id = supabase_helper.register_bot_user(
        telegram_id=user.id,
        username=username,
        first_name=user.first_name,
        referred_by=referred_by_id
    )
    
    if referrer_id:
        try:
            await bot.send_message(
                chat_id=referrer_id,
                text=f"🎉 <b>Yangi taklif!</b>\n\nSizning taklif havolangiz orqali <b>{html.escape(user.first_name)}</b> botga kirdi! Aksiya doirasida sizga +1 taklif balli qo'shildi.",
                parse_mode="HTML"
            )
        except Exception as ref_err:
            logger.error(f"Failed to notify referrer {referrer_id}: {ref_err}")
            
    welcome_text = (
        f"Salom, {html.bold(user.first_name)}! \n"
        f"🛍️ {html.bold('Mustafa Kids')} bolalar kiyimlari do'konimizga xush kelibsiz!\n\n"
        f"Bizning do'kondan sifatli, chiroyli va qulay bolalar kiyimlarini topishingiz mumkin.\n"
        f"Qiziqtirgan savollaringizni to'g'ridan-to'g'ri yozishingiz ham mumkin, AI yordamchimiz sizga javob beradi! 🤖\n\n"
        f"Quyidagi tugmalardan birini tanlang 👇"
    )
    if is_admin:
        welcome_text += "\n\n🔑 Siz admin sifatida tizimga kirdingiz! Rasm va captionda narxini yozib yuborib do'konga yangi mahsulot qo'shishingiz mumkin."
        
    await message.answer(welcome_text, parse_mode="HTML", reply_markup=get_main_keyboard(is_admin))


@router.message(Command("odam"))
@router.message(F.text == "🎁 Aksiya")
async def cmd_odam(message: Message):
    user = message.from_user
    telegram_id = user.id
    username = user.username

    # Register user if not already present
    supabase_helper.register_bot_user(
        telegram_id=telegram_id,
        username=username,
        first_name=user.first_name
    )

    # Get bot username to generate referral link
    bot_info = await bot.get_me()
    bot_username = bot_info.username
    ref_link = f"https://t.me/{bot_username}?start=ref_{telegram_id}"

    # Get user's referral count
    ref_count = supabase_helper.get_referral_count(telegram_id)

    # Get referral leaderboard (top 4)
    leaderboard = supabase_helper.get_referral_leaderboard()

    # Medal emojilari
    medals = ["🥇", "🥈", "🥉", "🏅"]

    # Format leaderboard text with medals
    leaderboard_text = ""
    user_rank = None
    for idx, item in enumerate(leaderboard, 1):
        medal = medals[idx - 1] if idx <= len(medals) else f"{idx}."
        name = item["first_name"]
        import html as py_html
        name_esc = py_html.escape(name)
        uname = f" (@{py_html.escape(item['username'])})" if item.get("username") else ""
        leaderboard_text += f"{medal} <b>{name_esc}</b>{uname} — <b>{item['count']}</b> ta\n"
        if item["telegram_id"] == telegram_id:
            user_rank = idx

    if not leaderboard_text:
        leaderboard_text = "🔔 Hozircha faol ishtirokchilar yo'q.\nBirinchi bo'lib taklif yuboring! 🚀"

    # Foydalanuvchi o'z o'rnini ko'rish
    if user_rank:
        rank_text = f"\n🎯 <b>Sizning o'rningiz: {medals[user_rank-1] if user_rank <= 4 else f'{user_rank}-o\'rin'}</b>\n"
    elif ref_count > 0:
        rank_text = f"\n📊 Siz top-4 dan tashqaridasiz, lekin {ref_count} ta taklif qildingiz!\n"
    else:
        rank_text = "\n💡 Hali hech kim taklif qilmadingiz. Boshlang!\n"

    # Progress bar
    max_ref = leaderboard[0]["count"] if leaderboard else 10
    bar_total = 10
    bar_filled = min(bar_total, round((ref_count / max(max_ref, 1)) * bar_total))
    progress_bar = "🟩" * bar_filled + "⬜" * (bar_total - bar_filled)

    response_text = (
        f"🎁 <b>MUSTAFA KIDS AKSIYASI!</b> 🎁\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"👥 Do'stlarni taklif qiling va <b>qimmatbaho sovg'alarga</b> ega bo'ling!\n\n"
        f"╔══════════════════════╗\n"
        f"       🔗 <b>SIZNING HAVOLANGIZ</b> 🔗\n"
        f"<code>{ref_link}</code>\n"
        f"  👆 <i>Bosib nusxa oling va yuboring!</i>\n"
        f"╚══════════════════════╝\n\n"
        f"📊 <b>Sizning natijangiz:</b>\n"
        f"{progress_bar}\n"
        f"👤 Siz <b>{ref_count} ta</b> odam taklif qildingiz!"
        f"{rank_text}\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n"
        f"🏆 <b>TOP-4 REYTING:</b>\n\n"
        f"{leaderboard_text}\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n"
        f"<i>📤 Havolani do'stlaringizga yuboring!\n"
        f"Kim ko'p odam taklif qilsa — <b>g'olib bo'ladi!</b> 🏆</i>"
    )

    # Ulashish tugmasi
    share_text = "Mustafa Kids aksiyasida ishtirok etaman! Siz ham qo'shiling 🛍️🎁"
    share_url = f"https://t.me/share/url?url={ref_link}&text={share_text}"

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📤 Do'stlarga ulashish", url=share_url)],
        [InlineKeyboardButton(text="🔄 Yangilash", callback_data=f"refresh_ref_{telegram_id}")]
    ])

    # Guruhda bo'lsa — shaxsiy DM yuborish, guruh xabarini o'chirish
    if message.chat.type != "private":
        try:
            # Foydalanuvchiga shaxsiy DM yuborish
            await bot.send_message(
                chat_id=telegram_id,
                text=response_text,
                parse_mode="HTML",
                reply_markup=kb
            )
            # Guruhdan /odam xabarini o'chirish (boshqalar ko'rmasin)
            try:
                await message.delete()
            except Exception:
                pass
            # Guruhda faqat shu odamga ko'rinadigan bildirishnoma yo'q (Telegram cheklovlar)
            # Shuning uchun hech narsa yozmaymiz guruhga
        except Exception as e:
            logger.error(f"Failed to send DM to {telegram_id}: {e}")
            # Agar DM yuborib bo'lmasa (bot bilan suhbat boshlanmagan) — guruhda xabar
            try:
                await message.reply(
                    f"📩 <b>{user.first_name}</b>, aksiya ma'lumotlari shaxsiy xabarda yuborildi!\n"
                    f"Agar kelmagan bo'lsa, avval botga <b>/start</b> yuboring 👇\n"
                    f"<a href='https://t.me/{bot_username}'>@{bot_username}</a>",
                    parse_mode="HTML"
                )
            except Exception:
                pass
    else:
        # Private chat — to'g'ridan-to'g'ri javob berish
        await message.answer(response_text, parse_mode="HTML", reply_markup=kb)


@router.callback_query(F.data.startswith("refresh_ref_"))
async def refresh_referral(callback: CallbackQuery):
    """Leaderboardni yangilash tugmasi"""
    user = callback.from_user
    telegram_id = user.id
    username = user.username
    
    bot_info = await bot.get_me()
    bot_username = bot_info.username
    ref_link = f"https://t.me/{bot_username}?start=ref_{telegram_id}"
    
    ref_count = supabase_helper.get_referral_count(telegram_id)
    leaderboard = supabase_helper.get_referral_leaderboard()
    
    medals = ["🥇", "🥈", "🥉", "🏅"]
    
    leaderboard_text = ""
    user_rank = None
    for idx, item in enumerate(leaderboard, 1):
        medal = medals[idx - 1] if idx <= len(medals) else f"{idx}."
        name = item["first_name"]
        import html as py_html
        name_esc = py_html.escape(name)
        uname = f" (@{py_html.escape(item['username'])})" if item.get("username") else ""
        leaderboard_text += f"{medal} <b>{name_esc}</b>{uname} — <b>{item['count']}</b> ta\n"
        if item["telegram_id"] == telegram_id:
            user_rank = idx
    
    if not leaderboard_text:
        leaderboard_text = "🔔 Hozircha faol ishtirokchilar yo'q.\nBirinchi bo'lib taklif yuboring! 🚀"
    
    if user_rank:
        rank_text = f"\n🎯 <b>Sizning o'rningiz: {medals[user_rank-1] if user_rank <= 4 else f'{user_rank}-o\'rin'}</b>\n"
    elif ref_count > 0:
        rank_text = f"\n📊 Siz top-4 dan tashqaridasiz, lekin {ref_count} ta taklif qildingiz!\n"
    else:
        rank_text = "\n💡 Hali hech kim taklif qilmadingiz. Boshlang!\n"
    
    max_ref = leaderboard[0]["count"] if leaderboard else 10
    bar_total = 10
    bar_filled = min(bar_total, round((ref_count / max(max_ref, 1)) * bar_total))
    progress_bar = "🟩" * bar_filled + "⬜" * (bar_total - bar_filled)
    
    response_text = (
        f"🎁 <b>SOLIHA BABY SHOP AKSIYASI!</b> 🎁\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"👥 Do'stlarni taklif qiling va <b>qimmatbaho sovg'alarga</b> ega bo'ling!\n\n"
        f"╔══════════════════════╗\n"
        f"       🔗 <b>SIZNING HAVOLANGIZ</b> 🔗\n"
        f"<code>{ref_link}</code>\n"
        f"  👆 <i>Bosib nusxa oling va yuboring!</i>\n"
        f"╚══════════════════════╝\n\n"
        f"📊 <b>Sizning natijangiz:</b>\n"
        f"{progress_bar}\n"
        f"👤 Siz <b>{ref_count} ta</b> odam taklif qildingiz!"
        f"{rank_text}\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n"
        f"🏆 <b>TOP-4 REYTING:</b>\n\n"
        f"{leaderboard_text}\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n"
        f"<i>📤 Havolani do'stlaringizga yuboring!\n"
        f"Kim ko'p odam taklif qilsa — <b>g'olib bo'ladi!</b> 🏆</i>"
    )
    
    share_text = f"Soliha Baby Shop aksiyasida ishtirok etaman! Siz ham qo'shiling 👶🎁"
    share_url = f"https://t.me/share/url?url={ref_link}&text={share_text}"
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📤 Do'stlarga ulashish", url=share_url)],
        [InlineKeyboardButton(text="🔄 Yangilash", callback_data=f"refresh_ref_{telegram_id}")]
    ])
    
    try:
        await callback.message.edit_text(response_text, parse_mode="HTML", reply_markup=kb)
        await callback.answer("✅ Ma'lumotlar yangilandi!")
    except Exception:
        await callback.answer("Ma'lumotlar allaqachon yangi!")


# ─── Kanal a'zoligini kuzatish (Join/Leave) ───────────────────────────────────

@router.chat_member(ChatMemberUpdatedFilter(member_status_changed=JOIN_TRANSITION))
async def on_channel_join(event: ChatMemberUpdated):
    """Foydalanuvchi kanalga qo'shilganda referral hisoblanadi."""
    # Faqat kanalimiz uchun tekshirish
    channel_id = TELEGRAM_CHANNEL_ID.lstrip("@") if TELEGRAM_CHANNEL_ID else ""
    chat_username = event.chat.username or ""
    chat_id_str = str(event.chat.id)
    
    # Kanal tekshiruvi (username yoki ID bo'yicha)
    if channel_id and channel_id.lower() != chat_username.lower() and channel_id != chat_id_str:
        return
    
    new_member = event.new_chat_member.user
    if new_member.is_bot:
        return
    
    telegram_id = new_member.id
    
    # Foydalanuvchi botga ro'yxatdan o'tganmi tekshir
    user_data = supabase_helper.get_bot_user_by_telegram_id(telegram_id)
    if not user_data:
        # Bot orqali kelmagan odamlar uchun - oddiy ro'yxatga olish
        supabase_helper.register_bot_user(
            telegram_id=telegram_id,
            username=new_member.username,
            first_name=new_member.first_name or "Foydalanuvchi"
        )
        logger.info(f"New channel member registered (no referral): {telegram_id}")
        return
    
    # Referrer'ni tekshir
    referrer_id = supabase_helper.channel_join_referral(telegram_id)
    if referrer_id:
        logger.info(f"User {telegram_id} joined channel via referral from {referrer_id}")
        # Referrer'ga bildirishnoma yuborish
        try:
            first_name = new_member.first_name or "Foydalanuvchi"
            import html as py_html
            name_esc = py_html.escape(first_name)
            
            # Referrer'ning yangi sonini ol
            new_count = supabase_helper.get_referral_count(referrer_id)
            
            await bot.send_message(
                chat_id=referrer_id,
                text=(
                    f"🎉 <b>Yangi a'zo!</b>\n\n"
                    f"<b>{name_esc}</b> sizning havolangiz orqali kanalga qo'shildi!\n"
                    f"📊 Sizning umumiy natijangiz: <b>{new_count} ta</b> 🏆"
                ),
                parse_mode="HTML"
            )
        except Exception as e:
            logger.error(f"Failed to notify referrer {referrer_id} on join: {e}")


@router.chat_member(ChatMemberUpdatedFilter(member_status_changed=LEAVE_TRANSITION))
async def on_channel_leave(event: ChatMemberUpdated):
    """Foydalanuvchi kanaldan chiqib ketganda referral kamayadi."""
    channel_id = TELEGRAM_CHANNEL_ID.lstrip("@") if TELEGRAM_CHANNEL_ID else ""
    chat_username = event.chat.username or ""
    chat_id_str = str(event.chat.id)
    
    if channel_id and channel_id.lower() != chat_username.lower() and channel_id != chat_id_str:
        return
    
    old_member = event.new_chat_member.user
    if old_member.is_bot:
        return
    
    telegram_id = old_member.id
    
    referrer_id = supabase_helper.channel_leave_referral(telegram_id)
    if referrer_id:
        logger.info(f"User {telegram_id} left channel, was referred by {referrer_id}")
        # Referrer'ga bildirishnoma yuborish (referred_by allaqachon null, count kamaygan)
        try:
            first_name = old_member.first_name or "Foydalanuvchi"
            import html as py_html
            name_esc = py_html.escape(first_name)
            
            # Yangilangan count (kamaygan holda)
            new_count = supabase_helper.get_referral_count(referrer_id)
            
            await bot.send_message(
                chat_id=referrer_id,
                text=(
                    f"😔 <b>A'zo chiqib ketdi</b>\n\n"
                    f"<b>{name_esc}</b> kanaldan chiqib ketdi.\n"
                    f"📊 Sizning joriy natijangiz: <b>{new_count} ta</b>"
                ),
                parse_mode="HTML"
            )
        except Exception as e:
            logger.error(f"Failed to notify referrer {referrer_id} on leave: {e}")


# ──────────────────────────────────────────────────────────────────────────────

@router.message(Command("post"))
async def cmd_post_to_channel(message: Message):

    user = message.from_user
    username = user.username
    is_admin = username and username.lower() in [u.lower() for u in ADMIN_USERNAMES]
    
    if not is_admin:
        await message.answer("Kechirasiz, ushbu buyruq faqat adminlar uchun.")
        return
        
    await message.answer("Mahsulot kanalga yuborilmoqda...")
    success = await post_random_product_to_channel()
    if success:
        await message.answer("✅ Mahsulot kanalga muvaffaqiyatli yuborildi!")
    else:
        await message.answer("❌ Kanalga yuborishda xatolik yuz berdi. Sozlamalar va bot adminligini tekshiring.")

@router.message(F.text == "🛍️ Katalog")
async def show_catalog(message: Message):
    kb = get_categories_keyboard()
    if not kb.inline_keyboard or len(kb.inline_keyboard) <= 1:
        await message.answer("Hozircha katalogda toifalar mavjud emas.")
    else:
        await message.answer("Mahsulot toifalaridan birini tanlang:", reply_markup=kb)

@router.callback_query(F.data.startswith("cat_"))
async def select_category(callback: CallbackQuery):
    cat_id = int(callback.data.split("_")[1])
    try:
        products = supabase_helper.get_products(cat_id)
        if not products:
            await callback.answer("Bu toifada hozircha mahsulotlar yo'q.", show_alert=True)
            return
            
        await callback.message.delete()
        for prod in products:
            size_str = f"\n📏 O'lchamlar: {prod['sizes']}" if prod.get("sizes") else ""
            prod_text = (
                f"👶👗 {html.bold(prod['name'])}\n"
                f"📝 Tavsif: {prod.get('description') or 'Mavjud emas'}\n"
                f"💵 Narxi: {prod['price']:,.0f} so'm{size_str}\n"
                f"📦 Omborda: {prod['stock']} dona\n"
            )
            
            kb = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🛒 Savatga qo'shish", callback_data=f"add_{prod['id']}")]
            ])
            
            if prod.get("image_url"):
                await callback.message.answer_photo(photo=prod["image_url"], caption=prod_text, parse_mode="HTML", reply_markup=kb)
            else:
                await callback.message.answer(prod_text, parse_mode="HTML", reply_markup=kb)
                
        await callback.message.answer("Boshqa toifalar:", reply_markup=get_categories_keyboard())
    except Exception as e:
        logger.error(f"Error listing category products: {e}")
        await callback.answer("Mahsulotlarni yuklashda xatolik yuz berdi.")
    callback.answer()

@router.callback_query(F.data == "close_catalog")
async def close_catalog(callback: CallbackQuery):
    await callback.message.delete()
    await callback.answer()

@router.callback_query(F.data.startswith("add_"))
async def add_to_cart_callback(callback: CallbackQuery, state: FSMContext):
    product_id = int(callback.data.split("_")[1])
    try:
        product = supabase_helper.get_product(product_id)
        if not product:
            await callback.answer("Mahsulot topilmadi.")
            return
            
        data = await state.get_data()
        cart = data.get("cart", {})
        
        prod_id_str = str(product_id)
        if prod_id_str in cart:
            cart[prod_id_str]["quantity"] += 1
        else:
            cart[prod_id_str] = {
                "name": product["name"],
                "price": product["price"],
                "quantity": 1,
                "size": product["sizes"].split(",")[0].strip() if product.get("sizes") else None
            }
            
        await state.update_data(cart=cart)
        await callback.answer(f"🛒 {product['name']} savatchaga qo'shildi!", show_alert=False)
    except Exception as e:
        logger.error(f"Error adding to cart: {e}")
    callback.answer()

@router.message(F.text == "🛒 Savatcha")
async def show_cart(message: Message, state: FSMContext):
    data = await state.get_data()
    cart = data.get("cart", {})
    
    if not cart:
        await message.answer("Sizning savatchangiz bo'sh. Katalogga o'tib mahsulotlarni qo'shishingiz mumkin.")
        return
        
    cart_text = f"🛒 {html.bold('Sizning savatchangiz:')}\n\n"
    total_amount = 0
    inline_buttons = []
    for pid, item in cart.items():
        subtotal = item["price"] * item["quantity"]
        total_amount += subtotal
        size_info = f" ({item['size']})" if item.get("size") else ""
        cart_text += f"• {item['name']}{size_info} - {item['quantity']} dona x {item['price']:,.0f} so'm = {subtotal:,.0f} so'm\n"
        
        inline_buttons.append([
            InlineKeyboardButton(text=f"➖ {item['name'][:15]}", callback_data=f"cart_dec_{pid}"),
            InlineKeyboardButton(text=f"➕ {item['name'][:15]}", callback_data=f"cart_inc_{pid}")
        ])
        
    cart_text += f"\n💰 {html.bold('Jami summa:')} {total_amount:,.0f} so'm"
    
    inline_buttons.append([
        InlineKeyboardButton(text="🗑️ Savatni tozalash", callback_data="cart_clear"),
        InlineKeyboardButton(text="✅ Buyurtma berish", callback_data="cart_checkout")
    ])
    
    await message.answer(cart_text, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(inline_keyboard=inline_buttons))

@router.callback_query(F.data.startswith("cart_"))
async def handle_cart_actions(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    cart = data.get("cart", {})
    action = callback.data.split("_")[1]
    
    if action == "clear":
        await state.update_data(cart={})
        await callback.message.delete()
        await callback.message.answer("Savatchangiz tozalandi.")
        await callback.answer()
        return
        
    elif action == "checkout":
        if not cart:
            await callback.answer("Savatchangiz bo'sh.", show_alert=True)
            return
        await callback.message.delete()
        await callback.message.answer("Buyurtmani rasmiylashtirish uchun ismingizni kiriting:")
        await state.set_state(CheckoutStates.waiting_for_name)
        await callback.answer()
        return
        
    pid = callback.data.split("_")[2]
    if action == "inc":
        if pid in cart:
            cart[pid]["quantity"] += 1
            await callback.answer("Soni ko'paytirildi.")
    elif action == "dec":
        if pid in cart:
            cart[pid]["quantity"] -= 1
            if cart[pid]["quantity"] <= 0:
                del cart[pid]
            await callback.answer("Soni kamaytirildi.")
            
    await state.update_data(cart=cart)
    if not cart:
        await callback.message.delete()
        await callback.message.answer("Sizning savatchangiz bo'sh.")
        return
        
    cart_text = f"🛒 {html.bold('Sizning savatchangiz:')}\n\n"
    total_amount = 0
    inline_buttons = []
    for pid_val, item in cart.items():
        subtotal = item["price"] * item["quantity"]
        total_amount += subtotal
        size_info = f" ({item['size']})" if item.get("size") else ""
        cart_text += f"• {item['name']}{size_info} - {item['quantity']} dona x {item['price']:,.0f} so'm = {subtotal:,.0f} so'm\n"
        
        inline_buttons.append([
            InlineKeyboardButton(text=f"➖ {item['name'][:15]}", callback_data=f"cart_dec_{pid_val}"),
            InlineKeyboardButton(text=f"➕ {item['name'][:15]}", callback_data=f"cart_inc_{pid_val}")
        ])
    cart_text += f"\n💰 {html.bold('Jami summa:')} {total_amount:,.0f} so'm"
    inline_buttons.append([
        InlineKeyboardButton(text="🗑️ Savatni tozalash", callback_data="cart_clear"),
        InlineKeyboardButton(text="✅ Buyurtma berish", callback_data="cart_checkout")
    ])
    
    await callback.message.edit_text(cart_text, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(inline_keyboard=inline_buttons))

# Checkout FSM
@router.message(CheckoutStates.waiting_for_name)
async def process_name(message: Message, state: FSMContext):
    name = message.text.strip()
    if not name:
        await message.answer("Iltimos, ismingizni to'g'ri kiriting:")
        return
    await state.update_data(customer_name=name)
    
    phone_keyboard = ReplyKeyboardMarkup(keyboard=[
        [KeyboardButton(text="📞 Telefon raqamni ulashish", request_contact=True)]
    ], resize_keyboard=True, one_time_keyboard=True)
    
    await message.answer("Telefon raqamingizni quyidagi tugma orqali ulashing yoki yozib yuboring:", reply_markup=phone_keyboard)
    await state.set_state(CheckoutStates.waiting_for_phone)

@router.message(CheckoutStates.waiting_for_phone)
async def process_phone(message: Message, state: FSMContext):
    phone = ""
    if message.contact:
        phone = message.contact.phone_number
    else:
        phone = message.text.strip()
        
    if not phone:
        await message.answer("Iltimos, telefon raqamingizni kiriting:")
        return
        
    await state.update_data(customer_phone=phone)
    await message.answer("Yetkazib berish manzilini to'liq kiriting (yoki 'O'zim olib ketaman' deb yozing):")
    await state.set_state(CheckoutStates.waiting_for_address)

@router.message(CheckoutStates.waiting_for_address)
async def process_address(message: Message, state: FSMContext):
    address = message.text.strip()
    if not address:
        await message.answer("Iltimos, manzilni kiriting:")
        return
        
    data = await state.get_data()
    cart = data.get("cart", {})
    customer_name = data.get("customer_name")
    customer_phone = data.get("customer_phone")
    
    delivery_method = "pickup" if "olib ketish" in address.lower() or "ozim" in address.lower() or "o'zim" in address.lower() else "delivery"
    
    total_amount = 0
    items_data = []
    for pid, item in cart.items():
        total_amount += item["price"] * item["quantity"]
        items_data.append({
            "product_id": int(pid),
            "size": item.get("size"),
            "quantity": item["quantity"],
            "price": item["price"]
        })
        
    # Save order in Supabase
    order = supabase_helper.create_order(
        customer_name=customer_name,
        customer_phone=customer_phone,
        address=address,
        delivery_method=delivery_method,
        total_amount=total_amount,
        items_data=items_data,
        telegram_id=message.from_user.id
    )
    
    if order:
        await state.update_data(cart={})
        await state.set_state(None)
        
        is_admin = message.from_user.username and message.from_user.username.lower() in [u.lower() for u in ADMIN_USERNAMES]
        await message.answer(
            f"🎉 Rahmat! Buyurtmangiz qabul qilindi.\n"
            f"📦 Buyurtma ID: #{order['id']}\n"
            f"💰 Jami summa: {total_amount:,.0f} so'm\n"
            f"Tez orada adminlarimiz siz bilan bog'lanishadi.",
            reply_markup=get_main_keyboard(is_admin)
        )
        
        await notify_admins_of_order(order, items_data)
    else:
        await message.answer("Buyurtma berishda muammo yuz berdi. Iltimos keyinroq urinib ko'ring.")

async def notify_admins_of_order(order, items_data):
    admin_chat_ids = supabase_helper.get_registered_admins_telegram_ids()
    if not admin_chat_ids:
        logger.warning("No admins registered in database.")
        return
        
    items_text = ""
    for item in items_data:
        prod = supabase_helper.get_product(item["product_id"])
        pname = prod["name"] if prod else "Noma'lum"
        size_info = f" ({item['size']})" if item['size'] else ""
        items_text += f"- {pname}{size_info}: {item['quantity']} dona x {item['price']:,.0f} so'm\n"
        
    admin_msg = (
        f"🔔 {html.bold('YANGI BUYURTMA!')}\n\n"
        f"📦 Buyurtma ID: #{order['id']}\n"
        f"👤 Xaridor: {order['customer_name']}\n"
        f"📞 Telefon: {order['customer_phone']}\n"
        f"📍 Manzil: {order['address']}\n"
        f"🚚 Turi: {'Yetkazib berish' if order['delivery_method'] == 'delivery' else 'Olib ketish'}\n\n"
        f"{html.bold('Mahsulotlar:')}\n{items_text}\n"
        f"💰 Jami summa: {html.bold(f'{order['total_amount']:,.0f}')} so'm"
    )
    
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✅ Qabul qilish", callback_data=f"adm_order_accept_{order['id']}"),
            InlineKeyboardButton(text="❌ Rad etish", callback_data=f"adm_order_cancel_{order['id']}")
        ]
    ])
    
    for chat_id in admin_chat_ids:
        try:
            await bot.send_message(chat_id, admin_msg, parse_mode="HTML", reply_markup=kb)
        except Exception as ex:
            logger.error(f"Failed to notify admin {chat_id}: {ex}")

# Admin action callbacks
@router.callback_query(F.data.startswith("adm_order_"))
async def handle_admin_order_action(callback: CallbackQuery):
    parts = callback.data.split("_")
    action = parts[2]
    order_id = int(parts[3])
    
    order = supabase_helper.get_order(order_id)
    if not order:
        await callback.answer("Buyurtma topilmadi.", show_alert=True)
        return
        
    new_status = "Qabul qilindi" if action == "accept" else "Bekor qilindi"
    supabase_helper.update_order_status(order_id, new_status)
    
    original_text = callback.message.text
    updated_text = (
        f"{original_text}\n\n"
        f"💼 STATUS YANGILANDI: {html.bold(new_status)} (Admin: @{callback.from_user.username or callback.from_user.first_name})"
    )
    
    await callback.message.edit_text(updated_text, parse_mode="HTML", reply_markup=None)
    await callback.answer(f"Buyurtma #{order_id} statusi '{new_status}' ga o'zgartirildi.")
    
    if order.get("telegram_id"):
        cust_msg = (
            f"📦 Sizning #{order['id']}-sonli buyurtmangiz adminlarimiz tomonidan "
            f"{html.bold(new_status.lower())}.\n"
        )
        if action == "accept":
            cust_msg += "🚚 Tez orada yetkazib berish bo'yicha bog'lanamiz!"
        else:
            cust_msg += "❌ Agar xatolik bo'lsa, adminga murojaat qiling."
            
        try:
            await bot.send_message(order['telegram_id'], cust_msg, parse_mode="HTML")
        except Exception as ex:
            logger.error(f"Could not notify customer {order['telegram_id']}: {ex}")

@router.message(F.text == "📦 Buyurtmalarim")
async def show_user_orders(message: Message):
    orders = supabase_helper.get_user_orders(message.from_user.id)
    if not orders:
        await message.answer("Sizda hali buyurtmalar mavjud emas.")
        return
        
    msg = f"📦 {html.bold('Sizning buyurtmalaringiz:')}\n\n"
    for order in orders:
        status_emoji = "🟡"
        if order["status"] == "Qabul qilindi":
            status_emoji = "🟢"
        elif order["status"] == "Yetkazilmoqda":
            status_emoji = "🚚"
        elif order["status"] == "Yakunlandi":
            status_emoji = "✅"
        elif order["status"] == "Bekor qilindi":
            status_emoji = "❌"
            
        msg += (
            f"Buyurtma #{order['id']} | {order['created_at'][:16].replace('T', ' ')}\n"
            f"Summa: {order['total_amount']:,.0f} so'm\n"
            f"Holati: {status_emoji} {order['status']}\n\n"
        )
    await message.answer(msg, parse_mode="HTML")

@router.message(F.text == "📞 Biz bilan bog'lanish")
async def show_contact_info(message: Message):
    contact_text = (
        f"🛍️ {html.bold('Mustafa Kids - Bolalar kiyimlari do\'koni')}\n\n"
        f"📍 Bizning manzil: Tashkent shahri\n"
        f"📞 Telefon: +998 91 339 26 96\n"
        f"💬 Telegram admin: @salomov_2502, @Doniyorovna96\n"
        f"📸 Instagram: <a href='https://www.instagram.com/mk_mustafa_kids/'>@mk_mustafa_kids</a>\n\n"
        f"Har kuni 09:00 dan 20:00 gacha xizmatingizdamiz!"
    )
    await message.answer(contact_text, parse_mode="HTML")


@router.message(F.text == "⚙️ Admin Panel Havolasi")
async def show_admin_link(message: Message):
    username = message.from_user.username
    if username and username.lower() in [u.lower() for u in ADMIN_USERNAMES]:
        webapp_url = os.getenv("WEBAPP_URL", "")
        site_link = webapp_url if webapp_url.startswith("https://") else "https://mustafa-kids.vercel.app/"
        await message.answer(
            f"🔑 Admin paneliga o'tish uchun quyidagi havolani bosing:\n"
            f"{site_link}/admin.html\n\n"
            f"Kirish paroli: {html.bold(os.getenv('ADMIN_PASSWORD', 'admin123'))}"
        )
    else:
        await message.answer("Kechirasiz, siz admin emassiz.")

# Service message handlers to delete join/leave messages in group chats
@router.message(F.new_chat_members)
async def delete_join_message(message: Message):
    try:
        await message.delete()
    except Exception as e:
        logger.error(f"Failed to delete join message: {e}")

@router.message(F.left_chat_member)
async def delete_leave_message(message: Message):
    try:
        await message.delete()
    except Exception as e:
        logger.error(f"Failed to delete leave message: {e}")

# Fallback free text handler -> OpenAI GPT assistant
@router.message(F.text)
async def handle_gpt_chat(message: Message, state: FSMContext):
    # Do not respond to admins writing text messages
    username = message.from_user.username
    if username and username.lower() in [u.lower() for u in ADMIN_USERNAMES]:
        return

    if message.text.startswith("/") or message.text in ["🛍️ Katalog", "🌐 Mini Do'kon", "🛒 Savatcha", "📦 Buyurtmalarim", "📞 Biz bilan bog'lanish", "⚙️ Admin Panel Havolasi", "🎥 Video rejalashtirish"]:
        return
        
    # If the message is in a group or supergroup, only respond if the bot is mentioned or replied to
    if message.chat.type in ["group", "supergroup"]:
        bot_info = await bot.get_me()
        is_mentioned = message.text and f"@{bot_info.username}" in message.text
        is_reply_to_bot = message.reply_to_message and message.reply_to_message.from_user.id == bot_info.id
        if not (is_mentioned or is_reply_to_bot):
            return
        
    await bot.send_chat_action(message.chat.id, action="typing")
    
    data = await state.get_data()
    history = data.get("history", [])
    history.append({"role": "user", "content": message.text})
    
    reply_text = await get_gpt_response(message.text, history=history)
    history.append({"role": "assistant", "content": reply_text})
    
    if len(history) > 20:
        history = history[-10:]
    await state.update_data(history=history)
    
    await message.answer(reply_text)

dp.include_router(router)
