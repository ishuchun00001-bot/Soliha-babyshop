// Auth Check
const isLoggedIn = localStorage.getItem("admin_logged_in") === "true";
if (!isLoggedIn) {
    window.location.href = "/login.html";
}

// State
let stats = {};
let products = [];
let categories = [];
let orders = [];
let supabaseClient = null;

// Elements
const sidebarLinks = document.querySelectorAll(".sidebar-link");
const tabContents = document.querySelectorAll(".tab-content");
const logoutBtn = document.getElementById("logoutBtn");

// Initialize
async function init() {
    // Initialize Supabase Client
    if (typeof supabase === 'undefined') {
        alert("Supabase kutubxonasi yuklanmadi. Iltimos config.js sozlamalarini tekshiring.");
        return;
    }
    
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (err) {
        console.error("Supabase Client Init Error:", err);
        return;
    }
    
    await loadTab("tab-dashboard");
    setupNavigation();
    setupProductForm();
    setupCategoryForm();
    
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("admin_logged_in");
        localStorage.removeItem("admin_token");
        window.location.href = "/login.html";
    });
}

// Navigation / Tabs
function setupNavigation() {
    sidebarLinks.forEach(link => {
        link.addEventListener("click", async (e) => {
            e.preventDefault();
            const tabId = link.getAttribute("data-tab");
            
            sidebarLinks.forEach(l => l.classList.remove("active"));
            link.classList.add("active");
            
            tabContents.forEach(tab => tab.classList.add("hidden-tab"));
            document.getElementById(tabId).classList.remove("hidden-tab");
            
            await loadTab(tabId);
        });
    });
}

async function loadTab(tabId) {
    if (tabId === "tab-dashboard") {
        await fetchStats();
    } else if (tabId === "tab-products") {
        await fetchCategories();
        await fetchProducts();
    } else if (tabId === "tab-categories") {
        await fetchCategories();
    } else if (tabId === "tab-orders") {
        await fetchOrders();
    }
}

// Fetch APIs directly from Supabase
async function fetchStats() {
    try {
        // Fetch products count
        const { count: prodCount, error: pErr } = await supabaseClient
            .from("products")
            .select("*", { count: "exact", head: true })
            .eq("is_active", true);
            
        // Fetch categories count
        const { count: catCount, error: cErr } = await supabaseClient
            .from("categories")
            .select("*", { count: "exact", head: true });
            
        // Fetch all orders to compute stats
        const { data: ordersList, error: oErr } = await supabaseClient
            .from("orders")
            .select("*");
            
        if (pErr || cErr || oErr) throw (pErr || cErr || oErr);
        
        let totalSales = 0;
        let totalOrders = ordersList ? ordersList.length : 0;
        let pendingOrders = 0;
        
        if (ordersList) {
            ordersList.forEach(o => {
                if (o.status !== "Bekor qilindi") {
                    totalSales += parseFloat(o.total_amount);
                }
                if (o.status === "Yangi") {
                    pendingOrders++;
                }
            });
        }
        
        document.getElementById("statSales").innerText = `${formatPrice(totalSales)} so'm`;
        document.getElementById("statOrders").innerText = totalOrders;
        document.getElementById("statPending").innerText = pendingOrders;
        document.getElementById("statProducts").innerText = prodCount || 0;
    } catch (e) {
        console.error("Stats loading error:", e);
    }
}

async function fetchProducts() {
    try {
        const { data, error } = await supabaseClient
            .from("products")
            .select("*")
            .eq("is_active", true)
            .order("created_at", { ascending: false });
            
        if (error) throw error;
        products = data || [];
        renderProducts();
    } catch (e) {
        console.error("Products fetch error:", e);
    }
}

async function fetchCategories() {
    try {
        const { data, error } = await supabaseClient
            .from("categories")
            .select("*")
            .order("name");
            
        if (error) throw error;
        categories = data || [];
        renderCategories();
        populateCategoryDropdown();
    } catch (e) {
        console.error("Categories fetch error:", e);
    }
}

async function fetchOrders() {
    try {
        // Fetch orders and join with order items and products
        const { data, error } = await supabaseClient
            .from("orders")
            .select("*, order_items(*, products(*))")
            .order("created_at", { ascending: false });
            
        if (error) throw error;
        orders = data || [];
        renderOrders();
    } catch (e) {
        console.error("Orders fetch error:", e);
    }
}

