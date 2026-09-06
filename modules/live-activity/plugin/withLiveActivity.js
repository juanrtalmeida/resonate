const { withInfoPlist } = require('expo/config-plugins');

/**
 * Habilita Live Activities no app iOS.
 *
 * O plugin faz **apenas** a parte declarativa: sem `NSSupportsLiveActivities` no
 * Info.plist, o ActivityKit recusa qualquer atividade, mesmo com todo o código presente.
 *
 * A extensão de widget em si tem de ser adicionada como um target no Xcode. Isso não é
 * automatizado aqui de propósito: criar um target novo significa reescrever o
 * `.pbxproj`, e um script errado corrompe o projeto de um jeito difícil de desfazer.
 * Os passos estão no README deste módulo — são poucos e feitos uma única vez.
 */
module.exports = function withLiveActivity(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.NSSupportsLiveActivities = true;
    return mod;
  });
};
