const fs = require('fs');
const path = require('path');

const plantsPath = path.join(__dirname, '..', '_data', 'plants.json');
const plants = JSON.parse(fs.readFileSync(plantsPath, 'utf8')).products;

function esc(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

let sql = '\n-- ============================================================\n';
sql += '-- SEED PRODUCTS (All ' + plants.length + ' botanical items from plants.json)\n';
sql += '-- ============================================================\n';
sql += 'INSERT INTO products (slug, name, variant, category, size, pot_included, price, mrp, discount, rating, reviews, image, description, stock, is_active, is_sold_out)\nVALUES\n';

const rows = plants.map(p => {
  return '  (' + [
    esc(p.slug),
    esc(p.name),
    esc(p.variant || ''),
    esc(p.category || 'Plants'),
    esc(p.size || 'Standard'),
    p.pot_included !== false ? 'true' : 'false',
    p.price || 0,
    p.mrp || p.price || 0,
    p.discount || 0,
    p.rating || 4.5,
    p.reviews || 0,
    esc(p.image || ''),
    esc(p.description || ''),
    100,
    'true',
    'false'
  ].join(', ') + ')';
});

sql += rows.join(',\n') + '\nON CONFLICT (slug) DO NOTHING;\n';

const schemaPath = path.join(__dirname, '..', 'supabase-schema.sql');
let fullSchema = fs.readFileSync(schemaPath, 'utf8');

// Append seed products if not present
if (!fullSchema.includes('-- SEED PRODUCTS (All')) {
  fullSchema += '\n' + sql;
  fs.writeFileSync(schemaPath, fullSchema, 'utf8');
  console.log('Appended', plants.length, 'products to supabase-schema.sql');
}
