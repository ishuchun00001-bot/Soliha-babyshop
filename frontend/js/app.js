// State Management
let products = [];
let categories = [];
let selectedCategory = "all";
let cart = JSON.parse(localStorage.getItem("soliha_cart")) || {};
let searchQuery = "";
let supabaseClient = null;

// Elements
const productsGrid = document.getElementById("productsGrid");
const categoriesContainer = document.getElementById("categoriesContainer");
const searchInput = document.getElementById("searchInput");
const cartBadge = document.getElementById("cartBadge");
const cartTrigger = document.getElementById("cartTrigger");
const cartDrawer = document.getElementById("cartDrawer");
const closeCart = document.getElementById("closeCart");
const drawerOverlay = document.getElementById("drawerOverlay");
const cartItemsContainer = document.getElementById("cartItemsContainer");
const cartTotal = document.getElementById("cartTotal");
const checkoutBtn = document.getElementById("checkoutBtn");
const checkoutModal = document.getElementById("checkoutModal");
const closeCheckout = document.getElementById("closeCheckout");
const cancelCheckout = document.getElementById("cancelCheckout");
const checkoutForm = document.getElementById("checkoutForm");
const successModal = document.getElementById("successModal");
const successClose = document.getElementById("successClose");

// Initialize
async function init() {
    // Check if Supabase SDK is loaded
    if (typeof supabase === 'undefined') {
        productsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--primary-pink); padding: 3rem; font-weight:600;">
            Supabase kutubxonasi yuklanmadi. Iltimos, config.js sozlamalarini va internet aloqasini tekshiring.
        </div>`;
        return;
    }
    
    // Initialize Supabase Client
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (err) {
        console.error("Supabase init error:", err);
        return;
    }
    
    await fetchCategories();
    await fetchProducts();
    renderCart();
    setupEventListeners();
}

// Fetch APIs directly from Supabase
async function fetchCategories() {
    try {
        const { data, error } = await supabaseClient
            .from("categories")
            .select("*")
            .order("name");
            
        if (error) throw error;
        categories = data || [];
        renderCategories();
    } catch (e) {
        console.error("Categories fetch error:", e);
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
        productsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-light); padding: 3rem;">
            Mahsulotlarni yuklashda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.
        </div>`;
    }
}

// Renderers
function renderCategories() {
    categoriesContainer.innerHTML = `<button class="category-tab ${selectedCategory === "all" ? "active" : ""}" data-id="all">Hammasi ✨</button>`;
    
    categories.forEach(cat => {
        const tab = document.createElement("button");
        tab.className = `category-tab ${selectedCategory == cat.id ? "active" : ""}`;
        tab.setAttribute("data-id", cat.id);
        tab.innerText = cat.name;
        categoriesContainer.appendChild(tab);
    });
}

