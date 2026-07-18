#![no_std]
//! # Campaign Contract
//!
//! Source of truth for every campaign's state and the business logic for
//! donations, withdrawals, and refunds. It never custodies tokens itself —
//! all value moves through the [`Treasury`](../treasury) via inter-contract
//! calls, keeping custody isolated from logic.
//!
//! Inter-contract map:
//! - `Factory`  → calls `register` here to create a campaign.
//! - `Campaign` → calls `Treasury::{deposit,release,refund}` to move funds.

use soroban_sdk::{contract, contractimpl, contracttype, vec, Address, Env, String, Vec};
use stellarfund_shared::{
    checked_add, Campaign, CampaignStatus, Donation, Error, MAX_DURATION, MIN_DONATION,
    MIN_DURATION, MIN_GOAL,
};

mod interop;
use interop::TreasuryClient;

mod events;
use events::{
    CampaignClosed, CampaignCreated, DonationReceived, FundsWithdrawn, GoalReached, RefundIssued,
};

#[contracttype]
enum DataKey {
    Config,
    /// Auto-incrementing campaign id counter.
    NextId,
    /// Campaign record by id.
    Campaign(u64),
    /// A donor's cumulative contribution to a campaign (for refunds).
    Contribution(u64, Address),
    /// Ordered list of donations to a campaign (for history).
    Donations(u64),
    /// Set of donor addresses for a campaign (for counting/iteration).
    Donors(u64),
}

#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub admin: Address,
    pub factory: Address,
    pub treasury: Address,
}

#[contract]
pub struct CampaignContract;

#[contractimpl]
impl CampaignContract {
    /// Initialise with the admin, the factory permitted to create campaigns,
    /// and the treasury used for custody.
    pub fn initialize(
        env: Env,
        admin: Address,
        factory: Address,
        treasury: Address,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(
            &DataKey::Config,
            &Config {
                admin,
                factory,
                treasury,
            },
        );
        env.storage().instance().set(&DataKey::NextId, &1u64);
        Ok(())
    }

