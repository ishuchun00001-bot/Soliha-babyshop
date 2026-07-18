import React, { useState, useEffect, useRef } from 'react';
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
    const [selectedAge, setSelectedAge] = useState('all');
    const [priceSort, setPriceSort] = useState('none');
    const [maxPrice, setMaxPrice] = useState(500000);
    
    const [cart, setCart] = useState(() => {
        const local = localStorage.getItem("soliha_cart");
        return local ? JSON.parse(local) : {};
    });
    
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [isSuccessOpen, setIsSuccessOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    
    // Lightbox gallery states
    const [activeLightboxIndex, setActiveLightboxIndex] = useState(null);
    const [zoomScale, setZoomScale] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    
    const touchRef = useRef({
        startX: 0,
        startY: 0,
        lastDistance: 0,
        isSwiping: false,
        isPinching: false,
        lastTap: 0
    });

    const handleNextLightbox = () => {
        if (activeLightboxIndex !== null && activeLightboxIndex < filteredProducts.length - 1) {
            setActiveLightboxIndex(activeLightboxIndex + 1);
        }
    };
    
    const handlePrevLightbox = () => {
        if (activeLightboxIndex !== null && activeLightboxIndex > 0) {
            setActiveLightboxIndex(activeLightboxIndex - 1);
        }
    };

    const handleWheel = (e) => {
        const intensity = 0.15;
        const delta = -e.deltaY;
        const change = delta > 0 ? intensity : -intensity;
        setZoomScale(prev => {
            const nextScale = Math.max(1, Math.min(5, prev + change));
            if (nextScale === 1) setPanOffset({ x: 0, y: 0 });
            return nextScale;
        });
    };

    const handleMouseDown = (e) => {
        if (zoomScale <= 1) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        setPanOffset({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Reset zoom and pan when lightbox product changes
    useEffect(() => {
        setZoomScale(1);
        setPanOffset({ x: 0, y: 0 });
        setIsDragging(false);
    }, [activeLightboxIndex]);

    // Handle Keyboard navigation (ArrowLeft, ArrowRight, Escape)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (activeLightboxIndex === null) return;
            if (e.key === 'Escape') {
                setActiveLightboxIndex(null);
            } else if (e.key === 'ArrowRight') {
                handleNextLightbox();
            } else if (e.key === 'ArrowLeft') {
                handlePrevLightbox();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeLightboxIndex, filteredProducts]);

    // Preload next and previous images
    useEffect(() => {
        if (activeLightboxIndex !== null) {
            const preload = (url) => {
                if (!url) return;
                const img = new Image();
                img.src = url;
            };
            if (activeLightboxIndex > 0) {
                preload(filteredProducts[activeLightboxIndex - 1]?.image_url);
            }
            if (activeLightboxIndex < filteredProducts.length - 1) {
                preload(filteredProducts[activeLightboxIndex + 1]?.image_url);
            }
        }
    }, [activeLightboxIndex, filteredProducts]);
    
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
        const matchesPrice = p.price <= maxPrice;
        const matchesAge = selectedAge === 'all' || (p.sizes && p.sizes.toLowerCase().includes(selectedAge.toLowerCase()));
        return matchesCategory && matchesSearch && matchesPrice && matchesAge;
    });

    if (priceSort === 'asc') {
        filteredProducts.sort((a, b) => a.price - b.price);
    } else if (priceSort === 'desc') {
        filteredProducts.sort((a, b) => b.price - a.price);
    }

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
                <span>✨ O'zbekiston bo'ylab yetkazib berish mavjud! 🛍️ 09:00 dan 21:00 gacha xizmatingizdamiz</span>
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
            
            {/* Filter Section (Price, Age/Size, Sorting) */}
            <div className="filters-sidebar" style={{ 
                background: 'var(--card-bg)', 
                padding: '1.25rem 1.5rem', 
                borderRadius: 'var(--radius-lg)', 
                border: '1px solid var(--glass-border)',
                margin: '1.5rem auto 2.5rem auto',
                maxWidth: '1200px',
                width: '100%',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1.5rem',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: 'var(--soft-shadow)'
            }}>
                {/* Age Filter */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '220px', flex: '2' }}>
                    <label style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-dark)', letterSpacing: '0.5px' }}>YOSH / RAZMER:</label>
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {['all', '0-3 oy', '3-6 oy', '6-9 oy', '9-12 oy', '1-2y', '3-4y', '5-6y', '7-8y'].map(age => (
                            <button
                                key={age}
                                className={`category-tab ${selectedAge === age ? 'active' : ''}`}
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', borderRadius: '4px', height: 'auto', border: '1px solid var(--glass-border)' }}
                                onClick={() => setSelectedAge(age)}
                            >
                                {age === 'all' ? 'Barchasi' : age}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Price Range Filter */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '180px', flex: '1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-dark)', letterSpacing: '0.5px' }}>MAKSIMAL NARX:</label>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary-navy)' }}>{formatPrice(maxPrice)} so'm</span>
                    </div>
                    <input 
                        type="range" 
                        min="20000" 
                        max="500000" 
                        step="10000"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(Number(e.target.value))}
                        style={{ accentColor: 'var(--primary-navy)', width: '100%', height: '6px', cursor: 'pointer' }}
                    />
                </div>

                {/* Price Sorting */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '150px', flex: '1' }}>
                    <label style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-dark)', letterSpacing: '0.5px' }}>SARALASH (NARX):</label>
                    <select 
                        value={priceSort}
                        onChange={(e) => setPriceSort(e.target.value)}
                        style={{
                            padding: '0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--glass-border)',
                            background: 'var(--card-bg)',
                            color: 'var(--text-dark)',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="none">Saralashsiz</option>
                        <option value="asc">Arzonlari oldin</option>
                        <option value="desc">Qimmatlari oldin</option>
                    </select>
                </div>
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
                            {filteredProducts.map((prod, idx) => {
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
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (prod.image_url) setActiveLightboxIndex(idx);
                                            }}
                                            style={{ cursor: 'zoom-in', position: 'relative' }}
                                        >
                                            {prod.image_url ? (
                                                <>
                                                    <img src={prod.image_url} alt={prod.name} className="product-image" />
                                                    <div style={{ position: 'absolute', bottom: '10px', right: '10px', background: 'rgba(0,0,0,0.5)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px', pointerEvents: 'none', zIndex: 5 }}>
                                                        🔍 Kattalashtirish
                                                    </div>
                                                </>
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
                                            
                                            {/* Dedicated Sizes Section */}
                                            {sizesList.length > 0 && (
                                                <div className="product-card-sizes" style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '1.2rem', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: '2px' }}>O'lcham:</span>
                                                    {sizesList.map(sz => (
                                                        <span 
                                                            key={sz} 
                                                            style={{ 
                                                                fontSize: '0.75rem', 
                                                                background: 'var(--primary-navy-light)', 
                                                                color: 'var(--primary-navy)', 
                                                                padding: '0.15rem 0.45rem', 
                                                                borderRadius: '4px', 
                                                                fontWeight: 600,
                                                                border: '1px solid var(--glass-border)'
                                                            }}
                                                        >
                                                            {sz}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="product-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '0.5rem', marginBottom: '1.2rem' }}>
                                                <div className="price-container">
                                                    <span className="original-price">{formatPrice(prod.price * 2)} so'm</span>
                                                    <span className="product-price">{formatPrice(prod.price)} so'm</span>
                                                </div>
                                            </div>
                                            <button 
                                                className="add-to-cart-btn"
                                                onClick={() => {
                                                    if (sizesList.length > 1) {
                                                        setSelectedProduct(prod);
                                                    } else {
                                                        handleAddToCart(prod, sizesList[0] || null);
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
                                <div 
                                    onClick={() => {
                                        if (selectedProduct.image_url) {
                                            const idx = filteredProducts.findIndex(p => p.id === selectedProduct.id);
                                            if (idx !== -1) {
                                                setActiveLightboxIndex(idx);
                                                setSelectedProduct(null);
                                            }
                                        }
                                    }}
                                    style={{ 
                                        width: window.innerWidth < 768 ? '100%' : '260px', 
                                        height: '320px', 
                                        background: 'var(--primary-navy-light)', 
                                        borderRadius: 'var(--radius-md)', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        overflow: 'hidden', 
                                        border: '1px solid var(--glass-border)',
                                        cursor: selectedProduct.image_url ? 'zoom-in' : 'default',
                                        position: 'relative'
                                    }}
                                >
                                    {selectedProduct.image_url ? (
                                        <>
                                            <img src={selectedProduct.image_url} alt={selectedProduct.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                            <div style={{ position: 'absolute', bottom: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', pointerEvents: 'none' }}>
                                                🔍 Kattalashtirish
                                            </div>
                                        </>
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

            {/* Lightbox / Fullscreen Image Zoom Modal */}
            <AnimatePresence>
                {activeLightboxIndex !== null && filteredProducts[activeLightboxIndex] && (
                    <motion.div 
                        role="dialog"
                        aria-modal="true"
                        aria-label="Mahsulot rasmini kattalashtirib ko'rish"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        onClick={() => setActiveLightboxIndex(null)}
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            width: '100vw',
                            height: '100vh',
                            backgroundColor: 'rgba(0, 0, 0, 0.95)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 2000,
                            cursor: zoomScale > 1 ? 'grab' : 'zoom-out',
                            overflow: 'hidden',
                            touchAction: 'none'
                        }}
                    >
                        {/* Close button */}
                        <button 
                            onClick={(e) => { e.stopPropagation(); setActiveLightboxIndex(null); }}
                            aria-label="Yopish"
                            style={{
                                position: 'absolute',
                                top: '20px',
                                right: '20px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: 'none',
                                color: 'white',
                                fontSize: '2.5rem',
                                width: '50px',
                                height: '50px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                zIndex: 2005,
                                transition: 'background 0.2s',
                                outline: 'none'
                            }}
                            onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
                            onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
                        >
                            &times;
                        </button>

                        {/* Navigation: Prev Button */}
                        {activeLightboxIndex > 0 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handlePrevLightbox(); }}
                                aria-label="Oldingi mahsulot"
                                style={{
                                    position: 'absolute',
                                    left: '20px',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    border: 'none',
                                    color: 'white',
                                    width: '50px',
                                    height: '50px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    zIndex: 2002,
                                    outline: 'none',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
                                onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                            </button>
                        )}

                        {/* Navigation: Next Button */}
                        {activeLightboxIndex < filteredProducts.length - 1 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleNextLightbox(); }}
                                aria-label="Keyingi mahsulot"
                                style={{
                                    position: 'absolute',
                                    right: '20px',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    border: 'none',
                                    color: 'white',
                                    width: '50px',
                                    height: '50px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    zIndex: 2002,
                                    outline: 'none',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
                                onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                        )}

                        {/* Zoomed Image Container */}
                        <div
                            onClick={(e) => e.stopPropagation()}
                            onWheel={handleWheel}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                            onTouchStart={(e) => {
                                const now = Date.now();
                                const doubleTapDelay = 300;
                                if (e.touches.length === 1 && (now - touchRef.current.lastTap) < doubleTapDelay) {
                                    setZoomScale(prev => {
                                        const newScale = prev > 1 ? 1 : 2;
                                        if (newScale === 1) setPanOffset({ x: 0, y: 0 });
                                        return newScale;
                                    });
                                    touchRef.current.lastTap = 0;
                                    return;
                                }
                                if (e.touches.length === 1) {
                                    touchRef.current.lastTap = now;
                                    touchRef.current.startX = e.touches[0].clientX;
                                    touchRef.current.startY = e.touches[0].clientY;
                                    if (zoomScale > 1) {
                                        setIsDragging(true);
                                        setDragStart({
                                            x: e.touches[0].clientX - panOffset.x,
                                            y: e.touches[0].clientY - panOffset.y
                                        });
                                    } else {
                                        touchRef.current.isSwiping = true;
                                    }
                                } else if (e.touches.length === 2) {
                                    touchRef.current.isPinching = true;
                                    touchRef.current.isSwiping = false;
                                    setIsDragging(false);
                                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                                    touchRef.current.lastDistance = Math.sqrt(dx * dx + dy * dy);
                                }
                            }}
                            onTouchMove={(e) => {
                                if (e.touches.length === 2 && touchRef.current.isPinching) {
                                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                                    const dist = Math.sqrt(dx * dx + dy * dy);
                                    const factor = dist / (touchRef.current.lastDistance || 1);
                                    touchRef.current.lastDistance = dist;
                                    setZoomScale(prev => {
                                        const newScale = Math.max(1, Math.min(5, prev * factor));
                                        if (newScale === 1) setPanOffset({ x: 0, y: 0 });
                                        return newScale;
                                    });
                                } else if (e.touches.length === 1 && zoomScale > 1 && isDragging) {
                                    setPanOffset({
                                        x: e.touches[0].clientX - dragStart.x,
                                        y: e.touches[0].clientY - dragStart.y
                                    });
                                }
                            }}
                            onTouchEnd={(e) => {
                                setIsDragging(false);
                                touchRef.current.isPinching = false;
                                if (touchRef.current.isSwiping && e.changedTouches.length === 1) {
                                    const endX = e.changedTouches[0].clientX;
                                    const diffX = endX - touchRef.current.startX;
                                    const threshold = 60;
                                    if (Math.abs(diffX) > threshold) {
                                        if (diffX > 0) {
                                            handlePrevLightbox();
                                        } else {
                                            handleNextLightbox();
                                        }
                                    }
                                }
                                touchRef.current.isSwiping = false;
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '100%',
                                height: '100%',
                                overflow: 'hidden'
                            }}
                        >
                            <motion.img 
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ 
                                    scale: zoomScale, 
                                    x: panOffset.x, 
                                    y: panOffset.y,
                                    opacity: 1
                                }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                transition={{ duration: isDragging ? 0 : 0.25 }}
                                src={filteredProducts[activeLightboxIndex].image_url} 
                                alt={filteredProducts[activeLightboxIndex].name} 
                                style={{
                                    maxWidth: '95vw',
                                    maxHeight: '95vh',
                                    objectFit: 'contain',
                                    borderRadius: '8px',
                                    boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
                                    userSelect: 'none',
                                    WebkitUserDrag: 'none',
                                    cursor: zoomScale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in'
                                }} 
                            />
                        </div>

                        {/* Bottom-left: Zoom Indicator */}
                        <div style={{
                            position: 'absolute',
                            bottom: '20px',
                            left: '20px',
                            background: 'rgba(0, 0, 0, 0.7)',
                            color: '#ffffff',
                            padding: '8px 16px',
                            borderRadius: '20px',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            pointerEvents: 'none',
                            zIndex: 2002,
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            fontFamily: 'sans-serif'
                        }}>
                            <span>🔍 Zoom: {zoomScale.toFixed(1)}x</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