function renderProducts() {
    let filtered = products;
    
    // Filter by Category
    if (selectedCategory !== "all") {
        filtered = filtered.filter(p => p.category_id == selectedCategory);
    }
    
    // Filter by Search
    if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(p => 
            p.name.toLowerCase().includes(query) || 
            (p.description && p.description.toLowerCase().includes(query))
        );
    }
    
    if (filtered.length === 0) {
        productsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-light); padding: 3rem;">
            Mahsulot topilmadi 🧸
        </div>`;
        return;
    }
    
    productsGrid.innerHTML = "";
    filtered.forEach(prod => {
        const sizeBadge = prod.sizes ? `<span class="product-sizes-badge">📏 ${prod.sizes.split(",")[0].trim()}+</span>` : "";
        const imageElement = prod.image_url 
            ? `<img src="${prod.image_url}" alt="${prod.name}" class="product-image" onerror="this.src='https://placehold.co/300x250?text=Soliha+Store'">`
            : `<div class="product-placeholder">🍼</div>`;
            
        const card = document.createElement("div");
        card.className = "product-card";
        card.innerHTML = `
            <div class="product-image-wrapper">
                ${imageElement}
            </div>
            <div class="product-info">
                <h3 class="product-name">${prod.name}</h3>
                <p class="product-desc">${prod.description || 'Nafis va chiroyli kiyimlar'}</p>
                <div class="product-meta">
                    <span class="product-price">${formatPrice(prod.price)} so'm</span>
                    ${sizeBadge}
                </div>
                <button class="add-to-cart-btn" data-id="${prod.id}">
                    🛒 Savatga qo'shish
                </button>
            </div>
        `;
        productsGrid.appendChild(card);
    });
}

function renderCart() {
    const keys = Object.keys(cart);
    const count = keys.reduce((sum, key) => sum + cart[key].quantity, 0);
    cartBadge.innerText = count;
    cartBadge.style.display = count > 0 ? "flex" : "none";
    
    if (keys.length === 0) {
        cartItemsContainer.innerHTML = `<div style="text-align: center; color: var(--text-light); padding: 3rem 0;">
            Savatchangiz bo'sh 🍼
        </div>`;
        cartTotal.innerText = "0 so'm";
        checkoutBtn.style.opacity = "0.6";
        checkoutBtn.style.pointerEvents = "none";
        return;
    }
    
    checkoutBtn.style.opacity = "1";
    checkoutBtn.style.pointerEvents = "all";
    cartItemsContainer.innerHTML = "";
    let total = 0;
    
    keys.forEach(key => {
        const item = cart[key];
        const subtotal = item.price * item.quantity;
        total += subtotal;
        
        const itemDiv = document.createElement("div");
        itemDiv.className = "cart-item";
        
        const imgTag = item.image_url 
            ? `<img src="${item.image_url}" alt="${item.name}" class="cart-item-image" onerror="this.src='https://placehold.co/70x70?text=Soliha'">`
            : `<div class="cart-item-image" style="display:flex;align-items:center;justify-content:center;background:#FFF0F2;font-size:1.8rem;">🍼</div>`;
            
        itemDiv.innerHTML = `
            ${imgTag}
            <div class="cart-item-info">
                <h4 class="cart-item-name">${item.name}</h4>
                <p class="cart-item-size">${item.size ? 'O\'lcham: ' + item.size : ''}</p>
                <div class="cart-item-price">${formatPrice(item.price)} so'm</div>
            </div>
            <div class="cart-item-controls">
                <div class="qty-controls">
                    <button class="qty-btn dec-qty" data-id="${key}">-</button>
                    <span class="qty-val">${item.quantity}</span>
                    <button class="qty-btn inc-qty" data-id="${key}">+</button>
                </div>
                <button class="remove-item" data-id="${key}">O'chirish</button>
            </div>
        `;
        cartItemsContainer.appendChild(itemDiv);
    });
    
    cartTotal.innerText = `${formatPrice(total)} so'm`;
}

// Cart actions
function addToCart(productId) {
    const prod = products.find(p => p.id == productId);
    if (!prod) return;
    
    let selectedSize = null;
    if (prod.sizes) {
        const sizeList = prod.sizes.split(",").map(s => s.trim());
        if (sizeList.length > 1) {
            const sizePrompt = prompt(`Iltimos, o'lchamni tanlang:\n${sizeList.join("\n")}`, sizeList[0]);
            if (sizePrompt === null) return;
            selectedSize = sizeList.includes(sizePrompt.trim()) ? sizePrompt.trim() : sizeList[0];
        } else {
            selectedSize = sizeList[0];
        }
    }
    
    const cartKey = selectedSize ? `${productId}_${selectedSize}` : `${productId}`;
    
    if (cart[cartKey]) {
        cart[cartKey].quantity += 1;
    } else {
        cart[cartKey] = {
            id: prod.id,
            name: prod.name,
            price: prod.price,
            size: selectedSize,
            quantity: 1,
            image_url: prod.image_url
        };
    }
    
    saveCart();
    renderCart();
    openCartDrawer();
}

function updateQty(cartKey, change) {
    if (!cart[cartKey]) return;
    
    cart[cartKey].quantity += change;
    if (cart[cartKey].quantity <= 0) {
        delete cart[cartKey];
    }
    saveCart();
    renderCart();
}

function removeFromCart(cartKey) {
    delete cart[cartKey];
    saveCart();
    renderCart();
}

function saveCart() {
    localStorage.setItem("soliha_cart", JSON.stringify(cart));
}