// Render UI Components
function renderProducts() {
    const tbody = document.getElementById("productsTableBody");
    tbody.innerHTML = "";
    
    if (products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-light);">Mahsulotlar yo'q</td></tr>`;
        return;
    }
    
    products.forEach(p => {
        const cat = categories.find(c => c.id == p.category_id);
        const catName = cat ? cat.name : "Noma'lum";
        const imgTag = p.image_url 
            ? `<img src="${p.image_url}" style="width:50px;height:50px;object-fit:cover;border-radius:var(--radius-sm);">` 
            : `<div style="width:50px;height:50px;display:flex;align-items:center;justify-content:center;background:#FFF0F2;border-radius:var(--radius-sm);font-size:1.5rem;">🍼</div>`;
            
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${imgTag}</td>
            <td><strong>${p.name}</strong></td>
            <td>${catName}</td>
            <td>${formatPrice(p.price)} so'm</td>
            <td>${p.sizes || '—'}</td>
            <td>${p.stock} dona</td>
            <td>
                <button class="btn-secondary delete-prod-btn" data-id="${p.id}" style="padding:0.4rem 0.8rem;color:var(--primary-pink);font-size:0.9rem;">O'chirish</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Add delete events
    document.querySelectorAll(".delete-prod-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-id");
            if (confirm("Haqiqatan ham ushbu mahsulotni o'chirmoqchisiz?")) {
                const { error } = await supabaseClient
                    .from("products")
                    .update({ is_active: false })
                    .eq("id", id);
                    
                if (!error) {
                    await fetchProducts();
                } else {
                    alert("O'chirishda xatolik: " + (typeof error === 'object' ? (error.message || JSON.stringify(error)) : error));
                }
            }
        });
    });
}

function renderCategories() {
    const tbody = document.getElementById("categoriesTableBody");
    tbody.innerHTML = "";
    
    if (categories.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-light);">Kategoriyalar yo'q</td></tr>`;
        return;
    }
    
    categories.forEach(c => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${c.id}</td>
            <td><strong>${c.name}</strong></td>
            <td>
                <button class="btn-secondary delete-cat-btn" data-id="${c.id}" style="padding:0.4rem 0.8rem;color:var(--primary-pink);font-size:0.9rem;">O'chirish</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    document.querySelectorAll(".delete-cat-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-id");
            if (confirm("Kategoriyani o'chirsangiz uning ichidagi barcha mahsulotlar ham o'chib ketadi! Rozimisiz?")) {
                const { error } = await supabaseClient
                    .from("categories")
                    .delete()
                    .eq("id", id);
                    
                if (!error) {
                    await fetchCategories();
                } else {
                    alert("Xatolik: " + (typeof error === 'object' ? (error.message || JSON.stringify(error)) : error));
                }
            }
        });
    });
}

function populateCategoryDropdown() {
    const select = document.getElementById("prodCategory");
    select.innerHTML = '<option value="">Kategoriyani tanlang...</option>';
    categories.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.innerText = c.name;
        select.appendChild(opt);
    });
}

