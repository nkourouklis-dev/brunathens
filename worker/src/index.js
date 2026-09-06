const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeOptions(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

async function getProducts(env) {
  const products = await env.DB.prepare(
    'SELECT id, name, category, active FROM products WHERE active = 1 ORDER BY id',
  ).all();

  const productIds = products.results.map((product) => product.id);
  let options = { results: [] };

  if (productIds.length > 0) {
    const placeholders = productIds.map(() => '?').join(',');
    const stmt = env.DB.prepare(
      `SELECT id, product_id, option_type, option_value, price_delta
       FROM product_options
       WHERE product_id IN (${placeholders})
       ORDER BY product_id, id`,
    );
    options = await stmt.bind(...productIds).all();
  }

  return products.results.map((product) => ({
    ...product,
    options: options.results.filter((option) => option.product_id === product.id),
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const path = url.pathname.replace(/^\/+|\/+$/g, '');
    const segments = path.split('/');

    if (segments[0] === 'api' && segments[1] === 'products') {
      if (request.method === 'GET') {
        const products = await getProducts(env);
        return jsonResponse({ products });
      }
    }

    if (segments[0] === 'api' && segments[1] === 'customers') {
      if (request.method === 'POST') {
        const payload = await readJson(request);
        const name = String(payload.name || '').trim();
        const deviceId = String(payload.deviceId || '').trim();

        if (!name || !deviceId) {
          return jsonResponse({ error: 'Name and device id are required' }, 400);
        }

        let customer = await env.DB.prepare('SELECT * FROM customers WHERE device_id = ? LIMIT 1').bind(deviceId).first();
        if (!customer) {
          const result = await env.DB.prepare(
            'INSERT INTO customers (name, device_id) VALUES (?, ?)',
          ).bind(name, deviceId).run();
          customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(result.meta.last_row_id).first();
        } else {
          await env.DB.prepare('UPDATE customers SET name = ? WHERE id = ?').bind(name, customer.id).run();
          customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(customer.id).first();
        }

        return jsonResponse({ customer });
      }
    }

    if (segments[0] === 'api' && segments[1] === 'favorites') {
      if (request.method === 'GET') {
        const customerId = Number(url.searchParams.get('customerId'));
        if (!customerId) {
          return jsonResponse({ favorites: [] });
        }

        const favorites = await env.DB.prepare(
          `SELECT f.id, f.customer_id, f.product_id, f.label, f.selected_options, p.name AS product_name
           FROM favorites f
           JOIN products p ON p.id = f.product_id
           WHERE f.customer_id = ?
           ORDER BY f.created_at DESC`,
        ).bind(customerId).all();

        return jsonResponse({
          favorites: favorites.results.map((favorite) => ({
            ...favorite,
            selected_options: normalizeOptions(favorite.selected_options),
          })),
        });
      }

      if (request.method === 'POST') {
        const payload = await readJson(request);
        const customerId = Number(payload.customerId);
        const productId = Number(payload.productId);
        const label = String(payload.label || '').trim();

        if (!customerId || !productId || !label) {
          return jsonResponse({ error: 'Missing customer, product or label' }, 400);
        }

        await env.DB.prepare(
          'INSERT INTO favorites (customer_id, product_id, label, selected_options) VALUES (?, ?, ?, ?)',
        ).bind(customerId, productId, label, JSON.stringify(payload.selectedOptions || {})).run();

        return jsonResponse({ success: true });
      }
    }

    if (segments[0] === 'api' && segments[1] === 'orders') {
      if (request.method === 'GET') {
        const customerId = Number(url.searchParams.get('customerId'));
        if (customerId) {
          const result = await env.DB.prepare(
            `SELECT o.*, p.name AS product_name, c.name AS customer_name
             FROM orders o
             JOIN products p ON p.id = o.product_id
             JOIN customers c ON c.id = o.customer_id
             WHERE o.customer_id = ?
             ORDER BY o.created_at DESC`,
          ).bind(customerId).all();

          return jsonResponse({
            orders: result.results.map((order) => ({
              ...order,
              selected_options: normalizeOptions(order.selected_options),
            })),
          });
        }

        const result = await env.DB.prepare(
          `SELECT o.*, p.name AS product_name, c.name AS customer_name
           FROM orders o
           JOIN products p ON p.id = o.product_id
           JOIN customers c ON c.id = o.customer_id
           ORDER BY o.created_at DESC`,
        ).all();

        return jsonResponse({
          orders: result.results.map((order) => ({
            ...order,
            selected_options: normalizeOptions(order.selected_options),
          })),
        });
      }

      if (request.method === 'POST') {
        const payload = await readJson(request);
        const customerId = Number(payload.customerId);
        const productId = Number(payload.productId);

        if (!customerId || !productId) {
          return jsonResponse({ error: 'Missing customer or product' }, 400);
        }

        const result = await env.DB.prepare(
          'INSERT INTO orders (customer_id, product_id, selected_options, status) VALUES (?, ?, ?, ?)',
        ).bind(customerId, productId, JSON.stringify(payload.selectedOptions || {}), 'sent').run();

        const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(result.meta.last_row_id).first();
        return jsonResponse({ order });
      }
    }

    if (segments[0] === 'api' && segments[1] === 'orders' && segments[2]) {
      const orderId = Number(segments[2]);
      if (request.method === 'PATCH' && segments[3] === 'status') {
        const payload = await readJson(request);
        const status = String(payload.status || '').trim();

        if (!orderId || !status) {
          return jsonResponse({ error: 'Invalid order id or status' }, 400);
        }

        await env.DB.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(status, orderId).run();
        const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
        return jsonResponse({ order });
      }
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};
