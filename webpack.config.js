
module.exports = {
    mode: 'none',
    entry: "./src/index.ts",
    module: {
        "rules": [
            {
                test: /\.tsx?/,
                use: "babel-loader",
                exclude: [
                    /example/,
                    /node_modules/,
                ]
            }
        ]
    },
    output: {
        filename: "index.js",
        library: "RobustWs",
        libraryTarget: "umd"
    }
}