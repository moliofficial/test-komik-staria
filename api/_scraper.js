const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://komikmama.online';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    'Referer': BASE_URL,
    'Connection': 'keep-alive'
};

function extractSlug(url) {
    if (!url) return null;
    try {
        const parts = url.replace(/\/$/, '').split('/');
        return parts[parts.length - 1];
    } catch (e) { return null; }
}

function getImg(el, $) {
    const src = $(el).attr('data-src') ||
                $(el).attr('data-lazy-src') ||
                $(el).attr('data-bg') ||
                $(el).attr('src');
    if (!src && $(el).attr('style')) {
        const m = $(el).attr('style').match(/url\(["']?(.*?)["']?\)/);
        if (m) return m[1];
    }
    return src;
}

async function home() {
    try {
        const { data } = await axios.get(BASE_URL, { headers: HEADERS });
        const $ = cheerio.load(data);

        const slider = [];
        $('.big-slider .swiper-slide:not(.swiper-slide-duplicate)').each((i, el) => {
            const title = $(el).find('.name').text().trim();
            const url = $(el).find('a').attr('href');
            const desc = $(el).find('.desc').text().trim();
            const chapter = $(el).find('.slidlc').text().trim().replace(/Chapter:\s*/, '');
            const thumb = getImg($(el).find('.slidtrithumb img'), $);
            const background = getImg($(el).find('.bigbanner'), $);
            const genres = [];
            $(el).find('.metas-genres-values a').each((j, gen) => genres.push($(gen).text().trim()));
            if (url) slider.push({ title, url, slug: extractSlug(url), desc, chapter, thumb, background, genres });
        });

        const popularToday = [];
        $('.popularslider .bs').each((i, el) => {
            const title = $(el).find('.tt').text().trim();
            const url = $(el).find('a').attr('href');
            const thumb = getImg($(el).find('img'), $);
            const chapter = $(el).find('.epxs').text().trim();
            const rating = $(el).find('.numscore').text().trim();
            if (url) popularToday.push({ title, url, slug: extractSlug(url), thumb, chapter, rating });
        });

        const latest = [];
        $('.listupd .utao').each((i, el) => {
            const title = $(el).find('.uta .luf a.series h4').text().trim() || $(el).find('.uta .luf h4 a').text().trim();
            const url = $(el).find('.uta .luf a.series').attr('href');
            const thumb = getImg($(el).find('.uta .imgu img'), $);
            const lastChapterName = $(el).find('.uta .luf ul li:first-child a').text().trim();
            const lastChapterUrl = $(el).find('.uta .luf ul li:first-child a').attr('href');
            if (url) latest.push({ title, url, slug: extractSlug(url), thumb, lastChapter: { name: lastChapterName, url: lastChapterUrl, slug: extractSlug(lastChapterUrl) } });
        });

        const popularSerial = { weekly: [], monthly: [], alltime: [] };
        const types = ['weekly', 'monthly', 'alltime'];
        $('#wpop-items .serieslist').each((i, el) => {
            if (i >= types.length) return;
            const type = types[i];
            $(el).find('li').each((j, li) => {
                const title = $(li).find('.leftseries h2 a, .leftseries h4 a').text().trim();
                const url = $(li).find('.leftseries h2 a, .leftseries h4 a').attr('href');
                const thumb = getImg($(li).find('.imgseries img'), $);
                const rating = $(li).find('.rt .numscore').text().trim();
                const genres = $(li).find('.leftseries span a').map((k, gen) => $(gen).text().trim()).get();
                if (url) popularSerial[type].push({ title, url, slug: extractSlug(url), thumb, rating, genres });
            });
        });

        return { status: true, data: { slider, popularToday, popularSerial, latest } };
    } catch (error) {
        return { status: false, message: error.message };
    }
}

async function search(query, page = 1) {
    try {
        const url = page > 1
            ? `${BASE_URL}/page/${page}/?s=${encodeURIComponent(query)}`
            : `${BASE_URL}/?s=${encodeURIComponent(query)}`;
        const { data } = await axios.get(url, { headers: HEADERS });
        const $ = cheerio.load(data);
        const results = [];

        $('.listupd .bs').each((i, el) => {
            const title = $(el).find('.tt').text().trim();
            const url = $(el).find('a').attr('href');
            const thumb = getImg($(el).find('img'), $);
            const lastChapter = $(el).find('.epxs').text().trim();
            const rating = $(el).find('.numscore').text().trim();
            if (url) results.push({ title, url, slug: extractSlug(url), thumb, lastChapter, rating });
        });

        const pagination = [];
        $('.pagination .page-numbers').each((i, el) => {
            const pageNum = $(el).text().trim();
            const pageUrl = $(el).attr('href');
            const isCurrent = $(el).hasClass('current');
            if (pageNum && pageNum !== '…') pagination.push({ page: pageNum, url: pageUrl || null, isCurrent });
        });

        return { status: true, data: results, pagination };
    } catch (error) {
        return { status: false, message: error.message };
    }
}

async function detail(url) {
    try {
        const { data } = await axios.get(url, { headers: HEADERS });
        const $ = cheerio.load(data);

        const title = $('h1.entry-title').text().trim();
        const thumb = getImg($('.thumb img'), $);
        const banner = getImg($('.bigbanner'), $);
        const rating = $('.rating .num').text().trim();
        const followedBy = $('.bmc').text().trim();
        const synopsis = $('.entry-content p').text().trim();
        const genres = $('.seriestugenre a').map((i, el) => $(el).text().trim()).get();

        const info = {};
        $('.infotable tr').each((i, el) => {
            const key = $(el).find('td:first-child').text().trim().replace(':', '');
            const val = $(el).find('td:last-child').text().trim();
            if (key) info[key.toLowerCase().replace(/\s+/g, '_')] = val;
        });

        const chapters = [];
        $('ul.clstyle li').each((i, el) => {
            const chUrl = $(el).find('a').attr('href');
            const name = $(el).find('span.chapternum').text().trim();
            const date = $(el).find('span.chapterdate').text().trim();
            if (chUrl) chapters.push({ name, url: chUrl, slug: extractSlug(chUrl), date });
        });

        return { status: true, data: { title, url, slug: extractSlug(url), thumb, banner, rating, followedBy, synopsis, genres, info, chapters } };
    } catch (error) {
        return { status: false, message: error.message };
    }
}

async function chapter(url) {
    try {
        const { data } = await axios.get(url, { headers: HEADERS });
        const $ = cheerio.load(data);

        let imageData = null;
        $('script').each((i, script) => {
            const content = $(script).html();
            if (content && content.includes('ts_reader.run(')) {
                const match = content.match(/ts_reader\.run\((.*?)\);/s);
                if (match && match[1]) {
                    try { imageData = JSON.parse(match[1]); } catch (e) {}
                }
            }
        });

        if (!imageData?.sources?.[0]?.images) {
            return { status: false, message: 'No images found in chapter' };
        }

        return {
            status: true,
            data: {
                title: $('h1.entry-title').text().trim(),
                url,
                slug: extractSlug(url),
                images: imageData.sources[0].images,
                prev: imageData.prevUrl || null,
                prevSlug: extractSlug(imageData.prevUrl),
                next: imageData.nextUrl || null,
                nextSlug: extractSlug(imageData.nextUrl)
            }
        };
    } catch (error) {
        return { status: false, message: error.message };
    }
}

async function genres() {
    try {
        const { data } = await axios.get(`${BASE_URL}/genre/`, { headers: HEADERS });
        const $ = cheerio.load(data);
        const results = [];
        $('ul.taxindex li').each((i, el) => {
            const name = $(el).find('span').text().trim();
            const url = $(el).find('a').attr('href');
            const count = $(el).find('i').text().trim();
            if (name) results.push({ name, url, slug: extractSlug(url), count });
        });
        return { status: true, data: results };
    } catch (error) {
        return { status: false, message: error.message };
    }
}

async function getByGenre(slug, page = 1) {
    try {
        const url = page > 1
            ? `${BASE_URL}/genres/${slug}/page/${page}/`
            : `${BASE_URL}/genres/${slug}/`;
        const { data } = await axios.get(url, { headers: HEADERS });
        const $ = cheerio.load(data);
        const results = [];

        $('.listupd .bs').each((i, el) => {
            const title = $(el).find('.tt').text().trim();
            const url = $(el).find('a').attr('href');
            const thumb = getImg($(el).find('img'), $);
            const lastChapter = $(el).find('.epxs').text().trim();
            const rating = $(el).find('.numscore').text().trim();
            if (url) results.push({ title, url, slug: extractSlug(url), thumb, lastChapter, rating });
        });

        const pagination = [];
        $('.pagination .page-numbers').each((i, el) => {
            const pageNum = $(el).text().trim();
            const pageUrl = $(el).attr('href');
            const isCurrent = $(el).hasClass('current');
            if (pageNum && pageNum !== '…') pagination.push({ page: pageNum, url: pageUrl || null, isCurrent });
        });

        return { status: true, data: results, pagination };
    } catch (error) {
        return { status: false, message: error.message };
    }
}

async function getFilter({ genre = '', status = '', type = '', order = '', page = 1 }) {
    try {
        const url = `${BASE_URL}/komik/?genre%5B%5D=${genre}&status=${status}&type=${type}&order=${order}${page > 1 ? '&page=' + page : ''}`;
        const { data } = await axios.get(url, { headers: HEADERS });
        const $ = cheerio.load(data);
        const results = [];

        $('.listupd .bs').each((i, el) => {
            const title = $(el).find('.tt').text().trim();
            const url = $(el).find('a').attr('href');
            const thumb = getImg($(el).find('img'), $);
            const lastChapter = $(el).find('.epxs').text().trim();
            const rating = $(el).find('.numscore').text().trim();
            if (url) results.push({ title, url, slug: extractSlug(url), thumb, lastChapter, rating });
        });

        const pagination = [];
        $('.pagination .page-numbers').each((i, el) => {
            const pageNum = $(el).text().trim();
            const pageUrl = $(el).attr('href');
            const isCurrent = $(el).hasClass('current');
            if (pageNum && pageNum !== '…') pagination.push({ page: pageNum, url: pageUrl || null, isCurrent });
        });

        return { status: true, data: results, pagination };
    } catch (error) {
        return { status: false, message: error.message };
    }
}

module.exports = { home, search, detail, chapter, genres, getByGenre, getFilter };