    /// Register a new campaign. Only the factory may call this — user-facing
    /// creation flows go through the factory so the registry stays consistent.
    pub fn register(
        env: Env,
        creator: Address,
        title: String,
        description: String,
        goal: i128,
        duration_secs: u64,
    ) -> Result<u64, Error> {
        let config = Self::load_config(&env)?;
        config.factory.require_auth();

        // ---- validation ----
        if goal < MIN_GOAL {
            return Err(Error::InvalidGoal);
        }
        if duration_secs < MIN_DURATION || duration_secs > MAX_DURATION {
            return Err(Error::InvalidDeadline);
        }
        if title.len() == 0 || title.len() > 100 {
            return Err(Error::InvalidTitle);
        }

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1);
        let now = env.ledger().timestamp();
        let campaign = Campaign {
            id,
            creator: creator.clone(),
            title: title.clone(),
            description,
            goal,
            raised: 0,
            deadline: now + duration_secs,
            status: CampaignStatus::Active,
            donors_count: 0,
            created_at: now,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(id), &campaign);
        env.storage()
            .persistent()
            .set(&DataKey::Donations(id), &vec![&env] as &Vec<Donation>);
        env.storage()
            .persistent()
            .set(&DataKey::Donors(id), &vec![&env] as &Vec<Address>);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        // Event: CampaignCreated
        CampaignCreated {
            id,
            creator,
            title,
            goal,
        }
        .publish(&env);
        Ok(id)
    }

    /// Donate `amount` to a campaign. Pulls funds into the treasury via an
    /// inter-contract call, then updates campaign state and emits events.
    pub fn donate(env: Env, campaign_id: u64, donor: Address, amount: i128) -> Result<(), Error> {
        donor.require_auth();
        if amount < MIN_DONATION {
            return Err(Error::InvalidAmount);
        }
        let config = Self::load_config(&env)?;
        let mut campaign = Self::load_campaign(&env, campaign_id)?;

        Self::sync_status(&env, &mut campaign);
        if campaign.status != CampaignStatus::Active {
            return Err(Error::CampaignNotActive);
        }
        if env.ledger().timestamp() >= campaign.deadline {
            return Err(Error::CampaignExpired);
        }

        // Inter-contract call: escrow the tokens in the treasury.
        let treasury = TreasuryClient::new(&env, &config.treasury);
        treasury.deposit(&campaign_id, &donor, &amount);

        // Update aggregate + per-donor accounting.
        campaign.raised = checked_add(campaign.raised, amount)?;

        let contrib_key = DataKey::Contribution(campaign_id, donor.clone());
        let prev: i128 = env.storage().persistent().get(&contrib_key).unwrap_or(0);
        if prev == 0 {
            campaign.donors_count += 1;
            let mut donors: Vec<Address> = env
                .storage()
                .persistent()
                .get(&DataKey::Donors(campaign_id))
                .unwrap();
            donors.push_back(donor.clone());
            env.storage()
                .persistent()
                .set(&DataKey::Donors(campaign_id), &donors);
        }
        env.storage()
            .persistent()
            .set(&contrib_key, &checked_add(prev, amount)?);

        // Append to donation history.
        let mut history: Vec<Donation> = env
            .storage()
            .persistent()
            .get(&DataKey::Donations(campaign_id))
            .unwrap();
        history.push_back(Donation {
            donor: donor.clone(),
            amount,
            timestamp: env.ledger().timestamp(),
        });
        env.storage()
            .persistent()
            .set(&DataKey::Donations(campaign_id), &history);

        // Event: DonationReceived
        DonationReceived {
            id: campaign_id,
            donor: donor.clone(),
            amount,
            total_raised: campaign.raised,
        }
        .publish(&env);

        // Event: GoalReached (fires once, on the crossing donation).
        if campaign.raised >= campaign.goal {
            campaign.status = CampaignStatus::Successful;
            GoalReached {
                id: campaign_id,
                raised: campaign.raised,
                goal: campaign.goal,
            }
            .publish(&env);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id), &campaign);
        Ok(())
    }

    /// Withdraw raised funds to the creator once the goal is met. Releases the
    /// full treasury escrow via an inter-contract call.
    pub fn withdraw(env: Env, campaign_id: u64) -> Result<i128, Error> {
        let config = Self::load_config(&env)?;
        let mut campaign = Self::load_campaign(&env, campaign_id)?;
        campaign.creator.require_auth();

        Self::sync_status(&env, &mut campaign);
        if campaign.status == CampaignStatus::Withdrawn {
            return Err(Error::AlreadyWithdrawn);
        }
        if campaign.raised < campaign.goal {
            return Err(Error::GoalNotReached);
        }

        let treasury = TreasuryClient::new(&env, &config.treasury);
        let amount = treasury.release(&campaign_id, &campaign.creator);

        campaign.status = CampaignStatus::Withdrawn;
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id), &campaign);

        // Event: FundsWithdrawn
        FundsWithdrawn {
            id: campaign_id,
            creator: campaign.creator.clone(),
            amount,
        }
        .publish(&env);
        Ok(amount)
    }

    /// Refund a donor's full contribution when a campaign has failed (deadline
    /// passed without reaching the goal).
    pub fn refund(env: Env, campaign_id: u64, donor: Address) -> Result<i128, Error> {
        donor.require_auth();
        let config = Self::load_config(&env)?;
        let mut campaign = Self::load_campaign(&env, campaign_id)?;

        Self::sync_status(&env, &mut campaign);
        if campaign.status != CampaignStatus::Failed {
            return Err(Error::GoalAlreadyReached);
        }

        let contrib_key = DataKey::Contribution(campaign_id, donor.clone());
        let contributed: i128 = env.storage().persistent().get(&contrib_key).unwrap_or(0);
        if contributed <= 0 {
            return Err(Error::NothingToRefund);
        }

        let treasury = TreasuryClient::new(&env, &config.treasury);
        treasury.refund(&campaign_id, &donor, &contributed);

        // Zero the contribution to prevent double-refund.
        env.storage().persistent().set(&contrib_key, &0i128);
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id), &campaign);

        // Event: RefundIssued
        RefundIssued {
            id: campaign_id,
            donor,
            amount: contributed,
        }
        .publish(&env);
        Ok(contributed)
    }

    /// Creator-initiated early close of an active campaign that has not yet
    /// met its goal. Marks it Failed so donors can refund.
    pub fn close(env: Env, campaign_id: u64) -> Result<(), Error> {
        let mut campaign = Self::load_campaign(&env, campaign_id)?;
        campaign.creator.require_auth();
        if campaign.status != CampaignStatus::Active {
            return Err(Error::CampaignNotActive);
        }
        campaign.status = CampaignStatus::Failed;
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id), &campaign);
        CampaignClosed {
            id: campaign_id,
            creator: campaign.creator.clone(),
        }
        .publish(&env);
        Ok(())
    }

    // ---- views ----

    /// Fetch a campaign, refreshing its computed status first.
    pub fn get_campaign(env: Env, campaign_id: u64) -> Result<Campaign, Error> {
        let mut campaign = Self::load_campaign(&env, campaign_id)?;
        Self::sync_status(&env, &mut campaign);
        Ok(campaign)
    }

    /// Donation history for a campaign.
    pub fn get_donations(env: Env, campaign_id: u64) -> Vec<Donation> {
        env.storage()
            .persistent()
            .get(&DataKey::Donations(campaign_id))
            .unwrap_or(vec![&env])
    }

    /// A single donor's cumulative contribution.
    pub fn get_contribution(env: Env, campaign_id: u64, donor: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Contribution(campaign_id, donor))
            .unwrap_or(0)
    }

    /// Total number of campaigns created so far.
    pub fn total_campaigns(env: Env) -> u64 {
        let next: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1);
        next - 1
    }

    // ---- internal ----

    fn load_config(env: &Env) -> Result<Config, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)
    }

    fn load_campaign(env: &Env, id: u64) -> Result<Campaign, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Campaign(id))
            .ok_or(Error::CampaignNotFound)
    }

    /// Transition Active campaigns to Successful/Failed based on the clock and
    /// funds raised. Idempotent and side-effect free on storage.
    fn sync_status(env: &Env, campaign: &mut Campaign) {
        if campaign.status != CampaignStatus::Active {
            return;
        }
        if campaign.raised >= campaign.goal {
            campaign.status = CampaignStatus::Successful;
        } else if env.ledger().timestamp() >= campaign.deadline {
            campaign.status = CampaignStatus::Failed;
        }
    }
}

mod test;
