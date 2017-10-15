/* global web3:false */

module.exports.wei = n => new web3.BigNumber(web3.toWei(n, 'wei'))
module.exports.ether = n => new web3.BigNumber(web3.toWei(n, 'ether'))
