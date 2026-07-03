// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IPriceOracle.sol";

/**
 * @title LendingBorrowingV2
 * @notice Institution-grade extension of Circle's `LendingBorrowing` sample.
 *
 * @dev This is a *versioned* successor, not an edit of the deployed sample:
 *      every original concept (deposit cirBTC collateral, borrow USDC, repay,
 *      withdraw, owner-funded pool, collateral factor) is preserved, and five
 *      capabilities the sample explicitly lacked are layered on top:
 *
 *        1. Liquidation engine + live health factor, driven by a swappable
 *           price oracle ({IPriceOracle}). The sample valued cirBTC:USDC 1:1;
 *           this contract values collateral at the oracle price.
 *        2. Dynamic, utilization-based interest via a kinked rate curve,
 *           accrued through a global borrow index.
 *        3. On-chain credit score that modulates a user's personal collateral
 *           factor within conservative bounds.
 *        4. Multiple independent positions per user (the sample allowed one).
 *        5. Portfolio/treasury aggregation views.
 *
 *      Invariants preserved from the sample: collateral (cirBTC) and loan
 *      (USDC) tokens both use 8 decimals; all owner risk levers are bounded;
 *      checks-effects-interactions + reentrancy guards on every mutating path.
 *
 *      Units:
 *        - Ratio params (collateral factor, liquidation threshold, bonus,
 *          close factor, reserve factor) are in basis points (10000 = 100%).
 *        - Interest rates and utilization are WAD-scaled (1e18 = 100%).
 *        - Health factor is WAD-scaled (1e18 = 1.0). Debt-free positions
 *          report `type(uint256).max`.
 */
