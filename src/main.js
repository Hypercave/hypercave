import { 
  RadixDappToolkit, 
  RadixNetwork, 
  DataRequestBuilder 
} from '@radixdlt/radix-dapp-toolkit';

import { CONFIG } from './config.js';
import { sessionCache, permanentResourceCache } from './cache.js';
import { 
  getAccountFungibles, 
  getAccountNonFungibles,
  getResourceMetadata,
  previewTransaction,
  parseBalancesFromReceipt
} from './gateway.js';
import { 
  buildInCaveManifest, 
  buildOutCaveManifest,
  buildLookCaveManifest 
} from './manifests.js';
import { ModalUI, setStatus, hideStatus } from './ui.js';

// Global state
let rdt = null;
let currentAccount = null;
let modalUI = null;

// DOM elements
let btnInCave = null;
let btnLookCave = null;
let btnOutCave = null;

/**
 * Initialize the application
 */
async function init() {
  // Cache DOM elements
  btnInCave = document.getElementById('btn-in-cave');
  btnLookCave = document.getElementById('btn-look-cave');
  btnOutCave = document.getElementById('btn-out-cave');
  
  // Initialize Radix dApp Toolkit
  rdt = RadixDappToolkit({
    networkId: RadixNetwork.Stokenet,
    applicationName: 'Hypercave',
    applicationVersion: '1.0.0',
    applicationDappDefinitionAddress: CONFIG.dAppDefinitionAddress
  });

  // After rdt = RadixDappToolkit(...)
  rdt.buttonApi.setTheme('radix-blue');
  
  // Configure what data to request from wallet on connect
  rdt.walletApi.setRequestData(
    DataRequestBuilder.accounts().atLeast(1)
  );
  
  // Subscribe to wallet connection state changes
  rdt.walletApi.walletData$.subscribe((walletData) => {
    console.log('Wallet data updated:', walletData);
    
    if (walletData.accounts && walletData.accounts.length > 0) {
      currentAccount = walletData.accounts[0];
      onAccountConnected();
    } else {
      currentAccount = null;
      onAccountDisconnected();
    }
  });
  
  // Initialize modal UI
  modalUI = new ModalUI();
  modalUI.onSubmit = handleTransaction;
  modalUI.onLookup = handleLookup;
  
  // Bind button click events
  btnInCave.addEventListener('click', () => openModal('in'));
  btnLookCave.addEventListener('click', () => openModal('look'));
  btnOutCave.addEventListener('click', () => openModal('out'));
  
  console.log('Hypercave initialized');
}

/**
 * Called when wallet connects and shares an account
 */
function onAccountConnected() {
  // Enable action buttons
  btnInCave.disabled = false;
  btnLookCave.disabled = false;
  btnOutCave.disabled = false;
  
  
  // Clear any stale session cache
  sessionCache.clear();
}

/**
 * Called when wallet disconnects
 */
function onAccountDisconnected() {
  // Disable action buttons
  btnInCave.disabled = true;
  btnLookCave.disabled = true;
  btnOutCave.disabled = true;
  
  // Clear state
  currentAccount = null;
  sessionCache.clear();
  
  // Hide modal if open
  if (modalUI) {
    modalUI.hide();
  }
  
  hideStatus();
}

/**
 * Open the modal for a specific operation
 * @param {string} mode - 'in', 'out', or 'look'
 */
async function openModal(mode) {
  if (!currentAccount) {
    setStatus('ME NEED WALLET!', 'error');
    return;
  }
  
  setStatus('LOOK FOR STUFF...', 'info');
  
  try {
    let fungibles = [];
    let nftCollections = [];
    
    if (mode === 'in') {
      // IN CAVE: Load user account resources
      [fungibles, nftCollections] = await Promise.all([
        getAccountFungibles(currentAccount.address),
        getAccountNonFungibles(currentAccount.address)
      ]);
      
      // Validate we have NFTs (required for all operations)
      if (nftCollections.length === 0) {
        setStatus('NO NFT! ME NEED NFT USE CAVE.', 'error');
        return;
      }
      
    } else {
      // OUT CAVE & LOOK CAVE: Load from permanent cache + NFTs from account
      nftCollections = await getAccountNonFungibles(currentAccount.address);
      
      // Validate we have NFTs
      if (nftCollections.length === 0) {
        setStatus('NO NFT! ME NEED NFT USE CAVE.', 'error');
        return;
      }
      
      // Load from permanent cache
      const cachedResources = permanentResourceCache.getAll();
      fungibles = Object.keys(cachedResources).map(ticker => ({
        resourceAddress: cachedResources[ticker].address,
        symbol: ticker,
        iconUrl: cachedResources[ticker].iconUrl,
        name: ticker,
        amount: '0' // Not relevant for OUT/LOOK
      }));
    }
    
    hideStatus();
    modalUI.show(mode, nftCollections, fungibles);
    
  } catch (error) {
    console.error('Failed to load account data:', error);
    setStatus(`ME NO FIND DATA: ${error.message}`, 'error');
  }
}

