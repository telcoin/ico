# Telcoin ICO

## Build requirements

* Yarn
* Node.js 8.6.0 or newer

## Testing

First, make sure you've installed development dependencies by running:

```bash
yarn
```

Next, start [`ganache-cli`](https://github.com/trufflesuite/ganache-cli):

```bash
make ganache
```

Finally, to run tests, simply execute:

```bash
make test
```

## Crowdsale

### Deployment

To deploy the TelcoinSale:

1. Run `make bundle` to create `./bundle/contracts/TelcoinSale.sol`.
2. In Parity's contract deployment view, load that file. Note that we're specifically avoiding `truffle deploy` to distance us from black magic as much as possible.
3. Deploy `Telcoin` first followed by `TelcoinSale`. Provide the arguments listed below.

#### `Telcoin` arguments

| Argument              | Value                                      | Meaning                                             |
|-----------------------|--------------------------------------------|-----------------------------------------------------|
| _distributor          | 0x8322C7E7C14B57Ff85947F28381421692A1cF267 | Our multisig wallet allocates distribution pools.   |

#### `TelcoinSale` arguments


| Argument              | Value                                      | Meaning                                             |
|-----------------------|--------------------------------------------|-----------------------------------------------------|
| _softCap              | 9000 ether                                 | Contract successful if 9000 ether received.         |
| _hardCap              | 22500 ether                                | Contract can finish early if 22500 ether received.  |
| _capFlex              | 1500                                       | Flexibly increase caps by 150% (250% total).        |
| _startTime            | 1513022400                                 | 2017-12-11T20:00:00.000Z                            |
| _endTime              | 1518379200                                 | 2018-02-11T20:00:00.000Z                            |
| _rate                 | 1                                          | For every wei, give 1 sale/bonus token.             |
| _wallet               | 0x8322C7E7C14B57Ff85947F28381421692A1cF267 | Our multisig wallet.                                |
| _telcoin              | 0x85e076361cc813A908Ff672F9BAd1541474402b2 | The address of the Telcoin ERC20 token contract.    |
| _bonusVestingStart    | 1518465600                                 | 2018-02-12T20:00:00.000Z                            |
| _bonusVestingDuration | 15552000                                   | 180 days.                                           |

### Expected flow

1. A `Telcoin` contract is created with a fixed total supply of `100,000,000,000.00` tokens, all of which are allocated to a multisig wallet for transfer to the various pools listed in the whitepaper.
2. A `TelcoinSale` contract is deployed with the arguments listed above. A non-zero value must be sent to the contract, which will then be sent to the wallet as a way to verify that the wallet is capable of actually receiving funds.
3. From the `Telcoin` contract, `25,000,000,000.00` tokens are transferred to the `TelcoinSale`. These tokens remain locked in the sale until it finishes.
4. It is not possible to participate in the sale until the sale starts.
5. Before or after the sale starts, the contract owner must call `.whitelist(address, uint256, uint256, uint32)` to whitelist investors one by one, or multiple at once by calling `.whitelistMany(address[], uint256, uint256, uint32)`.
6. Once the sale starts, whitelisted participants are able to either send Ether, or anyone can call `.buyTokens(address)` for a whitelisted address to purchase sale tokens.
    - Participants can also be allocated bonus tokens once their total contributions pass the whitelisted minimum amount. Bonus tokens will not be allocated earlier, but do apply retroactively once the minimum amount has been reached.
    - Additionally, owners can call `.registerAltPurchase(address, symbol, transactionId, weiAmount)` for a whitelisted address to register a purchase in an alternate currency. A transaction ID or another method of verification is provided in the `transactionId` argument, so that at the very least the existence of a transaction can be verified. These registered purchases are not eligible for direct refunds from the smart contract.
7. Our soft and hard cap are based on USD equivalent values. Should the USD/ETH exchange rate change considerably, we reserve the right to update the `capFlex` scale factor, which can either increase or decrease both the soft and hard cap. The effective caps have fixed minimum values and are calculated based on the formula `cap + cap * (1000 / capFlex)`.
8. Sent Ether is locked in the `TelcoinSale` until `.softCapReached()`, at which point due to it already being obvious that the sale will succeed and therefore no refunds will be issued, the contract owner will be able to `.withdraw()` the balance accumulated so far. This reduces the risk of the contract getting hacked, and/or the full amount of funds getting permanently locked in the contract due to an error interacting with the wallet.
9. Before `endTime` is reached, it is possible to extend the `TelcoinSale` by calling `extendTime(uint256)` with a desired time extension, no greater than 7 days from the original `endTime`.
10. Once the `TelcoinSale`'s `endTime` passes, the contract owner calls `.finish()` on the contract. This finishes the minting of both sale and bonus `TelcoinSaleToken`s, and depending on whether `softCapReached()`, may either cause a final withdrawal, or allow refunds to be processed by setting the `refunding` flag.
    - Alternatively, upon `.hardCapReached()` the sale can be finished early even if `endTime` has not been reached yet.
11. If the goal was not reached, anyone will be able to call `.refund(address)` for any participant address, which will transfer the total amount deposited for the participant address to the participant address (importantly, not to `msg.sender`). The `25,000,000,000.00` Telcoin are returned to the wallet.
    - Since we have no control over the wallet the investor used, there is a risk that an investor's wallet may have been rendered unusable by e.g. the Parity wallet suicide, or their fallback address may attempt to perform work that exceeds the gas stipend. For this reason, we implement an additional failsafe that allows all remaining funds to be withdrawn after 14 days have passed. Refunds can then be processed manually from the wallet, which requires trust, but is certainly better than potential loss of funds.
12. If the goal was reached, both the sale token and bonus token contracts are transferred a portion of the `TelcoinSale`'s `25,000,000,000.00` Telcoin, proportionate to the combined amount of sale and bonus tokens.
    - The sale token provides a `.redeem(address)` method that upon being called calculates the portion of sale tokens the address holds and transfers a full equivalent portion of the Telcoin held by the sale token contract to the address. This method can be called by anyone.
    - The bonus token provides a `.redeem(address)` method that upon being called calculates the portion of bonus tokens the address holds and the amount that has vested so far, on a linear scale. An equivalent portion of the `Telcoin` the bonus token contract holds is transferred to the address. This method can be called by anyone, and can be called multiple times during the vesting period.
    - Even after all participants have redeemed their Telcoin balances, a small amount of Telcoin may remain in the sale and bonus token contracts due to decimal rounding. This small number of tokens and/or token fractions is considered lost.

## Pre-sale

The pre-sale has finished and is no longer available for new purchases.

### Deployment

To deploy the Presale:

1. Run `make bundle` to create `./bundle/contracts/PreSale.sol`.
2. In Parity's contract deployment view, load that file. Note that we're specifically avoiding `truffle deploy` to distance us from black magic as much as possible.
3. Deploy and provide the following arguments:

| Argument   | Value                                      | Meaning                                   |
|------------|--------------------------------------------|-------------------------------------------|
| _goal      | 1 ether                                    | Contract successful if 1 ether received.  |
| _startTime | 1511899200                                 | 2017-11-28T20:00:00.000Z                  |
| _endTime   | 1512691200                                 | 2017-12-08T00:00:00.000Z                  |
| _rate      | 1                                          | For every wei, give 1 PreSale token.      |
| _wallet    | 0x8322C7E7C14B57Ff85947F28381421692A1cF267 | Our multisig wallet.                      |

### Expected flow

1. A `PreSale` contract is deployed with the agreed upon `goal`, `startTime`, `endTime`, `rate` and `wallet` arguments. These values were originally meant to be immutable, but following the Parity wallet suicide it was deemed necessary to have a method to change the wallet if needed. The `endTime` can also be extended by up to a maximum of 7 days as described below. A non-zero value must be sent to the contract, which will then be sent to the wallet as a way to verify that the wallet is capable of actually receiving funds.
2. It is not possible to participate in the sale until the sale starts.
3. Before or after the sale starts, the contract owner must call `.whitelist(address, uint256, uint32)` to whitelist investors one by one.
4. Once the sale starts, whitelisted participants are able to either send ether, or anyone can call `.buyTokens(address)` for a whitelisted address to purchase pre-sale tokens.
5. Sent Ether is locked in the `PreSale` until `.goalReached()`, at which point due to it already being obvious that the sale will succeed and therefore no refunds will be issued, the contract owner will be able to `.withdraw()` the balance accumulated so far in order to reduce the risk of either the contract getting hacked or the full amount of funds getting permanently locked in the contract due to an error interacting with the wallet.
6. Before `endTime` is reached, it is possible to extend the `PreSale` by calling `extendTime(uint256)` with a desired time extension, no greater than 7 days from the original `endTime`.
7. Once the `PreSale`'s `endTime` passes, the contract owner calls `.finish()` on the contract. This finishes the minting of `PreSaleToken`, and depending on whether `goalReached()` or not, may either cause a final withdrawal, or allow refunds to be processed by setting the `refunding` flag.
8. If the goal was not reached, anyone will be able to call `.refund(address)` for any participant address, which will transfer the total amount deposited for the participant address to the participant address (importantly, not to `msg.sender`).
    - Since we have no control over the wallet the investor used, there is a risk that an investor's wallet may have been rendered unusable by e.g. the Parity wallet suicide, or their fallback address may attempt to perform work that exceeds the gas stipend. For this reason, we implement an additional failsafe that allows all remaining funds to be withdrawn after 14 days have passed. Refunds can then be processed manually from the wallet, which requires trust, but is certainly better than potential loss of funds.
9. If the goal was reached, the contract owner gains ownership of the `PreSaleToken` contract.
10. The token owner is able to `.allowExchanger(address)` to add a trusted "exchanger" contract to the token contract.
11. The exchanger has an e.g. `.redeem(address)` method, which calls `.balanceOf(address)` on the pre-sale token, calculates the amount of final or intermediary tokens to grant for their balance, and calls `.exchange(address, uint256, string, uint256)` to transfer the participant's pre-sale token balance to the exchanger's address. The exchanger should then grant the previously calculated amount of tokens to the participant. This requires a degree of trust from the participant, as the exchanger is able to make any decision based on the pre-sale token balance or any other factor.
