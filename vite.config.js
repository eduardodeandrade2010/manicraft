/**
* @type {import('vite').UserConfig}
*/
export default {
  base: '/',
  build: {
    sourcemap: true
  },
  // The optional AI biome backend (server.mjs) is proxied here so the browser
  // never holds an API key. Without the backend, the in-browser keyword
  // interpreter handles prompts (favela, cyberpunk, frozen, desert, ...).
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8788', changeOrigin: true }
    }
  }
}
