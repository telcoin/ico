.PHONY: default build test

default: build

build:
	./node_modules/.bin/truffle compile

test:
	./node_modules/.bin/truffle test
