//! Strongly-typed contract events for the Campaign contract.
//!
//! Using `#[contractevent]` gives the frontend a stable, self-describing event
//! schema to stream over Soroban RPC (`getEvents`) for real-time updates.

use soroban_sdk::{contractevent, Address, String};

/// Emitted when a new campaign is registered.
#[contractevent]
pub struct CampaignCreated {
    #[topic]
    pub id: u64,
    pub creator: Address,
    pub title: String,
    pub goal: i128,
}

/// Emitted on every accepted donation.
#[contractevent]
pub struct DonationReceived {
    #[topic]
    pub id: u64,
    pub donor: Address,
    pub amount: i128,
    pub total_raised: i128,
}

/// Emitted once, when cumulative donations first meet or exceed the goal.
#[contractevent]
pub struct GoalReached {
    #[topic]
    pub id: u64,
    pub raised: i128,
    pub goal: i128,
}

/// Emitted when the creator withdraws funds from a successful campaign.
#[contractevent]
pub struct FundsWithdrawn {
    #[topic]
    pub id: u64,
    pub creator: Address,
    pub amount: i128,
}

/// Emitted when a donor is refunded from a failed campaign.
#[contractevent]
pub struct RefundIssued {
    #[topic]
    pub id: u64,
    pub donor: Address,
    pub amount: i128,
}

/// Emitted when a campaign is closed early by its creator.
#[contractevent]
pub struct CampaignClosed {
    #[topic]
    pub id: u64,
    pub creator: Address,
}
