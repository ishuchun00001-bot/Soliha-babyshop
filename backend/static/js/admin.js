// Auth Check
const token = localStorage.getItem("admin_token");
if (!token) {
    window.location.href = "/login";
}

// State
let stats = {};
let products = [];
let categories = [];
let orders = [];

// Elements
const sidebarLinks = document.querySelectorAll(".sidebar-link");
const tabContents = document.querySelectorAll(".tab-content");
const logoutBtn = document.getElementById("logoutBtn");

// Initialize
async function init() {
    await loadTab("tab-dashboard");
    setupNavigation();
    setupProductForm();
    setupCategoryForm();
    
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("admin_token");
        window.location.href = "/login";
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

// API Fetches and Renders
async function fetchStats() {
    try {
        const res = await fetch(`/api/stats?token=${token}`);
        if (!res.ok) throw new Error("Unauthorized");
        stats = await res.json();
        
        document.getElementById("statSales").innerText = `${formatPrice(stats.total_sales)} so'm`;
        document.getElementById("statOrders").innerText = stats.total_orders;
        document.getElementById("statPending").innerText = stats.pending_orders;
        document.getElementById("statProducts").innerText = stats.total_products;
    } catch (e) {
        handleAuthError(e);
    }
}

async function fetchProducts() {
    try {
        const res = await fetch(`/api/admin/products?token=${token}`);
        if (!res.ok) throw new Error("Unauthorized");
        products = await res.json();
        renderProducts();
    } catch (e) {
        handleAuthError(e);
    }
}

async function fetchCategories() {
    try {
        const res = await fetch("/api/categories");
        categories = await res.json();
        renderCategories();
        populateCategoryDropdown();
    } catch (e) {
        console.error(e);
    }
}

async function fetchOrders() {
    try {
        const res = await fetch(`/api/orders?token=${token}`);
        if (!res.ok) throw new Error("Unauthorized");
        orders = await res.json();
        renderOrders();
    } catch (e) {
        handleAuthError(e);
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
                const res = await fetch(`/api/products/${id}?token=${token}`, { method: "DELETE" });
                if (res.ok) {
                    await fetchProducts();
                } else {
                    alert("O'chirishda xatolik.");
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
    
    // Delete event
    document.querySelectorAll(".delete-cat-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-id");
            if (confirm("Kategoriyani o'chirsangiz uning ichidagi barcha mahsulotlar ham o'chib ketadi! Rozimisiz?")) {
                const res = await fetch(`/api/categories/${id}?token=${token}`, { method: "DELETE" });
                if (res.ok) {
                    await fetchCategories();
                } else {
                    const data = await res.json();
                    alert("Xatolik: " + (data.detail || "O'chirish imkoni bo'lmadi."));
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
            const res = await fetch(`/api/orders/${id}/status`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, status: newStatus })
            });
            if (res.ok) {
                await fetchOrders();
            } else {
                alert("Statusni o'zgartirishda xatolik.");
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
    
    order.items.forEach(it => {
        const tr = document.createElement("tr");
        const subtotal = it.price * it.quantity;
        tr.innerHTML = `
            <td><strong>${it.name}</strong></td>
            <td>${it.size || '—'}</td>
            <td>${it.quantity}</td>
            <td>${formatPrice(it.price)} so'm</td>
            <td><strong>${formatPrice(subtotal)} so'm</strong></td>
        `;
        tbody.appendChild(tr);
    });
    
    document.getElementById("detailTotal").innerText = `${formatPrice(order.total_amount)} so'm`;
    
    // Open modal
    document.getElementById("orderDetailModal").classList.add("open");
}

// Close order detail modal
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
    
    const openModal = () => modal.classList.add("open");
    const closeModal = () => {
        modal.classList.remove("open");
        form.reset();
    };
    
    openBtn.addEventListener("click", openModal);
    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    
    // AI Vision file input change listener
    const imageInput = document.getElementById("prodImage");
    const aiLoading = document.getElementById("aiLoading");
    const prodName = document.getElementById("prodName");
    const prodDesc = document.getElementById("prodDesc");
    const prodStock = document.getElementById("prodStock");
    const prodPrice = document.getElementById("prodPrice");

    imageInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Show AI Loading
        aiLoading.style.display = "flex";

        const formData = new FormData();
        formData.append("image", file);
        formData.append("token", token);

        try {
            const res = await fetch("/api/admin/analyze-image", {
                method: "POST",
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                if (data.name) prodName.value = data.name;
                if (data.description) prodDesc.value = data.description;
                if (data.stock !== undefined) prodStock.value = data.stock;
                
                // Focus on price input for quick pricing
                prodPrice.focus();
            } else {
                console.error("AI image analysis failed.");
            }
        } catch (err) {
            console.error("Error analyzing image:", err);
        } finally {
            aiLoading.style.display = "none";
        }
    });
    
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const formData = new FormData();
        formData.append("name", document.getElementById("prodName").value.trim());
        formData.append("description", document.getElementById("prodDesc").value.trim());
        formData.append("category_id", document.getElementById("prodCategory").value);
        formData.append("price", document.getElementById("prodPrice").value);
        formData.append("sizes", document.getElementById("prodSizes").value.trim());
        formData.append("stock", document.getElementById("prodStock").value);
        formData.append("token", token);
        
        const fileInput = document.getElementById("prodImage");
        if (fileInput.files[0]) {
            formData.append("image", fileInput.files[0]);
        }
        
        try {
            const res = await fetch("/api/products", {
                method: "POST",
                body: formData // Content-Type header MUST NOT be set manually for FormData uploads
            });
            
            if (res.ok) {
                closeModal();
                await fetchProducts();
            } else {
                const data = await res.json();
                alert("Xatolik: " + (data.detail || "Saqlab bo'lmadi."));
            }
        } catch (err) {
            console.error(err);
            alert("Rasm yuklash yoki mahsulot saqlashda tarmoq xatosi yuz berdi!");
        }
    });
}

function setupCategoryForm() {
    const form = document.getElementById("addCategoryForm");
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("newCatName").value.trim();
        
        try {
            const res = await fetch("/api/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, name })
            });
            
            if (res.ok) {
                document.getElementById("newCatName").value = "";
                await fetchCategories();
            } else {
                const data = await res.json();
                alert("Xatolik: " + (data.detail || "Saqlab bo'lmadi."));
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

function handleAuthError(err) {
    console.error(err);
    if (err.message === "Unauthorized") {
        localStorage.removeItem("admin_token");
        window.location.href = "/login";
    }
}

function formatPrice(p) {
    return Number(p).toLocaleString('uz-UZ').replace(/,/g, ' ');
}

// Start
document.addEventListener("DOMContentLoaded", init);
