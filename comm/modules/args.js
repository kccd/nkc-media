const {Command} = require('commander');
const program = new Command();
program
  .option('-h, --host [type]', '')
  .option('-p, --port [type]', '');
program.parse(process.argv);
const {port, host} = program.opts();

function GetArgs() {
  let _port = undefined;
  let _host = undefined;
  if(port && typeof port !== 'boolean') {
    _port = Number(port);
  }
  if(host && typeof host !== 'boolean') {
    _host = host;
  }
  return {
    port: _port,
    host: _host
  };
}

module.exports = {
  GetArgs
}
