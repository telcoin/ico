const assert = require('assert')

module.exports = err => {
  assert.ok(err.message.indexOf('invalid opcode') !== -1, `Expected invalid opcode, got: ${err}`)
}
