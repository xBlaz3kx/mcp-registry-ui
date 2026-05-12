import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  base: '/mcp-registry/',
  define: {
    __REGISTRY_URL__: JSON.stringify(process.env.REGISTRY_URL ?? ''),
  },
  resolve: {
    alias: { '~': '/src' },
  },
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
  ],
});
