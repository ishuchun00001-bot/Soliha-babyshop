# Soliha Store - Supabase, Vercel & Telegram Bot

Ushbu loyiha **Soliha** ayollar va bolalar kiyimlari do'koni uchun to'liq yangilangan bulutli (serverless) arxitekturadagi tizimdir:
1. **Frontend (Internet do'kon)**: Vercel hostingida joylashgan chiroyli single page sayt. U Supabase bazasi bilan to'g'ridan-to'g'ri bog'lanadi (Vercel-ga bepul joylanadi).
2. **Database & Storage**: **Supabase** platformasida PostgreSQL ma'lumotlar ombori hamda rasmlarni saqlash uchun Storage Bucket.
3. **Telegram Bot**: Mahsulotlarni ko'rish va xarid qilish. Eng asosiysi, adminlar do'konga yangi mahsulot qo'shishi uchun **botga rasm va captionda narxini yozib yuborishlari kifoya**. AI (GPT Vision) rasmni tahlil qilib, nom va tavsif yozadi hamda mahsulotni saytga joylaydi.

---

## ⚡ 1-Bosqich: Supabase Sozlash (Ma'lumotlar Bazasi va Storage)

1. [Supabase.com](https://supabase.com) ga kiring, ro'yxatdan o'ting va yangi bepul loyiha yarating.
2. Boshqaruv panelidagi **SQL Editor** bo'limini oching, **New Query** bosing va quyidagi SQL kodini joylab, **Run** tugmasini bosing:

```sql
-- 1. Kategoriyalar jadvali
create table categories (
  id serial primary key,
  name text unique not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Mahsulotlar jadvali
create table products (
  id serial primary key,
  category_id integer references categories(id) on delete cascade not null,
  name text not null,
  description text,
  price numeric not null,
  sizes text,
  image_url text,
  stock integer default 10 not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Buyurtmalar jadvali
create table orders (
  id serial primary key,
  customer_name text not null,
  customer_phone text not null,
  address text not null,
  delivery_method text default 'delivery' not null,
  total_amount numeric not null,
  status text default 'Yangi' not null,
  telegram_id bigint,
  customer_notified boolean default false not null, -- Mijozni bot orqali ogohlantirish uchun flag
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Buyurtma tarkibi jadvali
create table order_items (
  id serial primary key,
  order_id integer references orders(id) on delete cascade not null,
  product_id integer references products(id) on delete set null,
  size text,
  quantity integer default 1 not null,
  price numeric not null
);

-- 5. Adminlar jadvali
create table admin_users (
  id serial primary key,
  username text unique not null,
  telegram_id bigint,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
```

3. Supabase-da **Storage** (Fayllar saqlagichi) bo'limiga o'ting:
   * Yangi bucket yarating va unga **`products`** deb nom bering.
   * Bucket sozlamalaridan **"Public bucket"** (Ochiq cheklovsiz) tugmasini yoqing (bu rasmlar saytda ko'rinishi uchun shart).

---

## ⚙️ 2-Bosqich: Sozlamalarni kiritish

1. Supabase-da **Project Settings** -> **API** bo'limiga o'ting va `Project URL` hamda API kalitlarini oling.
2. [backend/.env](file:///d:/Soliha_baby_shop/backend/.env) faylini ochib, quyidagi o'zgaruvchilarni to'ldiring:
   ```env
   SUPABASE_URL=sizning_supabase_project_url (masalan: https://xyz.supabase.co)
   SUPABASE_KEY=sizning_service_role_key (bu maxfiy kalit, botga rasm yuklash uchun kerak)
   SUPABASE_ANON_KEY=sizning_anon_public_key (bu ochiq kalit, sayt uchun kerak)
   SUPABASE_BUCKET=products
   ```
3. [frontend/js/config.js](file:///d:/Soliha_baby_shop/frontend/js/config.js) faylini ochib, sayt ulanishi uchun o'sha ma'lumotlarni yozing:
   ```javascript
   const SUPABASE_URL = "https://xyz.supabase.co";
   const SUPABASE_ANON_KEY = "anon_key_bu_yerga";
   ```

---

## 🚀 3-Bosqich: Vercel-ga Frontendni Joylash

Mini-saytni Vercel-ga bepul va 1 daqiqada joylashtirishingiz mumkin:
1. [Vercel.com](https://vercel.com) saytiga kiring va ro'yxatdan o'ting.
2. Vercel CLI ni kompyuterga o'rnatib, loyiha ichidagi `frontend` papkasini deploy qiling yoki loyihangizni **GitHub** ga yuklab, Vercel-ga import qiling.
3. Loyihani import qilayotganda Root Directory sifatida **`frontend`** papkasini ko'rsating.
4. **Deploy** bosing. Vercel sizga tayyor HTTPS havola beradi (masalan: `https://soliha-store.vercel.app`).
5. Ushbu havolani nusxalab, `backend/.env` faylidagi `WEBAPP_URL` qismiga yozib qo'ying (Telegram Mini App ishlashi uchun).

---

## 🤖 4-Bosqich: Telegram Botdan foydalanish va rasm yuborish

Botni ishga tushirish uchun kompyuteringizda `start.bat` ni bosing.

### Bot orqali tezkor mahsulot yuklash:
1. Botga kiring (siz admin bo'lishingiz kerak).
2. Do'konga yuklamoqchi bo'lgan kiyimingiz rasmini botga yuboring.
3. **Rasm tagiga (caption)** kiyim narxini yozing (masalan: `125000` yoki `125 000 so'm`).
   * *Eslatma*: Agar rasm yuborganda narxini yozishni unutsangiz, bot sizdan narxini yozib yuborishni so'raydi.
4. Bot sizga mavjud toifalarni (kategoriyalarni) inline tugmalar orqali chiqaradi, toifani tanlang.
5. Kiyim o'lchamlarini yozing (masalan: `M, L, XL`) yoki o'tkazib yuborish uchun `/skip` buyrug'ini bosing.
6. **Tayyor!** Bot:
   * Rasmni Supabase Storage-ga yuklaydi.
   * AI yordamida rasm tahlil qilinib, kiyimga mos nom (masalan: *Nafis yozgi ayollar ko'ylagi*) va batafsil tavsif o'zbek tilida generatsiya qilinadi.
   * Ma'lumotlar bazada saqlanadi, Vercel saytida bir zumda paydo bo'ladi va Telegram kanalingizga ham avtomatik reklama qilib yuboriladi!
