// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IPriceOracle
 * @notice Minimal price-feed interface consumed by {LendingBorrowingV2}.
 *
 * @dev This is the swappable oracle seam. The protocol never talks to a
 *      concrete feed directly — it only depends on this interface, so the
 *      owner can point it at any implementation:
 *
 *        - {MockPriceOracle} on testnet, where the owner nudges the price to
 *          demonstrate health-factor movement and liquidations.
 *        - A Chainlink-backed adapter on mainnet. Chainlink's
 *          AggregatorV3Interface exposes `latestRoundData()` (which returns an
 *          `int256 answer`) and `decimals()`; a thin adapter that returns
 *          `uint256(answer)` from {getPrice} and forwards {decimals} satisfies
 *          this interface with no protocol changes. See ARCHITECTURE.md
 *          § "Oracle seam".
 *
 *      `getPrice()` returns the price of ONE whole collateral token (cirBTC)
 *      denominated in USD, scaled by 10**decimals(). For example, at a
 *      cirBTC price of $100,000 with 8 decimals, `getPrice()` returns
 *      100000 * 1e8 = 1e13.
 */
interface IPriceOracle {
    /// @notice Price of one whole collateral token in USD, scaled by 10**decimals().
    function getPrice() external view returns (uint256);

    /// @notice Number of decimals the price is scaled by (Chainlink USD feeds use 8).
    function decimals() external view returns (uint8);
}
