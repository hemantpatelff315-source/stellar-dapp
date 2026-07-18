#![no_std]
//! # Treasury Contract
//!
//! The Treasury is the custody layer of StellarFund. It escrows all donated
//! tokens on behalf of individual campaigns and is the **only** contract that
//! ever moves the underlying token.
//!
//! Security model:
//! - A single `authorized` contract address (the Campaign contract) is
//!   permitted to move funds. Because a contract automatically authorises the
//!   sub-calls it makes, the Treasury only ever trusts the audited Campaign
//!   contract — never an arbitrary caller.
//! - Every campaign has an isolated balance ledger. One campaign can never
//!   spend another campaign's escrow.
//! - All arithmetic is checked; overflow maps to an error, never a panic.
//! - Checks-effects-interactions ordering guards against reentrancy on payout.

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};
use stellarfund_shared::{checked_add, checked_sub, Error};

#[contracttype]
enum DataKey {
    /// Global config (admin + token + authorised mover).
    Config,
    /// Escrow balance for a given campaign id.
    Balance(u64),
}

#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub admin: Address,
    pub token: Address,
    /// The Campaign contract permitted to move escrowed funds.
    pub authorized: Address,
}

#[contract]
pub struct TreasuryContract;

#[contractimpl]
impl TreasuryContract {
    /// Initialise the treasury with an admin, the token it will custody, and
    /// the `authorized` contract (Campaign) permitted to move funds.
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        authorized: Address,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(
            &DataKey::Config,
            &Config {
                admin,
                token,
                authorized,
            },
        );
        Ok(())
    }

    /// Update the authorised mover. Admin-only; enables rotating the Campaign
    /// contract after an upgrade without redeploying the treasury.
    pub fn set_authorized(env: Env, authorized: Address) -> Result<(), Error> {
        let mut config = Self::load_config(&env)?;
        config.admin.require_auth();
        config.authorized = authorized;
        env.storage().instance().set(&DataKey::Config, &config);
        Ok(())
    }

    /// Pull `amount` of the token from `from` into the treasury and credit the
    /// campaign's escrow balance. Called by the Campaign contract when a
    /// donation is received.
    pub fn deposit(env: Env, campaign_id: u64, from: Address, amount: i128) -> Result<i128, Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let config = Self::load_config(&env)?;
        config.authorized.require_auth();
        from.require_auth();

        // Move real tokens into custody first; if this fails the whole tx
        // reverts and no balance is credited.
        let client = token::TokenClient::new(&env, &config.token);
        let treasury = env.current_contract_address();
        client.transfer(&from, &treasury, &amount);
        let current = Self::balance_of(&env, campaign_id);
        let updated = checked_add(current, amount)?;
        env.storage()
            .persistent()
            .set(&DataKey::Balance(campaign_id), &updated);
        Ok(updated)
    }

    /// Release the full escrow balance of a successful campaign to `to`
    /// (the creator). Only the authorised contract may trigger this.
    pub fn release(env: Env, campaign_id: u64, to: Address) -> Result<i128, Error> {
        let config = Self::load_config(&env)?;
        config.authorized.require_auth();

        let balance = Self::balance_of(&env, campaign_id);
        if balance <= 0 {
            return Err(Error::NothingToWithdraw);
        }

        // Zero the ledger before transferring (checks-effects-interactions).
        env.storage()
            .persistent()
            .set(&DataKey::Balance(campaign_id), &0i128);

        let client = token::TokenClient::new(&env, &config.token);
        client.transfer(&env.current_contract_address(), &to, &balance);
        Ok(balance)
    }

    /// Refund `amount` from a failed campaign's escrow back to a donor.
    /// Only the authorised contract may trigger this.
    pub fn refund(env: Env, campaign_id: u64, to: Address, amount: i128) -> Result<i128, Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let config = Self::load_config(&env)?;
        config.authorized.require_auth();

        let balance = Self::balance_of(&env, campaign_id);
        if amount > balance {
            return Err(Error::InsufficientTreasuryBalance);
        }
        let remaining = checked_sub(balance, amount)?;
        env.storage()
            .persistent()
            .set(&DataKey::Balance(campaign_id), &remaining);

        let client = token::TokenClient::new(&env, &config.token);
        client.transfer(&env.current_contract_address(), &to, &amount);
        Ok(remaining)
    }

    /// Read the escrow balance for a campaign.
    pub fn get_balance(env: Env, campaign_id: u64) -> i128 {
        Self::balance_of(&env, campaign_id)
    }

    /// Read the treasury configuration.
    pub fn get_config(env: Env) -> Result<Config, Error> {
        Self::load_config(&env)
    }

    // ---- internal helpers ----

    fn load_config(env: &Env) -> Result<Config, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)
    }

    fn balance_of(env: &Env, campaign_id: u64) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(campaign_id))
            .unwrap_or(0)
    }
}

mod test;
