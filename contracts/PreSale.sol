pragma solidity ^0.4.15;

import './lib/SafeMath.sol';
import './PreSaleToken.sol';

contract PreSale {
    using SafeMath for uint256;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TokenPurchase(address indexed purchaser, address indexed beneficiary, uint256 value, uint256 amount);
    event Pause();
    event Unpause();
    event Finalized();
    event Refunding();
    event Refunded(address indexed beneficiary, uint256 weiAmount);
    event Whitelisted(address indexed participant, bool allowed);

    /// The owner of the contract.
    address public owner;

    /// The token we're selling.
    PreSaleToken public token;

    /// The minimum goal to reach. If the goal is not reached, finishing
    /// the sale will enable refunds.
    uint256 public goal;

    /// The sale period.
    uint256 public startTime;
    uint256 public endTime;

    /// The numnber of tokens to mint per wei.
    uint256 public rate;

    /// The total number of wei raised. Note that the contract's balance may
    /// differ from this value if someone has decided to forcefully send us
    /// ether.
    uint256 public weiRaised;

    /// The wallet that will receive the contract's balance once the sale
    /// finishes and the minimum goal is met.
    address public wallet;

    /// The list of addresses that are allowed to participate in the sale.
    mapping(address => bool) public whitelisted;

    /// The amount of wei invested by each investor.
    mapping(address => uint256) deposited;

    /// An enumerable list of investors.
    address[] public investors;

    /// Whether the sale is paused.
    bool public paused = false;

    /// Whether the sale has finished.
    bool public finished = false;

    /// Whether we're accepting refunds.
    bool public refunding = false;

    /// The total number of wei refunded.
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
        require(whitelisted[_beneficiary]);
        require(whitelisted[msg.sender]);
        require(msg.value > 0);

        uint256 weiAmount = msg.value;
        uint256 tokens = weiAmount.mul(rate);

        deposited[_beneficiary] = deposited[_beneficiary].add(weiAmount);
        investors.push(_beneficiary);

        weiRaised = weiRaised.add(weiAmount);

        token.mint(_beneficiary, tokens);
        TokenPurchase(msg.sender, _beneficiary, weiAmount, tokens);
    }

    function depositOf(address _owner) public constant returns (uint256) {
        return deposited[_owner];
    }

    function finish() onlyOwner public {
        require(!finished);
        require(now > endTime);

        finished = true;
        token.finishMinting();

        if (weiRaised >= goal) {
            wallet.transfer(this.balance);
        } else {
            refunding = true;
            Refunding();
        }

        Finalized();
    }

    function pause() onlyOwner public {
        require(!paused);
        paused = true;
        Pause();
    }

    function unpause() onlyOwner public {
        require(paused);
        paused = false;
        Unpause();
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

    function whitelist(address _participant, bool _allowed) onlyOwner public {
        require(_participant != 0x0);
        require(whitelisted[_participant] != _allowed);

        whitelisted[_participant] = _allowed;
        Whitelisted(_participant, _allowed);
    }
}
