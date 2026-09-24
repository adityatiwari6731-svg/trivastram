-- ==============================================================================
-- KRAAL STREETWEAR x QIKINK x SUPABASE COMPLETE SCHEMA
-- ==============================================================================
-- Run this script in your Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. PRODUCTS TABLE (Synced directly from Qikink)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qikink_product_id TEXT UNIQUE,               -- Qikink product ID
    name TEXT NOT NULL,                          -- e.g. "Cyber Tokyo Oversized Tee"
    slug TEXT UNIQUE,
    category TEXT DEFAULT 'oversized-tees',
    category_label TEXT DEFAULT 'Oversized Tees',
    description TEXT,
    price NUMERIC NOT NULL DEFAULT 999,          -- Your selling price on KRAAL
    mrp NUMERIC NOT NULL DEFAULT 1999,            -- Display MRP (strikethrough)
    qikink_base_price NUMERIC,                   -- Base printing cost from Qikink
    images TEXT[] NOT NULL DEFAULT '{}',         -- Array of mockup image URLs
    sizes TEXT[] NOT NULL DEFAULT '{"S","M","L","XL","XXL"}',
    colors TEXT[] NOT NULL DEFAULT '{"Charcoal"}',
    gsm TEXT DEFAULT '240 GSM Heavyweight Cotton',
    fit TEXT DEFAULT 'Oversized Fit',
    badge TEXT DEFAULT 'NEW DROP',
    featured BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,              -- Whether to show on website
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 3. PRODUCT VARIANTS TABLE (Each size/color mapped to exact Qikink SKU)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    qikink_variant_id TEXT,
    qikink_sku TEXT NOT NULL,                    -- Exact SKU Qikink uses to pick blank & size
    size TEXT NOT NULL,                          -- S, M, L, XL, XXL
    color TEXT DEFAULT 'Charcoal',
    inventory_count INT DEFAULT 999,             -- Qikink POD stock
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 4. ORDERS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number TEXT UNIQUE NOT NULL,           -- e.g. KR-849201
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    shipping_address TEXT NOT NULL,
    landmark TEXT,
    city TEXT NOT NULL,
    pincode TEXT NOT NULL,
    delivery_speed TEXT DEFAULT 'standard',      -- 'standard' or 'priority'
    payment_method TEXT NOT NULL,                -- 'upi', 'card', 'netbanking', 'cod'
    payment_status TEXT DEFAULT 'pending',        -- 'pending', 'paid', 'cod_confirmed'
    subtotal NUMERIC NOT NULL,
    discount NUMERIC DEFAULT 0,
    shipping_fee NUMERIC NOT NULL DEFAULT 0,
    grand_total NUMERIC NOT NULL,
    status TEXT DEFAULT 'placed',                -- 'placed', 'pushed_to_qikink', 'in_production', 'shipped', 'delivered', 'cancelled'
    qikink_order_id TEXT,                        -- Returned by Qikink order API
    qikink_status TEXT,
    tracking_number TEXT,                        -- AWB number (Delhivery/Bluedart)
    courier_name TEXT,
    tracking_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 5. ORDER ITEMS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id TEXT,
    product_name TEXT NOT NULL,
    size TEXT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price NUMERIC NOT NULL,
    subtotal NUMERIC NOT NULL,
    qikink_sku TEXT,                             -- Qikink blank SKU passed to fulfillment
    design_front_url TEXT,                       -- High-res 300 DPI print graphic
    design_back_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active products" ON public.products;
DROP POLICY IF EXISTS "Public can view product variants" ON public.product_variants;
DROP POLICY IF EXISTS "Allow public insert products" ON public.products;
DROP POLICY IF EXISTS "Allow public update products" ON public.products;
DROP POLICY IF EXISTS "Allow public delete products" ON public.products;
DROP POLICY IF EXISTS "Allow public manage product variants" ON public.product_variants;
DROP POLICY IF EXISTS "Public can create orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public update orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public delete orders" ON public.orders;
DROP POLICY IF EXISTS "Public can create order items" ON public.order_items;
DROP POLICY IF EXISTS "Allow public update order items" ON public.order_items;
DROP POLICY IF EXISTS "Allow public delete order items" ON public.order_items;
DROP POLICY IF EXISTS "Public can view orders" ON public.orders;
DROP POLICY IF EXISTS "Public can view order items" ON public.order_items;

-- Products: Allow reading, adding, updating, and removing drops from Admin Panel
CREATE POLICY "Public can view active products" 
ON public.products FOR SELECT TO public 
USING (true);

CREATE POLICY "Allow public insert products" 
ON public.products FOR INSERT TO public 
WITH CHECK (true);

CREATE POLICY "Allow public update products" 
ON public.products FOR UPDATE TO public 
USING (true);

CREATE POLICY "Allow public delete products" 
ON public.products FOR DELETE TO public 
USING (true);

CREATE POLICY "Public can view product variants" 
ON public.product_variants FOR SELECT TO public 
USING (true);

CREATE POLICY "Allow public manage product variants" 
ON public.product_variants FOR ALL TO public 
USING (true);

-- Orders: Anyone can insert orders (checkout) & view/update for admin dispatch
CREATE POLICY "Public can create orders" 
ON public.orders FOR INSERT TO public 
WITH CHECK (true);

CREATE POLICY "Allow public update orders" 
ON public.orders FOR UPDATE TO public 
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete orders" 
ON public.orders FOR DELETE TO public 
USING (true);

CREATE POLICY "Public can create order items" 
ON public.order_items FOR INSERT TO public 
WITH CHECK (true);

CREATE POLICY "Allow public update order items" 
ON public.order_items FOR UPDATE TO public 
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete order items" 
ON public.order_items FOR DELETE TO public 
USING (true);

CREATE POLICY "Public can view orders" 
ON public.orders FOR SELECT TO public 
USING (true);

CREATE POLICY "Public can view order items" 
ON public.order_items FOR SELECT TO public 
USING (true);

-- ==============================================================================
-- 7. INDEXES FOR HIGH PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_qikink_id ON public.products(qikink_product_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
