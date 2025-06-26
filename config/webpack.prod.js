const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const TerserPlugin = require('terser-webpack-plugin');
const ZipPlugin = require('zip-webpack-plugin');
const config = require('../webpack.config');
const webpack = require('webpack');
const path = require('path');
const fs = require('fs');

config.mode = 'production';

var packageInfo = JSON.parse(fs.readFileSync('package.json', 'utf-8'))

config.optimization = {
    minimize: true,
    minimizer: [
        new TerserPlugin({
            extractComments: false,
            terserOptions: {
                compress: {
                    drop_console: true,
                },
                format: {
                    comments: false,
                },
            },
        }),
        new CssMinimizerPlugin(),
    ],
    splitChunks: {
        chunks: (chunk) => {
            return chunk.name !== 'background';
        },
        minSize: 10000,
        maxSize: 50000,
    },
};

config.plugins = (config.plugins || []).concat(
    new ZipPlugin({
        filename: `${packageInfo.name}-${packageInfo.version}.zip`,
        path: path.join(__dirname, '../', 'zip'),
    }),
    new BundleAnalyzerPlugin(),
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
        console.warn('Webpack warnings:', info.warnings);
    }

    console.log('✅ Build & ZIP completado correctamente.');
})