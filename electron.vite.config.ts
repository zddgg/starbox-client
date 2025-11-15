import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import svgLoader from 'vite-svg-loader'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('src/main/index.ts')
      },
      rollupOptions: {
        output: {
          dir: 'out/main'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('src/preload/index.ts')
      },
      rollupOptions: {
        output: {
          dir: 'out/preload'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [vue(), svgLoader({ svgoConfig: {} })],
    css: {
      preprocessorOptions: {
        scss: {
          quietDeps: true,
          logger: {
            warn: () => {},
          }
        }
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html')
        }
      }
    }
  }
})
