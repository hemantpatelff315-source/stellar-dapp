#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

struct Setup {
    env: Env,
    treasury: TreasuryContractClient<'static>,
    token: TokenClient<'static>,
    token_admin: StellarAssetClient<'static>,
    admin: Address,
    authorized: Address,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let authorized = Address::generate(&env);

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer.clone());
    let token = TokenClient::new(&env, &sac.address());
    let token_admin = StellarAssetClient::new(&env, &sac.address());

    let treasury_id = env.register(TreasuryContract, ());
    let treasury = TreasuryContractClient::new(&env, &treasury_id);
    treasury.initialize(&admin, &sac.address(), &authorized);

    Setup {
        env,
        treasury,
        token,
        token_admin,
        admin,
        authorized,
    }
}

#[test]
fn test_initialize_sets_config() {
    let s = setup();
    let cfg = s.treasury.get_config();
    assert_eq!(cfg.admin, s.admin);
    assert_eq!(cfg.authorized, s.authorized);
}

#[test]
fn test_double_initialize_fails() {
    let s = setup();
    let res = s
        .treasury
        .try_initialize(&s.admin, &s.token.address, &s.authorized);
    assert!(res.is_err());
}

#[test]
fn test_deposit_credits_balance() {
    let s = setup();
    let donor = Address::generate(&s.env);
    s.token_admin.mint(&donor, &100_000_000);

    let bal = s.treasury.deposit(&1, &donor, &50_000_000);
    assert_eq!(bal, 50_000_000);
    assert_eq!(s.treasury.get_balance(&1), 50_000_000);
    assert_eq!(s.token.balance(&donor), 50_000_000);
}

#[test]
fn test_deposit_accumulates() {
    let s = setup();
    let donor = Address::generate(&s.env);
    s.token_admin.mint(&donor, &100_000_000);
    s.treasury.deposit(&1, &donor, &20_000_000);
    s.treasury.deposit(&1, &donor, &30_000_000);
    assert_eq!(s.treasury.get_balance(&1), 50_000_000);
}

#[test]
fn test_deposit_isolated_per_campaign() {
    let s = setup();
    let donor = Address::generate(&s.env);
    s.token_admin.mint(&donor, &100_000_000);
    s.treasury.deposit(&1, &donor, &20_000_000);
    s.treasury.deposit(&2, &donor, &30_000_000);
    assert_eq!(s.treasury.get_balance(&1), 20_000_000);
    assert_eq!(s.treasury.get_balance(&2), 30_000_000);
}

#[test]
fn test_deposit_zero_fails() {
    let s = setup();
    let donor = Address::generate(&s.env);
    s.token_admin.mint(&donor, &100_000_000);
    let res = s.treasury.try_deposit(&1, &donor, &0);
    assert!(res.is_err());
}

#[test]
fn test_release_transfers_full_balance() {
    let s = setup();
    let donor = Address::generate(&s.env);
    let creator = Address::generate(&s.env);
    s.token_admin.mint(&donor, &100_000_000);
    s.treasury.deposit(&1, &donor, &80_000_000);

    let released = s.treasury.release(&1, &creator);
    assert_eq!(released, 80_000_000);
    assert_eq!(s.token.balance(&creator), 80_000_000);
    assert_eq!(s.treasury.get_balance(&1), 0);
}

#[test]
fn test_release_empty_fails() {
    let s = setup();
    let creator = Address::generate(&s.env);
    let res = s.treasury.try_release(&99, &creator);
    assert!(res.is_err());
}

#[test]
fn test_refund_partial_balance() {
    let s = setup();
    let donor = Address::generate(&s.env);
    s.token_admin.mint(&donor, &100_000_000);
    s.treasury.deposit(&1, &donor, &60_000_000);

    let remaining = s.treasury.refund(&1, &donor, &25_000_000);
    assert_eq!(remaining, 35_000_000);
    assert_eq!(s.token.balance(&donor), 65_000_000);
}

#[test]
fn test_refund_more_than_balance_fails() {
    let s = setup();
    let donor = Address::generate(&s.env);
    s.token_admin.mint(&donor, &100_000_000);
    s.treasury.deposit(&1, &donor, &10_000_000);
    let res = s.treasury.try_refund(&1, &donor, &20_000_000);
    assert!(res.is_err());
}

#[test]
fn test_set_authorized_updates_config() {
    let s = setup();
    let new_auth = Address::generate(&s.env);
    s.treasury.set_authorized(&new_auth);
    assert_eq!(s.treasury.get_config().authorized, new_auth);
}
