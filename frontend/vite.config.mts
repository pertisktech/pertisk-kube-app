 import { defineConfig } from "vite";
 import react from "@vitejs/plugin-react-swc";
 import path from "path";

 export default defineConfig({
   plugins: [react()],
   resolve: {
     alias: {
       "@": path.resolve(__dirname, "./src"),
     },
   },
   server: {
     port: 3000,
     proxy: {
       "/api": {
         target: process.env.VITE_BACKEND_URL || "http://localhost:8091",
         changeOrigin: true,
       },
     },
   },
   build: {
     outDir: "dist",
   },
 });

