const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude server-only packages (sharp, minio native binaries) from Metro's watch.
// These live in the monorepo node_modules but are only used by the API server.
config.resolver.blockList = [
  /node_modules[/\\]@img[/\\]/,
  /node_modules[/\\]sharp[/\\]/,
  /node_modules[/\\]minio[/\\]/,
  new RegExp(
    "^" +
      path
        .resolve(__dirname, "../api-server")
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      ".*$"
  ),
];

module.exports = config;
