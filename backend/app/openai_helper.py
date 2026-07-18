import json
import logging
import base64
from openai import AsyncOpenAI

from backend.app.config import OPENAI_API_KEY
from backend.app import supabase_helper

logger = logging.getLogger(__name__)

# Initialize OpenAI Client
client = None
if OPENAI_API_KEY:
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
else:
    logger.warning("OPENAI_API_KEY is not configured. GPT response will fallback to default messages.")

# Tool definitions for GPT Function Calling
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "Do'kondan mahsulotlarni nomi yoki tavsifi bo'yicha qidiradi. Qidiruv kalit so'zi berilishi kerak.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Qidirilayotgan mahsulot nomi (masalan: 'kombinezon', 'o'yinchoq', 'bodik')"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_product_details",
            "description": "Mahsulotning to'liq tafsilotlari, narxi, o'lchamlari va ombordagi qoldig'ini ID bo'yicha oladi.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {
                        "type": "integer",
                        "description": "Mahsulotning unikal ID raqami"
                    }
                },
                "required": ["product_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_categories",
            "description": "Do'kondagi barcha toifalar (kategoriyalar) ro'yxatini oladi."
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_shop_info",
            "description": "Do'kon manzili, ish vaqti, telefon raqami va yetkazib berish shartlari kabi umumiy ma'lumotlarni oladi."
        }
    }
]

# Local tool execution logic (Supabase integration)
async def execute_tool(name: str, arguments: dict) -> str:
    try:
        if name == "search_products":
            query = arguments.get("query", "").lower()
            products = supabase_helper.get_products()
            
            # Filter results client-side matching name or description
            filtered = []
            for p in products:
                name_match = query in p["name"].lower()
                desc_match = (p.get("description") and query in p["description"].lower())
                if name_match or desc_match:
                    filtered.append({
                        "id": p["id"],
                        "name": p["name"],
                        "price": f"{p['price']:,.0f} so'm",
                        "sizes": p.get("sizes") or "—"
                    })
            
            if not filtered:
                return f"Qidiruv bo'yicha '{query}' hech qanday mahsulot topilmadi."
            return json.dumps(filtered, ensure_ascii=False)
            
        elif name == "get_product_details":
            pid = arguments.get("product_id")
            p = supabase_helper.get_product(pid)
            if not p or not p.get("is_active", True):
                return "Mahsulot topilmadi yoki faol emas."
                
            cats = supabase_helper.get_categories()
            cat_name = "Noma'lum"
            for c in cats:
                if c["id"] == p["category_id"]:
                    cat_name = c["name"]
                    break
                    
            details = {
                "id": p["id"],
                "name": p["name"],
                "description": p.get("description") or "Tavsif mavjud emas",
                "price": f"{p['price']:,.0f} so'm",
                "sizes": p.get("sizes") or "—",
                "stock": p.get("stock", 10),
                "category": cat_name
            }
            return json.dumps(details, ensure_ascii=False)
            
        elif name == "get_categories":
            cats = supabase_helper.get_categories()
            res = [{"id": c["id"], "name": c["name"]} for c in cats]
            return json.dumps(res, ensure_ascii=False)
            
        elif name == "get_shop_info":
            info = {
                "shop_name": "Mustafa Kids - Bolalar kiyimlari do'koni 🛍️",
                "address": "Tashkent shahri",
                "phone": "+998 91 339 26 96",
                "telegram_admins": "@salomov_2502, @Doniyorovna96",
                "working_hours": "Har kuni 09:00 dan 20:00 gacha",
                "delivery_terms": "Tashkent sh. va viloyatlarga yetkazib berish mavjud. BTS / Pochta orqali yuboriladi. Yetkazib berish narxi kelishiladi."
            }
            return json.dumps(info, ensure_ascii=False)
            
        else:
            return f"Xatolik: '{name}' nomli funksiya mavjud emas."
    except Exception as e:
        logger.error(f"Error executing tool {name}: {e}")
        return f"Tizim xatoligi yuz berdi: {str(e)}"

