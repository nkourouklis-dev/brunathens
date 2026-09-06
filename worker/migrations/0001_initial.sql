DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS product_options;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS customers;

CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  device_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  image TEXT
);

CREATE TABLE product_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  option_type TEXT NOT NULL,
  option_value TEXT NOT NULL,
  price_delta REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  selected_options TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  selected_options TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

INSERT INTO products (id, name, category, active, image) VALUES
  (1, 'Espresso', 'coffee', 1, null),
  (2, 'Freddo Espresso', 'coffee', 1, null),
  (3, 'Cappuccino', 'coffee', 1, null),
  (4, 'Iced Latte', 'cold', 1, null),
  (5, 'Tea', 'tea', 1, null);

INSERT INTO product_options (product_id, option_type, option_value, price_delta) VALUES
  (1, 'size', 'single', 0),
  (1, 'size', 'double', 1),
  (1, 'size', 'quad', 2),
  (1, 'sugar', 'σκέτος', 0),
  (1, 'sugar', 'μέτριος', 0),
  (1, 'sugar', 'γλυκός', 0),
  (1, 'extra', 'γάλα', 0.5),
  (1, 'extra', 'σιρόπι', 0.7),
  (1, 'extra', 'πάγος', 0.3),

  (2, 'size', 'single', 0),
  (2, 'size', 'double', 1),
  (2, 'size', 'quad', 2),
  (2, 'sugar', 'σκέτος', 0),
  (2, 'sugar', 'μέτριος', 0),
  (2, 'sugar', 'γλυκός', 0),
  (2, 'extra', 'γάλα', 0.5),
  (2, 'extra', 'σιρόπι', 0.7),
  (2, 'extra', 'πάγος', 0.3),

  (3, 'size', 'small', 0),
  (3, 'size', 'medium', 1),
  (3, 'size', 'large', 2),
  (3, 'sugar', 'σκέτος', 0),
  (3, 'sugar', 'μέτριος', 0),
  (3, 'sugar', 'γλυκός', 0),
  (3, 'extra', 'γάλα', 0.5),
  (3, 'extra', 'κακάο', 0.8),
  (3, 'extra', 'πάγος', 0.3),

  (4, 'size', 'small', 0),
  (4, 'size', 'medium', 1),
  (4, 'size', 'large', 2),
  (4, 'sugar', 'σκέτος', 0),
  (4, 'sugar', 'μέτριος', 0),
  (4, 'sugar', 'γλυκός', 0),
  (4, 'extra', 'γάλα', 0.5),
  (4, 'extra', 'σιρόπι', 0.7),
  (4, 'extra', 'πάγος', 0.3),

  (5, 'size', 'small', 0),
  (5, 'size', 'medium', 1),
  (5, 'size', 'large', 2),
  (5, 'sugar', 'σκέτος', 0),
  (5, 'sugar', 'μέτριος', 0),
  (5, 'sugar', 'γλυκός', 0),
  (5, 'extra', 'λεμόνι', 0.5),
  (5, 'extra', 'μέλι', 0.8),
  (5, 'extra', 'πάγος', 0.3);
