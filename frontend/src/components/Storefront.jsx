import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    ShoppingBag, Search, X, Plus, Minus, Check, MapPin, Phone, Clock, ShoppingCart
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { SHOP_INFO } from '../config';

export default function Storefront() {
    // State
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    
    const [cart, setCart] = useState(() => {
        const local = localStorage.getItem("soliha_cart");
        return local ? JSON.parse(local) : {};
    });
    
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [isSuccessOpen, setIsSuccessOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    
    // Checkout form state
    const [custName, setCustName] = useState('');
    const [custPhone, setCustPhone] = useState('+998');
    const [custAddress, setCustAddress] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState('delivery');
    const [checkoutLoading, setCheckoutLoading] = useState(false);

    // Save cart to local storage
    useEffect(() => {
        localStorage.setItem("soliha_cart", JSON.stringify(cart));
    }, [cart]);

    // Log visitor session
    useEffect(() => {
        async function logVisit() {
            try {
                // 1. Get or generate visitor_id
                let visitorId = localStorage.getItem("soliha_visitor_id");
                if (!visitorId) {
                    visitorId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                        const r = Math.random() * 16 | 0;
                        const v = c === 'x' ? r : (r & 0x3 | 0x8);
                        return v.toString(16);
                    });
                    localStorage.setItem("soliha_visitor_id", visitorId);
                }

                // 2. Check if already logged in this session
                const sessionLogged = sessionStorage.getItem("soliha_visit_logged");
                if (!sessionLogged) {
                    const { error } = await supabase
                        .from("visit_logs")
                        .insert([{ visitor_id: visitorId }]);
                    
                    if (!error) {
                        sessionStorage.setItem("soliha_visit_logged", "true");
                    }
                }
            } catch (err) {
                console.error("Failed to log visit:", err);
            }
        }
        logVisit();
    }, []);

    // Fetch initial data
    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                // 1. Fetch categories
                const { data: catData, error: catErr } = await supabase
                    .from("categories")
                    .select("*")
                    .order("name");
                if (catErr) throw catErr;
                setCategories(catData || []);

                // 2. Fetch products
                const { data: prodData, error: prodErr } = await supabase
                    .from("products")
                    .select("*")
                    .eq("is_active", true)
                    .order("created_at", { ascending: false });
                if (prodErr) throw prodErr;
                setProducts(prodData || []);
            } catch (err) {
                console.error("Data fetching failed:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    // Cart calculations
    const cartKeys = Object.keys(cart);
    const cartCount = cartKeys.reduce((sum, key) => sum + cart[key].quantity, 0);
    const cartTotal = cartKeys.reduce((sum, key) => sum + (cart[key].price * cart[key].quantity), 0);

    // Filters
    const filteredProducts = products.filter(p => {
        const matchesCategory = selectedCategory === 'all' || p.category_id === Number(selectedCategory);
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesCategory && matchesSearch;
    });

    // Cart Actions
    const handleAddToCart = (product, size) => {
        const cartKey = size ? `${product.id}_${size}` : `${product.id}`;
        setCart(prev => {
            const updated = { ...prev };
            if (updated[cartKey]) {
                updated[cartKey].quantity += 1;
            } else {
                updated[cartKey] = {
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    size: size || null,
                    quantity: 1,
                    image_url: product.image_url
                };
            }
            return updated;
        });
    };

    const handleUpdateQty = (cartKey, amount) => {
        setCart(prev => {
            const updated = { ...prev };
            if (!updated[cartKey]) return prev;
            updated[cartKey].quantity += amount;
            if (updated[cartKey].quantity <= 0) {
                delete updated[cartKey];
            }
            return updated;
        });
    };

    const handleRemoveFromCart = (cartKey) => {
        setCart(prev => {
            const updated = { ...prev };
            delete updated[cartKey];
            return updated;
        });
    };

    // Checkout Submission
    const handleCheckoutSubmit = async (e) => {
        e.preventDefault();
        if (cartKeys.length === 0) return;
        setCheckoutLoading(true);

        const items = cartKeys.map(key => ({
            product_id: cart[key].id,
            size: cart[key].size,
            quantity: cart[key].quantity,
            price: cart[key].price
        }));

        try {
            // 1. Create order
            const { data: orderData, error: orderErr } = await supabase
                .from("orders")
                .insert([{
                    customer_name: custName,
                    customer_phone: custPhone,
                    address: custAddress,
                    delivery_method: deliveryMethod,
                    total_amount: cartTotal,
                    status: "Yangi",
                    customer_notified: false
                }])
                .select();
                
            if (orderErr) throw orderErr;
            const orderId = orderData[0].id;

            // 2. Insert items
            const itemsToInsert = items.map(it => ({
                order_id: orderId,
                product_id: it.product_id,
                size: it.size,
                quantity: it.quantity,
                price: it.price
            }));
            const { error: itemsErr } = await supabase
                .from("order_items")
                .insert(itemsToInsert);
            if (itemsErr) throw itemsErr;

            // 3. Decrement stock
            for (let it of items) {
                const prod = products.find(p => p.id === it.product_id);
                if (prod) {
                    const newStock = Math.max(0, prod.stock - it.quantity);
                    await supabase
                        .from("products")
                        .update({ stock: newStock })
                        .eq("id", it.product_id);
                }
            }

            // Success cleanup
            setCart({});
            setCustName('');
            setCustPhone('+998');
            setCustAddress('');
            setDeliveryMethod('delivery');
            
            setIsCheckoutOpen(false);
            setIsSuccessOpen(true);
        } catch (err) {
            console.error("Checkout transaction failed:", err);
            alert("Buyurtmani rasmiylashtirishda xatolik yuz berdi! Qayta urinib ko'ring.");
        } finally {
            setCheckoutLoading(false);
        }
    };

    const formatPrice = (p) => {
        return Number(p).toLocaleString('uz-UZ').replace(/,/g, ' ');
    };

    return (
        <div>
            {/* Background elements */}
            <div className="bg-glow bg-glow-1"></div>
            <div className="bg-glow bg-glow-2"></div>

            {/* Announcement bar */}
            <div className="announcement-bar">
                <span>✨ Tashkent shahri bo'ylab bepul yetkazib berish! 🛍️ 9:00 dan 20:00 gacha xizmatingizdamiz</span>
            </div>

            {/* Header */}
            <header>
                <div className="logo-container" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img src="/logo.png" alt="Mustafa Kids Logo" style={{ height: '35px', width: 'auto', borderRadius: '50%' }} />
                    <span className="logo-text">Mustafa <span className="logo-subtext">Kids</span></span>
                </div>
                
                <div className="header-right">
                    <motion.div 
                        className="cart-icon-container" 
                        id="cartTrigger"
                        onClick={() => setIsCartOpen(true)}
                        whileTap={{ scale: 0.95 }}
                    >
                        <span className="cart-icon-wrapper">
                            <ShoppingCart size={20} />
                        </span>
                        <span className="cart-label">Savatcha</span>
                        <AnimatePresence>
                            {cartCount > 0 && (
                                <motion.div 
                                    className="cart-badge" 
                                    id="cartBadge"
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    exit={{ scale: 0 }}
                                >
                                    {cartCount}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="hero">
                <span className="hero-tag">Nafislik va Qulaylik</span>
                <h1>Mustafa Kids do'konida <span>Go'zallik va Sifat</span> uyg'unligi</h1>
                <p>Farzandingiz uchun eng sara, sifatli va betakror bolalar kiyim-kechaklari to'plamini taqdim etamiz</p>
            </section>

            {/* Search Section */}
            <div className="search-container">
                <div className="search-wrapper">
                    <span className="search-icon">
                        <Search size={18} strokeWidth={2.5} />
                    </span>
                    <input 
                        type="text" 
                        className="search-input" 
                        id="searchInput" 
                        placeholder="Kiyimlar, razmerlar yoki toifalarni qidiring..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Categories Slider */}
            <div className="categories-container" id="categoriesContainer">
                <button 
                    className={`category-tab ${selectedCategory === 'all' ? 'active' : ''}`}
                    onClick={() => setSelectedCategory('all')}
                >
                    Hammasi ✨
                </button>
                {categories.map(cat => (
                    <button 
                        key={cat.id}
                        className={`category-tab ${selectedCategory === String(cat.id) ? 'active' : ''}`}
                        onClick={() => setSelectedCategory(String(cat.id))}
                    >
                        {cat.name}
                    </button>
                ))}
            </div>

            {/* Products Grid */}
            <main className="products-section">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '5rem 0' }}>
                        <div className="loading-spinner"></div>
                        <p style={{ marginTop: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>Nafis kiyimlar yuklanmoqda...</p>
                    </div>
                ) : filteredProducts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--text-muted)' }}>
                        <p style={{ fontSize: '1.2rem', fontWeight: 500 }}>Hech qanday mahsulot topilmadi</p>
                    </div>
                ) : (
                    <motion.div 
                        className="products-grid" 
                        id="productsGrid"
                        layout
                    >
                        <AnimatePresence>
                            {filteredProducts.map(prod => {
                                const sizesList = prod.sizes ? prod.sizes.split(",").map(s => s.trim()) : [];
                                return (
                                    <motion.div 
                                        key={prod.id}
                                        className="product-card"
                                        layout
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ duration: 0.3 }}
                                    >
                                        <div className="sale-badge">Chegirma -50%</div>
                                        <div 
                                            className="product-image-wrapper"
                                            onClick={() => setSelectedProduct(prod)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            {prod.image_url ? (
                                                <img src={prod.image_url} alt={prod.name} className="product-image" />
                                            ) : (
                                                <div className="product-placeholder">🍼</div>
                                            )}
                                        </div>
                                        <div className="product-info">
                                            <h3 
                                                className="product-name"
                                                onClick={() => setSelectedProduct(prod)}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                {prod.name}
                                            </h3>
                                            <p className="product-desc">{prod.description || 'Mustafa Kids kiyimi'}</p>
                                            <div className="product-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '0.5rem' }}>
                                                <div className="price-container">
                                                    <span className="original-price">{formatPrice(prod.price * 2)} so'm</span>
                                                    <span className="product-price">{formatPrice(prod.price)} so'm</span>
                                                </div>
                                                {sizesList.length > 0 && (
                                                    <span className="product-sizes-badge">📏 {sizesList[0]}+</span>
                                                )}
                                            </div>
                                            <button 
                                                className="add-to-cart-btn"
                                                onClick={() => {
                                                    if (sizesList.length > 1) {
                                                        setSelectedProduct(prod);
                                                    } else {
                                                        handleAddToCart(prod, sizesList[0]);
                                                    }
                                                }}
                                            >
                                                <ShoppingCart size={16} />
                                                <span>Savatga qo'shish</span>
                                            </button>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </motion.div>
                )}
            </main>

            {/* Floating Mobile Cart */}
            <AnimatePresence>
                {cartCount > 0 && (
                    <motion.div 
                        className="floating-cart" 
                        id="floatingCartTrigger"
                        onClick={() => setIsCartOpen(true)}
                        initial={{ opacity: 0, scale: 0, y: 50 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0, y: 50 }}
                        whileTap={{ scale: 0.9 }}
                    >
                        <ShoppingCart size={24} />
                        <div className="floating-cart-badge" id="floatingCartBadge">{cartCount}</div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Footer */}
            <footer>
                <div className="footer-grid">
                    <div className="footer-brand">
                        <h3>{SHOP_INFO.name}</h3>
                        <p>Bolalar kiyimlarining eng nafis to'plami. Sifat biz uchun eng birinchi o'rinda.</p>
                    </div>
                    <div className="footer-contacts">
                        <h4>Bog'lanish 📞</h4>
                        <p><MapPin size={14} style={{ marginRight: '5px', display: 'inline' }} /> {SHOP_INFO.address}</p>
                        <p><Phone size={14} style={{ marginRight: '5px', display: 'inline' }} /> {SHOP_INFO.phone1}</p>
                        {SHOP_INFO.phone2 && <p><Phone size={14} style={{ marginRight: '5px', display: 'inline' }} /> {SHOP_INFO.phone2}</p>}
                    </div>
                    <div className="footer-hours">
                        <h4>Ish vaqti ⏰</h4>
                        <p><Clock size={14} style={{ marginRight: '5px', display: 'inline' }} /> Dushanba - Yakshanba</p>
                        <p>{SHOP_INFO.hours}</p>
                    </div>
                </div>
                <div className="footer-bottom">
                    <p>&copy; 2026 Mustafa Kids. Barcha huquqlar himoyalangan.</p>
                </div>
            </footer>

            {/* Cart Drawer */}
            <div className={`cart-drawer ${isCartOpen ? 'open' : ''}`} id="cartDrawer">
                <div className="cart-drawer-header">
                    <h2 className="cart-drawer-title">Savatchangiz 🛒</h2>
                    <button className="close-drawer" id="closeCart" onClick={() => setIsCartOpen(false)}>&times;</button>
                </div>
                <div className="cart-drawer-body" id="cartItemsContainer">
                    {cartKeys.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '5rem 0' }}>
                            <p style={{ fontSize: '1.1rem' }}>Savatchangiz bo'sh 🍼</p>
                        </div>
                    ) : (
                        cartKeys.map(key => {
                            const item = cart[key];
                            return (
                                <div key={key} className="cart-item">
                                    {item.image_url ? (
                                        <img src={item.image_url} alt={item.name} className="cart-item-image" />
                                    ) : (
                                        <div className="cart-item-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', background: 'var(--primary-rose-light)' }}>🍼</div>
                                    )}
                                    <div className="cart-item-info">
                                        <h4 className="cart-item-name">{item.name}</h4>
                                        {item.size && <p className="cart-item-size">O'lcham: {item.size}</p>}
                                        <div className="cart-item-price">{formatPrice(item.price)} so'm</div>
                                    </div>
                                    <div className="cart-item-controls">
                                        <div className="qty-controls">
                                            <button className="qty-btn" onClick={() => handleUpdateQty(key, -1)}><Minus size={12} /></button>
                                            <span className="qty-val">{item.quantity}</span>
                                            <button className="qty-btn" onClick={() => handleUpdateQty(key, 1)}><Plus size={12} /></button>
                                        </div>
                                        <button className="remove-item" onClick={() => handleRemoveFromCart(key)}>O'chirish</button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
                <div className="cart-drawer-footer">
                    <div className="total-summary">
                        <span>Jami summa:</span>
                        <span id="cartTotal">{formatPrice(cartTotal)} so'm</span>
                    </div>
                    <button 
                        className="checkout-btn" 
                        id="checkoutBtn"
                        disabled={cartKeys.length === 0}
                        onClick={() => {
                            setIsCartOpen(false);
                            setIsCheckoutOpen(true);
                        }}
                    >
                        Buyurtma Berish ✨
                    </button>
                </div>
            </div>

            {/* Cart Drawer Overlay */}
            <div className={`drawer-overlay ${isCartOpen ? 'open' : ''}`} id="drawerOverlay" onClick={() => setIsCartOpen(false)}></div>

            {/* Product Quick View / Size Selection Modal */}
            <AnimatePresence>
                {selectedProduct && (
                    <motion.div 
                        className="modal open"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <div className="modal-content" style={{ maxWidth: '600px' }}>
                            <div className="modal-header">
                                <h2 className="modal-title">{selectedProduct.name}</h2>
                                <button className="close-drawer" onClick={() => setSelectedProduct(null)}>&times;</button>
                            </div>
                            <div style={{ padding: '2rem', display: 'flex', gap: '2rem', flexDirection: window.innerWidth < 768 ? 'column' : 'row' }}>
                                <div style={{ width: window.innerWidth < 768 ? '100%' : '200px', height: '200px', background: 'var(--primary-navy-light)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
                                    {selectedProduct.image_url ? (
                                        <img src={selectedProduct.image_url} alt={selectedProduct.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '0.5rem' }} />
                                    ) : (
                                        <div style={{ fontSize: '3rem' }}>🍼</div>
                                    )}
                                </div>
                                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{selectedProduct.description || 'Batafsil ma\'lumotlar mavjud emas.'}</p>
                                    <div className="price-container">
                                        <span className="original-price" style={{ fontSize: '1.05rem' }}>{formatPrice(selectedProduct.price * 2)} so'm</span>
                                        <span className="product-price" style={{ fontSize: '1.6rem', fontWeight: 700 }}>{formatPrice(selectedProduct.price)} so'm</span>
                                    </div>
                                    
                                    {/* Size selection if sizes exist */}
                                    {selectedProduct.sizes && (
                                        <div>
                                            <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem' }}>O'lchamni tanlang:</p>
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                {selectedProduct.sizes.split(",").map(s => s.trim()).map(size => (
                                                    <button 
                                                        key={size}
                                                        className="category-tab"
                                                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                                                        onClick={() => {
                                                            handleAddToCart(selectedProduct, size);
                                                            setSelectedProduct(null);
                                                            setIsCartOpen(true);
                                                        }}
                                                    >
                                                        {size}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {!selectedProduct.sizes && (
                                        <button 
                                            className="add-to-cart-btn"
                                            onClick={() => {
                                                handleAddToCart(selectedProduct, null);
                                                setSelectedProduct(null);
                                                setIsCartOpen(true);
                                            }}
                                        >
                                            <ShoppingCart size={16} />
                                            <span>Savatga qo'shish</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Checkout Modal */}
            <AnimatePresence>
                {isCheckoutOpen && (
                    <motion.div 
                        className="modal open"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <div className="modal-content">
                            <div className="modal-header">
                                <h2 className="modal-title">Buyurtmani Rasmiylashtirish 📝</h2>
                                <button className="close-drawer" onClick={() => setIsCheckoutOpen(false)} style={{ color: 'white', fontSize: '2rem' }}>&times;</button>
                            </div>
                            <form id="checkoutForm" onSubmit={handleCheckoutSubmit}>
                                <div className="form-group">
                                    <label htmlFor="custName">Ismingiz:</label>
                                    <input 
                                        type="text" 
                                        id="custName" 
                                        required 
                                        placeholder="Ismingizni kiriting"
                                        value={custName}
                                        onChange={(e) => setCustName(e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="custPhone">Telefon raqamingiz:</label>
                                    <input 
                                        type="tel" 
                                        id="custPhone" 
                                        required 
                                        placeholder="+998 90 123 45 67"
                                        value={custPhone}
                                        onChange={(e) => setCustPhone(e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="custAddress">Yetkazib berish manzili:</label>
                                    <input 
                                        type="text" 
                                        id="custAddress" 
                                        required 
                                        placeholder="Manzilingizni yozing"
                                        value={custAddress}
                                        onChange={(e) => setCustAddress(e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="deliveryMethod">Yetkazib berish turi:</label>
                                    <select 
                                        id="deliveryMethod"
                                        value={deliveryMethod}
                                        onChange={(e) => setDeliveryMethod(e.target.value)}
                                    >
                                        <option value="delivery">Yetkazib berish (Dostavka)</option>
                                        <option value="pickup">Do'kondan olib ketish (Samovivoz)</option>
                                    </select>
                                </div>
                                <div className="form-actions">
                                    <button type="button" className="btn-secondary" onClick={() => setIsCheckoutOpen(false)}>Orqaga</button>
                                    <button type="submit" className="btn-primary" disabled={checkoutLoading}>
                                        {checkoutLoading ? "Kuting..." : "Tasdiqlash ✨"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Success Modal */}
            <AnimatePresence>
                {isSuccessOpen && (
                    <motion.div 
                        className="modal open"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <div className="modal-content" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                            <div className="success-checkmark">
                                <div className="checkmark-circle">
                                    <div className="checkmark-draw"></div>
                                </div>
                            </div>
                            <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--primary-rose-dark)', marginTop: '1.5rem', marginBottom: '0.5rem', fontSize: '1.8rem' }}>
                                Buyurtmangiz Qabul Qilindi! 🎉
                            </h2>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem', fontSize: '1rem', lineHeight: 1.6 }}>
                                Xaridingiz uchun rahmat! Buyurtmangiz muvaffaqiyatli ro'yxatga olindi. Tez orada do'kon ma'murlari siz bilan bog'lanishadi.
                            </p>
                            <button className="btn-primary" style={{ width: '100%' }} onClick={() => setIsSuccessOpen(false)}>Tushunarli</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
