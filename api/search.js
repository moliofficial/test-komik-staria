const { search: scrapeSearch } = require('./_scraper.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { q, page } = req.query;
  if (!q) return res.status(400).json({ error: 'Query parameter "q" required' });
  try {
    const result = await scrapeSearch(q, parseInt(page) || 1);
    if (!result.status) return res.status(500).json({ error: result.message });
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
