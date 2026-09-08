const {Command} = require('commander');
const program = new Command();
program
  .option('-h, --host <host>', '')
  .option('-p, --port <port>', '');
program.parse(process.argv);
const {port, host} = program.opts();

function GetArgs() {
  let _port = undefined;
  let _host = undefined;
  if(port !== undefined && typeof port !== 'boolean') {
    _port = Number(port);
  }
  if(host !== undefined && typeof host !== 'boolean') {
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
