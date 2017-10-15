/* global web3:false */

const assert = require('assert')

const promisor = require('./promisor')

module.exports.Throw = 'invalid opcode'

module.exports.BigNumber = web3.BigNumber

module.exports.ZERO = '0x0000000000000000000000000000000000000000'

const wei = (n, unit) => new web3.BigNumber(web3.toWei(n, unit))

module.exports.wei = wei

const advanceBlock = async () => {
  return await promisor(callback => {
    web3.currentProvider.sendAsync({
      jsonrpc: '2.0',
      method: 'evm_mine',
      id: Date.now(),
    }, callback)
  })
}

module.exports.advanceBlock = advanceBlock

const latestTime = async () => {
  return web3.eth.getBlock('latest').timestamp
}

module.exports.latestTime = latestTime

const increaseTime = async duration => {
  const id = Date.now()

  await promisor(callback => {
    web3.currentProvider.sendAsync({
      jsonrpc: '2.0',
      method: 'evm_increaseTime',
      params: [duration],
      id: id,
    }, callback)
  })

  return await promisor(callback => {
    web3.currentProvider.sendAsync({
      jsonrpc: '2.0',
      method: 'evm_mine',
      id: id + 1,
    }, callback)
  })
}

module.exports.increaseTime = increaseTime

const increaseTimeTo = async target => {
  let now = await latestTime()
  assert.ok(target >= now, `Can't go back in time`)
  let diff = target - now
  return increaseTime(diff)
}

module.exports.increaseTimeTo = increaseTimeTo

const getBalance = async wallet => {
  return web3.eth.getBalance(wallet)
}

module.exports.getBalance = getBalance
