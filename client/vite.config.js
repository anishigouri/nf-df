import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Em dev, o Vite roda numa porta separada do Express -- o proxy abaixo faz
// as chamadas /api do front chegarem no backend (:3001) sem precisar de CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
