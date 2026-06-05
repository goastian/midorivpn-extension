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

config.plugins = (config.plugins || []).concat(
    new ZipPlugin({
        filename: `${packageInfo.name}-${packageInfo.version}.zip`,
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

    console.log('✅ Build & ZIP completado correctamente.');
})
