import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue2";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: "dist/lib",
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "src/lib/index.ts"),
      name: "BeeDataViewPanel",
      formats: ["es", "umd"],
      fileName: (format) => `bee-dataview-panel.${format}.js`
    },
    rollupOptions: {
      external: ["vue"],
      output: {
        exports: "named",
        globals: {
          vue: "Vue"
        }
      }
    }
  }
});
