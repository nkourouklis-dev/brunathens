import { jsonResponse } from '../_lib/shared.js';

async function getProducts(env) {
  const products = await env.DB.prepare(
    'SELECT id, name, category, active, image FROM products WHERE active = 1 ORDER BY id',
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

export async function onRequestGet(context) {
  const products = await getProducts(context.env);
  return jsonResponse({ products }, 200);
}
