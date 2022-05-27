const {Broker} = require('./modules/broker');
const {GetMoleculerConfigs} = require('./modules/configs');
const app = require('./app');
Broker.createService(app);

async function StartBroker() {
  await Broker.start();
  console.log(`Namespace: ${Broker.namespace}`);
  console.log(`NodeID: ${Broker.nodeID}`);
  console.log(`Service: ${app.name} started`);
  console.log(`Version: ${app.version}`);
  ConsoleApiServiceInfo();
}

function ConsoleApiServiceInfo() {
  const moleculerConfigs = GetMoleculerConfigs();
  if (moleculerConfigs.web.enabled) {
    console.log(
      `ApiService is running at ${moleculerConfigs.web.host}:${moleculerConfigs.web.port}`,
    );
  }
}

module.exports = {
  StartBroker
};
