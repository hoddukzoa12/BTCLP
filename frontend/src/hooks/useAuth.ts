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
  if (typeof window === 'undefined') {
    return { walletId: null, walletAddress: null, publicKey: null };
  }
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return { walletId: null, walletAddress: null, publicKey: null };
    const parsed = JSON.parse(raw) as WalletState;
    return {
      walletId: parsed.walletId ?? null,
      walletAddress: parsed.walletAddress ?? null,
      publicKey: parsed.publicKey ?? null,
    };
  } catch {
    return { walletId: null, walletAddress: null, publicKey: null };
  }
}

function saveWalletToStorage(userId: string, wallet: WalletState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getStorageKey(userId), JSON.stringify(wallet));
}

function clearWalletFromStorage(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(getStorageKey(userId));
}

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

  const createWallet = useCallback(async (): Promise<CreateWalletResponse> => {
    if (!authenticated || !user?.id) {
      throw new Error('User must be authenticated to create a wallet');
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
  }, [authenticated, user?.id, getAccessToken]);

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
    if (user?.id) {
      clearWalletFromStorage(user.id);
    }
    setWallet({ walletId: null, walletAddress: null, publicKey: null });
    await privyLogout();
  }, [user?.id, privyLogout]);

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
