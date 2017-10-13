pragma solidity ^0.4.15;

import './lib/SafeMath.sol';
import './PreSaleToken.sol';

contract PreSale {
    using SafeMath for uint256;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TokenPurchase(address indexed purchaser, address indexed beneficiary, uint256 value, uint256 amount);
    event Finalized();
    event Refunding();
    event Refunded(address indexed beneficiary, uint256 weiAmount);

    address public owner;
    PreSaleToken public token;
    uint256 public goal;
    uint256 public startTime;
    uint256 public endTime;
    uint256 public rate;
    uint256 public weiRaised;
    address public wallet;
    mapping(address => uint256) deposited;
    address[] public investors;
    bool public paused = false;
    bool public finished = false;
    bool public refunding = false;
    uint256 public weiRefunded;

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    modifier saleOpen() {
        require(now >= startTime);
        require(now <= endTime);
        require(!paused);
        require(!finished);
        _;
    }

    function PreSale(uint256 _goal, uint256 _startTime, uint256 _endTime, uint256 _rate, address _wallet) {
        require(_goal > 0);
        require(_startTime >= now);
        require(_endTime >= _startTime);
        require(_rate > 0);
        require(_wallet != 0x0);

        owner = msg.sender;
        goal = _goal;
        startTime = _startTime;
        endTime = _endTime;
        rate = _rate;
        wallet = _wallet;
        token = new PreSaleToken();
    }

    function () payable {
        buyTokens(msg.sender);
    }

    function buyTokens(address _beneficiary) saleOpen public payable {
        require(_beneficiary != address(0));
        require(msg.value > 0);

        uint256 weiAmount = msg.value;
        uint256 tokens = weiAmount.mul(rate);

        deposited[_beneficiary] = deposited[_beneficiary].add(weiAmount);
        investors.push(_beneficiary);

        weiRaised = weiRaised.add(weiAmount);

        token.mint(_beneficiary, tokens);
        TokenPurchase(msg.sender, _beneficiary, weiAmount, tokens);

        wallet.transfer(weiAmount);
    }

    function finish() onlyOwner public {
        require(!finished);
        require(now > endTime);

        if (weiRaised >= goal) {
            refunding = true;
            Refunding();
        }

        Finalized();

        finished = true;
    }

    function refund(address _investor) public {
        require(finished);
        require(refunding);
        require(deposited[_investor] > 0);

        uint256 weiAmount = deposited[_investor];
        deposited[_investor] = 0;
        _investor.transfer(weiAmount);

        weiRefunded = weiRefunded.add(weiAmount);

        Refunded(_investor, weiAmount);
    }

    function transferOwnership(address _to) onlyOwner public {
        require(_to != address(0));
        OwnershipTransferred(owner, _to);
        owner = _to;
    }
}
