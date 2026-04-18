const { chapter: scrapeChapter } = require('./_scraper.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Query parameter "url" required' });
  try {
    const result = await scrapeChapter(url);
    if (!result.status) return res.status(500).json({ error: result.message });
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
