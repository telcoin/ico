const evm = require('./evm')

// Due to https://github.com/domenic/chai-as-promised/issues/70 chai
// gets constructed here, just once.
module.exports = require('chai')
  .use(require('chai-bignumber')(evm.BigNumber))
  .use(require('chai-as-promised'))