// Helpers
function formatPrice(p) {
    return Number(p).toLocaleString('uz-UZ').replace(/,/g, ' ');
}

function openCartDrawer() {
    cartDrawer.classList.add("open");
    drawerOverlay.classList.add("open");
}

function closeCartDrawer() {
    cartDrawer.classList.remove("open");
    drawerOverlay.classList.remove("open");
}

// Event Listeners
function setupEventListeners() {
    categoriesContainer.addEventListener("click", (e) => {
        if (e.target.classList.contains("category-tab")) {
            document.querySelectorAll(".category-tab").forEach(tab => tab.classList.remove("active"));
            e.target.classList.add("active");
            selectedCategory = e.target.getAttribute("data-id");
            renderProducts();
        }
    });
    
    searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        renderProducts();
    });
    
    productsGrid.addEventListener("click", (e) => {
        if (e.target.classList.contains("add-to-cart-btn")) {
            const pid = e.target.getAttribute("data-id");
            addToCart(pid);
        }
    });
    
    cartTrigger.addEventListener("click", openCartDrawer);
    closeCart.addEventListener("click", closeCartDrawer);
    drawerOverlay.addEventListener("click", closeCartDrawer);
    
    cartItemsContainer.addEventListener("click", (e) => {
        const key = e.target.getAttribute("data-id");
        if (!key) return;
        
        if (e.target.classList.contains("inc-qty")) {
            updateQty(key, 1);
        } else if (e.target.classList.contains("dec-qty")) {
            updateQty(key, -1);
        } else if (e.target.classList.contains("remove-item")) {
            removeFromCart(key);
        }
    });
    
    checkoutBtn.addEventListener("click", () => {
        closeCartDrawer();
        checkoutModal.classList.add("open");
    });
    
    const hideCheckout = () => checkoutModal.classList.remove("open");
    closeCheckout.addEventListener("click", hideCheckout);
    cancelCheckout.addEventListener("click", hideCheckout);
    
    checkoutForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const customer_name = document.getElementById("custName").value.trim();
        const customer_phone = document.getElementById("custPhone").value.trim();
        const address = document.getElementById("custAddress").value.trim();
        const delivery_method = document.getElementById("deliveryMethod").value;
        
        const cartKeys = Object.keys(cart);
        const items = cartKeys.map(key => ({
            product_id: cart[key].id,
            size: cart[key].size,
            quantity: cart[key].quantity,
            price: cart[key].price
        }));
        
        const total = cartKeys.reduce((sum, key) => sum + (cart[key].price * cart[key].quantity), 0);
        
        try {
            // 1. Insert Order
            const { data: orderData, error: orderErr } = await supabaseClient
                .from("orders")
                .insert([{
                    customer_name,
                    customer_phone,
                    address,
                    delivery_method,
                    total_amount: total,
                    status: "Yangi"
                }])
                .select();
                
            if (orderErr) throw orderErr;
            
            const orderId = orderData[0].id;
            
            // 2. Insert Order Items
            const itemsToInsert = items.map(it => ({
                order_id: orderId,
                product_id: it.product_id,
                size: it.size,
                quantity: it.quantity,
                price: it.price
            }));
            
            const { error: itemsErr } = await supabaseClient
                .from("order_items")
                .insert(itemsToInsert);
                
            if (itemsErr) throw itemsErr;
            
            // 3. Decrement Product Stock
            for (let it of items) {
                const prod = products.find(p => p.id == it.product_id);
                if (prod) {
                    const newStock = Math.max(0, prod.stock - it.quantity);
                    await supabaseClient
                        .from("products")
                        .update({ stock: newStock })
                        .eq("id", it.product_id);
                }
            }
            
            // Clear Cart
            cart = {};
            saveCart();
            renderCart();
            
            hideCheckout();
            successModal.classList.add("open");
            
        } catch (err) {
            console.error("Checkout transaction failed:", err);
            alert("Buyurtmani rasmiylashtirishda xatolik yuz berdi! Iltimos, qaytadan urinib ko'ring.");
        }
    });
    
    successClose.addEventListener("click", () => {
        successModal.classList.remove("open");
    });
}

// Start
document.addEventListener("DOMContentLoaded", init);
