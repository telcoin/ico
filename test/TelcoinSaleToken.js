/* global artifacts:false, contract:false, describe: false, it:false */

const evm = require('./helpers/evm')
const {expect} = require('./helpers/chai')
const duration = require('./helpers/duration')

const Telcoin = artifacts.require('./Telcoin.sol')
const TelcoinSaleToken = artifacts.require('./TelcoinSaleToken.sol')

contract('TelcoinSaleToken', accounts => {
  describe('contract', () => {
    describe('ownership', () => {
      it(`should not be transferrable by non-owner`, async () => {
        const [owner, nonOwner] = accounts
        const telcoin = await Telcoin.new(owner, {from: owner})
        const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
        await expect(token.transferOwnership(nonOwner, { from: nonOwner })).to.be.rejectedWith(evm.Revert)
      })

      it(`should be transferrable by owner`, async () => {
        const [owner, nonOwner] = accounts
        const telcoin = await Telcoin.new(owner, {from: owner})
        const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
        await token.transferOwnership(nonOwner, {from: owner})
        await expect(token.owner.call()).to.eventually.equal(nonOwner)
      })

      it(`should not allow 0x0 as owner`, async () => {
        const [owner] = accounts
        const telcoin = await Telcoin.new(owner, {from: owner})
        const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
        await expect(token.transferOwnership('0x0000000000000000000000000000000000000000', {from: owner})).to.be.rejectedWith(evm.Revert)
      })

      it(`should fire OwnershipTransferred event on ownership change`, async () => {
        const [owner, nonOwner] = accounts
        const telcoin = await Telcoin.new(owner, {from: owner})
        const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
        const {logs} = await expect(token.transferOwnership(nonOwner, {from: owner})).to.be.fulfilled
        expect(logs.find(e => e.event === 'OwnershipTransferred')).to.exist
      })
    })

    describe('minting', () => {
      describe('finishing', () => {
        describe(`by non-owner`, () => {
          it(`should not be possible`, async () => {
            const [owner, nonOwner] = accounts
            const telcoin = await Telcoin.new(owner, {from: owner})
            const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
            await expect(token.finishMinting({from: nonOwner})).to.be.rejectedWith(evm.Revert)
          })
        })

        describe(`by owner`, () => {
          it(`should set mintingFinished flag`, async () => {
            const [owner] = accounts
            const telcoin = await Telcoin.new(owner, {from: owner})
            const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
            await expect(token.mintingFinished.call()).to.eventually.equal(false)
            await expect(token.finishMinting({from: owner})).to.be.fulfilled
            await expect(token.mintingFinished.call()).to.eventually.equal(true)
          })

          it(`should not let finish twice`, async () => {
            const [owner] = accounts
            const telcoin = await Telcoin.new(owner, {from: owner})
            const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
            await expect(token.finishMinting({from: owner})).to.be.fulfilled
            await expect(token.finishMinting({from: owner})).to.be.rejectedWith(evm.Revert)
          })

          it(`should fire MintFinished event`, async () => {
            const [owner] = accounts
            const telcoin = await Telcoin.new(owner, {from: owner})
            const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
            const {logs} = await expect(token.finishMinting({from: owner})).to.be.fulfilled
            expect(logs.find(e => e.event === 'MintFinished')).to.exist
          })
        })
      })

      it(`should not be allowed by non-owner`, async () => {
        const [owner, nonOwner] = accounts
        const telcoin = await Telcoin.new(owner, {from: owner})
        const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
        await expect(token.mint(nonOwner, 10000, { from: nonOwner })).to.be.rejectedWith(evm.Revert)
      })

      it(`should be allowed by owner`, async () => {
        const [owner, recipient] = accounts
        const telcoin = await Telcoin.new(owner, {from: owner})
        const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
        await expect(token.totalSupply.call()).to.eventually.bignumber.equal(0)
        await expect(token.balanceOf.call(recipient)).to.eventually.bignumber.equal(0)
        await token.mint(recipient, 42, {from: owner})
        await expect(token.balanceOf.call(recipient)).to.eventually.bignumber.equal(42)
        await expect(token.totalSupply.call()).to.eventually.bignumber.equal(42)
      })

      it(`should fire Mint event`, async () => {
        const [owner, recipient] = accounts
        const telcoin = await Telcoin.new(owner, {from: owner})
        const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
        const {logs} = await expect(token.mint(recipient, 42, {from: owner})).to.be.fulfilled
        expect(logs.find(e => e.event === 'Mint')).to.exist
      })

      it(`should fire Transfer event`, async () => {
        const [owner, recipient] = accounts
        const telcoin = await Telcoin.new(owner, {from: owner})
        const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
        const {logs} = await expect(token.mint(recipient, 42, {from: owner})).to.be.fulfilled
        expect(logs.find(e => e.event === 'Transfer')).to.exist
      })

      it(`should not allow 0 tokens to be minted`, async () => {
        const [owner] = accounts
        const telcoin = await Telcoin.new(owner, {from: owner})
        const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
        await expect(token.mint(owner, 0, {from: owner})).to.be.rejectedWith(evm.Revert)
      })

      it(`should increase total supply`, async () => {
        const [owner, recipient] = accounts
        const telcoin = await Telcoin.new(owner, {from: owner})
        const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
        await expect(token.totalSupply.call()).to.eventually.bignumber.equal(0)
        await token.mint(recipient, 10, {from: owner})
        await expect(token.totalSupply.call()).to.eventually.bignumber.equal(10)
        await token.mint(recipient, 5, {from: owner})
        await expect(token.totalSupply.call()).to.eventually.bignumber.equal(15)
      })

      it(`should not be allowed after minting finishes`, async () => {
        const [owner] = accounts
        const telcoin = await Telcoin.new(owner, {from: owner})
        const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
        await token.finishMinting({from: owner})
        await expect(token.mint(owner, 10000, {from: owner})).to.be.rejectedWith(evm.Revert)
      })

      it(`should not let mint for 0x0`, async () => {
        const [owner] = accounts
        const telcoin = await Telcoin.new(owner, {from: owner})
        const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
        await expect(token.mint(0x0, 10000, {from: owner})).to.be.rejectedWith(evm.Revert)
      })
    })

    describe('redeeming', () => {
      describe(`before minting has finished`, () => {
        it(`should not be possible`, async () => {
          const [owner, recipient] = accounts
          const telcoin = await Telcoin.new(owner, {from: owner})
          const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(telcoin.transfer(token.address, 2000000, {from: owner})).to.be.fulfilled
          await expect(token.redeem(recipient, {from: recipient})).to.be.rejectedWith(evm.Revert)
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(token.redeem(recipient, {from: recipient})).to.be.fulfilled
        })
      })

      describe(`after minting has finished`, () => {
        it(`should distribute telcoin to the beneficiary`, async () => {
          const [owner, recipient1, recipient2] = accounts
          const telcoin = await Telcoin.new(owner, {from: owner})
          const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
          await expect(token.mint(recipient1, 100, {from: owner})).to.be.fulfilled
          await expect(token.mint(recipient2, 900, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(telcoin.transfer(token.address, 2000000, {from: owner})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient1)).to.eventually.bignumber.equal(0)
          await expect(token.redeem(recipient1, {from: recipient1})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient1)).to.eventually.bignumber.equal(200000)
          await expect(telcoin.balanceOf.call(recipient2)).to.eventually.bignumber.equal(0)
          await expect(token.redeem(recipient2, {from: recipient2})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient2)).to.eventually.bignumber.equal(1800000)
        })

        it(`should distribute telcoin to many beneficiaries`, async () => {
          const [owner, recipient1, recipient2, other] = accounts
          const telcoin = await Telcoin.new(owner, {from: owner})
          const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
          await expect(token.mint(recipient1, 100, {from: owner})).to.be.fulfilled
          await expect(token.mint(recipient2, 900, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(telcoin.transfer(token.address, 2000000, {from: owner})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient1)).to.eventually.bignumber.equal(0)
          await expect(telcoin.balanceOf.call(recipient2)).to.eventually.bignumber.equal(0)
          await expect(token.redeemMany([recipient1, recipient2], {from: other})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient1)).to.eventually.bignumber.equal(200000)
          await expect(telcoin.balanceOf.call(recipient2)).to.eventually.bignumber.equal(1800000)
        })

        it(`should transfer telcoin to a single beneficiary if sole purchaser`, async () => {
          const [owner, recipient] = accounts
          const telcoin = await Telcoin.new(owner, {from: owner})
          const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(telcoin.transfer(token.address, 2000000, {from: owner})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient)).to.eventually.bignumber.equal(0)
          await expect(token.redeem(recipient, {from: recipient})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient)).to.eventually.bignumber.equal(2000000)
        })

        it(`should limit distribution by vesting schedule`, async () => {
          const [owner, recipient] = accounts
          const now = await evm.latestTime()
          const telcoin = await Telcoin.new(owner, {from: owner})
          const token = await TelcoinSaleToken.new(telcoin.address, now, duration.days(10), {from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(telcoin.transfer(token.address, 2000000, {from: owner})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient)).to.eventually.bignumber.equal(0)
          await expect(token.redeem(recipient, {from: recipient})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient)).to.eventually.bignumber.equal(0)
          await evm.increaseTimeTo(now + duration.days(1))
          await expect(token.redeem(recipient, {from: recipient})).to.be.fulfilled
          // The vested values are timing sensitive and may therefore change
          // slightly. However, let's not make the tests fuzzy till it
          // actually happens.
          await expect(telcoin.balanceOf.call(recipient)).to.eventually.bignumber.equal(200000)
          await evm.increaseTimeTo(now + duration.days(2))
          await expect(token.redeem(recipient, {from: recipient})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient)).to.eventually.bignumber.equal(400000)
          await evm.increaseTimeTo(now + duration.days(9))
          await expect(token.redeem(recipient, {from: recipient})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient)).to.eventually.bignumber.equal(1800000)
          await evm.increaseTimeTo(now + duration.days(10))
          await expect(token.redeem(recipient, {from: recipient})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient)).to.eventually.bignumber.equal(2000000)
        })

        it(`should not redeem until vesting starts`, async () => {
          const [owner, recipient] = accounts
          const now = await evm.latestTime()
          const telcoin = await Telcoin.new(owner, {from: owner})
          const token = await TelcoinSaleToken.new(telcoin.address, now + duration.days(5), duration.days(5), {from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(telcoin.transfer(token.address, 2000000, {from: owner})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient)).to.eventually.bignumber.equal(0)
          await expect(token.redeem(recipient, {from: recipient})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient)).to.eventually.bignumber.equal(0)
          await evm.increaseTimeTo(now + duration.days(4))
          await expect(token.redeem(recipient, {from: recipient})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient)).to.eventually.bignumber.equal(0)
          await evm.increaseTimeTo(now + duration.days(11))
          await expect(token.redeem(recipient, {from: recipient})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient)).to.eventually.bignumber.equal(2000000)
        })

        it(`should not allow double redeem`, async () => {
          const [owner, recipient] = accounts
          const telcoin = await Telcoin.new(owner, {from: owner})
          const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(telcoin.transfer(token.address, 2000000, {from: owner})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient)).to.eventually.bignumber.equal(0)
          await expect(token.redeem(recipient, {from: recipient})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient)).to.eventually.bignumber.equal(2000000)
          await expect(token.redeem(recipient, {from: recipient})).to.be.fulfilled
          await expect(telcoin.balanceOf.call(recipient)).to.eventually.bignumber.equal(2000000)
        })

        it(`should fire Redeem event`, async () => {
          const [owner, recipient] = accounts
          const telcoin = await Telcoin.new(owner, {from: owner})
          const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(telcoin.transfer(token.address, 33, {from: owner})).to.be.fulfilled
          const {logs} = await expect(token.redeem(recipient, {from: owner})).to.be.fulfilled
          expect(logs.find(e => e.event === 'Redeem')).to.exist
        })

        it(`should fire Transfer event`, async () => {
          const [owner, recipient] = accounts
          const telcoin = await Telcoin.new(owner, {from: owner})
          const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(telcoin.transfer(token.address, 33, {from: owner})).to.be.fulfilled
          const {logs} = await expect(token.redeem(recipient, {from: owner})).to.be.fulfilled
          expect(logs.find(e => e.event === 'Transfer')).to.exist
        })

        it(`should not let redeem for 0x0`, async () => {
          const [owner] = accounts
          const telcoin = await Telcoin.new(owner, {from: owner})
          const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(token.redeem(evm.ZERO, {from: owner})).to.be.rejectedWith(evm.Revert)
        })

        it(`should allow 0 balance to be redeemed as 0`, async () => {
          const [owner, recipient1, recipient2] = accounts
          const telcoin = await Telcoin.new(owner, {from: owner})
          const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
          await expect(telcoin.transfer(token.address, 99, {from: owner})).to.be.fulfilled
          await expect(token.mint(recipient1, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(token.balanceOf.call(recipient2)).to.eventually.bignumber.equal(0)
          await expect(token.redeem(recipient2, {from: owner})).to.be.fulfilled
          await expect(token.balanceOf.call(recipient2)).to.eventually.bignumber.equal(0)
        })

        it(`should not change total supply`, async () => {
          const [owner, recipient] = accounts
          const telcoin = await Telcoin.new(owner, {from: owner})
          const token = await TelcoinSaleToken.new(telcoin.address, 0, 0, {from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(telcoin.transfer(token.address, 33, {from: owner})).to.be.fulfilled
          await expect(token.totalSupply.call()).to.eventually.bignumber.equal(100)
          await expect(token.redeem(recipient, {from: owner})).to.be.fulfilled
          await expect(token.totalSupply.call()).to.eventually.bignumber.equal(100)
        })
      })
    })
  })
})
