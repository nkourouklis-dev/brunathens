-- Multiple products per order, and "your order is ready" notifications for customers.

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  selected_options TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- Existing single-product orders become one item each (quantity from selected_options).
INSERT INTO order_items (order_id, product_id, selected_options, quantity)
SELECT
  o.id,
  o.product_id,
  o.selected_options,
  CASE
    WHEN json_valid(o.selected_options) THEN
      CASE
        WHEN CAST(json_extract(o.selected_options, '$.quantity') AS INTEGER) BETWEEN 1 AND 20
          THEN CAST(json_extract(o.selected_options, '$.quantity') AS INTEGER)
        ELSE 1
      END
    ELSE 1
  END
FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id);

CREATE TABLE IF NOT EXISTS customer_push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  keys_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_customer_push_subscriptions_customer_id ON customer_push_subscriptions(customer_id);
