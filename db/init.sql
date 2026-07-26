-- Run this once against your Postgres database to create and seed the demo schema.
-- Both the Node API and the Agno agent (via the Postgres MCP server) read/write this table.

CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    sku         VARCHAR(32) UNIQUE NOT NULL,
    name        VARCHAR(200) NOT NULL,
    category    VARCHAR(100) NOT NULL,
    price       NUMERIC(10, 2) NOT NULL,
    stock       INTEGER NOT NULL DEFAULT 0,
    status      VARCHAR(20) NOT NULL DEFAULT 'active', -- active | low_stock | discontinued
    description TEXT,
    image_seed  VARCHAR(100), -- used to generate a deterministic placeholder image
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO products (sku, name, category, price, stock, status, description, image_seed) VALUES
('WM-1001', 'Aria Wireless Mouse',        'Peripherals',  29.99,  142, 'active',       'Ergonomic wireless mouse with silent clicks and a 6-month battery life.', 'aria-mouse'),
('KB-1002', 'Nimbus Mechanical Keyboard', 'Peripherals',  89.00,  54,  'active',       'Hot-swappable mechanical keyboard with warm-white per-key backlighting.', 'nimbus-kb'),
('MN-1003', 'Halo 27" 4K Monitor',        'Displays',     349.50, 12,  'low_stock',    '27-inch 4K IPS monitor with a 144Hz overclock mode.', 'halo-monitor'),
('SP-1004', 'Drift Bluetooth Speaker',    'Audio',        59.99,  201, 'active',       'Compact speaker with 14-hour playback and IPX6 water resistance.', 'drift-speaker'),
('HD-1005', 'Cirrus Noise-Cancelling Headphones', 'Audio', 199.00, 8,  'low_stock',    'Over-ear headphones with adaptive noise cancellation.', 'cirrus-hp'),
('LP-1006', 'Vantage 14" Ultrabook',      'Computers',    1249.00, 3,  'low_stock',    'Lightweight ultrabook with a 14-inch OLED display and 18-hour battery.', 'vantage-laptop'),
('CH-1007', 'Motion Ergonomic Chair',     'Furniture',    329.00,  0,  'discontinued', 'Mesh-back office chair with adjustable lumbar support.', 'motion-chair'),
('DK-1008', 'Rise Standing Desk',         'Furniture',    459.00,  27,  'active',      'Electric standing desk with programmable height presets.', 'rise-desk'),
('WC-1009', 'Pulse Fitness Tracker',      'Wearables',    79.99,  310, 'active',       'Water-resistant fitness tracker with heart-rate and sleep monitoring.', 'pulse-tracker'),
('CM-1010', 'Focal 1080p Webcam',         'Peripherals',  49.99,  95,  'active',       'Autofocus webcam with a built-in privacy shutter.', 'focal-webcam'),
('PB-1011', 'Voyage 20000mAh Power Bank', 'Accessories',  39.99,  4,   'low_stock',    'Fast-charging power bank with USB-C PD and dual USB-A ports.', 'voyage-power'),
('TB-1012', 'Slate 11" Tablet',           'Computers',    399.00, 0,   'discontinued', '11-inch tablet with stylus support, replaced by the Slate 2.', 'slate-tablet')
ON CONFLICT (sku) DO NOTHING;