function renderOrders() {
    const tbody = document.getElementById("ordersTableBody");
    tbody.innerHTML = "";
    
    if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-light);">Buyurtmalar yo'q</td></tr>`;
        return;
    }
    
    orders.forEach(o => {
        const dateStr = new Date(o.created_at).toLocaleString("uz-UZ", {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        });
        
        const statusClass = getStatusClass(o.status);
        const tr = document.createElement("tr");
        
        tr.innerHTML = `
            <td>#${o.id}</td>
            <td>${dateStr}</td>
            <td><strong>${o.customer_name}</strong></td>
            <td>${o.customer_phone}</td>
            <td>${o.delivery_method === "delivery" ? "🚚 Etkazish" : "🏢 Olib ketish"}</td>
            <td><strong>${formatPrice(o.total_amount)} so'm</strong></td>
            <td><span class="status-badge ${statusClass}">${o.status}</span></td>
            <td>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <button class="btn-secondary view-order-btn" data-id="${o.id}" style="padding:0.4rem 0.8rem;font-size:0.9rem;">Batafsil</button>
                    <select class="order-status-select" data-id="${o.id}" style="padding:0.4rem;border-radius:var(--radius-sm);font-size:0.9rem;">
                        <option value="Yangi" ${o.status === "Yangi" ? "selected" : ""}>Yangi</option>
                        <option value="Qabul qilindi" ${o.status === "Qabul qilindi" ? "selected" : ""}>Qabul qilindi</option>
                        <option value="Yetkazilmoqda" ${o.status === "Yetkazilmoqda" ? "selected" : ""}>Yetkazilmoqda</option>
                        <option value="Yakunlandi" ${o.status === "Yakunlandi" ? "selected" : ""}>Yakunlandi</option>
                        <option value="Bekor qilindi" ${o.status === "Bekor qilindi" ? "selected" : ""}>Bekor qilindi</option>
                    </select>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // View detail event
    document.querySelectorAll(".view-order-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            showOrderDetail(id);
        });
    });
    
    // Status change event
    document.querySelectorAll(".order-status-select").forEach(select => {
        select.addEventListener("change", async (e) => {
            const id = select.getAttribute("data-id");
            const newStatus = e.target.value;
            
            // Update status and set customer_notified=false for the Telegram bot to notify them!
            const { error } = await supabaseClient
                .from("orders")
                .update({ 
                    status: newStatus,
                    customer_notified: false 
                })
                .eq("id", id);
                
            if (!error) {
                await fetchOrders();
            } else {
                alert("Statusni o'zgartirishda xatolik: " + (typeof error === 'object' ? (error.message || JSON.stringify(error)) : error));
            }
        });
    });
}

function showOrderDetail(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (!order) return;
    
    document.getElementById("detailCustName").innerText = order.customer_name;
    document.getElementById("detailCustPhone").innerText = order.customer_phone;
    document.getElementById("detailCustAddress").innerText = order.address;
    document.getElementById("detailDeliveryMethod").innerText = order.delivery_method === "delivery" ? "Yetkazib berish (Dostavka)" : "O'zim olib ketish (Samovivoz)";
    document.getElementById("detailDate").innerText = new Date(order.created_at).toLocaleString("uz-UZ");
    
    const tbody = document.getElementById("detailItemsBody");
    tbody.innerHTML = "";
    
    order.order_items.forEach(it => {
        const tr = document.createElement("tr");
        const subtotal = it.price * it.quantity;
        const pname = it.products ? it.products.name : "O'chirilgan mahsulot";
        tr.innerHTML = `
            <td><strong>${pname}</strong></td>
            <td>${it.size || '—'}</td>
            <td>${it.quantity}</td>
            <td>${formatPrice(it.price)} so'm</td>
            <td><strong>${formatPrice(subtotal)} so'm</strong></td>
        `;
        tbody.appendChild(tr);
    });
    
    document.getElementById("detailTotal").innerText = `${formatPrice(order.total_amount)} so'm`;
    document.getElementById("orderDetailModal").classList.add("open");
}

document.getElementById("closeOrderDetail").addEventListener("click", closeOrderDetailModal);
document.getElementById("closeOrderDetailBtn").addEventListener("click", closeOrderDetailModal);
function closeOrderDetailModal() {
    document.getElementById("orderDetailModal").classList.remove("open");
}

// Form Handlers
function setupProductForm() {
    const modal = document.getElementById("productModal");
    const openBtn = document.getElementById("openProductModalBtn");
    const closeBtn = document.getElementById("closeProductModal");
    const cancelBtn = document.getElementById("cancelProductBtn");
    const form = document.getElementById("productForm");
    const saveBtn = document.getElementById("saveProductBtn");
    
    const openModal = () => modal.classList.add("open");
    const closeModal = () => {
        modal.classList.remove("open");
        form.reset();
        saveBtn.innerText = "Saqlash ✨";
        saveBtn.disabled = false;
    };
    
    openBtn.addEventListener("click", openModal);
    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        saveBtn.innerText = "Yuklanmoqda...";
        saveBtn.disabled = true;
        
        const name = document.getElementById("prodName").value.trim();
        const description = document.getElementById("prodDesc").value.trim();
        const categoryId = document.getElementById("prodCategory").value;
        const price = document.getElementById("prodPrice").value;
        const sizes = document.getElementById("prodSizes").value.trim();
        const stock = document.getElementById("prodStock").value;
        const fileInput = document.getElementById("prodImage");
        const file = fileInput.files[0];
        
        if (!file) {
            alert("Rasm yuklash majburiy!");
            saveBtn.innerText = "Saqlash ✨";
            saveBtn.disabled = false;
            return;
        }
        
        try {
            // 1. Upload file to Supabase Storage
            const cleanName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
            const { data: uploadData, error: uploadErr } = await supabaseClient.storage
                .from(SUPABASE_BUCKET || "products")
                .upload(cleanName, file);
                
            if (uploadErr) throw uploadErr;
            
            // 2. Get Public URL
            const { data: urlData } = supabaseClient.storage
                .from(SUPABASE_BUCKET || "products")
                .getPublicUrl(cleanName);
                
            const imageUrl = urlData.publicUrl;
            
            // 3. Create Product in DB
            const { error: insertErr } = await supabaseClient
                .from("products")
                .insert([{
                    name,
                    description,
                    price: parseFloat(price),
                    category_id: parseInt(categoryId),
                    sizes: sizes || null,
                    image_url: imageUrl,
                    stock: parseInt(stock),
                    is_active: true
                }]);
                
            if (insertErr) throw insertErr;
            
            closeModal();
            await fetchProducts();
        } catch (err) {
            console.error(err);
            alert("Mahsulot qo'shishda xatolik: " + err.message);
            saveBtn.innerText = "Saqlash ✨";
            saveBtn.disabled = false;
        }
    });
}

function setupCategoryForm() {
    const form = document.getElementById("addCategoryForm");
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("newCatName").value.trim();
        
        try {
            const { error } = await supabaseClient
                .from("categories")
                .insert([{ name }]);
                
            if (!error) {
                document.getElementById("newCatName").value = "";
                await fetchCategories();
            } else {
                alert("Xatolik: " + (typeof error === 'object' ? (error.message || JSON.stringify(error)) : error));
            }
        } catch (err) {
            console.error(err);
        }
    });
}

// Status Helpers
function getStatusClass(status) {
    switch (status) {
        case "Yangi": return "status-yangi";
        case "Qabul qilindi": return "status-qabul";
        case "Yetkazilmoqda": return "status-yetkazilmoqda";
        case "Yakunlandi": return "status-yakunlandi";
        case "Bekor qilindi": return "status-bekor";
        default: return "";
    }
}

function formatPrice(p) {
    return Number(p).toLocaleString('uz-UZ').replace(/,/g, ' ');
}

// Start
document.addEventListener("DOMContentLoaded", init);
