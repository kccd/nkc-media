const {GetServerConfigs} = require('../modules/configs');
module.exports = {
  params: {},
  handler() {
    const {port, host} = GetServerConfigs();
    return {
      port,
      host
    };
  }
}
