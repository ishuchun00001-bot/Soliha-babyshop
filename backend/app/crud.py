from sqlalchemy.orm import Session
from backend.app.database import Category, Product, Order, OrderItem, AdminUser

# Category CRUD
def get_categories(db: Session):
    return db.query(Category).all()

def get_category_by_name(db: Session, name: str):
    return db.query(Category).filter(Category.name == name).first()

def create_category(db: Session, name: str):
    db_category = Category(name=name)
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

def delete_category(db: Session, category_id: int):
    category = db.query(Category).filter(Category.id == category_id).first()
    if category:
        db.delete(category)
        db.commit()
        return True
    return False

# Product CRUD
def get_products(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Product).filter(Product.is_active == True).offset(skip).limit(limit).all()

def get_all_products_raw(db: Session):
    return db.query(Product).all()

def get_product(db: Session, product_id: int):
    return db.query(Product).filter(Product.id == product_id).first()

def get_products_by_category(db: Session, category_id: int):
    return db.query(Product).filter(Product.category_id == category_id, Product.is_active == True).all()

def create_product(db: Session, name: str, description: str, price: float, category_id: int, sizes: str = None, image_url: str = None, stock: int = 10):
    product = Product(
        name=name,
        description=description,
        price=price,
        category_id=category_id,
        sizes=sizes,
        image_url=image_url,
        stock=stock
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product

def update_product(db: Session, product_id: int, updates: dict):
    product = get_product(db, product_id)
    if not product:
        return None
    for key, value in updates.items():
        if hasattr(product, key):
            setattr(product, key, value)
    db.commit()
    db.refresh(product)
    return product

def delete_product(db: Session, product_id: int):
    product = get_product(db, product_id)
    if product:
        db.delete(product)
        db.commit()
        return True
    return False

# Order CRUD
def create_order(db: Session, customer_name: str, customer_phone: str, address: str, delivery_method: str, total_amount: float, items_data: list, telegram_id: int = None):
    # items_data should be list of dicts: [{"product_id": int, "size": str, "quantity": int, "price": float}]
    order = Order(
        customer_name=customer_name,
        customer_phone=customer_phone,
        address=address,
        delivery_method=delivery_method,
        total_amount=total_amount,
        telegram_id=telegram_id
    )
    db.add(order)
    db.flush()  # get order.id before commit
    
    for item in items_data:
        order_item = OrderItem(
            order_id=order.id,
            product_id=item["product_id"],
            size=item.get("size"),
            quantity=item.get("quantity", 1),
            price=item["price"]
        )
        db.add(order_item)
        # Optionally decrement product stock
        prod = get_product(db, item["product_id"])
        if prod:
            prod.stock = max(0, prod.stock - item.get("quantity", 1))
            
    db.commit()
    db.refresh(order)
    return order

def get_orders(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Order).order_by(Order.created_at.desc()).offset(skip).limit(limit).all()

def get_order(db: Session, order_id: int):
    return db.query(Order).filter(Order.id == order_id).first()

def get_user_orders(db: Session, telegram_id: int):
    return db.query(Order).filter(Order.telegram_id == telegram_id).order_by(Order.created_at.desc()).all()

def update_order_status(db: Session, order_id: int, status: str):
    order = get_order(db, order_id)
    if order:
        order.status = status
        db.commit()
        db.refresh(order)
        return order
    return None

# Admin CRUD
def get_admin_by_username(db: Session, username: str):
    return db.query(AdminUser).filter(AdminUser.username == username).first()

def update_admin_telegram_id(db: Session, username: str, telegram_id: int):
    admin = get_admin_by_username(db, username)
    if admin:
        admin.telegram_id = telegram_id
        db.commit()
        db.refresh(admin)
        return admin
    else:
        # Create admin if it doesn't exist but is in config
        admin = AdminUser(username=username, telegram_id=telegram_id)
        db.add(admin)
        db.commit()
        db.refresh(admin)
        return admin

def get_registered_admins_telegram_ids(db: Session):
    admins = db.query(AdminUser).filter(AdminUser.telegram_id != None).all()
    return [admin.telegram_id for admin in admins]

def ensure_admins_exist(db: Session, allowed_usernames: list):
    # Clean up admins not in allowed list, or just ensure config ones are there
    for username in allowed_usernames:
        admin = get_admin_by_username(db, username)
        if not admin:
            db_admin = AdminUser(username=username)
            db.add(db_admin)
    db.commit()
