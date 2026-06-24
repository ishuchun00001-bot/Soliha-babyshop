from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from backend.app.config import DATABASE_URL

# Create SQLAlchemy engine and session
engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Category(Base):
    __tablename__ = "categories"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    
    products = relationship("Product", back_populates="category", cascade="all, delete-orphan")

class Product(Base):
    __tablename__ = "products"
    
    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    price = Column(Float, nullable=False)
    sizes = Column(String, nullable=True)  # Comma-separated sizes e.g., "0-3 oy, 3-6 oy, 6-9 oy"
    image_url = Column(String, nullable=True)  # Relative url path, e.g., "/static/uploads/filename.png"
    stock = Column(Integer, default=10)
    is_active = Column(Boolean, default=True)
    
    category = relationship("Category", back_populates="products")
    order_items = relationship("OrderItem", back_populates="product")

class Order(Base):
    __tablename__ = "orders"
    
    id = Column(Integer, primary_key=True, index=True)
    customer_name = Column(String, nullable=False)
    customer_phone = Column(String, nullable=False)
    address = Column(String, nullable=False)
    delivery_method = Column(String, default="delivery")  # "delivery" or "pickup"
    total_amount = Column(Float, nullable=False)
    status = Column(String, default="Yangi")  # "Yangi", "Qabul qilindi", "Yetkazilmoqda", "Yakunlandi", "Bekor qilindi"
    telegram_id = Column(Integer, nullable=True)  # User's telegram chat_id if ordered via bot
    created_at = Column(DateTime, default=datetime.utcnow)
    
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

class OrderItem(Base):
    __tablename__ = "order_items"
    
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    size = Column(String, nullable=True)
    quantity = Column(Integer, default=1)
    price = Column(Float, nullable=False)
    
    order = relationship("Order", back_populates="items")
    product = relationship("Product", back_populates="order_items")

class AdminUser(Base):
    __tablename__ = "admin_users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)  # Telegram username without @
    telegram_id = Column(Integer, nullable=True)  # Filled dynamically when admin starts the bot

def init_db():
    Base.metadata.create_all(bind=engine)