# Main GPT response generator
async def get_gpt_response(message_text: str, history: list = None) -> str:
    if not client:
        return (
            "Assalomu alaykum! 🛍️ Mustafa Kids do'konimizga xush kelibsiz.\n"
            "Hozirda AI yordamchi o'chirilgan. Savollaringiz bo'lsa adminga murojaat qiling:\n"
            "📞 +998 91 339 26 96 | @salomov_2502, @Doniyorovna96"
        )
        
    system_prompt = (
        "Siz 'Mustafa Kids - Bolalar kiyimlari do'koni' yordamchi AI sotuvchisisiz. Vazifangiz xaridorlar bilan o'ta xushmuomala, mehmondo'st, juda qisqa, lunda va chiroyli tilda O'zbek tilida muloqot qilishdir. Uzun gapirmang, qisqa va lo'nda javob bering.\n"
        "Mijozlar bolalar kiyimlari haqida so'rashadi.\n"
        "QAT'IY VA MUHIM QOIDALAR:\n"
        "1. FAQAT DO'KON DOIRASIDA JAVOB BERISH: Siz FAQAT 'Mustafa Kids' do'koni, uning kiyimlari, toifalari, manzili, ish vaqti va yetkazib berish xizmatiga doir savollarga javob berasiz. Umuman boshqa mavzulardagi savollarga (masalan: dasturlash, matematika, tarix, siyosat, boshqa sohalar va h.k.) mutlaqo javob bermang. Agar mijoz boshqa mavzuda savol bersa, juda xushmuomala ravishda faqat do'kon va kiyim-kechaklar bo'yicha yordam bera olishingizni aytib, savolga javob berishni rad eting.\n"
        "2. NARX VA OMBORDAGI SONI HAQIDA GAPIRMASLIK: Mahsulotlarning narxi yoki omborda nechta qolganligi (soni) haqida umuman gapirmang va ma'lumot bermang. Agar mijoz biron kiyimning narxini, uni qanday sotib olishni, buyurtma berishni yoki omborda bor-yo'qligini so'rasa, darhol adminlarni chaqiring. Javobingiz aynan quyidagicha bo'lishi kerak: 'Ushbu savolingiz bo'yicha hozir sizga adminlarimiz batafsil ma'lumot berishadi, iltimos biroz kuting: @salomov_2502 yoki @Doniyorovna96'.\n"
        "3. O'zingizdan narx to'qimang va narx so'ralganda 'hozir sizga yozishadi' deb adminlarni chaqiring.\n"
        "4. Boshqa umumiy savollar (ish vaqti, do'kon manzili, telefon raqamlari, qanday toifalar borligi) uchun tegishli funksiyalarni (tools) chaqirib, o'ta qisqa va chiroyli javob bering.\n"
        "Javoblaringizda doimo chiroyli emojilar ishlating."
    )


    
    messages = [{"role": "system", "content": system_prompt}]
    
    # Add history if available (limit to last 6 messages to save context space)
    if history:
        for msg in history[-6:]:
            messages.append(msg)
            
    # Add current user message
    messages.append({"role": "user", "content": message_text})
    
    try:
        # First request to GPT
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto"
        )
        
        response_message = response.choices[0].message
        tool_calls = response_message.tool_calls
        
        # Check if GPT wants to call a tool
        if tool_calls:
            # Add assistant message to context
            messages.append(response_message)
            
            # Execute all requested tools
            for tool_call in tool_calls:
                function_name = tool_call.function.name
                function_args = json.loads(tool_call.function.arguments)
                
                # Execute tool
                tool_output = await execute_tool(function_name, function_args)
                
                # Add tool result to context
                messages.append({
                    "tool_call_id": tool_call.id,
                    "role": "tool",
                    "name": function_name,
                    "content": tool_output
                })
                
            # Second request to GPT with tool outputs
            second_response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages
            )
            return second_response.choices[0].message.content
            
        else:
            return response_message.content
            
    except Exception as e:
        logger.error(f"Error in OpenAI API call: {e}")
        return "Kechirasiz, hozirda savolingizga javob berishda texnik muammo yuz berdi. Iltimos birozdan keyin qaytadan urinib ko'ring."

