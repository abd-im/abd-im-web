import { rmSync } from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-electron-plugin";
import { customStart, loadViteEnv } from "vite-electron-plugin/plugin";
import pkg from "./package.json";
import legacy from "@vitejs/plugin-legacy";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// import visualizer from "rollup-plugin-visualizer";

const isWeb = process.env.BUILD_TARGET === "web";

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const baseDomain = env.VITE_BASE_DOMAIN || "your-server-domain";
  const chatTarget = `https://${baseDomain}`;

  if (!isWeb) {
    rmSync("dist-electron", { recursive: true, force: true });
  }

  const sourcemap = command === "serve" || !!process.env.VSCODE_DEBUG;

  return {
    resolve: {
      alias: {
        "@": path.join(__dirname, "src"),
        ...(isWeb
          ? { "electron-log/renderer": path.join(__dirname, "src/utils/mockLogger.ts") }
          : {}),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          silenceDeprecations: ["legacy-js-api"],
        },
      },
    },
    plugins: [
      react(),
      !isWeb &&
        electron({
          include: ["electron"],
          transformOptions: {
            sourcemap,
          },
          plugins: [
            ...(!!process.env.VSCODE_DEBUG
              ? [
                  // Will start Electron via VSCode Debug
                  customStart(() =>
                    console.log(
                      /* For `.vscode/.debug.script.mjs` */ "[startup] Electron App",
                    ),
                  ),
                ]
              : []),
            // Allow use `import.meta.env.VITE_SOME_KEY` in Electron-Main
            loadViteEnv(),
          ],
        }),
      // legacy({
      //   targets: ["defaults", "not IE 11"],
      // }),
      // visualizer({ open: true }),
    ].filter(Boolean),
    server: {
      ...(!!process.env.VSCODE_DEBUG
        ? (() => {
            const url = new URL(pkg.debug.env.VITE_DEV_SERVER_URL);
            return {
              host: url.hostname,
              port: +url.port,
            };
          })()
        : {
            host: true,
          }),
      proxy: {
        "/chat-api": {
          target: chatTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/chat-api/, "/chat"),
        },
      },
    },
    clearScreen: false,
    build: {
      sourcemap: false,
      cssCodeSplit: true,
      chunkSizeWarningLimit: 500,
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
      rollupOptions: {
        output: {},
      },
    },
  };
});