contract LendingBorrowingV2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Constants ──────────────────────────────────────────────────────
    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant SECONDS_PER_YEAR = 365 days;

    // Credit-score derivation constants (see {creditScore}).
    uint256 internal constant CREDIT_BASE = 500;
    uint256 internal constant CREDIT_MAX = 1000;
    uint256 internal constant REPAY_POINTS = 40; // per fully-repaid position
    uint256 internal constant REPAY_CAP = 300; // caps repay contribution
    uint256 internal constant VOLUME_CAP = 200; // caps volume contribution
    uint256 internal constant LIQ_PENALTY = 200; // per liquidation suffered
    // Ceiling check: CREDIT_BASE(500) + REPAY_CAP(300) + VOLUME_CAP(200) = CREDIT_MAX(1000),
    // so a spotless borrower can actually reach the max personal collateral factor.

    // ─── Types ──────────────────────────────────────────────────────────
    struct Position {
        uint256 collateral; // cirBTC locked (collateral-token base units)
        uint256 scaledDebt; // debt / borrowIndex at last touch (WAD-scaled principal)
        bool active;
    }

    struct CreditData {
        uint256 loansFullyRepaid; // positions brought to zero debt by repayment
        uint256 totalRepaidVolume; // cumulative USDC repaid (loan base units)
        uint256 liquidations; // times this user was liquidated
        uint256 loansOpened; // positions opened
    }

    // ─── Immutable config ───────────────────────────────────────────────
    IERC20 public immutable collateralToken; // cirBTC
    IERC20 public immutable lendingToken; // USDC
    uint256 internal immutable collateralUnit; // 10**collateralDecimals
    uint256 internal immutable loanUnit; // 10**loanDecimals

    // ─── Risk parameters (owner-configurable, bounded) ──────────────────
    IPriceOracle public oracle;
    uint256 public collateralFactorBps; // base borrow LTV, e.g. 5000 = 50%
    uint256 public maxCollateralFactorBps; // credit ceiling, e.g. 6500 = 65%
    uint256 public liquidationThresholdBps; // e.g. 8000 = 80%
    uint256 public liquidationBonusBps; // e.g. 800 = 8%
    uint256 public closeFactorBps; // max % of debt repaid per liquidation, e.g. 5000

    // ─── Interest-rate model (kinked; WAD-scaled per-year rates) ────────
    uint256 public baseRatePerYear; // e.g. 0.02e18 = 2%
    uint256 public slope1; // rate added linearly up to the kink
    uint256 public slope2; // steeper rate added above the kink
    uint256 public kink; // utilization inflection, WAD (e.g. 0.8e18)
    uint256 public reserveFactorBps; // supplier-side haircut for supplyAPY

    // ─── Interest accrual state ─────────────────────────────────────────
    uint256 public borrowIndex; // WAD; grows as interest accrues
    uint256 public lastAccrualTime;
    uint256 public totalScaledDebt; // sum of all positions' scaledDebt

    // ─── User state ─────────────────────────────────────────────────────
    mapping(address => Position[]) internal _positions;
    mapping(address => CreditData) public credit;

    // ─── Errors ─────────────────────────────────────────────────────────
    error ZeroAmount();
    error InvalidToken();
    error InvalidParam();
    error NoSuchPosition();
    error PositionInactive();
    error ExceedsBorrowLimit();
    error InsufficientLiquidity();
    error InsufficientCollateral();
    error ExceedsDebt();
    error NotLiquidatable();
    error PositionHealthy();
    error WouldBeUndercollateralized();

    // ─── Events ─────────────────────────────────────────────────────────
    event PositionOpened(address indexed user, uint256 indexed positionId);
    event CollateralDeposited(address indexed user, uint256 indexed positionId, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 indexed positionId, uint256 amount);
    event LoanTaken(address indexed user, uint256 indexed positionId, uint256 amount);
    event LoanRepaid(address indexed user, uint256 indexed positionId, uint256 amount, bool fullyRepaid);
    event Liquidation(
        address indexed liquidator,
        address indexed user,
        uint256 indexed positionId,
        uint256 repayAmount,
        uint256 collateralSeized
    );
    event PoolFunded(uint256 amount);
    event OracleUpdated(address indexed newOracle);
    event RiskParamsUpdated(
        uint256 collateralFactorBps,
        uint256 maxCollateralFactorBps,
        uint256 liquidationThresholdBps,
        uint256 liquidationBonusBps,
        uint256 closeFactorBps
    );
    event InterestRateParamsUpdated(
        uint256 baseRatePerYear,
        uint256 slope1,
        uint256 slope2,
        uint256 kink,
        uint256 reserveFactorBps
    );
    event InterestAccrued(uint256 borrowIndex, uint256 totalBorrows);
    event CreditUpdated(address indexed user, uint256 newScore);

    /**
     * @param _collateralToken cirBTC (collateral).
     * @param _lendingToken USDC (loan token).
     * @param _oracle Price feed implementing {IPriceOracle}.
     * @param _collateralFactorBps Base borrow LTV in bps (1..maxCollateralFactorBps).
     * @param _maxCollateralFactorBps Credit ceiling in bps (< liquidation threshold).
     * @param _liquidationThresholdBps Liquidation threshold in bps (> maxCollateralFactor, <= BPS).
     * @param _liquidationBonusBps Liquidator bonus in bps.
     * @param _closeFactorBps Max share of a position's debt repayable per liquidation.
     */
    constructor(
        address _collateralToken,
        address _lendingToken,
        address _oracle,
        uint256 _collateralFactorBps,
        uint256 _maxCollateralFactorBps,
        uint256 _liquidationThresholdBps,
        uint256 _liquidationBonusBps,
        uint256 _closeFactorBps
    ) {
        if (_collateralToken == address(0) || _lendingToken == address(0)) revert InvalidToken();
        if (_oracle == address(0)) revert InvalidParam();

        collateralToken = IERC20(_collateralToken);
        lendingToken = IERC20(_lendingToken);
        collateralUnit = 10 ** IERC20Metadata(_collateralToken).decimals();
        loanUnit = 10 ** IERC20Metadata(_lendingToken).decimals();

        oracle = IPriceOracle(_oracle);
        _setRiskParams(
            _collateralFactorBps,
            _maxCollateralFactorBps,
            _liquidationThresholdBps,
            _liquidationBonusBps,
            _closeFactorBps
        );

        // Sensible default kinked curve: 2% base, +8% to the 80% kink, +100% above.
        baseRatePerYear = 0.02e18;
        slope1 = 0.08e18;
        slope2 = 1.0e18;
        kink = 0.8e18;
        reserveFactorBps = 1000; // 10%

        borrowIndex = WAD;
        lastAccrualTime = block.timestamp;
    }

    // ─── Position lifecycle ─────────────────────────────────────────────

    /// @notice Open a new, empty position and return its id.
    function openPosition() external returns (uint256 positionId) {
        return _openPosition(msg.sender);
    }

    /**
     * @notice Open a position and deposit collateral into it in one call.
     * @param amount cirBTC to deposit (collateral base units). Requires prior approval.
     * @return positionId The new position's id.
     */
    function openPositionWithCollateral(uint256 amount)
        external
        nonReentrant
        returns (uint256 positionId)
    {
        if (amount == 0) revert ZeroAmount();
        positionId = _openPosition(msg.sender);
        _positions[msg.sender][positionId].collateral = amount;
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        emit CollateralDeposited(msg.sender, positionId, amount);
    }

    /// @notice Deposit cirBTC collateral into an existing position. Requires prior approval.
    function depositCollateral(uint256 positionId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Position storage p = _position(msg.sender, positionId);
        p.collateral += amount;
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        emit CollateralDeposited(msg.sender, positionId, amount);
    }

    /**
     * @notice Withdraw cirBTC that is not needed to back the position's debt.
     * @dev The position must remain within its (credit-adjusted) borrow limit
     *      after withdrawal — a stricter bar than the liquidation threshold.
     */
    function withdrawCollateral(uint256 positionId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accrue();
        Position storage p = _position(msg.sender, positionId);
        if (amount > p.collateral) revert InsufficientCollateral();

        uint256 debt = _debtOf(p);
        uint256 remainingCollateral = p.collateral - amount;
        if (debt > 0) {
            uint256 capacity =
                _collateralValue(remainingCollateral) * effectiveCollateralFactorBps(msg.sender) / BPS;
            if (capacity < debt) revert WouldBeUndercollateralized();
        }

        p.collateral = remainingCollateral;
        if (p.collateral == 0 && debt == 0) p.active = false;

        collateralToken.safeTransfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, positionId, amount);
    }

    /// @notice Borrow USDC against a position, up to its credit-adjusted limit.
    function takeLoan(uint256 positionId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accrue();
        Position storage p = _position(msg.sender, positionId);

        uint256 newDebt = _debtOf(p) + amount;
        uint256 capacity = _collateralValue(p.collateral) * effectiveCollateralFactorBps(msg.sender) / BPS;
        if (newDebt > capacity) revert ExceedsBorrowLimit();
        if (lendingToken.balanceOf(address(this)) < amount) revert InsufficientLiquidity();

        uint256 scaledDelta = _toScaled(amount);
        p.scaledDebt += scaledDelta;
        totalScaledDebt += scaledDelta;

        lendingToken.safeTransfer(msg.sender, amount);
        emit LoanTaken(msg.sender, positionId, amount);
    }

    /**
     * @notice Repay a position's USDC debt (partially or fully). Requires prior approval.
     * @dev Overpayment is capped at the outstanding debt, so callers can pass a
     *      generous amount to fully close a position whose debt is still ticking.
     */
    function repayLoan(uint256 positionId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accrue();
        Position storage p = _position(msg.sender, positionId);

        uint256 debt = _debtOf(p);
        if (debt == 0) revert ExceedsDebt();

        uint256 repay = amount > debt ? debt : amount;
        bool fullyRepaid = repay == debt;

        // Effects
        if (fullyRepaid) {
            totalScaledDebt -= p.scaledDebt;
            p.scaledDebt = 0;
            if (p.collateral == 0) p.active = false;
            CreditData storage c = credit[msg.sender];
            c.loansFullyRepaid += 1;
            c.totalRepaidVolume += repay;
            emit CreditUpdated(msg.sender, creditScore(msg.sender));
        } else {
            uint256 scaledDelta = _toScaled(repay);
            if (scaledDelta > p.scaledDebt) scaledDelta = p.scaledDebt; // dust guard
            p.scaledDebt -= scaledDelta;
            totalScaledDebt -= scaledDelta;
            credit[msg.sender].totalRepaidVolume += repay;
        }

        // Interaction
        lendingToken.safeTransferFrom(msg.sender, address(this), repay);
        emit LoanRepaid(msg.sender, positionId, repay, fullyRepaid);
    }

    // ─── Liquidation ────────────────────────────────────────────────────

    /**
     * @notice Liquidate an unhealthy position. Callable by anyone.
     * @dev The caller repays up to `closeFactor` of the position's USDC debt and
     *      receives collateral worth the repaid amount plus the liquidation
     *      bonus, at the oracle price. If the position lacks enough collateral to
     *      pay the full bonus, all remaining collateral is seized.
     * @param user Position owner.
     * @param positionId Position to liquidate.
     * @param repayAmount USDC the liquidator offers to repay (capped internally).
     */
    function liquidate(address user, uint256 positionId, uint256 repayAmount)
        external
        nonReentrant
    {
        if (repayAmount == 0) revert ZeroAmount();
        _accrue();
        Position storage p = _position(user, positionId);

        uint256 debt = _debtOf(p);
        if (debt == 0) revert ExceedsDebt();
        if (_healthFactor(p) >= WAD) revert PositionHealthy();

        uint256 maxRepay = debt * closeFactorBps / BPS;
        uint256 repay = repayAmount > maxRepay ? maxRepay : repayAmount;
        if (repay == 0) revert ZeroAmount();

        // Collateral to seize = repay value * (1 + bonus), converted to collateral units.
        uint256 seizeValueLoan = repay * (BPS + liquidationBonusBps) / BPS;
        uint256 seize = _loanValueToCollateral(seizeValueLoan);
        if (seize > p.collateral) seize = p.collateral;

        // Effects
        uint256 scaledDelta = _toScaled(repay);
        if (scaledDelta > p.scaledDebt) scaledDelta = p.scaledDebt;
        p.scaledDebt -= scaledDelta;
        totalScaledDebt -= scaledDelta;
        p.collateral -= seize;
        if (p.collateral == 0 && p.scaledDebt == 0) p.active = false;

        CreditData storage c = credit[user];
        c.liquidations += 1;
        emit CreditUpdated(user, creditScore(user));

        // Interactions
        lendingToken.safeTransferFrom(msg.sender, address(this), repay);
        collateralToken.safeTransfer(msg.sender, seize);
        emit Liquidation(msg.sender, user, positionId, repay, seize);
    }

    // ─── Owner actions ──────────────────────────────────────────────────

    /// @notice Fund the USDC lending pool. Requires prior approval.
    function fundPool(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        lendingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit PoolFunded(amount);
    }

    /// @notice Swap the price oracle (e.g. mock -> Chainlink adapter). See {IPriceOracle}.
    function setOracle(address newOracle) external onlyOwner {
        if (newOracle == address(0)) revert InvalidParam();
        oracle = IPriceOracle(newOracle);
        emit OracleUpdated(newOracle);
    }

    /// @notice Update all risk parameters atomically (bounds enforced).
    function setRiskParams(
        uint256 _collateralFactorBps,
        uint256 _maxCollateralFactorBps,
        uint256 _liquidationThresholdBps,
        uint256 _liquidationBonusBps,
        uint256 _closeFactorBps
    ) external onlyOwner {
        _setRiskParams(
            _collateralFactorBps,
            _maxCollateralFactorBps,
            _liquidationThresholdBps,
            _liquidationBonusBps,
            _closeFactorBps
        );
    }

    /// @notice Update the kinked interest-rate curve. Accrues first so the change is clean.
    function setInterestRateParams(
        uint256 _baseRatePerYear,
        uint256 _slope1,
        uint256 _slope2,
        uint256 _kink,
        uint256 _reserveFactorBps
    ) external onlyOwner {
        if (_kink == 0 || _kink >= WAD) revert InvalidParam();
        if (_reserveFactorBps > BPS) revert InvalidParam();
        _accrue();
        baseRatePerYear = _baseRatePerYear;
        slope1 = _slope1;
        slope2 = _slope2;
        kink = _kink;
        reserveFactorBps = _reserveFactorBps;
        emit InterestRateParamsUpdated(_baseRatePerYear, _slope1, _slope2, _kink, _reserveFactorBps);
    }

    // ─── Views: positions ───────────────────────────────────────────────

    /// @notice Number of positions (including closed ones) a user has ever opened.
    function positionCount(address user) external view returns (uint256) {
        return _positions[user].length;
    }

    /// @notice Raw stored fields of a position.
    function getPosition(address user, uint256 positionId)
        external
        view
        returns (uint256 collateral, uint256 scaledDebt, bool active)
    {
        Position storage p = _position(user, positionId);
        return (p.collateral, p.scaledDebt, p.active);
    }

    /**
     * @notice Frontend-friendly, fully-derived snapshot of a position.
     * @return collateral cirBTC locked (collateral base units).
     * @return debt Current USDC debt incl. accrued interest (loan base units).
     * @return collateralValueLoan Collateral value in USDC terms at the oracle price.
     * @return hf WAD-scaled HF (type(uint256).max if debt-free).
     * @return maxAdditionalBorrow Extra USDC borrowable right now (loan base units).
     * @return active Whether the position is open.
     */
    function getPositionDetails(address user, uint256 positionId)
        external
        view
        returns (
            uint256 collateral,
            uint256 debt,
            uint256 collateralValueLoan,
            uint256 hf,
            uint256 maxAdditionalBorrow,
            bool active
        )
    {
        Position storage p = _position(user, positionId);
        collateral = p.collateral;
        debt = _debtOf(p);
        collateralValueLoan = _collateralValue(p.collateral);
        hf = _healthFactor(p);
        uint256 capacity = collateralValueLoan * effectiveCollateralFactorBps(user) / BPS;
        maxAdditionalBorrow = capacity > debt ? capacity - debt : 0;
        active = p.active;
    }

    /// @notice Current USDC debt of a position, including accrued interest.
    function currentDebt(address user, uint256 positionId) external view returns (uint256) {
        return _debtOf(_position(user, positionId));
    }

    /// @notice WAD-scaled health factor of a position (type(uint256).max if debt-free).
    function healthFactor(address user, uint256 positionId) external view returns (uint256) {
        return _healthFactor(_position(user, positionId));
    }

    /// @notice True when a position is eligible for liquidation.
    function isLiquidatable(address user, uint256 positionId) external view returns (bool) {
        Position storage p = _position(user, positionId);
        return _debtOf(p) > 0 && _healthFactor(p) < WAD;
    }

    /// @notice Collateral value of a position, expressed in USDC at the oracle price.
    function collateralValue(address user, uint256 positionId) external view returns (uint256) {
        return _collateralValue(_position(user, positionId).collateral);
    }

    // ─── Views: portfolio / treasury ────────────────────────────────────

    /// @notice Aggregate collateral, debt and collateral value across a user's positions.
    function accountSummary(address user)
        external
        view
        returns (uint256 totalCollateral, uint256 totalDebtOut, uint256 totalCollateralValue)
    {
        Position[] storage arr = _positions[user];
        for (uint256 i = 0; i < arr.length; i++) {
            totalCollateral += arr[i].collateral;
            totalDebtOut += _debtOf(arr[i]);
            totalCollateralValue += _collateralValue(arr[i].collateral);
        }
    }

    /// @notice Aggregate WAD-scaled health factor across all of a user's positions.
    function accountHealthFactor(address user) external view returns (uint256) {
        Position[] storage arr = _positions[user];
        uint256 weightedCollateral;
        uint256 totalDebtOut;
        for (uint256 i = 0; i < arr.length; i++) {
            weightedCollateral += _collateralValue(arr[i].collateral) * liquidationThresholdBps / BPS;
            totalDebtOut += _debtOf(arr[i]);
        }
        if (totalDebtOut == 0) return type(uint256).max;
        return weightedCollateral * WAD / totalDebtOut;
    }

    // ─── Views: interest-rate model ─────────────────────────────────────

    /// @notice Total outstanding USDC borrows incl. accrued interest.
    function totalBorrows() public view returns (uint256) {
        return totalScaledDebt * _projectedBorrowIndex() / WAD;
    }

    /// @notice USDC available to borrow (idle pool cash).
    function poolLiquidity() external view returns (uint256) {
        return lendingToken.balanceOf(address(this));
    }

    /// @notice WAD-scaled pool utilization = borrows / (borrows + cash).
    function utilization() public view returns (uint256) {
        return _utilization(totalBorrows());
    }

    /// @notice Current borrow APR (WAD-scaled, 1e18 = 100%).
    function borrowAPR() external view returns (uint256) {
        return _borrowRatePerYear(utilization());
    }

    /// @notice Current supply APY (WAD-scaled) = borrowAPR * utilization * (1 - reserveFactor).
    function supplyAPY() external view returns (uint256) {
        uint256 u = utilization();
        uint256 rate = _borrowRatePerYear(u);
        return rate * u / WAD * (BPS - reserveFactorBps) / BPS;
    }

    /// @notice The live borrow index, projected to the current block.
    function currentBorrowIndex() external view returns (uint256) {
        return _projectedBorrowIndex();
    }

    // ─── Views: credit ──────────────────────────────────────────────────

    /**
     * @notice On-chain credit score in [0, 1000], derived purely from a user's
     *         repayment history: full repayments and volume raise it, being
     *         liquidated lowers it. Starts at {CREDIT_BASE} (500).
     */
    function creditScore(address user) public view returns (uint256) {
        CreditData storage c = credit[user];

        uint256 repayBonus = c.loansFullyRepaid * REPAY_POINTS;
        if (repayBonus > REPAY_CAP) repayBonus = REPAY_CAP;

        uint256 volumeBonus = _volumeBonus(c.totalRepaidVolume);
        uint256 penalty = c.liquidations * LIQ_PENALTY;

        uint256 raw = CREDIT_BASE + repayBonus + volumeBonus;
        uint256 score = raw > penalty ? raw - penalty : 0;
        if (score > CREDIT_MAX) score = CREDIT_MAX;
        return score;
    }

    /**
     * @notice A user's personal collateral factor (bps), scaled by credit score.
     * @dev Scores at or below {CREDIT_BASE} get the base factor. Above it, the
     *      factor rises linearly toward {maxCollateralFactorBps}, capped there.
     *      Always strictly below the liquidation threshold (enforced in setters).
     */
    function effectiveCollateralFactorBps(address user) public view returns (uint256) {
        uint256 score = creditScore(user);
        if (score <= CREDIT_BASE) return collateralFactorBps;
        uint256 extra =
            (maxCollateralFactorBps - collateralFactorBps) * (score - CREDIT_BASE) / (CREDIT_MAX - CREDIT_BASE);
        return collateralFactorBps + extra;
    }

    // ─── Internal: accrual & math ───────────────────────────────────────

    /// @dev Persist accrued interest into `borrowIndex` up to the current block.
    function _accrue() internal {
        uint256 dt = block.timestamp - lastAccrualTime;
        if (dt == 0) return;
        if (totalScaledDebt > 0) {
            uint256 debt = totalScaledDebt * borrowIndex / WAD;
            uint256 ratePerYear = _borrowRatePerYear(_utilization(debt));
            uint256 interestFactor = ratePerYear * dt / SECONDS_PER_YEAR; // WAD
            borrowIndex += borrowIndex * interestFactor / WAD;
        }
        lastAccrualTime = block.timestamp;
        emit InterestAccrued(borrowIndex, totalScaledDebt * borrowIndex / WAD);
    }

    /// @dev The borrow index projected to `block.timestamp` without writing state.
    function _projectedBorrowIndex() internal view returns (uint256) {
        uint256 dt = block.timestamp - lastAccrualTime;
        if (dt == 0 || totalScaledDebt == 0) return borrowIndex;
        uint256 debt = totalScaledDebt * borrowIndex / WAD;
        uint256 ratePerYear = _borrowRatePerYear(_utilization(debt));
        uint256 interestFactor = ratePerYear * dt / SECONDS_PER_YEAR;
        return borrowIndex + borrowIndex * interestFactor / WAD;
    }

    /// @dev Current debt of a position using the projected (live) index.
    function _debtOf(Position storage p) internal view returns (uint256) {
        if (p.scaledDebt == 0) return 0;
        return p.scaledDebt * _projectedBorrowIndex() / WAD;
    }

    /// @dev Convert a nominal loan amount to scaled-debt units at the live index.
    function _toScaled(uint256 amount) internal view returns (uint256) {
        return amount * WAD / _projectedBorrowIndex();
    }

    /// @dev WAD-scaled utilization for a given outstanding-borrow figure.
    function _utilization(uint256 debt) internal view returns (uint256) {
        if (debt == 0) return 0;
        uint256 cash = lendingToken.balanceOf(address(this));
        return debt * WAD / (debt + cash);
    }

    /// @dev Kinked borrow-rate curve, WAD-scaled per year.
    function _borrowRatePerYear(uint256 u) internal view returns (uint256) {
        if (u <= kink) {
            return baseRatePerYear + (u * slope1 / kink);
        }
        uint256 excess = u - kink;
        return baseRatePerYear + slope1 + (excess * slope2 / (WAD - kink));
    }

    /// @dev Collateral value expressed in loan (USDC) base units at the oracle price.
    function _collateralValue(uint256 collateralAmount) internal view returns (uint256) {
        if (collateralAmount == 0) return 0;
        uint256 price = oracle.getPrice();
        uint256 priceUnit = 10 ** oracle.decimals();
        return collateralAmount * price * loanUnit / (collateralUnit * priceUnit);
    }

    /// @dev Inverse of {_collateralValue}: loan-unit value -> collateral base units.
    function _loanValueToCollateral(uint256 loanValue) internal view returns (uint256) {
        uint256 price = oracle.getPrice();
        uint256 priceUnit = 10 ** oracle.decimals();
        return loanValue * collateralUnit * priceUnit / (loanUnit * price);
    }

    /// @dev WAD-scaled health factor for a position.
    function _healthFactor(Position storage p) internal view returns (uint256) {
        uint256 debt = _debtOf(p);
        if (debt == 0) return type(uint256).max;
        uint256 adjustedCollateral = _collateralValue(p.collateral) * liquidationThresholdBps / BPS;
        return adjustedCollateral * WAD / debt;
    }

    function _volumeBonus(uint256 volume) internal view returns (uint256) {
        if (volume >= 1000 * loanUnit) return VOLUME_CAP; // 200
        if (volume >= 100 * loanUnit) return 120;
        if (volume >= 10 * loanUnit) return 60;
        return 0;
    }

    // ─── Internal: helpers ──────────────────────────────────────────────

    function _openPosition(address user) internal returns (uint256 positionId) {
        positionId = _positions[user].length;
        _positions[user].push(Position({collateral: 0, scaledDebt: 0, active: true}));
        credit[user].loansOpened += 1;
        emit PositionOpened(user, positionId);
    }

    function _position(address user, uint256 positionId) internal view returns (Position storage) {
        Position[] storage arr = _positions[user];
        if (positionId >= arr.length) revert NoSuchPosition();
        Position storage p = arr[positionId];
        if (!p.active) revert PositionInactive();
        return p;
    }

    function _setRiskParams(
        uint256 _collateralFactorBps,
        uint256 _maxCollateralFactorBps,
        uint256 _liquidationThresholdBps,
        uint256 _liquidationBonusBps,
        uint256 _closeFactorBps
    ) internal {
        if (_collateralFactorBps == 0 || _collateralFactorBps > _maxCollateralFactorBps) revert InvalidParam();
        if (_maxCollateralFactorBps >= _liquidationThresholdBps) revert InvalidParam();
        if (_liquidationThresholdBps > BPS) revert InvalidParam();
        if (_liquidationBonusBps > BPS) revert InvalidParam();
        if (_closeFactorBps == 0 || _closeFactorBps > BPS) revert InvalidParam();

        collateralFactorBps = _collateralFactorBps;
        maxCollateralFactorBps = _maxCollateralFactorBps;
        liquidationThresholdBps = _liquidationThresholdBps;
        liquidationBonusBps = _liquidationBonusBps;
        closeFactorBps = _closeFactorBps;
        emit RiskParamsUpdated(
            _collateralFactorBps,
            _maxCollateralFactorBps,
            _liquidationThresholdBps,
            _liquidationBonusBps,
            _closeFactorBps
        );
    }
}
