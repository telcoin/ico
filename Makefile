.PHONY: default build lint test coverage bundle

GNOSIS := vendor/GnosisMultiSigWallet

default: build

build:
	npm run truffle -- compile

lint:
	npm run solium -- -d contracts

test: lint
	npm run truffle -- test

coverage: lint
	npm run solidity-coverage

ganache:
	npm run ganache-cli

bundle:
	mkdir -p bundle/contracts
	rm -f bundle/contracts/Wallet.sol
	cat $(GNOSIS)/contracts/MultiSigWallet.sol >> bundle/contracts/Wallet.sol
	sed '/^$$/,$$!d' $(GNOSIS)/contracts/MultiSigWalletWithDailyLimit.sol >> bundle/contracts/Wallet.sol
	rm -f bundle/contracts/PreSale.sol
	cat contracts/lib/SafeMath.sol >> bundle/contracts/PreSale.sol
	echo >> bundle/contracts/PreSale.sol
	echo >> bundle/contracts/PreSale.sol
	sed '/contract/,$$!d' contracts/PreSaleToken.sol >> bundle/contracts/PreSale.sol
	echo >> bundle/contracts/PreSale.sol
	echo >> bundle/contracts/PreSale.sol
	sed '/contract/,$$!d' contracts/PreSale.sol >> bundle/contracts/PreSale.sol
	rm -f bundle/contracts/TelcoinSale.sol
	cat contracts/lib/SafeMath.sol >> bundle/contracts/TelcoinSale.sol
	echo >> bundle/contracts/TelcoinSale.sol
	echo >> bundle/contracts/TelcoinSale.sol
	sed '/contract/,$$!d' contracts/Telcoin.sol >> bundle/contracts/TelcoinSale.sol
	echo >> bundle/contracts/TelcoinSale.sol
	echo >> bundle/contracts/TelcoinSale.sol
	sed '/contract/,$$!d' contracts/TelcoinSaleToken.sol >> bundle/contracts/TelcoinSale.sol
	echo >> bundle/contracts/TelcoinSale.sol
	echo >> bundle/contracts/TelcoinSale.sol
	sed '/contract/,$$!d' contracts/TelcoinSale.sol >> bundle/contracts/TelcoinSale.sol
	rm -f bundle/contracts/Telcoin.sol
	cat contracts/lib/SafeMath.sol >> bundle/contracts/Telcoin.sol
	echo >> bundle/contracts/Telcoin.sol
	echo >> bundle/contracts/Telcoin.sol
	sed '/contract/,$$!d' contracts/Telcoin.sol >> bundle/contracts/Telcoin.sol
	cat contracts/lib/SafeMath.sol > bundle/contracts/TelcoinSaleKYCEscrow.sol
	echo >> bundle/contracts/TelcoinSaleKYCEscrow.sol
	echo >> bundle/contracts/TelcoinSaleKYCEscrow.sol
	sed '/contract/,$$!d' contracts/Telcoin.sol >> bundle/contracts/TelcoinSaleKYCEscrow.sol
	echo >> bundle/contracts/TelcoinSaleKYCEscrow.sol
	echo >> bundle/contracts/TelcoinSaleKYCEscrow.sol
	sed '/contract/,$$!d' contracts/TelcoinSaleToken.sol >> bundle/contracts/TelcoinSaleKYCEscrow.sol
	echo >> bundle/contracts/TelcoinSaleKYCEscrow.sol
	echo >> bundle/contracts/TelcoinSaleKYCEscrow.sol
	sed '/contract/,$$!d' contracts/TelcoinSale.sol >> bundle/contracts/TelcoinSaleKYCEscrow.sol
	echo >> bundle/contracts/TelcoinSaleKYCEscrow.sol
	echo >> bundle/contracts/TelcoinSaleKYCEscrow.sol
	sed '/contract/,$$!d' contracts/TelcoinSaleKYCEscrow.sol >> bundle/contracts/TelcoinSaleKYCEscrow.sol
	cat contracts/lib/SafeMath.sol > bundle/contracts/TelcoinSaleCapEscrow.sol
	echo >> bundle/contracts/TelcoinSaleCapEscrow.sol
	echo >> bundle/contracts/TelcoinSaleCapEscrow.sol
	sed '/contract/,$$!d' contracts/TelcoinSaleCapEscrow.sol >> bundle/contracts/TelcoinSaleCapEscrow.sol
