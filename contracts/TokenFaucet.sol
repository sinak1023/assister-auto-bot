// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IMintable {
    function allocateTo(address to, uint256 value) external;
}

/**
 * @title TokenFaucet
 * @notice Rate-limited testnet faucet. Each wallet can claim a fixed amount of
 *         a token once per cooldown window (default 24h). The faucet is an
 *         authorized minter on the {TestnetERC20} tokens, and — because those
 *         tokens gate minting to authorized minters — this is the only way a
 *         normal user can obtain test tokens, so the limits actually hold.
 */
contract TokenFaucet is Ownable {
    /// @notice Cooldown between claims of the same token, per wallet.
    uint256 public cooldown;

    /// @notice Fixed amount minted per claim, per token (0 = token not supported).
    mapping(address => uint256) public dripAmount;

    /// @notice Last claim timestamp: token => user => timestamp.
    mapping(address => mapping(address => uint256)) public lastClaim;

    error TokenNotSupported();
    error CooldownActive(uint256 secondsRemaining);

    event Claimed(address indexed token, address indexed user, uint256 amount);
    event DripConfigured(address indexed token, uint256 amount);
    event CooldownUpdated(uint256 cooldown);

    constructor(uint256 _cooldown) {
        cooldown = _cooldown;
        emit CooldownUpdated(_cooldown);
    }

    /// @notice Configure the per-claim amount for a token (owner only).
    function setDrip(address token, uint256 amount) external onlyOwner {
        dripAmount[token] = amount;
        emit DripConfigured(token, amount);
    }

    /// @notice Update the cooldown window (owner only).
    function setCooldown(uint256 _cooldown) external onlyOwner {
        cooldown = _cooldown;
        emit CooldownUpdated(_cooldown);
    }

    /// @notice Claim the fixed drip amount of `token`. Reverts if still cooling down.
    function claim(address token) external {
        uint256 amount = dripAmount[token];
        if (amount == 0) revert TokenNotSupported();

        uint256 last = lastClaim[token][msg.sender];
        if (last != 0 && block.timestamp < last + cooldown) {
            revert CooldownActive(last + cooldown - block.timestamp);
        }

        lastClaim[token][msg.sender] = block.timestamp;
        IMintable(token).allocateTo(msg.sender, amount);
        emit Claimed(token, msg.sender, amount);
    }

    /// @notice Seconds until `user` can claim `token` again (0 = claimable now).
    function claimableIn(address token, address user) external view returns (uint256) {
        uint256 last = lastClaim[token][user];
        if (last == 0 || block.timestamp >= last + cooldown) return 0;
        return last + cooldown - block.timestamp;
    }
}
