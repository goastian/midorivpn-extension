process.env.APP_ENV = 'production';

const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const TerserPlugin = require('terser-webpack-plugin');
const ZipPlugin = require('zip-webpack-plugin');
const config = require('../webpack.config');
const webpack = require('webpack');
const path = require('path');
const fs = require('fs');

config.mode = 'production';
config.devtool = false;

var packageInfo = JSON.parse(fs.readFileSync('package.json', 'utf-8'))

config.optimization = {
    ...config.optimization,
    minimize: true,
    minimizer: [
        new TerserPlugin({
            extractComments: false,
            terserOptions: {
                compress: {
                    // Strip console.log/info/debug in production. console.debug
                    // is used by the diag: channel which is disabled (no-op) in
                    // prod builds, so stripping it is a no-op safety net.
                    // console.error and console.warn are kept so real failures
                    // and warnings remain visible in extension DevTools.
                    pure_funcs: ['console.log', 'console.info', 'console.debug'],
                },
                format: {
                    comments: false,
                },
            },
        }),
        new CssMinimizerPlugin(),
    ],
};

const targetBrowser = process.env.BROWSER;
const zipFilename = targetBrowser
    ? `${packageInfo.name}-${packageInfo.version}-${targetBrowser}.zip`
    : `${packageInfo.name}-${packageInfo.version}.zip`;

config.plugins = (config.plugins || []).concat(
    new ZipPlugin({
        filename: zipFilename,
        path: path.join(__dirname, '../', 'zip'),
    }),
    new BundleAnalyzerPlugin({ analyzerMode: 'disabled' }),
);

config.resolve = {
    alias: {
        vue$: 'vue/dist/vue.runtime.esm-browser.prod.js',
        '@': path.resolve(__dirname, 'src'),
        '@vue/devtools-kit$': false,
    },
    extensions: ['.ts', '.js'],
}

webpack(config, (err, stats) => {
    if (err) throw err;

    const info = stats.toJson();

    if (stats.hasErrors()) {
        console.error('Webpack compilation errors:', info.errors);
        process.exit(1);
    }

    if (stats.hasWarnings()) {
        info.warnings.forEach(w => console.warn('⚠️ ', w.message));
    }

    const manifest = JSON.parse(fs.readFileSync(path.join(config.output.path, 'manifest.json'), 'utf-8'));
    const background = manifest.background || {};
    if (targetBrowser === 'firefox' && background.service_worker) {
        throw new Error('Firefox package must not contain background.service_worker');
    }
    if (targetBrowser === 'chrome' && (background.scripts || manifest.browser_specific_settings)) {
        throw new Error('Chrome package contains Firefox-only manifest fields');
    }
    const extensionCsp = manifest.content_security_policy?.extension_pages || '';
    if (/localhost|127\.0\.0\.1|\bws:|\bhttp:/.test(extensionCsp)) {
        throw new Error('Production extension CSP contains development origins');
    }

    console.log('✅ Build & ZIP completado correctamente.');
})
