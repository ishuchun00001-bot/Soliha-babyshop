import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
ADMIN_USERNAMES_RAW = os.getenv("ADMIN_USERNAMES", "")
ADMIN_USERNAMES = [u.strip().replace("@", "") for u in ADMIN_USERNAMES_RAW.split(",") if u.strip()]

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///d:/Soliha_baby_shop/backend/database.db")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
SECRET_KEY = os.getenv("SECRET_KEY", "soliha_baby_shop_secret_key_123!")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
TELEGRAM_CHANNEL_ID = os.getenv("TELEGRAM_CHANNEL_ID", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "products")

# Directory for static upload files
BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR = BASE_DIR.parent / "frontend" / "dist"
