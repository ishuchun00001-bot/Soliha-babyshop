import os
from pathlib import Path
from dotenv import load_dotenv

# Directory for static upload files
BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env file
env_path = BASE_DIR / ".env"
load_dotenv(dotenv_path=env_path, override=True)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
ADMIN_USERNAMES_RAW = os.getenv("ADMIN_USERNAMES", "")
ADMIN_USERNAMES = [u.strip().replace("@", "") for u in ADMIN_USERNAMES_RAW.split(",") if u.strip()]

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR.as_posix()}/database.db")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
SECRET_KEY = os.getenv("SECRET_KEY", "soliha_baby_shop_secret_key_123!")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
TELEGRAM_CHANNEL_ID = os.getenv("TELEGRAM_CHANNEL_ID", "")
INSTAGRAM_VERIFY_TOKEN = os.getenv("INSTAGRAM_VERIFY_TOKEN", "soliha_insta_verify_123")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "products")

UPLOAD_DIR = BASE_DIR / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR = BASE_DIR.parent / "frontend" / "dist"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

