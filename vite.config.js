import { defineConfig } from 'vite';

export default defineConfig({
    base: '/agente_web/',
    server: {
        proxy: {
            '/platform-font': {
                target: 'https://library.service24gps.com',
                changeOrigin: true,
                secure: false,
            },
            '/css': {
                target: 'https://library.service24gps.com',
                changeOrigin: true,
                secure: false,
            },
            '/milvus': {
                target: 'http://localhost:19530',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/milvus/, '')
            }
        }
    }
});