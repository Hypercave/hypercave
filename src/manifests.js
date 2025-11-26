import { CONFIG } from './config.js';

/**
 * Build transaction manifest for IN CAVE (deposit resources)
 * 
 * @param {string} accountAddress - User's account address
 * @param {string} nftCollection - NFT collection resource address
 * @param {string} nftId - NFT local ID (e.g., "#1#", "<uuid>", "{ruid}")
 * @param {Array<{resourceAddress: string, amount: string}>} resources - Resources to deposit
 * @returns {string} - Transaction manifest
 */
export function buildInCaveManifest(accountAddress, nftCollection, nftId, resources) {
  // Create proof of NFT
  let manifest = `
CALL_METHOD
  Address("${accountAddress}")
  "create_proof_of_non_fungibles"
  Address("${nftCollection}")
  Array<NonFungibleLocalId>(NonFungibleLocalId("${nftId}"))
;

POP_FROM_AUTH_ZONE
  Proof("nft_proof")
;
`;

  // Withdraw each resource and take into named bucket
  resources.forEach((resource, index) => {
    manifest += `
CALL_METHOD
  Address("${accountAddress}")
  "withdraw"
  Address("${resource.resourceAddress}")
  Decimal("${resource.amount}")
;

TAKE_FROM_WORKTOP
  Address("${resource.resourceAddress}")
  Decimal("${resource.amount}")
  Bucket("bucket_${index}")
;
`;
  });

  // Build bucket array for in_cave call
  const bucketArray = resources
    .map((_, index) => `Bucket("bucket_${index}")`)
    .join(', ');

  // Call in_cave with proof and buckets
  manifest += `
CALL_METHOD
  Address("${CONFIG.componentAddress}")
  "in_cave"
  Proof("nft_proof")
  Array<Bucket>(${bucketArray})
;
`;

  return manifest.trim();
}

/**
 * Build transaction manifest for OUT CAVE (withdraw resources)
 * 
 * @param {string} accountAddress - User's account address
 * @param {string} nftCollection - NFT collection resource address
 * @param {string} nftId - NFT local ID
 * @param {Array<{resourceAddress: string, amount: string}>} withdrawals - Resources to withdraw
 * @returns {string} - Transaction manifest
 */
export function buildOutCaveManifest(accountAddress, nftCollection, nftId, withdrawals) {
  // Build withdrawal tuples: Array<Tuple<Address, Decimal>>
  const withdrawalTuples = withdrawals
    .map(w => `Tuple(Address("${w.resourceAddress}"), Decimal("${w.amount}"))`)
    .join(', ');

  const manifest = `
CALL_METHOD
  Address("${accountAddress}")
  "create_proof_of_non_fungibles"
  Address("${nftCollection}")
  Array<NonFungibleLocalId>(NonFungibleLocalId("${nftId}"))
;

POP_FROM_AUTH_ZONE
  Proof("nft_proof")
;

CALL_METHOD
  Address("${CONFIG.componentAddress}")
  "out_cave"
  Proof("nft_proof")
  Array<Tuple>(${withdrawalTuples})
;

CALL_METHOD
  Address("${accountAddress}")
  "deposit_batch"
  Expression("ENTIRE_WORKTOP")
;
`;

  return manifest.trim();
}

/**
 * Build transaction manifest for LOOK CAVE (query balances via preview)
 * 
 * @param {string} accountAddress - User's account address
 * @param {string} nftCollection - NFT collection resource address
 * @param {string} nftId - NFT local ID
 * @param {string[]} resourceAddresses - Resources to check balances for
 * @returns {string} - Transaction manifest
 */
export function buildLookCaveManifest(accountAddress, nftCollection, nftId, resourceAddresses) {
  // Build resource address array
  const addressArray = resourceAddresses
    .map(addr => `Address("${addr}")`)
    .join(', ');

  const manifest = `
CALL_METHOD
  Address("${accountAddress}")
  "create_proof_of_non_fungibles"
  Address("${nftCollection}")
  Array<NonFungibleLocalId>(NonFungibleLocalId("${nftId}"))
;

POP_FROM_AUTH_ZONE
  Proof("nft_proof")
;

CALL_METHOD
  Address("${CONFIG.componentAddress}")
  "query_balances"
  Proof("nft_proof")
  Array<Address>(${addressArray})
;
`;

  return manifest.trim();
}