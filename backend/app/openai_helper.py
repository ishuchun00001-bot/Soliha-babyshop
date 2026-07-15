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
        if "stock" not in data:
            data["stock"] = 10
            
        return data
    except Exception as e:
        logger.error(f"Error in OpenAI Vision image analysis: {e}")
        return {
            "name": "Yangi kiyim-kechak",
            "description": "Rasm tahlilida xatolik yuz berdi, lekin tizim mahsulotni yaratdi.",
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
            model="dall-e-3",
            prompt=prompt,
            size="1024x1024",
            quality="hd",
            n=1
        )
        url = response.data[0].url
        import httpx
        async with httpx.AsyncClient() as http_client:
            img_res = await http_client.get(url, timeout=60)
            if img_res.status_code == 200:
                logger.info("Dalle image generated and downloaded successfully.")
                return img_res.content
    except Exception as e:
        logger.error(f"Error generating DALL-E image: {e}")
    return None


def create_infographics(image_bytes: bytes, title: str, price: float, sizes: str) -> bytes:
    import io
    from PIL import Image, ImageDraw, ImageFont
    
    image = Image.open(io.BytesIO(image_bytes))
    
    # Ensure it's RGB
    if image.mode != "RGB":
        image = image.convert("RGB")
        
    image = image.resize((1024, 1024), Image.Resampling.LANCZOS)
    
    # Create transparent drawing layer
    draw_layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(draw_layer)
    
    try:
        font_title = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 36)
        font_price = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 44)
        font_brand = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 26)
        font_sizes = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 24)
    except Exception:
        try:
            font_title = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 36)
            font_price = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 44)
            font_brand = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 26)
            font_sizes = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 24)
        except Exception:
            font_title = ImageFont.load_default()
            font_price = ImageFont.load_default()
            font_brand = ImageFont.load_default()
            font_sizes = ImageFont.load_default()
            
    # Bottom banner box (semi-transparent elegant white)
    draw.rectangle([0, 850, 1024, 1024], fill=(255, 255, 255, 220))
    
    # Gold/rose border separator line on top of bottom banner
    draw.line([0, 850, 1024, 850], fill=(219, 148, 153, 255), width=4)
    
    # Sizes badge on top-right corner
    if sizes:
        size_txt = f"Razmer: {sizes}"
        bbox = draw.textbbox((0, 0), size_txt, font=font_sizes)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        badge_w = text_w + 30
        badge_h = text_h + 16
        draw.rounded_rectangle([1024 - badge_w - 40, 40, 1024 - 40, 40 + badge_h], radius=15, fill=(219, 148, 153, 240))
        draw.text((1024 - badge_w - 25, 48), size_txt, fill=(255, 255, 255, 255), font=font_sizes)
        
    # Draw Mustafa Kids branding on the bottom banner
    draw.text((40, 870), "Mustafa Kids", fill=(219, 148, 153, 255), font=font_brand)
    
    # Draw product title
    display_title = title[:45] + "..." if len(title) > 45 else title
    draw.text((40, 915), display_title, fill=(40, 40, 40, 255), font=font_title)
    
    # Draw Price on bottom-right
    price_str = f"{price:,.0f} so'm".replace(",", " ")
    draw.text((700, 910), price_str, fill=(180, 80, 90, 255), font=font_price)
    
    # Composite drawings onto original image
    image = Image.alpha_composite(image.convert("RGBA"), draw_layer).convert("RGB")
    
    out_io = io.BytesIO()
    image.save(out_io, format="JPEG", quality=90)
    return out_io.getvalue()


