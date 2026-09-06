UPDATE products SET image = 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=82' WHERE id = 1;
UPDATE products SET image = 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=900&q=82' WHERE id = 2;
UPDATE products SET image = 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=82' WHERE id = 3;
UPDATE products SET image = 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=82' WHERE id = 4;
UPDATE products SET image = 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=900&q=82' WHERE id = 5;

INSERT OR IGNORE INTO products (id, name, category, active, image) VALUES
  (6, 'Americano', 'coffee', 1, 'https://images.unsplash.com/photo-1551030173-122aabc4489c?auto=format&fit=crop&w=900&q=82'),
  (7, 'Flat White', 'coffee', 1, 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?auto=format&fit=crop&w=900&q=82'),
  (8, 'Latte', 'coffee', 1, 'https://images.unsplash.com/photo-1561882468-9110e03e0f78?auto=format&fit=crop&w=900&q=82'),
  (9, 'Mocha', 'coffee', 1, 'https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?auto=format&fit=crop&w=900&q=82'),
  (10, 'Cold Brew', 'cold', 1, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=82'),
  (11, 'Freddo Cappuccino', 'cold', 1, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=82');

INSERT OR IGNORE INTO product_options (product_id, option_type, option_value, price_delta) VALUES
  (6, 'size', 'single', 0), (6, 'size', 'double', 1), (6, 'size', 'quad', 2),
  (6, 'sugar', 'σκέτος', 0), (6, 'sugar', 'μέτριος', 0), (6, 'sugar', 'γλυκός', 0),
  (6, 'extra', 'γάλα', 0.5), (6, 'extra', 'σιρόπι', 0.7), (6, 'extra', 'πάγος', 0.3),

  (7, 'size', 'small', 0), (7, 'size', 'medium', 1), (7, 'size', 'large', 2),
  (7, 'sugar', 'σκέτος', 0), (7, 'sugar', 'μέτριος', 0), (7, 'sugar', 'γλυκός', 0),
  (7, 'extra', 'γάλα', 0.5), (7, 'extra', 'σιρόπι', 0.7), (7, 'extra', 'κακάο', 0.8),

  (8, 'size', 'small', 0), (8, 'size', 'medium', 1), (8, 'size', 'large', 2),
  (8, 'sugar', 'σκέτος', 0), (8, 'sugar', 'μέτριος', 0), (8, 'sugar', 'γλυκός', 0),
  (8, 'extra', 'γάλα', 0.5), (8, 'extra', 'σιρόπι', 0.7), (8, 'extra', 'πάγος', 0.3),

  (9, 'size', 'small', 0), (9, 'size', 'medium', 1), (9, 'size', 'large', 2),
  (9, 'sugar', 'σκέτος', 0), (9, 'sugar', 'μέτριος', 0), (9, 'sugar', 'γλυκός', 0),
  (9, 'extra', 'γάλα', 0.5), (9, 'extra', 'σιρόπι', 0.7), (9, 'extra', 'κακάο', 0.8),

  (10, 'size', 'small', 0), (10, 'size', 'medium', 1), (10, 'size', 'large', 2),
  (10, 'sugar', 'σκέτος', 0), (10, 'sugar', 'μέτριος', 0), (10, 'sugar', 'γλυκός', 0),
  (10, 'extra', 'γάλα', 0.5), (10, 'extra', 'σιρόπι', 0.7), (10, 'extra', 'πάγος', 0.3),

  (11, 'size', 'single', 0), (11, 'size', 'double', 1), (11, 'size', 'quad', 2),
  (11, 'sugar', 'σκέτος', 0), (11, 'sugar', 'μέτριος', 0), (11, 'sugar', 'γλυκός', 0),
  (11, 'extra', 'γάλα', 0.5), (11, 'extra', 'σιρόπι', 0.7), (11, 'extra', 'πάγος', 0.3);