async def analyze_product_image(image_bytes: bytes, mime_type: str) -> dict:
    if not client:
        return {
            "name": "Yangi mahsulot",
            "description": "Mahsulot rasmini tahlil qilish uchun OpenAI API kaliti sozlanmagan.",
            "stock": 10
        }
        
    try:
        # Encode bytes to base64
        base64_image = base64.b64encode(image_bytes).decode("utf-8")
        
        prompt = (
            "Siz 'Mustafa Kids' bolalar kiyimlari do'koni uchun mahsulot tahlilchisisiz. "
            "Ushbu yuklangan kiyim/mahsulot rasmini tahlil qiling. "
            "Natijani faqatgina JSON formatida, hech qanday markdown formatlashsiz (```json va ``` teglarsiz) qaytaring: \n"
            "{\n"
            "  \"name\": \"Mahsulotning chiroyli, jozibali nomi o'zbek tilida (masalan: 'Nafis gulli shifon ko'ylak' yoki 'Chiroyli bolalar trikotaj kombinezoni')\",\n"
            "  \"description\": \"Mahsulotning chiroyli tavsifi, matosi, dizayni va uslubini ta'riflovchi o'zbek tilidagi 2-3 ta gap\",\n"
            "  \"price\": Taxminiy chakana sotish narxi faqat butun son ko'rinishida (masalan: 120000, 140000, 95000. Kiyim turiga qarab munosib narx belgilang, masalan to'plam kiyimlar uchun 140000, ko'ylak uchun 120000, futbolka uchun 75000 so'm, shimlar uchun 95000 so'm, kurtkalar uchun 180000 so'm. Faqat raqam yozing),\n"
            "  \"sizes\": \"Kiyim uchun mos keladigan bolalar o'lchamlari (masalan agar rasmda yozilgan bo'lsa o'shani oling, aks holda standart mos o'lchamlarni yozing, masalan: '86, 92, 98' yoki '92, 98, 104, 110')\",\n"
            "  \"stock\": 10\n"
            "}\n"
            "Javobda faqat to'g'ri JSON bo'lishi shart, qo'shimcha matn yozmang."
        )
        
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=300
        )
        
        content = response.choices[0].message.content.strip()
        # Clean markdown wrappers if returned
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()
        
        data = json.loads(content)
        # Ensure required fields exist
        if "name" not in data:
            data["name"] = "Yangi mahsulot"
        if "description" not in data:
            data["description"] = "Tavsif mavjud emas"
        if "price" not in data:
            data["price"] = 120000
        if "sizes" not in data:
            data["sizes"] = "92, 98, 104"
        if "stock" not in data:
            data["stock"] = 10
            
        return data
    except Exception as e:
        logger.error(f"Error in OpenAI Vision image analysis: {e}")
        return {
            "name": "Yangi kiyim-kechak",
            "description": "Rasm tahlilida xatolik yuz berdi, lekin tizim mahsulotni yaratdi.",
            "price": 120000,
            "sizes": "92, 98, 104",
            "stock": 10
        }

async def generate_video_post_caption(brief_info: str) -> dict:
    if not client:
        return {
            "caption": brief_info,
            "hashtags": "#mustafakids #bolalarkiyimi #mk_mustafa_kids"
        }
    try:
        prompt = (
            "Siz 'Mustafa Kids' bolalar kiyimlari do'koni uchun sotuvchi va kopiraytersiz. "
            "Mijoz quyidagi qisqa ma'lumotni berdi:\n"
            f"'{brief_info}'\n\n"
            "Ushbu ma'lumot asosida Instagram va Telegram uchun jozibali, qiziqarli, emojilar bilan boyitilgan, "
            "sotuvchi matn (caption) va mos keluvchi ommabop heshteglarni (hashtags) o'zbek tilida yozib bering. "
            "Natijani faqatgina JSON formatida, hech qanday markdown formatlashsiz (```json va ``` teglarsiz) qaytaring: \n"
            "{\n"
            "  \"caption\": \"Bu yerda chiroyli yozilgan tavsif matni bo'ladi. Emojilar ishlating.\",\n"
            "  \"hashtags\": \"#heshteg1 #heshteg2 #mustafakids #mk_mustafa_kids\"\n"
            "}\n"
            "Javobda faqat to'g'ri JSON bo'lishi shart, qo'shimcha matn yozmang."
        )
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500
        )
        content = response.choices[0].message.content.strip()
        # Clean markdown wrappers if returned
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()
        
        data = json.loads(content)
        if "caption" not in data:
            data["caption"] = brief_info
        if "hashtags" not in data:
            data["hashtags"] = "#mustafakids #bolalarkiyimi #mk_mustafa_kids"
        return data
    except Exception as e:
        logger.error(f"Error generating video post caption: {e}")
        return {
            "caption": brief_info,
            "hashtags": "#mustafakids #bolalarkiyimi #mk_mustafa_kids"
        }


async def generate_dalle_image(prompt: str) -> Optional[bytes]:
    if not client:
        logger.error("OpenAI client not configured for DALL-E.")
        return None
    try:
        response = await client.images.generate(
            model="gpt-image-2",
            prompt=prompt,
            size="1024x1024",
            quality="high",
            n=1
        )
        url = response.data[0].url
        if not url:
            logger.error("DALL-E response URL is empty.")
            return None
            
        if url.startswith("data:image"):
            import base64
            logger.info("Dalle image generated as base64 data URI, decoding directly.")
            _, encoded = url.split(",", 1)
            return base64.b64decode(encoded)
        else:
            import httpx
            logger.info("Dalle image generated as web URL, downloading...")
            async with httpx.AsyncClient() as http_client:
                img_res = await http_client.get(url, timeout=60)
                if img_res.status_code == 200:
                    logger.info("Dalle image downloaded successfully.")
                    return img_res.content
    except Exception as e:
        logger.error(f"Error generating DALL-E image: {e}")
    return None


