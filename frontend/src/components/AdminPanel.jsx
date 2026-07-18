import React, { useState, useEffect } from 'react';
import { 
    LayoutDashboard, Package, FolderHeart, ShoppingCart, LogOut, Trash2, 
    Eye, Plus, Save, FileImage, Sparkles, CheckCircle2, ChevronRight 
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { SUPABASE_BUCKET } from '../config';

export default function AdminPanel({ onLogout }) {
    // Navigation state
    const [activeTab, setActiveTab] = useState('tab-dashboard');

    // Data states
    const [categories, setCategories] = useState([]);
    const [products, setProducts] = useState([]);
    const [orders, setOrders] = useState([]);
    const [stats, setStats] = useState({
        totalSales: 0,
        totalOrders: 0,
        pendingOrders: 0,
        totalProducts: 0,
        totalVisits: 0,
        uniqueVisitors: 0,
        todayVisits: 0,
        todayUniqueVisitors: 0
    });

    // Form states
    const [newCatName, setNewCatName] = useState('');
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [productForm, setProductForm] = useState({
        name: '',
        description: '',
        categoryId: '',
        price: '',
        sizes: '',
        stock: '10',
        file: null
    });
    const [productModalLoading, setProductModalLoading] = useState(false);
    
    // Order detail view state
    const [selectedOrder, setSelectedOrder] = useState(null);

    // Initial load
    useEffect(() => {
        loadData();
    }, [activeTab]);

    async function loadData() {
        try {
            // Load categories
            const { data: catData } = await supabase.from("categories").select("*").order("name");
            setCategories(catData || []);

            // Load products
            const { data: prodData } = await supabase.from("products").select("*").eq("is_active", true).order("created_at", { ascending: false });
            setProducts(prodData || []);

            // Load orders
            const { data: ordData } = await supabase
                .from("orders")
                .select("*, order_items(*, products(*))")
                .order("created_at", { ascending: false });
            setOrders(ordData || []);

            // Load visits (safely inside try-catch to prevent failure if table does not exist yet)
            let visitData = null;
            try {
                const { data: vData, error: vErr } = await supabase
                    .from("visit_logs")
                    .select("visitor_id, created_at");
                if (!vErr) {
                    visitData = vData;
                } else {
                    console.warn("Could not load visit_logs (table may not be created yet):", vErr);
                }
            } catch (vEx) {
                console.warn("Error querying visit_logs table:", vEx);
            }

            // Calculate stats
            if (ordData && prodData) {
                let sales = 0;
                let pending = 0;
                ordData.forEach(o => {
                    if (o.status !== "Bekor qilindi") {
                        sales += Number(o.total_amount);
                    }
                    if (o.status === "Yangi") {
                        pending++;
                    }
                });

                // Calculate visitor stats
                let totalVisits = 0;
                let uniqueVisitors = 0;
                let todayVisits = 0;
                let todayUniqueVisitors = 0;

                if (visitData) {
                    totalVisits = visitData.length;
                    
                    // Unique visitors (all-time)
                    const uniqueIds = new Set(visitData.map(v => v.visitor_id));
                    uniqueVisitors = uniqueIds.size;

                    // Today's visits (local day matching in YYYY-MM-DD format)
                    const todayStr = new Date().toLocaleDateString('en-CA');
                    const todayVisitsList = visitData.filter(v => {
                        const vDate = new Date(v.created_at).toLocaleDateString('en-CA');
                        return vDate === todayStr;
                    });
                    todayVisits = todayVisitsList.length;

                    // Today's unique visitors
                    const todayUniqueIds = new Set(todayVisitsList.map(v => v.visitor_id));
                    todayUniqueVisitors = todayUniqueIds.size;
                }

                setStats({
                    totalSales: sales,
                    totalOrders: ordData.length,
                    pendingOrders: pending,
                    totalProducts: prodData.length,
                    totalVisits,
                    uniqueVisitors,
                    todayVisits,
                    todayUniqueVisitors
                });
            }
        } catch (err) {
            console.error("Failed to load admin data:", err);
        }
    }

    // Category actions
    const handleAddCategory = async (e) => {
        e.preventDefault();
        if (!newCatName.trim()) return;
        try {
            const { error } = await supabase
                .from("categories")
                .insert([{ name: newCatName.trim() }]);
            if (error) throw error;
            setNewCatName('');
            loadData();
        } catch (err) {
            alert("Kategoriya qo'shishda xato: " + (err.message || JSON.stringify(err)));
        }
    };

    const handleDeleteCategory = async (id) => {
        if (!confirm("Kategoriyani o'chirsangiz uning ichidagi barcha mahsulotlar ham o'chadi! Rozimisiz?")) return;
        try {
            const { error } = await supabase.from("categories").delete().eq("id", id);
            if (error) throw error;
            loadData();
        } catch (err) {
            alert("Kategoriyani o'chirishda xato: " + (err.message || JSON.stringify(err)));
        }
    };

    // Product actions
    const handleProductFormSubmit = async (e) => {
        e.preventDefault();
        if (!productForm.file) {
            alert("Mahsulot rasmini yuklash majburiy!");
            return;
        }
        setProductModalLoading(true);

        try {
            // 1. Upload file
            const file = productForm.file;
            const cleanName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
            const { data: uploadData, error: uploadErr } = await supabase.storage
                .from(SUPABASE_BUCKET || "products")
                .upload(cleanName, file);
            if (uploadErr) throw uploadErr;

            // 2. Get URL
            const { data: urlData } = supabase.storage
                .from(SUPABASE_BUCKET || "products")
                .getPublicUrl(cleanName);
            const imageUrl = urlData.publicUrl;

            // 3. Insert record
            const { error: insertErr } = await supabase
                .from("products")
                .insert([{
                    name: productForm.name,
                    description: productForm.description,
                    price: parseFloat(productForm.price),
                    category_id: parseInt(productForm.categoryId),
                    sizes: productForm.sizes || null,
                    image_url: imageUrl,
                    stock: parseInt(productForm.stock),
                    is_active: true
                }]);
            if (insertErr) throw insertErr;

            // Reset
            setIsProductModalOpen(false);
            setProductForm({
                name: '',
                description: '',
                categoryId: '',
                price: '',
                sizes: '',
                stock: '10',
                file: null
            });
            loadData();
        } catch (err) {
            alert("Mahsulot qo'shishda xato: " + (err.message || JSON.stringify(err)));
        } finally {
            setProductModalLoading(false);
        }
    };

    const handleDeleteProduct = async (id) => {
        if (!confirm("Ushbu mahsulotni butunlay o'chirishga ishonchingiz komilmi?")) return;
        try {
            // Try to delete the record completely (hard delete)
            const { error } = await supabase
                .from("products")
                .delete()
                .eq("id", id);
                
            if (error) {
                // If hard delete fails (e.g., due to orders constraint), perform a soft delete instead
                console.warn("Hard delete failed (product is ordered), performing soft delete:", error);
                const { error: softError } = await supabase
                    .from("products")
                    .update({ is_active: false })
                    .eq("id", id);
                if (softError) throw softError;
            }
            loadData();
        } catch (err) {
            alert("Mahsulotni o'chirishda xato: " + (err.message || JSON.stringify(err)));
        }
    };

    // Order status actions
    const handleStatusChange = async (orderId, newStatus) => {
        try {
            // Set customer_notified = false so background poller notices and triggers Telegram message
            const { error } = await supabase
                .from("orders")
                .update({ 
                    status: newStatus,
                    customer_notified: false
                })
                .eq("id", orderId);
            if (error) throw error;
            loadData();
        } catch (err) {
            alert("Statusni yangilashda xato: " + (err.message || JSON.stringify(err)));
        }
    };

    const formatPrice = (p) => {
        return Number(p).toLocaleString('uz-UZ').replace(/,/g, ' ');
    };

    const getStatusClass = (status) => {
        switch (status) {
            case "Yangi": return "status-yangi";
            case "Qabul qilindi": return "status-qabul";
            case "Yetkazilmoqda": return "status-yetkazilmoqda";
            case "Yakunlandi": return "status-yakunlandi";
            case "Bekor qilindi": return "status-bekor";
            default: return "";
        }
    };

    return (
        <div className="admin-container">
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="logo-container">
                    <span className="logo-text">Mustafa <span className="logo-subtext">Admin</span></span>
                </div>
                <ul className="sidebar-menu">
                    <li>
                        <div 
                            className={`sidebar-link ${activeTab === 'tab-dashboard' ? 'active' : ''}`}
                            onClick={() => setActiveTab('tab-dashboard')}
                        >
                            <LayoutDashboard size={18} />
                            <span>Dashboard</span>
                        </div>
                    </li>
                    <li>
                        <div 
                            className={`sidebar-link ${activeTab === 'tab-products' ? 'active' : ''}`}
                            onClick={() => setActiveTab('tab-products')}
                        >
                            <Package size={18} />
                            <span>Mahsulotlar</span>
                        </div>
                    </li>
                    <li>
                        <div 
                            className={`sidebar-link ${activeTab === 'tab-categories' ? 'active' : ''}`}
                            onClick={() => setActiveTab('tab-categories')}
                        >
                            <FolderHeart size={18} />
                            <span>Kategoriyalar</span>
                        </div>
                    </li>
                    <li>
                        <div 
                            className={`sidebar-link ${activeTab === 'tab-orders' ? 'active' : ''}`}
                            onClick={() => setActiveTab('tab-orders')}
                        >
                            <ShoppingCart size={18} />
                            <span>Buyurtmalar</span>
                        </div>
                    </li>
                </ul>
                <button 
                    className="btn-secondary" 
                    onClick={onLogout}
                    style={{ marginTop: 'auto', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                    <LogOut size={16} />
                    <span>Tizimdan chiqish</span>
                </button>
            </aside>

            {/* Main Area */}
            <main className="admin-main">
                
                {/* 1. DASHBOARD */}
                {activeTab === 'tab-dashboard' && (
                    <section>
                        <h1 style={{ marginBottom: '2rem', fontWeight: 700 }}>Dashboard 📊</h1>
                        
                        <div className="stats-grid">
                            <div className="stat-card">
                                <div className="stat-icon">💰</div>
                                <div>
                                    <div className="stat-value">{formatPrice(stats.totalSales)} so'm</div>
                                    <div className="stat-label">Jami Savdo (bekor bo'lmagan)</div>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon blue">📦</div>
                                <div>
                                    <div className="stat-value">{stats.totalOrders}</div>
                                    <div className="stat-label">Jami Buyurtmalar</div>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon" style={{ color: 'var(--danger)', background: '#FFF2F2' }}>🔔</div>
                                <div>
                                    <div className="stat-value" style={{ color: 'var(--danger)' }}>{stats.pendingOrders}</div>
                                    <div className="stat-label">Yangi Buyurtmalar</div>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon blue">🍼</div>
                                <div>
                                    <div className="stat-value">{stats.totalProducts}</div>
                                    <div className="stat-label">Faol Mahsulotlar</div>
                                </div>
                            </div>
                        </div>

                        <h3 style={{ marginTop: '2.5rem', marginBottom: '1.2rem', fontWeight: 600, fontSize: '1.2rem' }}>Tashriflar Statistikasi 📈</h3>
                        <div className="stats-grid" style={{ marginBottom: '2rem' }}>
                            <div className="stat-card">
                                <div className="stat-icon" style={{ color: 'var(--primary-rose-dark)', background: 'var(--primary-rose-light)', fontSize: '1.5rem' }}>👥</div>
                                <div>
                                    <div className="stat-value">{stats.uniqueVisitors}</div>
                                    <div className="stat-label">Noyob Tashriflar (All-time)</div>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon" style={{ color: '#2563EB', background: '#DBEAFE', fontSize: '1.5rem' }}>👁️</div>
                                <div>
                                    <div className="stat-value">{stats.totalVisits}</div>
                                    <div className="stat-label">Jami Ko'rishlar (Sessiyalar)</div>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon" style={{ color: '#059669', background: '#D1FAE5', fontSize: '1.5rem' }}>📅</div>
                                <div>
                                    <div className="stat-value">{stats.todayUniqueVisitors}</div>
                                    <div className="stat-label">Bugungi Noyob Tashriflar</div>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon" style={{ color: '#7C3AED', background: '#F3E8FF', fontSize: '1.5rem' }}>✨</div>
                                <div>
                                    <div className="stat-value">{stats.todayVisits}</div>
                                    <div className="stat-label">Bugungi Jami Ko'rishlar</div>
                                </div>
                            </div>
                        </div>

                        <div className="admin-card">
                            <h2 className="admin-card-title">Mustafa Kids Boshqaruv Paneliga Xush Kelibsiz!</h2>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '1.2rem' }}>
                                Tizim to'liq ravishda **Supabase** bulutli platformasiga integratsiya qilingan.
                            </p>
                            <ul style={{ color: 'var(--text-muted)', paddingLeft: '1.5rem', lineHeight: 1.8 }}>
                                <li>Mijozlar buyurtmalari avtomatik tarzda ushbu admin panelda paydo bo'ladi.</li>
                                <li>Siz buyurtma holatini o'zgartirishingiz bilanoq, Telegram bot xaridorga bot orqali avtomatik xabar yuboradi.</li>
                                <li>Yangi mahsulotlarni bevosita Telegram botga rasm va narxini yozib yuborish orqali ham qo'sha olasiz. Ular bir zumda saytda ham aks etadi.</li>
                            </ul>
                        </div>
                    </section>
                )}

                {/* 2. PRODUCTS */}
                {activeTab === 'tab-products' && (
                    <section>
                        <div className="admin-card-header">
                            <h1 style={{ fontWeight: 700 }}>Mahsulotlar 🛍️</h1>
                            <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => setIsProductModalOpen(true)}>
                                <Plus size={16} />
                                <span>Yangi Mahsulot</span>
                            </button>
                        </div>

                        <div className="admin-card">
                            <div className="admin-table-wrapper">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Rasm</th>
                                            <th>Nomi</th>
                                            <th>Kategoriya</th>
                                            <th>Narxi</th>
                                            <th>O'lchamlar</th>
                                            <th>Qoldiq</th>
                                            <th>Amallar</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {products.length === 0 ? (
                                            <tr>
                                                <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Mahsulotlar mavjud emas</td>
                                            </tr>
                                        ) : (
                                            products.map(p => {
                                                const cat = categories.find(c => c.id === p.category_id);
                                                return (
                                                    <tr key={p.id}>
                                                        <td>
                                                            {p.image_url ? (
                                                                <img src={p.image_url} alt={p.name} style={{ width: '45px', height: '45px', objectFit: 'contain', background: 'var(--primary-rose-light)', borderRadius: 'var(--radius-sm)', padding: '2px' }} />
                                                            ) : (
                                                                <div style={{ width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary-rose-light)', borderRadius: 'var(--radius-sm)', fontSize: '1.2rem' }}>🍼</div>
                                                            )}
                                                        </td>
                                                        <td><strong>{p.name}</strong></td>
                                                        <td>{cat ? cat.name : "Noma'lum"}</td>
                                                        <td><strong>{formatPrice(p.price)} so'm</strong></td>
                                                        <td>{p.sizes || '—'}</td>
                                                        <td>{p.stock} dona</td>
                                                        <td>
                                                            <button 
                                                                className="btn-secondary" 
                                                                style={{ padding: '0.4rem 0.8rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                                                onClick={() => handleDeleteProduct(p.id)}
                                                            >
                                                                <Trash2 size={14} />
                                                                <span>O'chirish</span>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                )}

                {/* 3. CATEGORIES */}
                {activeTab === 'tab-categories' && (
                    <section>
                        <h1 style={{ marginBottom: '2rem', fontWeight: 700 }}>Kategoriyalar 📂</h1>
                        
                        <div className="admin-card" style={{ maxWidth: '600px', marginBottom: '2.5rem' }}>
                            <h2 className="admin-card-title">Yangi Kategoriya Qo'shish</h2>
                            <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '1rem' }}>
                                <input 
                                    type="text" 
                                    required 
                                    placeholder="Kategoriya nomi (masalan: Bolalar kiyimi)" 
                                    value={newCatName}
                                    onChange={(e) => setNewCatName(e.target.value)}
                                    style={{ flexGrow: 1, padding: '0.8rem 1.2rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,0,0,0.1)' }}
                                />
                                <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Plus size={16} />
                                    <span>Qo'shish</span>
                                </button>
                            </form>
                        </div>

                        <div className="admin-card" style={{ maxWidth: '600px' }}>
                            <h2 className="admin-card-title">Mavjud Kategoriyalar</h2>
                            <div className="admin-table-wrapper">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Kategoriya Nomi</th>
                                            <th>Amallar</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {categories.length === 0 ? (
                                            <tr>
                                                <td colSpan="3" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Kategoriyalar mavjud emas</td>
                                            </tr>
                                        ) : (
                                            categories.map(c => (
                                                <tr key={c.id}>
                                                    <td>#{c.id}</td>
                                                    <td><strong>{c.name}</strong></td>
                                                    <td>
                                                        <button 
                                                            className="btn-secondary" 
                                                            style={{ padding: '0.4rem 0.8rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                                            onClick={() => handleDeleteCategory(c.id)}
                                                        >
                                                            <Trash2 size={14} />
                                                            <span>O'chirish</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                )}

                {/* 4. ORDERS */}
                {activeTab === 'tab-orders' && (
                    <section>
                        <h1 style={{ marginBottom: '2rem', fontWeight: 700 }}>Buyurtmalar 📦</h1>

                        <div className="admin-card">
                            <div className="admin-table-wrapper">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Sana</th>
                                            <th>Xaridor</th>
                                            <th>Telefon</th>
                                            <th>Turi</th>
                                            <th>Summa</th>
                                            <th>Holati</th>
                                            <th>Amallar</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orders.length === 0 ? (
                                            <tr>
                                                <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Buyurtmalar mavjud emas</td>
                                            </tr>
                                        ) : (
                                            orders.map(o => {
                                                const date = new Date(o.created_at).toLocaleString("uz-UZ", {
                                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                });
                                                return (
                                                    <tr key={o.id}>
                                                        <td>#{o.id}</td>
                                                        <td>{date}</td>
                                                        <td><strong>{o.customer_name}</strong></td>
                                                        <td>{o.customer_phone}</td>
                                                        <td>{o.delivery_method === 'delivery' ? "🚚 Dostavka" : "🏢 Samovivoz"}</td>
                                                        <td><strong>{formatPrice(o.total_amount)} so'm</strong></td>
                                                        <td>
                                                            <span className={`status-badge ${getStatusClass(o.status)}`}>
                                                                {o.status}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                                <button 
                                                                    className="btn-secondary" 
                                                                    style={{ padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                                                    onClick={() => setSelectedOrder(o)}
                                                                >
                                                                    <Eye size={14} />
                                                                    <span>Batafsil</span>
                                                                </button>
                                                                <select 
                                                                    className="status-select"
                                                                    value={o.status}
                                                                    onChange={(e) => handleStatusChange(o.id, e.target.value)}
                                                                    style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,0,0,0.1)' }}
                                                                >
                                                                    <option value="Yangi">Yangi</option>
                                                                    <option value="Qabul qilindi">Qabul qilindi</option>
                                                                    <option value="Yetkazilmoqda">Yetkazilmoqda</option>
                                                                    <option value="Yakunlandi">Yakunlandi</option>
                                                                    <option value="Bekor qilindi">Bekor qilindi</option>
                                                                </select>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                )}

            </main>

            {/* Product creation Modal */}
            {isProductModalOpen && (
                <div className="modal open">
                    <div className="modal-content" style={{ maxWidth: '550px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">Yangi Mahsulot Qo'shish</h2>
                            <button className="close-drawer" onClick={() => setIsProductModalOpen(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleProductFormSubmit} style={{ padding: '2rem' }}>
                            <div className="form-group">
                                <label>Mahsulot nomi:</label>
                                <input 
                                    type="text" 
                                    required 
                                    placeholder="Masalan: Nafis gulli shifon ko'ylak"
                                    value={productForm.name}
                                    onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                                />
                            </div>
                            <div className="form-group">
                                <label>Tavsifi (Tafsilotlari):</label>
                                <textarea 
                                    placeholder="Kiyim haqida ma'lumot..."
                                    value={productForm.description}
                                    onChange={(e) => setProductForm(prev => ({ ...prev, description: e.target.value }))}
                                    style={{ padding: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,0,0,0.1)' }}
                                />
                            </div>
                            <div className="form-group">
                                <label>Kategoriya:</label>
                                <select 
                                    required
                                    value={productForm.categoryId}
                                    onChange={(e) => setProductForm(prev => ({ ...prev, categoryId: e.target.value }))}
                                >
                                    <option value="">Tanlang...</option>
                                    {categories.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Narxi (so'mda):</label>
                                    <input 
                                        type="number" 
                                        required 
                                        placeholder="85000"
                                        value={productForm.price}
                                        onChange={(e) => setProductForm(prev => ({ ...prev, price: e.target.value }))}
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Ombor qoldig'i:</label>
                                    <input 
                                        type="number" 
                                        required 
                                        value={productForm.stock}
                                        onChange={(e) => setProductForm(prev => ({ ...prev, stock: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>O'lchamlari (vergul bilan):</label>
                                <input 
                                    type="text" 
                                    placeholder="Masalan: M, L, XL yoki 0-3 oy, 3-6 oy"
                                    value={productForm.sizes}
                                    onChange={(e) => setProductForm(prev => ({ ...prev, sizes: e.target.value }))}
                                />
                            </div>
                            <div className="form-group">
                                <label>Mahsulot rasmi:</label>
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    required
                                    onChange={(e) => setProductForm(prev => ({ ...prev, file: e.target.files[0] }))}
                                    style={{ background: 'none', border: 'none', padding: '0' }}
                                />
                            </div>
                            <div className="form-actions">
                                <button type="button" className="btn-secondary" onClick={() => setIsProductModalOpen(false)}>Bekor qilish</button>
                                <button type="submit" className="btn-primary" disabled={productModalLoading}>
                                    {productModalLoading ? "Yuklanmoqda..." : "Saqlash ✨"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Order details modal */}
            {selectedOrder && (
                <div className="modal open">
                    <div className="modal-content" style={{ maxWidth: '650px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">Buyurtma #{selectedOrder.id} Tafsilotlari 📝</h2>
                            <button className="close-drawer" onClick={() => setSelectedOrder(null)}>&times;</button>
                        </div>
                        <div style={{ padding: '2rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                <div>
                                    <p><strong>Xaridor:</strong> {selectedOrder.customer_name}</p>
                                    <p><strong>Telefon:</strong> {selectedOrder.customer_phone}</p>
                                    <p><strong>Sana:</strong> {new Date(selectedOrder.created_at).toLocaleString("uz-UZ")}</p>
                                </div>
                                <div>
                                    <p><strong>Manzil:</strong> {selectedOrder.address}</p>
                                    <p><strong>Yetkazish turi:</strong> {selectedOrder.delivery_method === 'delivery' ? "Dostavka" : "Do'kondan olib ketish"}</p>
                                    <p><strong>Buyurtma statusi:</strong> <span className={`status-badge ${getStatusClass(selectedOrder.status)}`}>{selectedOrder.status}</span></p>
                                </div>
                            </div>

                            <h3 style={{ marginBottom: '0.8rem', fontWeight: 600 }}>Sotib olingan kiyimlar:</h3>
                            <div className="admin-table-wrapper" style={{ marginBottom: '1.5rem' }}>
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Mahsulot</th>
                                            <th>O'lcham</th>
                                            <th>Soni</th>
                                            <th>Narxi</th>
                                            <th>Jami</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedOrder.order_items.map(it => {
                                            const pname = it.products ? it.products.name : "O'chirilgan kiyim";
                                            return (
                                                <tr key={it.id}>
                                                    <td><strong>{pname}</strong></td>
                                                    <td>{it.size || '—'}</td>
                                                    <td>{it.quantity} dona</td>
                                                    <td>{formatPrice(it.price)} so'm</td>
                                                    <td><strong>{formatPrice(it.price * it.quantity)} so'm</strong></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.25rem', borderTop: '2px solid rgba(0,0,0,0.05)', paddingTop: '1rem' }}>
                                <span>Umumiy Jami:</span>
                                <span style={{ color: 'var(--accent-terracotta)' }}>{formatPrice(selectedOrder.total_amount)} so'm</span>
                            </div>

                            <div className="form-actions" style={{ marginTop: '2rem' }}>
                                <button className="btn-primary" onClick={() => setSelectedOrder(null)}>Yopish</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
