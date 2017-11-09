pragma solidity 0.4.18;

import './lib/SafeMath.sol';


contract PreSaleToken {
    using SafeMath for uint256;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AllowExchanger(address indexed exchanger);
    event RevokeExchanger(address indexed exchanger);
    event Mint(address indexed to, uint256 amount);
    event MintFinished();
    event Exchange(address indexed from, uint256 exchangedValue, string symbol, uint256 grantedValue);
    event Transfer(address indexed from, address indexed to, uint256 value);

    /// The owner of the contract.
    address public owner;

    /// The total number of minted tokens, excluding destroyed tokens.
    uint256 public totalSupply;

    /// The token balance of each address.
    mapping(address => uint256) balances;

    /// The full list of addresses we have minted tokens for, stored for
    /// exchange purposes.
    address[] public holders;

    /// Whether the token is still mintable.
    bool public mintingFinished = false;

    /// Addresses allowed to exchange the presale tokens for the final
    /// and/or intermediary tokens.
    mapping(address => bool) public exchangers;

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    modifier onlyExchanger() {
        require(exchangers[msg.sender]);
        _;
    }

    function PreSaleToken() public {
        owner = msg.sender;
    }

    function allowExchanger(address _exchanger) onlyOwner public {
        require(mintingFinished);
        require(_exchanger != 0x0);
        require(!exchangers[_exchanger]);

        exchangers[_exchanger] = true;
        AllowExchanger(_exchanger);
    }

    function exchange(
        address _from,
        uint256 _amount,
        string _symbol,
        uint256 _grantedValue
    )
        onlyExchanger
        public
        returns (bool)
    {
        require(mintingFinished); // Always true due to exchangers requiring the same condition
        require(_from != 0x0);
        require(!exchangers[_from]);
        require(_amount > 0);
        require(_amount <= balances[_from]);

        balances[_from] = balances[_from].sub(_amount);
        balances[msg.sender] = balances[msg.sender].add(_amount);
        Exchange(
            _from,
            _amount,
            _symbol,
            _grantedValue
        );
        Transfer(_from, msg.sender, _amount);

        return true;
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
        holders.push(_to);
        Mint(_to, _amount);
        Transfer(0x0, _to, _amount);

        return true;
    }

    function revokeExchanger(address _exchanger) onlyOwner public {
        require(mintingFinished);
        require(_exchanger != 0x0);
        require(exchangers[_exchanger]);

        delete exchangers[_exchanger];
        RevokeExchanger(_exchanger);
    }

    function transferOwnership(address _to) onlyOwner public {
        require(_to != address(0));
        OwnershipTransferred(owner, _to);
        owner = _to;
    }

    function balanceOf(address _owner) public constant returns (uint256) {
        return balances[_owner];
    }
}
