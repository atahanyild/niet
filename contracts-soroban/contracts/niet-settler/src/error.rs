use soroban_sdk::contracterror;

/// Errors emitted by NietSettler. Discriminant ranges:
/// 1000-1099 — pausable / generic role errors
/// 1100+    — Niet-specific
#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum NietSettlerError {
    // Init & auth
    NotInitialized = 1101,
    AlreadyInitialized = 1102,
    UnauthorizedAdmin = 1103,
    Paused = 1104,

    // CCTP message validation
    InvalidMessageFormat = 1200,
    InvalidBurnMessageFormat = 1201,
    UnsupportedMessageVersion = 1202,
    UnsupportedBurnMessageVersion = 1203,
    InvalidMintRecipient = 1204,
    NoTokensMinted = 1205,

    // hookData / NietIntent
    HookDataTooShort = 1300,
    InvalidNietMagic = 1301,
    UnsupportedIntentVersion = 1302,
    InvalidIntentPayload = 1303,

    // Condition evaluation
    UnknownConditionVariant = 1400,
    PoolReadFailed = 1401,

    // Action adapters
    UnknownActionVariant = 1500,
    BlendSupplyFailed = 1501,
    RefundBurnFailed = 1502,
    HoldTransferFailed = 1503,
}
