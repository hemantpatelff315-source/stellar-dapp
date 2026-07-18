#![no_std]
//! Shared types, errors, and event definitions for the StellarFund platform.
//!
//! This crate is consumed by the `treasury`, `campaign`, and `factory`
//! contracts so that data structures and error codes stay consistent across
//! contract boundaries (which is essential for safe inter-contract calls).

use soroban_sdk::{contracterror, contracttype, Address, String};

/// Lifecycle state of a single campaign.
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CampaignStatus {
    /// Accepting donations and before the deadline.
    Active = 0,
    /// Goal met; creator may withdraw.
    Successful = 1,
    /// Deadline passed without meeting the goal; donors may refund.
    Failed = 2,
    /// Funds have been withdrawn by the creator.
    Withdrawn = 3,
    /// Manually closed by the creator before the deadline.
    Closed = 4,
}

/// Core on-chain representation of a campaign, shared between the factory
/// (registry) and the campaign contract (source of truth).
#[contracttype]
#[derive(Clone)]
pub struct Campaign {
    pub id: u64,
    pub creator: Address,
    pub title: String,
    pub description: String,
    pub goal: i128,
    pub raised: i128,
    pub deadline: u64,
    pub status: CampaignStatus,
    pub donors_count: u32,
    pub created_at: u64,
}

/// A single donation record, used to power refunds and transaction history.
#[contracttype]
#[derive(Clone)]
pub struct Donation {
    pub donor: Address,
    pub amount: i128,
    pub timestamp: u64,
}

/// Canonical error codes returned across all StellarFund contracts.
///
/// The numeric values are part of the public ABI — never reorder them.
#[contracterror]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    // ---- Generic ----
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    // ---- Validation ----
    InvalidAmount = 10,
    InvalidGoal = 11,
    InvalidDeadline = 12,
    InvalidTitle = 13,
    // ---- Campaign lifecycle ----
    CampaignNotFound = 20,
    CampaignNotActive = 21,
    CampaignExpired = 22,
    CampaignNotEnded = 23,
    GoalNotReached = 24,
    GoalAlreadyReached = 25,
    // ---- Funds ----
    NothingToWithdraw = 30,
    NothingToRefund = 31,
    AlreadyWithdrawn = 32,
    InsufficientTreasuryBalance = 33,
    // ---- Overflow / safety ----
    ArithmeticOverflow = 40,
    DuplicateOperation = 41,
}

/// Minimum donation, in stroops (1 XLM = 10_000_000 stroops).
pub const MIN_DONATION: i128 = 1_000_000; // 0.1 XLM
/// Minimum fundraising goal, in stroops.
pub const MIN_GOAL: i128 = 10_000_000; // 1 XLM
/// Maximum campaign duration in seconds (180 days).
pub const MAX_DURATION: u64 = 180 * 24 * 60 * 60;
/// Minimum campaign duration in seconds (1 hour).
pub const MIN_DURATION: u64 = 60 * 60;

/// Checked addition helper that maps overflow to a domain error instead of
/// panicking. Used everywhere funds are accumulated.
pub fn checked_add(a: i128, b: i128) -> Result<i128, Error> {
    a.checked_add(b).ok_or(Error::ArithmeticOverflow)
}

/// Checked subtraction helper.
pub fn checked_sub(a: i128, b: i128) -> Result<i128, Error> {
    a.checked_sub(b).ok_or(Error::ArithmeticOverflow)
}
