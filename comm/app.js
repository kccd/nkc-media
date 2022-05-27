const ApiService = require("moleculer-web");
const {GetMoleculerConfigs} = require('./modules/configs');
const moleculerConfigs = GetMoleculerConfigs();
const mixins = moleculerConfigs.web.enabled? [ApiService]: [];
const getServerInfo = require('./actions/getServerInfo');

module.exports = {
  name: 'media',
  version: 1,
  mixins,
  settings: {
    port: moleculerConfigs.web.port,
    host: moleculerConfigs.web.host,
  },
  actions: {
    getServerInfo
  }
}
