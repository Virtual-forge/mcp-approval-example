const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /api/products - list all products, newest first
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM products ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/:id - single product detail
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [
      req.params.id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST /api/products - create a product
router.post('/', async (req, res) => {
  const { sku, name, category, price, stock, status, description, image_seed } =
    req.body;
  if (!sku || !name || !category || price === undefined) {
    return res
      .status(400)
      .json({ error: 'sku, name, category and price are required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO products (sku, name, category, price, stock, status, description, image_seed)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'active'), $7, $8)
       RETURNING *`,
      [sku, name, category, price, stock || 0, status, description, image_seed]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A product with that SKU already exists' });
    }
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// PUT /api/products/:id - update a product
router.put('/:id', async (req, res) => {
  const { name, category, price, stock, status, description, image_seed } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE products SET
         name = COALESCE($1, name),
         category = COALESCE($2, category),
         price = COALESCE($3, price),
         stock = COALESCE($4, stock),
         status = COALESCE($5, status),
         description = COALESCE($6, description),
         image_seed = COALESCE($7, image_seed)
       WHERE id = $8
       RETURNING *`,
      [name, category, price, stock, status, description, image_seed, req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [
      req.params.id,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;
