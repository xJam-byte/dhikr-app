// apps/mobile/metro.config.js
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../.."); // корень монорепы

const defaultConfig = getDefaultConfig(projectRoot);

module.exports = {
  ...defaultConfig,

  // ❗ сохраняем дефолт и добавляем свой путь
  watchFolders: [...(defaultConfig.watchFolders || []), workspaceRoot],

  resolver: {
    ...defaultConfig.resolver,
    // ❗ сначала дефолтные пути, затем корневой node_modules монорепы
    nodeModulesPaths: [
      ...(defaultConfig.resolver?.nodeModulesPaths || []),
      path.resolve(workspaceRoot, "node_modules"),
    ],
  },
};
