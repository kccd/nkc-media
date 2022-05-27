const {Broker} = require('./broker');

const ServiceActionNames = {
  v1_nkc_set_resource_status: 'v1.nkc.setResourceStatus',
  v1_nkc_set_verified_status: 'v1.nkc.setVerifiedStatus'
};

function BrokerCall(serviceActionName, params) {
  return Broker.call(serviceActionName, params);
}

module.exports = {
  ServiceActionNames,
  BrokerCall
};
