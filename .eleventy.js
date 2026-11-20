module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy('css');
  eleventyConfig.addPassthroughCopy('js');
  eleventyConfig.addPassthroughCopy('images');
  eleventyConfig.addPassthroughCopy({ 'src/images': 'images' });
  eleventyConfig.addPassthroughCopy('public');
  eleventyConfig.addPassthroughCopy({ 'public/plants': 'plants' });
  eleventyConfig.addPassthroughCopy('admin');
  eleventyConfig.ignores.add('backend/**');
  eleventyConfig.ignores.add('node_modules/**');
  eleventyConfig.ignores.add('.gemini/**');
  eleventyConfig.ignores.add('_site/**');
  eleventyConfig.ignores.add('layouts/**');
  eleventyConfig.ignores.add('scripts/**');
  eleventyConfig.ignores.add('_xlsx-media/**');
  eleventyConfig.ignores.add('stitch_assets/**');
  eleventyConfig.ignores.add('.agents/**');
  eleventyConfig.ignores.add('.agent/**');
  eleventyConfig.ignores.add('.gsd/**');
  eleventyConfig.ignores.add('*.md');
  eleventyConfig.ignores.add('**/*.md');
  eleventyConfig.ignores.add('agent/**');
  eleventyConfig.ignores.add('data/**');
  eleventyConfig.ignores.add('.claude/**');
  const crypto = require('crypto');
  const fs = require('fs');

  eleventyConfig.addNunjucksFilter('assetHash', function(filePath) {
    try {
      var rawPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
      if (fs.existsSync(rawPath)) {
        var hash = crypto.createHash('md5').update(fs.readFileSync(rawPath)).digest('hex').substring(0, 8);
        return filePath + '?v=' + hash;
      }
    } catch (e) {}
    return filePath;
  });

  eleventyConfig.addNunjucksFilter('json', function(v) { return JSON.stringify(v); });

  eleventyConfig.addNunjucksFilter('related', function(products, category, slug) {
    return (products || []).filter(function(p) {
      return p.category === category && p.slug !== slug;
    }).slice(0, 4);
  });

  eleventyConfig.addNunjucksFilter('bestsellers', function(products, n) {
    return (products || []).slice().sort(function(a, b) {
      return b.reviews - a.reviews;
    }).slice(0, n || 8);
  });

  eleventyConfig.addNunjucksFilter('byCategory', function(products, category) {
    return (products || []).filter(function(p) {
      return p.category === category;
    });
  });

  return {
    dir: {
      input: '.',
      output: '_site',
      data: '_data',
      layouts: 'layouts',
      includes: 'partials'
    },
    templateFormats: ['html', 'json', 'njk'],
    htmlTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk'
  };
};
