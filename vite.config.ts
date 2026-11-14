import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Only VITE_-prefixed env vars are exposed to client code (Vite default).
// Never map a server-style secret (e.g. OPENROUTER_TOKEN) into
// import.meta.env: everything in the client bundle is public.
export default defineConfig({
  plugins: [react()],
})
