/* global artifacts:false, contract:false, describe: false, it:false */

const evm = require('./helpers/evm')
const {expect} = require('./helpers/chai')

const Telcoin = artifacts.require('./Telcoin.sol')

contract('Telcoin', accounts => {
  describe('contract', () => {
    describe(`creation`, () => {
      it(`should assign entire initial supply to the distributor`, async () => {
        const [distributor] = accounts
        const telcoin = await Telcoin.new(distributor)
        const totalSupply = await expect(telcoin.totalSupply.call()).to.be.fulfilled
        await expect(telcoin.balanceOf.call(distributor)).to.eventually.bignumber.equal(totalSupply)
      })
    })

    describe(`token`, () => {
      it(`should be named 'Telcoin'`, async () => {
        const [distributor] = accounts
        const telcoin = await Telcoin.new(distributor)
        await expect(telcoin.name.call()).to.eventually.equal('Telcoin')
      })

      it(`should have symbol 'TEL'`, async () => {
        const [distributor] = accounts
        const telcoin = await Telcoin.new(distributor)
        await expect(telcoin.symbol.call()).to.eventually.equal('TEL')
      })

      it(`should have 2 decimals`, async () => {
        const [distributor] = accounts
        const telcoin = await Telcoin.new(distributor)
        await expect(telcoin.decimals.call()).to.eventually.bignumber.equal(2)
      })

      it(`should have fixed 10b token supply`, async () => {
        const [distributor] = accounts
        const telcoin = await Telcoin.new(distributor)
        await expect(telcoin.totalSupply.call()).to.eventually.bignumber.equal(10000000000000)
      })
    })

    describe(`active transfer`, () => {
      it(`should not accept 0x0 as recipient`, async () => {
        const [distributor, nonZero] = accounts
        const telcoin = await Telcoin.new(distributor)
        await expect(telcoin.transfer(evm.ZERO, 10, {from: distributor})).to.be.rejectedWith(evm.Revert)
        await expect(telcoin.transfer(nonZero, 10, {from: distributor})).to.be.fulfilled
      })

      it(`should allow transferring entire balance`, async () => {
        const [distributor, recipient1, recipient2, recipient3] = accounts
        const telcoin = await Telcoin.new(distributor)
        await expect(telcoin.transfer(recipient1, 333, {from: distributor})).to.be.fulfilled
        await expect(telcoin.transfer(recipient3, 333, {from: distributor})).to.be.fulfilled
        await expect(telcoin.transfer(recipient2, 333, {from: recipient1})).to.be.fulfilled
        await expect(telcoin.transfer(recipient2, 300, {from: recipient3})).to.be.fulfilled
        await expect(telcoin.transfer(recipient2, 33, {from: recipient3})).to.be.fulfilled
      })

      it(`should not allow transferring more than entire balance`, async () => {
        const [distributor, recipient1, recipient2] = accounts
        const telcoin = await Telcoin.new(distributor)
        await expect(telcoin.transfer(recipient1, 100, {from: distributor})).to.be.fulfilled
        await expect(telcoin.transfer(recipient2, 50, {from: recipient1})).to.be.fulfilled
        await expect(telcoin.transfer(recipient2, 51, {from: recipient1})).to.be.rejectedWith(evm.Revert)
      })

      it(`should adjust balances of sender and recipient`, async () => {
        const [distributor, recipient1, recipient2] = accounts
        const telcoin = await Telcoin.new(distributor)
        await expect(telcoin.transfer(recipient1, 100, {from: distributor})).to.be.fulfilled
        const totalSupply = await expect(telcoin.totalSupply.call()).to.be.fulfilled
        await expect(telcoin.balanceOf.call(distributor)).to.eventually.bignumber.equal(totalSupply.sub(100))
        await expect(telcoin.balanceOf.call(recipient1)).to.eventually.bignumber.equal(100)
        await expect(telcoin.transfer(recipient2, 50, {from: recipient1})).to.be.fulfilled
        await expect(telcoin.balanceOf.call(recipient1)).to.eventually.bignumber.equal(50)
        await expect(telcoin.balanceOf.call(recipient2)).to.eventually.bignumber.equal(50)
        await expect(telcoin.transfer(recipient2, 49, {from: recipient1})).to.be.fulfilled
        await expect(telcoin.balanceOf.call(recipient1)).to.eventually.bignumber.equal(1)
        await expect(telcoin.balanceOf.call(recipient2)).to.eventually.bignumber.equal(99)
      })

      it(`should fire Transfer event`, async () => {
        const [distributor, recipient1] = accounts
        const telcoin = await Telcoin.new(distributor)
        const {logs} = await expect(telcoin.transfer(recipient1, 100, {from: distributor})).to.be.fulfilled
        expect(logs.find(e => e.event === 'Transfer')).to.exist
      })
    })

    describe(`passive transfer`, () => {
      it(`should not accept 0x0 as recipient`, async () => {
        const [distributor, recipient] = accounts
        const telcoin = await Telcoin.new(distributor)
        await expect(telcoin.approve(recipient, 1000, {from: distributor})).to.be.fulfilled
        await expect(telcoin.transferFrom(distributor, evm.ZERO, 10, {from: recipient})).to.be.rejectedWith(evm.Revert)
        await expect(telcoin.transferFrom(distributor, recipient, 10, {from: recipient})).to.be.fulfilled
      })

      it(`should respect allowance`, async () => {
        const [distributor, recipient] = accounts
        const telcoin = await Telcoin.new(distributor)
        await expect(telcoin.approve(recipient, 1000, {from: distributor})).to.be.fulfilled
        await expect(telcoin.transferFrom(distributor, recipient, 1001, {from: recipient})).to.be.rejectedWith(evm.Revert)
        await expect(telcoin.transferFrom(distributor, recipient, 1000, {from: recipient})).to.be.fulfilled
      })

      it(`should allow transferring entire balance`, async () => {
        const [distributor, recipient1, recipient2] = accounts
        const telcoin = await Telcoin.new(distributor)
        await expect(telcoin.approve(recipient1, 1000, {from: distributor})).to.be.fulfilled
        await expect(telcoin.transferFrom(distributor, recipient1, 1000, {from: recipient1})).to.be.fulfilled
        await expect(telcoin.approve(recipient2, 1000, {from: recipient1})).to.be.fulfilled
        await expect(telcoin.transferFrom(recipient1, recipient2, 333, {from: recipient2})).to.be.fulfilled
        await expect(telcoin.transferFrom(recipient1, recipient2, 667, {from: recipient2})).to.be.fulfilled
      })

      it(`should not allow transferring more than entire balance`, async () => {
        const [distributor, recipient1, recipient2] = accounts
        const telcoin = await Telcoin.new(distributor)
        await expect(telcoin.approve(recipient1, 1000, {from: distributor})).to.be.fulfilled
        await expect(telcoin.transferFrom(distributor, recipient1, 1000, {from: recipient1})).to.be.fulfilled
        await expect(telcoin.approve(recipient2, 2000, {from: recipient1})).to.be.fulfilled
        await expect(telcoin.transferFrom(recipient1, recipient2, 1001, {from: recipient2})).to.be.rejectedWith(evm.Revert)
        await expect(telcoin.transferFrom(recipient1, recipient2, 1000, {from: recipient2})).to.be.fulfilled
      })

      it(`should adjust balances of sender and recipient`, async () => {
        const [distributor, recipient1, recipient2] = accounts
        const telcoin = await Telcoin.new(distributor)
        await expect(telcoin.approve(recipient1, 300, {from: distributor})).to.be.fulfilled
        await expect(telcoin.transferFrom(distributor, recipient1, 100, {from: recipient1})).to.be.fulfilled
        const totalSupply = await expect(telcoin.totalSupply.call()).to.be.fulfilled
        await expect(telcoin.balanceOf.call(distributor)).to.eventually.bignumber.equal(totalSupply.sub(100))
        await expect(telcoin.balanceOf.call(recipient1)).to.eventually.bignumber.equal(100)
        await expect(telcoin.approve(recipient2, 300, {from: recipient1})).to.be.fulfilled
        await expect(telcoin.transferFrom(recipient1, recipient2, 50, {from: recipient2})).to.be.fulfilled
        await expect(telcoin.balanceOf.call(recipient1)).to.eventually.bignumber.equal(50)
        await expect(telcoin.balanceOf.call(recipient2)).to.eventually.bignumber.equal(50)
        await expect(telcoin.transferFrom(recipient1, recipient2, 49, {from: recipient2})).to.be.fulfilled
        await expect(telcoin.balanceOf.call(recipient1)).to.eventually.bignumber.equal(1)
        await expect(telcoin.balanceOf.call(recipient2)).to.eventually.bignumber.equal(99)
      })

      it(`should fire Transfer event`, async () => {
        const [distributor, recipient1] = accounts
        const telcoin = await Telcoin.new(distributor)
        await expect(telcoin.approve(recipient1, 1000, {from: distributor})).to.be.fulfilled
        const {logs} = await expect(telcoin.transferFrom(distributor, recipient1, 100, {from: recipient1})).to.be.fulfilled
        expect(logs.find(e => e.event === 'Transfer')).to.exist
      })

      describe(`approval`, () => {
        it(`should fire Approval event`, async () => {
          const [distributor, recipient1] = accounts
          const telcoin = await Telcoin.new(distributor)
          const {logs} = await expect(telcoin.approve(recipient1, 1000, {from: distributor})).to.be.fulfilled
          expect(logs.find(e => e.event === 'Approval')).to.exist
        })

        it(`increase should fire Approval event`, async () => {
          const [distributor, recipient1] = accounts
          const telcoin = await Telcoin.new(distributor)
          const {logs} = await expect(telcoin.increaseApproval(recipient1, 1000, {from: distributor})).to.be.fulfilled
          expect(logs.find(e => e.event === 'Approval')).to.exist
        })

        it(`decrease should fire Approval event`, async () => {
          const [distributor, recipient1] = accounts
          const telcoin = await Telcoin.new(distributor)
          const {logs} = await expect(telcoin.decreaseApproval(recipient1, 1000, {from: distributor})).to.be.fulfilled
          expect(logs.find(e => e.event === 'Approval')).to.exist
        })

        it(`should be overwritten with approve()`, async () => {
          const [distributor, recipient1] = accounts
          const telcoin = await Telcoin.new(distributor)
          await expect(telcoin.allowance.call(distributor, recipient1)).to.eventually.bignumber.equal(0)
          await expect(telcoin.approve(recipient1, 1000, {from: distributor})).to.be.fulfilled
          await expect(telcoin.allowance.call(distributor, recipient1)).to.eventually.bignumber.equal(1000)
          await expect(telcoin.approve(recipient1, 415, {from: distributor})).to.be.fulfilled
          await expect(telcoin.allowance.call(distributor, recipient1)).to.eventually.bignumber.equal(415)
        })

        it(`should be increased with increaseApproval()`, async () => {
          const [distributor, recipient1] = accounts
          const telcoin = await Telcoin.new(distributor)
          await expect(telcoin.allowance.call(distributor, recipient1)).to.eventually.bignumber.equal(0)
          await expect(telcoin.approve(recipient1, 1000, {from: distributor})).to.be.fulfilled
          await expect(telcoin.allowance.call(distributor, recipient1)).to.eventually.bignumber.equal(1000)
          await expect(telcoin.increaseApproval(recipient1, 415, {from: distributor})).to.be.fulfilled
          await expect(telcoin.allowance.call(distributor, recipient1)).to.eventually.bignumber.equal(1415)
        })

        it(`should be decreased with decreaseApproval()`, async () => {
          const [distributor, recipient1] = accounts
          const telcoin = await Telcoin.new(distributor)
          await expect(telcoin.allowance.call(distributor, recipient1)).to.eventually.bignumber.equal(0)
          await expect(telcoin.approve(recipient1, 1000, {from: distributor})).to.be.fulfilled
          await expect(telcoin.allowance.call(distributor, recipient1)).to.eventually.bignumber.equal(1000)
          await expect(telcoin.decreaseApproval(recipient1, 415, {from: distributor})).to.be.fulfilled
          await expect(telcoin.allowance.call(distributor, recipient1)).to.eventually.bignumber.equal(585)
        })

        it(`should not be decreasable below 0`, async () => {
          const [distributor, recipient1] = accounts
          const telcoin = await Telcoin.new(distributor)
          await expect(telcoin.allowance.call(distributor, recipient1)).to.eventually.bignumber.equal(0)
          await expect(telcoin.decreaseApproval(recipient1, 1, {from: distributor})).to.be.fulfilled
          await expect(telcoin.allowance.call(distributor, recipient1)).to.eventually.bignumber.equal(0)
          await expect(telcoin.approve(recipient1, 1000, {from: distributor})).to.be.fulfilled
          await expect(telcoin.allowance.call(distributor, recipient1)).to.eventually.bignumber.equal(1000)
          await expect(telcoin.decreaseApproval(recipient1, 1001, {from: distributor})).to.be.fulfilled
          await expect(telcoin.allowance.call(distributor, recipient1)).to.eventually.bignumber.equal(0)
        })
      })
    })
  })
})
