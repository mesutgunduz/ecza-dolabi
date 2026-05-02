const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude temporary expo-image cache directories inside node_modules from watching
config.resolver.blockList = [
  /node_modules[/\\].*[/\\]\.expo-image-[^/\\]+[/\\].*/,
];

module.exports = config;
