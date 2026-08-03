// The Reanimated babel plugin is configured automatically by babel-preset-expo
// as of SDK 54+ — do not add react-native-worklets/plugin manually.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
