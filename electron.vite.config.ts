import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import svgLoader from 'vite-svg-loader'
import tailwindcss from '@tailwindcss/vite'

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
        '@dynamic-form': resolve('src/renderer/src/components/dynamic-form'),
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [vue(), tailwindcss(), svgLoader({ svgoConfig: {} })],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html')
        }
      }
    }
  }
})
