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
                "shop_name": "Soliha - Ayollar va Bolalar kiyimlari do'koni 👗🍼",
                "address": "Zarafshon shahri, 11-44 avtobus bekatida",
                "phone": "+998 93 067 18 88, +998 97 320 06 68",
                "telegram_admins": "@EnglishteacherMadi, @Salomov_2502",
                "working_hours": "Har kuni 09:00 dan 20:00 gacha",
                "delivery_terms": "Zarafshon sh. bo'ylab va viloyatlarga yetkazib berish mavjud. BTS / Pochta orqali yuboriladi. Yetkazib berish narxi kelishiladi."
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
            "Assalomu alaykum! 🍼 Soliha Baby Shop do'konimizga xush kelibsiz.\n"
            "Hozirda AI yordamchi o'chirilgan. Savollaringiz bo'lsa adminga murojaat qiling:\n"
            "📞 +998 90 123 45 67 | @EnglishteacherMadi, @Salomov_2502"
        )
        
    system_prompt = (
        "Siz 'Soliha - Ayollar va Bolalar kiyimlari do'koni' yordamchi AI sotuvchisisiz. Vazifangiz xaridorlarga samimiy, muloyim va mehmondo'st tilda, O'zbek tilida savollariga javob berishdir.\n"
        "Mijozlar do'kondan nafis ayollar kiyimlari, go'daklar va bolalar uchun sifatli kiyim-kechaklar yoki o'yinchoqlar izlashayotgan bo'ladi. Ularga doimo yordam berishga tayyor turing.\n"
        "Sizda do'kon ma'lumotlar omboriga bog'langan maxsus funksiyalar (tools) mavjud. Har safar mijoz mahsulot, uning narxi, razmeri, toifasi yoki do'kon manzili/telefoni haqida so'raganda, "
        "albatta mos keluvchi funksiyani chaqiring. O'zingizdan taxminiy narxlar to'qimang!\n"
        "Mahsulot narxi, o'lchamlari yoki tafsilotlarini doimo bazadagi ma'lumotlarga asoslanib ayting.\n"
        "Javoblaringizni chiroyli ko'rinishda formatlang va emojilar (masalan: 👗, 🍼, 🧸, 👶, 💵, 📍) ishlating."
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
            "Siz 'Soliha' ayollar va bolalar kiyimlari do'koni uchun mahsulot tahlilchisisiz. "
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
