require("@babel/core").transformFile("src/index.ts", {
    filename: "src/index.ts",
    presets: ["@babel/preset-typescript"],
}, (x, result) => {
    console.log(x);
    console.log(result);
});