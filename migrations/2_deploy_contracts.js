/* global artifacts:false */

const PreSaleToken = artifacts.require('./PreSaleToken.sol')

module.exports = deployer => {
  deployer.deploy(PreSaleToken)
}
