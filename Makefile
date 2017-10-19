.PHONY: default build lint test

default: build

build:
	./node_modules/.bin/truffle compile

lint:
	./node_modules/.bin/solium -d contracts

test: lint
	./node_modules/.bin/truffle test
