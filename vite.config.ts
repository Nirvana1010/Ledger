import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' 让它在 https://<user>.github.io/<repo>/ 子路径下也能正常加载
export default defineConfig({
  plugins: [react()],
  base: './',
});
