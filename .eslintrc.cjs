module.exports = {
  extends: ['plugin:astro/recommended'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  overrides: [{ files: ['*.astro'], parser: 'astro-eslint-parser' }],
};
