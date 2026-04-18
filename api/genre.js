const { genres: scrapeGenres, getByGenre } = require('./_scraper.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { slug, page } = req.query;
  try {
    // /api/genre          -> list semua genre
    // /api/genre?slug=xxx -> komik per genre
    const result = slug
      ? await getByGenre(slug, parseInt(page) || 1)
      : await scrapeGenres();
    if (!result.status) return res.status(500).json({ error: result.message });
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
