const path = require('path');

/** @type {import('webpack').Configuration} */
const config = {
    target: 'node',

    entry: path.resolve(__dirname, 'src/extension.ts'),

    output: {
        path: path.resolve(__dirname, 'out/src'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: (info) => {
            return `${info.resourcePath.replace(/\.\/src\//, '../../src/')}`;
        },
    },

    devtool: 'source-map',

    externals: {
        vscode: 'commonjs vscode',
    },

    resolve: {
        extensions: ['.ts', '.js'],
    },

    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                    },
                ],
            },
        ],
    },

    plugins: [],
};

module.exports = config;