/**
 * Handle IN CAVE or OUT CAVE transaction submission
 * @param {object} data - Transaction data from modal
 */
async function handleTransaction(data) {
  if (!currentAccount || !data.nft || data.resources.length === 0) {
    return;
  }
  
  const { mode, nft, resources } = data;
  
  modalUI.setLoading(true);
  
  try {
    // Build the appropriate manifest
    let manifest;
    
    if (mode === 'in') {
      manifest = buildInCaveManifest(
        currentAccount.address,
        nft.collection,
        nft.id,
        resources.map(r => ({
          resourceAddress: r.resourceAddress,
          amount: r.amount
        }))
      );
    } else if (mode === 'out') {
      manifest = buildOutCaveManifest(
        currentAccount.address,
        nft.collection,
        nft.id,
        resources.map(r => ({
          resourceAddress: r.resourceAddress,
          amount: r.amount
        }))
      );
    } else {
      throw new Error('Invalid mode for transaction');
    }
    
    console.log('Submitting transaction:', manifest);
    
    // Send transaction to wallet for signing
    const result = await rdt.walletApi.sendTransaction({
      transactionManifest: manifest,
      message: mode === 'in' ? 'PUT IN CAVE' : 'TAKE FROM CAVE'
    });
    
    if (result.isErr()) {
      throw new Error(result.error.message || 'ME NO DO! YOU SAY NO!');
    }
    
    // Success - add resources to permanent cache if IN CAVE
    if (mode === 'in') {
      const resourcesToCache = resources.map(r => ({
        ticker: r.symbol,
        address: r.resourceAddress,
        iconUrl: r.iconUrl
      }));
      permanentResourceCache.addMultiple(resourcesToCache);
      console.log('Added resources to permanent cache:', resourcesToCache);

      // Update cave balances if we've looked them up
      for (const resource of resources) {
        modalUI.updateCaveBalance(resource.resourceAddress, resource.amount, {
          symbol: resource.symbol,
          name: resource.symbol,
          iconUrl: resource.iconUrl
        });
      }

      // Invalidate only account fungibles cache (balances changed)
      sessionCache.remove(`fungibles:${currentAccount.address}`);
      sessionCache.remove(`nfts:${currentAccount.address}`);
      console.log('Invalidated account cache after IN CAVE transaction');
    } else if (mode === 'out') {
      // Update cave balances by subtracting the amounts taken out
      for (const resource of resources) {
        modalUI.updateCaveBalance(resource.resourceAddress, `-${resource.amount}`, {
          symbol: resource.symbol,
          name: resource.symbol,
          iconUrl: resource.iconUrl
        });
      }

      // Invalidate only account fungibles cache (balances changed)
      sessionCache.remove(`fungibles:${currentAccount.address}`);
      sessionCache.remove(`nfts:${currentAccount.address}`);
      console.log('Invalidated account cache after OUT CAVE transaction');
    }

    // Close modal (don't clear all cache, only specific keys were invalidated)
    modalUI.hide();
    
    // No success message shown on main page - removed setStatus call
    console.log('Transaction successful:', result.value.transactionIntentHash);
    
  } catch (error) {
    console.error('Transaction failed:', error);
    setStatus(`ME NO DO! ${error.message}`, 'error');
  } finally {
    modalUI.setLoading(false);
  }
}

/**
 * Handle LOOK CAVE balance query
 * @param {object} data - Query data from modal
 */
async function handleLookup(data) {
  if (!currentAccount || !data.nft || data.resources.length === 0) {
    return;
  }
  
  const { nft, resources } = data;
  const resourceAddresses = resources.map(r => r.resourceAddress);
  
  modalUI.setLoading(true);
  modalUI.showBalancesLoading();
  
  try {
    // Build preview manifest
    const manifest = buildLookCaveManifest(
      currentAccount.address,
      nft.collection,
      nft.id,
      resourceAddresses
    );
    
    console.log('Previewing transaction:', manifest);
    
    // Execute preview
    const previewResult = await previewTransaction(manifest);
    
    console.log('Preview result:', previewResult);
    
    // Parse balances from receipt
    const balances = parseBalancesFromReceipt(previewResult.receipt, resourceAddresses);
    
    // Get metadata for display
    const metadata = await getResourceMetadata(resourceAddresses);
    
    // Render results
    modalUI.renderBalances(balances, metadata);
    
  } catch (error) {
    console.error('Balance lookup failed:', error);
    modalUI.showBalancesError(`ME NO SEE: ${error.message}`);
  } finally {
    modalUI.setLoading(false);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}