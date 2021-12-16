const CommunicationClient = require('./communicationClient.v1');
const {getPort} = require('./tools');
const {address: serviceAddress, communication} = require('./configs');
const realPort = getPort();
const {serverAddress, serverPort, clientName} = communication;

const communicationClient = new CommunicationClient({
  serverAddress,
  serverPort,
  serviceAddress,
  serviceId: process.pid,
  servicePort: realPort,
  serviceName: clientName
});

function getCommunicationClient() {
  return communicationClient;
}

//媒体服务通知NKC服务
function sendMessageToNkc(type, props) {
  const {rid, status, error, filesInfo, vid} = props;
  const communicationClient = getCommunicationClient();
  communicationClient.sendMessage(communicationConfig.servicesName.nkc, {
    type,
    data: {
      rid,
      vid,
      status,
      error,
      filesInfo
    },
  });
}

module.exports = {
  getCommunicationClient,
  sendMessageToNkc
};
