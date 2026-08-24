import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, loadEnv } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'
import { tanstackRouter } from '@tanstack/router-plugin/rspack'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ envMode }) => {
  const env = loadEnv({ mode: envMode, prefixes: ['VITE_'] })
  const serverUrl =
    process.env.VITE_REACT_APP_SERVER_URL ||
    env.rawPublicVars.VITE_REACT_APP_SERVER_URL ||
    'http://localhost:3000'
  const canvasCloudServerUrl =
    process.env.VITE_CANVAS_CLOUD_SERVER_URL ||
    env.rawPublicVars.VITE_CANVAS_CLOUD_SERVER_URL ||
    'http://localhost:10689'
  const canvasManualUat =
    process.env.VITE_CANVAS_MANUAL_UAT ||
    env.rawPublicVars.VITE_CANVAS_MANUAL_UAT ||
    ''
  const canvasManualUatCustomerLogin =
    process.env.VITE_CANVAS_MANUAL_UAT_CUSTOMER_LOGIN ||
    env.rawPublicVars.VITE_CANVAS_MANUAL_UAT_CUSTOMER_LOGIN ||
    ''
  const canvasManualUatAdminLogin =
    process.env.VITE_CANVAS_MANUAL_UAT_ADMIN_LOGIN ||
    env.rawPublicVars.VITE_CANVAS_MANUAL_UAT_ADMIN_LOGIN ||
    ''

  const isProd = envMode === 'production'
  const devProxy: Record<string, object> = Object.fromEntries(
    (['/api', '/mj', '/pg'] as const).map((key) => [
      key,
      { target: serverUrl, changeOrigin: true },
    ])
  )
  devProxy['/canvas-api'] = {
    target: canvasCloudServerUrl,
    changeOrigin: true,
    pathRewrite: { '^/canvas-api': '' },
  }

  return {
    plugins: [pluginReact(), pluginTailwindcss({ optimize: false })],
    // Rsbuild 2: replaces deprecated `performance.chunkSplit` (RSPack 2 aligned)
    splitChunks: {
      preset: 'default',
      cacheGroups: {
        'vendor-react': {
          test: /node_modules[\\/](react|react-dom)[\\/]/,
          name: 'vendor-react',
          chunks: 'all',
          priority: 0,
          enforce: true,
        },
        'vendor-ui-primitives': {
          test: /node_modules[\\/](@base-ui|@radix-ui)[\\/]/,
          name: 'vendor-ui-primitives',
          chunks: 'all',
          priority: 0,
          enforce: true,
        },
        'vendor-tanstack': {
          test: /node_modules[\\/]@tanstack[\\/]/,
          name: 'vendor-tanstack',
          chunks: 'all',
          priority: 0,
          enforce: true,
        },
      },
    },
    source: {
      entry: {
        index: './src/main.tsx',
      },
      define: {
        'import.meta.env.VITE_CANVAS_MANUAL_UAT':
          JSON.stringify(canvasManualUat),
        'import.meta.env.VITE_CANVAS_MANUAL_UAT_CUSTOMER_LOGIN': JSON.stringify(
          canvasManualUatCustomerLogin
        ),
        'import.meta.env.VITE_CANVAS_MANUAL_UAT_ADMIN_LOGIN': JSON.stringify(
          canvasManualUatAdminLogin
        ),
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    html: {
      template: './index.html',
    },
    server: {
      host: '0.0.0.0',
      strictPort: false,
      proxy: devProxy,
    },
    output: {
      // Production optimizations
      minify: isProd,
      target: 'web',
      distPath: {
        root: 'dist',
      },
      // Rely on Rsbuild default legalComments ("linked" → per-chunk *.LICENSE.txt) in all modes.
      // Do not set "none" in production: that strips minifier-preserved third-party notices and
      // extracted license files, which some distributions require for open-source compliance.
    },
    performance: {
      // Remove console in production
      removeConsole: isProd ? ['log'] : false,
      buildCache: false,
    },
    tools: {
      rspack: {
        plugins: [
          tanstackRouter({
            target: 'react',
            // Dev: avoid per-route async chunks (reduces white flash on navigation + faster HMR feedback).
            // Prod: keep route-based code splitting.
            autoCodeSplitting: isProd,
          }),
        ],
      },
    },
  }
})
