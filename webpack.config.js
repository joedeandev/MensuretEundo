import path from "path";
import HtmlWebPackPlugin from "html-webpack-plugin";

export default {
  entry: "./client/index.tsx",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.(png|svg|jpe?g|gif)$/i,
        type: "asset/resource",
      },
      {
        test: /\.s[ac]ss$/i,
        exclude: /node_modules/,
        use: ["style-loader", "css-loader", "sass-loader"],
      },
    ],
  },
  resolve: {
    roots: [path.resolve(path.dirname("."), "client")],
    extensions: [".tsx", ".ts", ".js"],
  },
  plugins: [
    new HtmlWebPackPlugin({
      template: "./client/index.html",
      filename: "index.html",
      favicon: "./client/favicon.ico",
    }),
  ],
  output: {
    filename: "main.js",
    path: path.resolve(path.dirname("."), "dist", "client"),
  },
};
