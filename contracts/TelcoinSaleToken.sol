pragma solidity 0.4.18;

import "./lib/SafeMath.sol";
import "./Telcoin.sol";


contract TelcoinSaleToken {
    using SafeMath for uint256;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Mint(address indexed to, uint256 amount);
    event MintFinished();
    event Redeem(address indexed beneficiary, uint256 sacrificedValue, uint256 grantedValue);
    event Transfer(address indexed from, address indexed to, uint256 value);

    /// The owner of the contract.
    address public owner;

    /// The total number of minted tokens, excluding destroyed tokens.
    uint256 public totalSupply;

    /// The token balance and released amount of each address.
    mapping(address => uint256) balances;
    mapping(address => uint256) redeemed;

    /// Whether the token is still mintable.
    bool public mintingFinished = false;

    /// Redeemable telcoin.
    Telcoin telcoin;
    uint256 public totalRedeemed;

    /// Vesting period.
    uint256 vestingStart;
    uint256 vestingDuration;

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    function TelcoinSaleToken(
        Telcoin _telcoin,
        uint256 _vestingStart,
        uint256 _vestingDuration
    )
        public
    {
        owner = msg.sender;
        telcoin = _telcoin;
        vestingStart = _vestingStart;
        vestingDuration = _vestingDuration;
    }

    function finishMinting() onlyOwner public returns (bool) {
        require(!mintingFinished);

        mintingFinished = true;
        MintFinished();

        return true;
    }

    function mint(address _to, uint256 _amount) onlyOwner public returns (bool) {
        require(_to != 0x0);
        require(!mintingFinished);
        require(_amount > 0);

        totalSupply = totalSupply.add(_amount);
        balances[_to] = balances[_to].add(_amount);
        Mint(_to, _amount);
        Transfer(0x0, _to, _amount);

        return true;
    }

    function redeemMany(address[] _beneficiaries) public {
        for (uint256 i = 0; i < _beneficiaries.length; i++) {
            redeem(_beneficiaries[i]);
        }
    }

    function redeem(address _beneficiary) public returns (uint256) {
        require(mintingFinished);
        require(_beneficiary != 0x0);

        uint256 balance = redeemableBalance(_beneficiary);
        if (balance == 0) {
            return 0;
        }

        uint256 totalDistributable = telcoin.balanceOf(this).add(totalRedeemed);

        // Avoid loss of precision by multiplying and later dividing by
        // a large value.
        uint256 amount = balance.mul(10 ** 18).div(totalSupply).mul(totalDistributable).div(10 ** 18);

        balances[_beneficiary] = balances[_beneficiary].sub(balance);
        redeemed[_beneficiary] = redeemed[_beneficiary].add(balance);
        balances[telcoin] = balances[telcoin].add(balance);
        totalRedeemed = totalRedeemed.add(amount);

        Transfer(_beneficiary, telcoin, balance);
        Redeem(_beneficiary, balance, amount);

        telcoin.transfer(_beneficiary, amount);

        return amount;
    }

    function transferOwnership(address _to) onlyOwner public {
        require(_to != address(0));
        OwnershipTransferred(owner, _to);
        owner = _to;
    }

    function balanceOf(address _owner) public constant returns (uint256) {
        return balances[_owner];
    }

    function redeemableBalance(address _beneficiary) public constant returns (uint256) {
        return vestedBalance(_beneficiary).sub(redeemed[_beneficiary]);
    }

    function vestedBalance(address _beneficiary) public constant returns (uint256) {
        uint256 currentBalance = balances[_beneficiary];
        uint256 totalBalance = currentBalance.add(redeemed[_beneficiary]);

        if (now < vestingStart) {
            return 0;
        }

        if (now >= vestingStart.add(vestingDuration)) {
            return totalBalance;
        }

        return totalBalance.mul(now.sub(vestingStart)).div(vestingDuration);
    }
}
