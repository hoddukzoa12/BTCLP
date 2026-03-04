'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

interface WalletState {
  walletId: string | null;
  walletAddress: string | null;
  publicKey: string | null;
}

interface CreateWalletResponse {
  walletId: string;
  walletAddress: string;
  publicKey: string;
}

interface ExecuteTransactionResponse {
  transactionHash: string;
}

interface TransactionCall {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
}

function getStorageKey(userId: string): string {
  return `btcfi_wallet_${userId}`;
}

function loadWalletFromStorage(userId: string): WalletState {
  const empty: WalletState = { walletId: null, walletAddress: null, publicKey: null };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as WalletState;

    // Validate: walletId must be a Privy wallet ID, not a hex address
    if (parsed.walletId && parsed.walletId.startsWith('0x')) {
      console.warn('[useAuth] Corrupted walletId (hex address) in localStorage — clearing');
      localStorage.removeItem(getStorageKey(userId));
      return empty;
    }

    return {
      walletId: parsed.walletId ?? null,
      walletAddress: parsed.walletAddress ?? null,
      publicKey: parsed.publicKey ?? null,
    };
  } catch {
    return empty;
  }
}

function saveWalletToStorage(userId: string, wallet: WalletState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getStorageKey(userId), JSON.stringify(wallet));
}

// Module-level guard: prevents multiple useAuth() instances from
// triggering concurrent recovery calls to /api/wallet/create.
let recoveryInFlight = false;

export function useAuth() {
  const {
    login,
    logout: privyLogout,
    authenticated,
    ready,
    user,
    getAccessToken,
  } = usePrivy();

  const [wallet, setWallet] = useState<WalletState>({
    walletId: null,
    walletAddress: null,
    publicKey: null,
  });
  const [isTxPending, setIsTxPending] = useState(false);

  // Load wallet state when auth changes
  useEffect(() => {
    if (!ready) return;

    if (authenticated && user?.id) {
      const stored = loadWalletFromStorage(user.id);
      setWallet(stored);
    } else {
      setWallet({ walletId: null, walletAddress: null, publicKey: null });
    }
  }, [ready, authenticated, user?.id]);

  // Server-side wallet recovery: if authenticated but no wallet, try to recover.
  // Uses module-level guard so multiple useAuth() instances don't race.
  useEffect(() => {
    if (!ready || !authenticated || !user?.id) return;
    if (wallet.walletId) return;
    if (recoveryInFlight) return;

    recoveryInFlight = true;
    const userId = user.id;
    console.log('[useAuth] No wallet in state — attempting server recovery');

    getAccessToken()
      .then((token) =>
        fetch('/api/wallet/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ ownerId: userId }),
        }),
      )
      .then(async (res) => {
        if (!res.ok) throw new Error(`Recovery failed: ${res.status}`);
        const data = (await res.json()) as CreateWalletResponse;
        const recovered: WalletState = {
          walletId: data.walletId,
          walletAddress: data.walletAddress,
          publicKey: data.publicKey,
        };
        setWallet(recovered);
        saveWalletToStorage(userId, recovered);
        console.log('[useAuth] Wallet recovered:', recovered.walletAddress);
      })
      .catch((e) => {
        console.warn('[useAuth] Wallet recovery failed:', e);
      })
      .finally(() => {
        recoveryInFlight = false;
      });
  }, [ready, authenticated, user?.id, wallet.walletId, getAccessToken]);

  const createWallet = useCallback(async (): Promise<CreateWalletResponse> => {
    if (!authenticated || !user?.id) {
      throw new Error('User must be authenticated to create a wallet');
    }

    // ── Guard: if in-memory state already has a valid wallet, reuse it ──
    if (wallet.walletId && wallet.walletAddress) {
      console.log('[useAuth] Reusing wallet from state:', wallet.walletAddress);
      return {
        walletId: wallet.walletId,
        walletAddress: wallet.walletAddress,
        publicKey: wallet.publicKey ?? '',
      };
    }

    // ── Guard: check localStorage as well ──
    const stored = loadWalletFromStorage(user.id);
    if (stored.walletId && stored.walletAddress) {
      console.log('[useAuth] Reusing wallet from localStorage:', stored.walletAddress);
      setWallet(stored);
      return {
        walletId: stored.walletId,
        walletAddress: stored.walletAddress,
        publicKey: stored.publicKey ?? '',
      };
    }

    const token = await getAccessToken();
    const response = await fetch('/api/wallet/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ownerId: user.id }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to create wallet: ${response.status} ${errorBody}`);
    }

    const data = (await response.json()) as CreateWalletResponse;
    const newWallet: WalletState = {
      walletId: data.walletId,
      walletAddress: data.walletAddress,
      publicKey: data.publicKey,
    };

    setWallet(newWallet);
    saveWalletToStorage(user.id, newWallet);

    return data;
  }, [authenticated, user?.id, wallet, getAccessToken]);

  const executeTransaction = useCallback(
    async (calls: TransactionCall[]): Promise<ExecuteTransactionResponse> => {
      if (!authenticated || !user?.id) {
        throw new Error('User must be authenticated to execute a transaction');
      }
      if (!wallet.walletId) {
        throw new Error('No wallet found. Create a wallet first.');
      }

      setIsTxPending(true);
      try {
        const token = await getAccessToken();
        const response = await fetch('/api/wallet/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            walletId: wallet.walletId,
            calls,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();

          // If the wallet has no valid auth keys, it's an embedded wallet
          // that can't sign server-side. Clear it so recovery creates a
          // proper server wallet on next attempt.
          if (
            response.status === 500 &&
            errorBody.includes('authorization keys')
          ) {
            console.warn('[useAuth] Wallet auth key error — clearing stale wallet');
            localStorage.removeItem(getStorageKey(user.id));
            setWallet({ walletId: null, walletAddress: null, publicKey: null });
          }

          throw new Error(
            `Failed to execute transaction: ${response.status} ${errorBody}`,
          );
        }

        return (await response.json()) as ExecuteTransactionResponse;
      } finally {
        setIsTxPending(false);
      }
    },
    [authenticated, user?.id, wallet.walletId, getAccessToken],
  );

  const logout = useCallback(async () => {
    // NOTE: We intentionally do NOT clear wallet from localStorage.
    // The wallet is bound to the Privy userId, so the same user logging
    // back in should see the same wallet. Only the in-memory state is reset.
    setWallet({ walletId: null, walletAddress: null, publicKey: null });
    await privyLogout();
  }, [privyLogout]);

  return {
    // Privy core
    login,
    logout,
    authenticated,
    ready,
    user,
    getAccessToken,

    // Wallet state
    walletId: wallet.walletId,
    walletAddress: wallet.walletAddress,
    publicKey: wallet.publicKey,
    isWalletReady: Boolean(wallet.walletId && wallet.walletAddress),

    // Wallet actions
    createWallet,
    executeTransaction,
    isTxPending,
  };
}
