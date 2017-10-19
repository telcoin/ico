/* global artifacts:false, contract:false, describe: false, it:false */

const evm = require('./helpers/evm')
const {expect} = require('./helpers/chai')

const PreSaleToken = artifacts.require('./PreSaleToken.sol')

contract('PreSaleToken', accounts => {
  describe('ownership', () => {
    it(`should not be transferrable by non-owner`, async () => {
      const [owner, nonOwner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await expect(token.transferOwnership(nonOwner, { from: nonOwner })).to.be.rejectedWith(evm.Throw)
    })

    it(`should be transferrable by owner`, async () => {
      const [owner, nonOwner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await token.transferOwnership(nonOwner, {from: owner})
      await expect(token.owner.call()).to.eventually.equal(nonOwner)
    })

    it(`should not allow 0x0 as owner`, async () => {
      const [owner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await expect(token.transferOwnership('0x0000000000000000000000000000000000000000', {from: owner})).to.be.rejectedWith(evm.Throw)
    })

    it(`should fire OwnershipTransferred event on ownership change`, async () => {
      const [owner, nonOwner] = accounts
      const token = await PreSaleToken.new({from: owner})
      const {logs} = await expect(token.transferOwnership(nonOwner, {from: owner})).to.be.fulfilled
      expect(logs.find(e => e.event === 'OwnershipTransferred')).to.exist
    })
  })

  describe('minting', () => {
    describe('finishing', () => {
      describe(`by non-owner`, () => {
        it(`should not be possible`, async () => {
          const [owner, nonOwner] = accounts
          const token = await PreSaleToken.new({from: owner})
          await expect(token.finishMinting({from: nonOwner})).to.be.rejectedWith(evm.Throw)
        })
      })

      describe(`by owner`, () => {
        it(`should set mintingFinished flag`, async () => {
          const [owner] = accounts
          const token = await PreSaleToken.new({from: owner})
          await expect(token.mintingFinished.call()).to.eventually.equal(false)
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(token.mintingFinished.call()).to.eventually.equal(true)
        })

        it(`should not let finish twice`, async () => {
          const [owner] = accounts
          const token = await PreSaleToken.new({from: owner})
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.rejectedWith(evm.Throw)
        })

        it(`should fire MintFinished event`, async () => {
          const [owner] = accounts
          const token = await PreSaleToken.new({from: owner})
          const {logs} = await expect(token.finishMinting({from: owner})).to.be.fulfilled
          expect(logs.find(e => e.event === 'MintFinished')).to.exist
        })
      })
    })

    it(`should not be allowed by non-owner`, async () => {
      const [owner, nonOwner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await expect(token.mint(nonOwner, 10000, { from: nonOwner })).to.be.rejectedWith(evm.Throw)
    })

    it(`should be allowed by owner`, async () => {
      const [owner, recipient] = accounts
      const token = await PreSaleToken.new({from: owner})
      await expect(token.totalSupply.call()).to.eventually.bignumber.equal(0)
      await expect(token.balanceOf.call(recipient)).to.eventually.bignumber.equal(0)
      await token.mint(recipient, 42, {from: owner})
      await expect(token.balanceOf.call(recipient)).to.eventually.bignumber.equal(42)
      await expect(token.totalSupply.call()).to.eventually.bignumber.equal(42)
    })

    it(`should fire Mint event`, async () => {
      const [owner, recipient] = accounts
      const token = await PreSaleToken.new({from: owner})
      const {logs} = await expect(token.mint(recipient, 42, {from: owner})).to.be.fulfilled
      expect(logs.find(e => e.event === 'Mint')).to.exist
    })

    it(`should fire Transfer event`, async () => {
      const [owner, recipient] = accounts
      const token = await PreSaleToken.new({from: owner})
      const {logs} = await expect(token.mint(recipient, 42, {from: owner})).to.be.fulfilled
      expect(logs.find(e => e.event === 'Transfer')).to.exist
    })

    it(`should not allow 0 tokens to be minted`, async () => {
      const [owner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await expect(token.mint(owner, 0, {from: owner})).to.be.rejectedWith(evm.Throw)
    })

    it(`should increase total supply`, async () => {
      const [owner, recipient] = accounts
      const token = await PreSaleToken.new({from: owner})
      await expect(token.totalSupply.call()).to.eventually.bignumber.equal(0)
      await token.mint(recipient, 10, {from: owner})
      await expect(token.totalSupply.call()).to.eventually.bignumber.equal(10)
      await token.mint(recipient, 5, {from: owner})
      await expect(token.totalSupply.call()).to.eventually.bignumber.equal(15)
    })

    it(`should add recipient to the list of recipients`, async () => {
      const [owner, recipient1, recipient2] = accounts
      const token = await PreSaleToken.new({from: owner})
      await expect(token.recipients.call(0)).to.be.rejectedWith(evm.Throw)
      await expect(token.recipients.call(1)).to.be.rejectedWith(evm.Throw)
      await token.mint(recipient1, 10, {from: owner})
      await token.mint(recipient2, 10, {from: owner})
      await expect(token.recipients.call(0)).to.eventually.equal(recipient1)
      await expect(token.recipients.call(1)).to.eventually.equal(recipient2)
    })

    it(`should not be allowed after minting finishes`, async () => {
      const [owner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await token.finishMinting({from: owner})
      await expect(token.mint(owner, 10000, {from: owner})).to.be.rejectedWith(evm.Throw)
    })

    it(`should not let mint for 0x0`, async () => {
      const [owner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await expect(token.mint(0x0, 10000, {from: owner})).to.be.rejectedWith(evm.Throw)
    })
  })

  describe('exchanging', () => {
    describe('exchangers', () => {
      describe(`by non-owner`, () => {
        it(`should not let add new exchangers`, async () => {
          const [owner, nonOwner, recipient, exchanger] = accounts
          const token = await PreSaleToken.new({from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(token.allowExchanger(exchanger, {from: nonOwner})).to.be.rejectedWith(evm.Throw)
        })

        it(`should not let revoke exchangers`, async () => {
          const [owner, nonOwner, recipient, exchanger] = accounts
          const token = await PreSaleToken.new({from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
          await expect(token.revokeExchanger(exchanger, {from: nonOwner})).to.be.rejectedWith(evm.Throw)
        })
      })

      describe(`by owner`, () => {
        describe(`before minting has finished`, () => {
          it(`should not let add new exchangers`, async () => {
            const [owner, recipient, exchanger] = accounts
            const token = await PreSaleToken.new({from: owner})
            await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
            await expect(token.allowExchanger(exchanger, {from: owner})).to.be.rejectedWith(evm.Throw)
            await expect(token.finishMinting({from: owner})).to.be.fulfilled
            await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
          })

          it(`should not let revoke exchangers`, async () => {
            const [owner, recipient, exchanger] = accounts
            const token = await PreSaleToken.new({from: owner})
            await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
            await expect(token.revokeExchanger(exchanger, {from: owner})).to.be.rejectedWith(evm.Throw)
            await expect(token.finishMinting({from: owner})).to.be.fulfilled
            await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
            await expect(token.revokeExchanger(exchanger, {from: owner})).to.be.fulfilled
          })
        })

        describe(`after minting has finished`, () => {
          it(`should let add new exchangers`, async () => {
            const [owner, recipient, exchanger] = accounts
            const token = await PreSaleToken.new({from: owner})
            await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
            await expect(token.finishMinting({from: owner})).to.be.fulfilled
            await expect(token.exchangers.call(exchanger)).to.eventually.equal(false)
            await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
            await expect(token.exchangers.call(exchanger)).to.eventually.equal(true)
          })

          it(`should fire AllowExchanger event when exchanger added`, async () => {
            const [owner, recipient, exchanger] = accounts
            const token = await PreSaleToken.new({from: owner})
            await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
            await expect(token.finishMinting({from: owner})).to.be.fulfilled
            const {logs} = await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
            expect(logs.find(e => e.event === 'AllowExchanger')).to.exist
          })

          it(`should not allow exchanger to be added twice`, async () => {
            const [owner, recipient, exchanger] = accounts
            const token = await PreSaleToken.new({from: owner})
            await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
            await expect(token.finishMinting({from: owner})).to.be.fulfilled
            await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
            await expect(token.allowExchanger(exchanger, {from: owner})).to.be.rejectedWith(evm.Throw)
          })

          it(`should not let 0x0 to be added as an exchanger`, async () => {
            const [owner, recipient] = accounts
            const token = await PreSaleToken.new({from: owner})
            await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
            await expect(token.finishMinting({from: owner})).to.be.fulfilled
            await expect(token.allowExchanger(evm.ZERO, {from: owner})).to.be.rejectedWith(evm.Throw)
          })

          it(`should not let revoke 0x0 exchanger`, async () => {
            const [owner, recipient] = accounts
            const token = await PreSaleToken.new({from: owner})
            await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
            await expect(token.finishMinting({from: owner})).to.be.fulfilled
            await expect(token.revokeExchanger(evm.ZERO, {from: owner})).to.be.rejectedWith(evm.Throw)
          })

          it(`should let revoke exchangers`, async () => {
            const [owner, recipient, exchanger] = accounts
            const token = await PreSaleToken.new({from: owner})
            await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
            await expect(token.finishMinting({from: owner})).to.be.fulfilled
            await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
            await expect(token.revokeExchanger(exchanger, {from: owner})).to.be.fulfilled
            await expect(token.exchangers.call(exchanger)).to.eventually.equal(false)
          })

          it(`should fire RevokeExchanger event when exchanger revoked`, async () => {
            const [owner, recipient, exchanger] = accounts
            const token = await PreSaleToken.new({from: owner})
            await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
            await expect(token.finishMinting({from: owner})).to.be.fulfilled
            await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
            const {logs} = await expect(token.revokeExchanger(exchanger, {from: owner})).to.be.fulfilled
            expect(logs.find(e => e.event === 'RevokeExchanger')).to.exist
          })

          it(`should not allow non-exchanger to be revoked`, async () => {
            const [owner, recipient, exchanger, other] = accounts
            const token = await PreSaleToken.new({from: owner})
            await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
            await expect(token.finishMinting({from: owner})).to.be.fulfilled
            await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
            await expect(token.revokeExchanger(other, {from: owner})).to.be.rejectedWith(evm.Throw)
          })
        })
      })
    })

    describe(`by non-exchanger`, () => {
      it(`should not be possible`, async () => {
        const [owner, nonOwner, recipient, exchanger] = accounts
        const token = await PreSaleToken.new({from: owner})
        await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
        await expect(token.finishMinting({from: owner})).to.be.fulfilled
        await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
        await expect(token.exchange(recipient, 33, 'FOO', 75, {from: nonOwner})).to.be.rejectedWith(evm.Throw)
      })
    })

    describe(`by exchanger`, () => {
      describe(`before minting has finished`, () => {
        it(`should not be possible`, async () => {
          const [owner, recipient, exchanger] = accounts
          const token = await PreSaleToken.new({from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(token.allowExchanger(exchanger, {from: owner})).to.be.rejectedWith(evm.Throw)
          await expect(token.exchange(recipient, 33, 'FOO', 75, {from: exchanger})).to.be.rejectedWith(evm.Throw)
        })
      })

      describe(`after minting has finished`, () => {
        it(`should transfer tokens to the exchanger address`, async () => {
          const [owner, recipient, exchanger] = accounts
          const token = await PreSaleToken.new({from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
          await expect(token.balanceOf.call(recipient)).to.eventually.bignumber.equal(100)
          await expect(token.balanceOf.call(exchanger)).to.eventually.bignumber.equal(0)
          await expect(token.exchange(recipient, 33, 'FOO', 75, {from: exchanger})).to.be.fulfilled
          await expect(token.balanceOf.call(recipient)).to.eventually.bignumber.equal(67)
          await expect(token.balanceOf.call(exchanger)).to.eventually.bignumber.equal(33)
        })

        it(`should fire Exchange event`, async () => {
          const [owner, recipient, exchanger] = accounts
          const token = await PreSaleToken.new({from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
          const {logs} = await expect(token.exchange(recipient, 33, 'FOO', 75, {from: exchanger})).to.be.fulfilled
          expect(logs.find(e => e.event === 'Exchange')).to.exist
        })

        it(`should fire Transfer event`, async () => {
          const [owner, recipient, exchanger] = accounts
          const token = await PreSaleToken.new({from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
          const {logs} = await expect(token.exchange(recipient, 33, 'FOO', 75, {from: exchanger})).to.be.fulfilled
          expect(logs.find(e => e.event === 'Transfer')).to.exist
        })

        it(`should not let transfer to another exchanger`, async () => {
          const [owner, exchanger, otherExchanger] = accounts
          const token = await PreSaleToken.new({from: owner})
          await expect(token.mint(otherExchanger, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
          await expect(token.allowExchanger(otherExchanger, {from: owner})).to.be.fulfilled
          await expect(token.exchange(otherExchanger, 33, 'FOO', 75, {from: exchanger})).to.be.rejectedWith(evm.Throw)
        })

        it(`should not let exchange for 0x0`, async () => {
          const [owner, exchanger, otherExchanger] = accounts
          const token = await PreSaleToken.new({from: owner})
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
          await expect(token.allowExchanger(otherExchanger, {from: owner})).to.be.fulfilled
          await expect(token.exchange(evm.ZERO, 33, 'FOO', 75, {from: exchanger})).to.be.rejectedWith(evm.Throw)
        })

        it(`should not allow 0 amount to be exchanged`, async () => {
          const [owner, recipient, exchanger] = accounts
          const token = await PreSaleToken.new({from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
          await expect(token.exchange(recipient, 0, 'FOO', 75, {from: exchanger})).to.be.rejectedWith(evm.Throw)
        })

        it(`should not allow more than available balance to be exchanged`, async () => {
          const [owner, recipient, exchanger] = accounts
          const token = await PreSaleToken.new({from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
          await expect(token.exchange(recipient, 101, 'FOO', 75, {from: exchanger})).to.be.rejectedWith(evm.Throw)
        })

        it(`should not change total supply`, async () => {
          const [owner, recipient, exchanger] = accounts
          const token = await PreSaleToken.new({from: owner})
          await expect(token.mint(recipient, 100, {from: owner})).to.be.fulfilled
          await expect(token.finishMinting({from: owner})).to.be.fulfilled
          await expect(token.totalSupply.call()).to.eventually.bignumber.equal(100)
          await expect(token.allowExchanger(exchanger, {from: owner})).to.be.fulfilled
          await expect(token.exchange(recipient, 33, 'FOO', 75, {from: exchanger})).to.be.fulfilled
          await expect(token.totalSupply.call()).to.eventually.bignumber.equal(100)
        })
      })
    })
  })
})
