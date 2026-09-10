import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
	root: resolve(__dirname, "src/renderer"),
	plugins: [react()],
	build: {
		outDir: resolve(__dirname, "dist/renderer"),
		emptyOutDir: true,
		target: "chrome120",
	},
	server: {
		port: 5173,
		strictPort: true,
	},
	resolve: {
		alias: {
			"@shared": resolve(__dirname, "src/shared"),
			"@jesus/tui": resolve(__dirname, "../../tui/dist/index.js"),
		},
	},
});