def create_infographics(image_bytes: bytes, title: str, price: float, sizes: str) -> bytes:
    import io
    from PIL import Image, ImageDraw, ImageFont
    
    # 1. Create base canvas (1024x1280 px) with warm beige background
    canvas_w = 1024
    canvas_h = 1280
    background_color = (245, 238, 227) # #f5eedf (warm beige/cream)
    canvas = Image.new("RGB", (canvas_w, canvas_h), background_color)
    draw = ImageDraw.Draw(canvas)
    
    # 2. Draw outer border (elegant thin line)
    border_color = (209, 199, 189) # #d1c7bd
    draw.rectangle([10, 10, canvas_w - 10, canvas_h - 10], outline=border_color, width=2)
    
    # 3. Load Fonts
    try:
        font_serif_lg = ImageFont.truetype("C:/Windows/Fonts/georgiab.ttf", 46)
        font_serif_md = ImageFont.truetype("C:/Windows/Fonts/georgiab.ttf", 26)
        font_serif_italic = ImageFont.truetype("C:/Windows/Fonts/georgiai.ttf", 22)
        font_sans_bold = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 24)
        font_sans_regular = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 20)
        font_sans_sm = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 16)
    except Exception:
        # Fallback to default
        font_serif_lg = ImageFont.load_default()
        font_serif_md = ImageFont.load_default()
        font_serif_italic = ImageFont.load_default()
        font_sans_bold = ImageFont.load_default()
        font_sans_regular = ImageFont.load_default()
        font_sans_sm = ImageFont.load_default()

    # 4. Load & Resize product photo
    prod_image = Image.open(io.BytesIO(image_bytes))
    if prod_image.mode != "RGB":
        prod_image = prod_image.convert("RGB")
        
    # Resize product photo to fit elegantly on the right
    prod_w = 510
    prod_h = 680
    prod_resized = prod_image.resize((prod_w, prod_h), Image.Resampling.LANCZOS)
    
    # Position product photo on canvas (x=470, y=70)
    canvas.paste(prod_resized, (470, 70))
    
    # Draw simple frame border around the product photo
    draw.rectangle([470, 70, 470 + prod_w, 70 + prod_h], outline=border_color, width=1)
    
    # 5. Left Column Content (Brand, Titles, Badges, Features)
    # Brand
    draw.text((40, 60), "MUSTAFA KIDS", fill=(100, 90, 80), font=font_sans_sm)
    
    # Subtitle "Cool & Comfy" with decorative line
    draw.text((40, 90), "Cool & Comfy", fill=(140, 130, 120), font=font_serif_italic)
    draw.line([180, 105, 300, 105], fill=(140, 130, 120), width=1)
    
    # Product Title (e.g. SUMMER SET)
    draw.text((40, 120), title.upper()[:16], fill=(74, 60, 49), font=font_serif_lg)
    
    # Rounded badge capsule "YUMSHOQ VA NAFAS OLADIGAN"
    badge_bg = (119, 107, 95) # #776b5f
    draw.rounded_rectangle([40, 190, 360, 230], radius=15, fill=badge_bg)
    draw.text((65, 198), "YUMSHOQ VA NAFAS OLADIGAN", fill=(255, 255, 255), font=font_sans_sm)
    
    # Size info if present
    if sizes:
        draw.text((40, 250), f"O'lcham: {sizes}", fill=(74, 60, 49), font=font_sans_bold)
        
    # Price Block
    draw.text((40, 300), "NARXI:", fill=(140, 130, 120), font=font_sans_bold)
    # Sale price
    price_str = f"{price:,.0f} so'm".replace(",", " ")
    draw.text((40, 330), price_str, fill=(20, 44, 115), font=font_serif_lg) # Navy blue
    # Original price (crossed out)
    original_price = price * 2
    old_price_str = f"{original_price:,.0f} so'm".replace(",", " ")
    draw.text((40, 385), old_price_str, fill=(254, 74, 73), font=font_serif_md)
    # Crossed line
    bbox_old = draw.textbbox((40, 385), old_price_str, font=font_serif_md)
    line_y = (bbox_old[1] + bbox_old[3]) // 2
    draw.line([bbox_old[0], line_y, bbox_old[2], line_y], fill=(254, 74, 73), width=2)
    
    # Bullet points (Circular icons with Uzbek features)
    features = [
        "Yuqori sifatli paxta",
        "Yengil va nafas oladigan",
        "Zamonaviy va qulay dizayn",
        "Har kuni uchun ideal tanlov"
    ]
    bullet_y = 450
    for feat in features:
        # Draw circular background
        circle_center = (55, bullet_y + 15)
        r = 15
        draw.ellipse([circle_center[0]-r, circle_center[1]-r, circle_center[0]+r, circle_center[1]+r], fill=(219, 210, 196))
        # Draw a small inner checkmark or dot
        draw.ellipse([circle_center[0]-4, circle_center[1]-4, circle_center[0]+4, circle_center[1]+4], fill=(74, 60, 49))
        
        # Text
        draw.text((85, bullet_y + 4), feat, fill=(74, 60, 49), font=font_sans_regular)
        bullet_y += 55

    # 6. Bottom Part Divider
    draw.line([25, 780, canvas_w - 25, 780], fill=border_color, width=1)
    
    # 7. Bottom Three Columns
    # Column 1 (Details zoom in)
    col1_x = 40
    draw.text((col1_x, 800), "DETALLAR", fill=(74, 60, 49), font=font_serif_md)
    # Crop two square details from the original product image and place them
    detail_size = 130
    # Safe boundary cropping
    w_orig, h_orig = prod_resized.size
    cx1, cy1 = int(w_orig * 0.4), int(h_orig * 0.2)
    cx2, cy2 = int(w_orig * 0.5), int(h_orig * 0.6)
    detail1 = prod_resized.crop((cx1, cy1, cx1 + detail_size, cy1 + detail_size))
    detail2 = prod_resized.crop((cx2, cy2, cx2 + detail_size, cy2 + detail_size))
    
    canvas.paste(detail1, (col1_x, 850))
    canvas.paste(detail2, (col1_x + 150, 850))
    # Border frames for details
    draw.rectangle([col1_x, 850, col1_x + detail_size, 850 + detail_size], outline=border_color, width=1)
    draw.rectangle([col1_x + 150, 850, col1_x + 150 + detail_size, 850 + detail_size], outline=border_color, width=1)
    
    draw.text((col1_x, 1000), "Nafis va yumshoq tikuvlar", fill=(100, 90, 80), font=font_sans_sm)
    draw.text((col1_x, 1025), "Qulay va keng o'lchamlar", fill=(100, 90, 80), font=font_sans_sm)
    
    # Column 2 (Afzalliklari list)
    col2_x = 380
    draw.text((col2_x, 800), "AFZALLIKLARI", fill=(74, 60, 49), font=font_serif_md)
    benefits = [
        "• 100% tabiiy va xavfsiz",
        "• Terini bezovta qilmaydi",
        "• Yuvishda rangi o'chmaydi",
        "• Harakatni cheklamaydi",
        "• Allergiyaga qarshi mato"
    ]
    ben_y = 850
    for ben in benefits:
        draw.text((col2_x, ben_y), ben, fill=(74, 60, 49), font=font_sans_regular)
        ben_y += 35
        
    # Column 3 (Mato close-up)
    col3_x = 700
    draw.text((col3_x, 800), "MATO TEKSTURASI", fill=(74, 60, 49), font=font_serif_md)
    detail_w = 280
    detail_h = 160
    cx3, cy3 = int(w_orig * 0.35), int(h_orig * 0.4)
    texture_img = prod_resized.crop((cx3, cy3, cx3 + detail_w, cy3 + detail_h))
    canvas.paste(texture_img, (col3_x, 850))
    # Border frame for texture
    draw.rectangle([col3_x, 850, col3_x + detail_w, 850 + detail_h], outline=border_color, width=1)
    
    # Description label for texture
    draw.text((col3_x, 1025), "100% Premium Paxta matosi", fill=(100, 90, 80), font=font_sans_sm)
    
    # 8. Footer (Little moments...)
    draw.line([25, 1210, canvas_w - 25, 1210], fill=border_color, width=1)
    footer_text = "LITTLE MOMENTS, GREAT MEMORIES  •  MUSTAFA KIDS"
    draw.text((canvas_w // 2 - 220, 1230), footer_text, fill=(140, 130, 120), font=font_sans_sm)
    
    out_io = io.BytesIO()
    canvas.save(out_io, format="JPEG", quality=95)
    return out_io.getvalue()


