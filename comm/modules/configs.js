const commConfig = require('../../configs');
const {GetArgs} = require('./args');
const {host: argsHost, port: argsPort} = GetArgs();
function GetMoleculerConfigs() {
  return {
    ...commConfig.moleculer
  }
}

function GetServerConfigs() {
  return {
    host: argsHost || commConfig.address,
    port: argsPort || commConfig.port
  }
}

module.exports = {
  GetMoleculerConfigs,
  GetServerConfigs
}
