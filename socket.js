const {BrokerCall, ServiceActionNames} = require('./comm/modules/call');

//媒体服务通知NKC服务
function sendMessageToNkc(type, props) {
  const {rid = '', status = false, error = '', filesInfo = {}, vid = ''} = props;
  Promise.resolve()
    .then(() => {
      if(type === 'resourceStatus') {
        return BrokerCall(ServiceActionNames.v1_nkc_set_resource_status, {
          rid,
          status,
          error,
          filesInfo
        });
      } else {
        return BrokerCall(ServiceActionNames.v1_nkc_set_verified_status, {
          vid,
          status,
          error,
          filesInfo
        });
      }
    })
    .catch(err => {
      console.error(err);
    });
}

module.exports = {
  sendMessageToNkc
};
