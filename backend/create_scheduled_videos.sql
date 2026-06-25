-- scheduled_videos jadvalini yaratish
CREATE TABLE IF NOT EXISTS public.scheduled_videos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    video_url text NOT NULL, -- Telegram file_id
    instagram_video_url text, -- Supabase public URL
    caption text,
    hashtags text,
    scheduled_at timestamp with time zone NOT NULL,
    is_posted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- Jadvalga yozish/o'qish huquqlarini yoqish (agar RLS faol bo'lsa yoki RLS ni o'chirib qo'yish)
ALTER TABLE public.scheduled_videos ENABLE ROW LEVEL SECURITY;

-- Service role va Anon key uchun barcha huquqlarni berish (yoki soddalashtirish uchun vaqtincha RLS siyosatlarini yaratish)
CREATE POLICY "Allow all operations for authenticated and anon users" 
ON public.scheduled_videos 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);
