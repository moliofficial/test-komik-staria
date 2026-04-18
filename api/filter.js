const { getFilter } = require('./_scraper.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { genre = '', status = '', type = '', order = '', page = 1 } = req.query;
  try {
    const result = await getFilter({ genre, status, type, order, page: parseInt(page) });
    if (!result.status) return res.status(500).json({ error: result.message });
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
