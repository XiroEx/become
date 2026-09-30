/* eslint-disable import/first */
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import {
  evaluateVersionGate,
  fetchAppConfig,
  dismissUpdateBanner,
  openStore,
  DISMISSED_VERSION_KEY,
  type VersionGateDeps,
} from '@/lib/version/versionGate';
import { createMemoryAsyncStorage } from '@/lib/query/persistor';
import { UpdateRequiredScreen } from '@/components/version/UpdateRequiredScreen';
import { UpdateBanner } from '@/components/version/UpdateBanner';
import { VersionGate } from '@/components/version/VersionGate';

describe('Version Gate logic', () => {
  it('evaluateVersionGate: fails open when config is null (network error)', async () => {
    const result = await evaluateVersionGate(null, {
      installedVersion: '0.1.0',
      platform: 'ios',
    });
    expect(result.isBlocked).toBe(false);
    expect(result.hasUpdate).toBe(false);
  });

  it('evaluateVersionGate: opens normally when config is empty/unset', async () => {
    const result = await evaluateVersionGate(
      { ios: {}, android: {} },
      { installedVersion: '0.1.0', platform: 'ios' },
    );
    expect(result.isBlocked).toBe(false);
    expect(result.hasUpdate).toBe(false);
  });

  it('evaluateVersionGate: blocks when minVersion is above installedVersion on iOS', async () => {
    const config = {
      ios: {
        minVersion: '0.2.0',
        latestVersion: '0.3.0',
        storeUrl: 'https://apps.apple.com/app/become',
      },
      android: {
        minVersion: '0.0.5',
      },
    };

    const iosResult = await evaluateVersionGate(config, {
      installedVersion: '0.1.0',
      platform: 'ios',
    });
    expect(iosResult.isBlocked).toBe(true);
    expect(iosResult.hasUpdate).toBe(false);
    expect(iosResult.storeUrl).toBe('https://apps.apple.com/app/become');

    const androidResult = await evaluateVersionGate(config, {
      installedVersion: '0.1.0',
      platform: 'android',
    });
    expect(androidResult.isBlocked).toBe(false);
  });

  it('evaluateVersionGate: blocks when minVersion is above installedVersion on Android', async () => {
    const config = {
      ios: {
        minVersion: '0.0.5',
      },
      android: {
        minVersion: '0.2.0',
        latestVersion: '0.3.0',
        storeUrl: 'https://play.google.com/store/apps/details?id=io.redbtn.become',
      },
    };

    const androidResult = await evaluateVersionGate(config, {
      installedVersion: '0.1.0',
      platform: 'android',
    });
    expect(androidResult.isBlocked).toBe(true);
    expect(androidResult.hasUpdate).toBe(false);
    expect(androidResult.storeUrl).toBe(
      'https://play.google.com/store/apps/details?id=io.redbtn.become',
    );

    const iosResult = await evaluateVersionGate(config, {
      installedVersion: '0.1.0',
      platform: 'ios',
    });
    expect(iosResult.isBlocked).toBe(false);
  });

  it('evaluateVersionGate: does not block when installedVersion equals minVersion', async () => {
    const config = {
      ios: { minVersion: '0.1.0' },
      android: { minVersion: '0.1.0' },
    };

    const result = await evaluateVersionGate(config, {
      installedVersion: '0.1.0',
      platform: 'ios',
    });
    expect(result.isBlocked).toBe(false);
  });

  it('evaluateVersionGate: shows banner when latestVersion is higher and not dismissed', async () => {
    const storage = createMemoryAsyncStorage();
    const config = {
      ios: {
        minVersion: '0.1.0',
        latestVersion: '0.2.0',
        storeUrl: 'https://apps.apple.com/app/become',
      },
      android: {},
    };

    const result = await evaluateVersionGate(config, {
      installedVersion: '0.1.0',
      platform: 'ios',
      storage,
    });
    expect(result.isBlocked).toBe(false);
    expect(result.hasUpdate).toBe(true);
    expect(result.latestVersion).toBe('0.2.0');
  });

  it('evaluateVersionGate: suppresses banner once per version when dismissed in storage', async () => {
    const storage = createMemoryAsyncStorage();
    await storage.setItem(DISMISSED_VERSION_KEY, '0.2.0');

    const config = {
      ios: {
        minVersion: '0.1.0',
        latestVersion: '0.2.0',
      },
      android: {},
    };

    const result = await evaluateVersionGate(config, {
      installedVersion: '0.1.0',
      platform: 'ios',
      storage,
    });
    expect(result.isBlocked).toBe(false);
    expect(result.hasUpdate).toBe(false);

    // If latestVersion changes to 0.3.0, banner shows again
    const newConfig = {
      ios: {
        minVersion: '0.1.0',
        latestVersion: '0.3.0',
      },
      android: {},
    };
    const newResult = await evaluateVersionGate(newConfig, {
      installedVersion: '0.1.0',
      platform: 'ios',
      storage,
    });
    expect(newResult.hasUpdate).toBe(true);
  });

  it('fetchAppConfig: returns null on fetch rejection (fail open on network off)', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('Network error'));
    const result = await fetchAppConfig({
      baseUrl: 'https://test.example.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });

  it('fetchAppConfig: returns parsed config on 200', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ios: { minVersion: '1.0.0' },
        android: { minVersion: '1.0.0' },
      }),
    });
    const result = await fetchAppConfig({
      baseUrl: 'https://test.example.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result?.ios.minVersion).toBe('1.0.0');
    expect(result?.android.minVersion).toBe('1.0.0');
  });

  it('openStore and dismissUpdateBanner work as expected', async () => {
    const storage = createMemoryAsyncStorage();
    await dismissUpdateBanner('1.2.0', { storage });
    expect(await storage.getItem(DISMISSED_VERSION_KEY)).toBe('1.2.0');

    const openUrl = jest.fn().mockResolvedValue(true);
    await openStore('https://example.com/store', { openUrl });
    expect(openUrl).toHaveBeenCalledWith('https://example.com/store');
  });
});

describe('UpdateRequiredScreen component', () => {
  it('renders "Update Become" title and calls onOpenStore when tapped', () => {
    const onOpenStore = jest.fn();
    const { getByTestId, getByText, getAllByText } = render(
      <UpdateRequiredScreen
        storeUrl="https://apps.apple.com/app/become"
        onOpenStore={onOpenStore}
      />,
    );

    expect(getByTestId('update-required-screen-title')).toBeTruthy();
    expect(getAllByText('Update Become').length).toBeGreaterThanOrEqual(1);
    expect(
      getByText(
        'A new version of Become is required to continue. Please update to the latest version.',
      ),
    ).toBeTruthy();

    const button = getByTestId('update-required-screen-button');
    fireEvent.press(button);
    expect(onOpenStore).toHaveBeenCalledTimes(1);
  });
});

describe('UpdateBanner component', () => {
  it('renders banner with version and handles dismiss and update clicks', () => {
    const onUpdate = jest.fn();
    const onDismiss = jest.fn();

    const { getByTestId, getByText } = render(
      <UpdateBanner
        latestVersion="0.2.0"
        storeUrl="https://apps.apple.com/app/become"
        onUpdate={onUpdate}
        onDismiss={onDismiss}
      />,
    );

    expect(getByText('Update available')).toBeTruthy();
    expect(getByText('Become v0.2.0 is available.')).toBeTruthy();

    const updateBtn = getByTestId('update-banner-update-btn');
    fireEvent.press(updateBtn);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    const dismissBtn = getByTestId('update-banner-dismiss-btn');
    fireEvent.press(dismissBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('VersionGate integration component', () => {
  it('opens normally when network is off or config is unset', async () => {
    const deps: VersionGateDeps = {
      installedVersion: '0.1.0',
      platform: 'ios',
      fetchImpl: jest.fn().mockRejectedValue(new Error('Failed to fetch')) as unknown as typeof fetch,
      storage: createMemoryAsyncStorage(),
    };

    const { getByText, queryByTestId } = render(
      <VersionGate deps={deps}>
        <Text>Normal App Content</Text>
      </VersionGate>,
    );

    await waitFor(() => {
      expect(getByText('Normal App Content')).toBeTruthy();
    });

    expect(queryByTestId('update-required-screen')).toBeNull();
    expect(queryByTestId('update-banner')).toBeNull();
  });

  it('blocks the app with Update Become screen when minVersion > installedVersion', async () => {
    const deps: VersionGateDeps = {
      installedVersion: '0.1.0',
      platform: 'ios',
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ios: {
            minVersion: '0.2.0',
            latestVersion: '0.3.0',
            storeUrl: 'https://apps.apple.com/app/become',
          },
          android: {},
        }),
      }) as unknown as typeof fetch,
      storage: createMemoryAsyncStorage(),
    };

    const { findByTestId, queryByText } = render(
      <VersionGate deps={deps}>
        <Text>Normal App Content</Text>
      </VersionGate>,
    );

    const blockedScreen = await findByTestId('update-required-screen');
    expect(blockedScreen).toBeTruthy();

    // Content is blocked and not rendered!
    expect(queryByText('Normal App Content')).toBeNull();
  });

  it('shows dismissible banner when latestVersion > installedVersion and dismisses it', async () => {
    const storage = createMemoryAsyncStorage();
    const deps: VersionGateDeps = {
      installedVersion: '0.1.0',
      platform: 'ios',
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ios: {
            minVersion: '0.1.0',
            latestVersion: '0.2.0',
            storeUrl: 'https://apps.apple.com/app/become',
          },
          android: {},
        }),
      }) as unknown as typeof fetch,
      storage,
    };

    const { findByTestId, getByText, queryByTestId } = render(
      <VersionGate deps={deps}>
        <Text>Normal App Content</Text>
      </VersionGate>,
    );

    const banner = await findByTestId('update-banner');
    expect(banner).toBeTruthy();
    expect(getByText('Normal App Content')).toBeTruthy();

    // Tap dismiss
    const dismissBtn = await findByTestId('update-banner-dismiss-btn');
    fireEvent.press(dismissBtn);

    await waitFor(() => {
      expect(queryByTestId('update-banner')).toBeNull();
    });

    // Verify dismissed state in storage
    expect(await storage.getItem(DISMISSED_VERSION_KEY)).toBe('0.2.0');
  });

  it('re-checks version when app is foregrounded', async () => {
    let appStateListener: ((status: string) => void) | null = null;
    const subscribeToAppState = (listener: (status: any) => void) => {
      appStateListener = listener;
      return () => {
        appStateListener = null;
      };
    };

    let callCount = 0;
    const fetchImpl = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // First call: app allowed
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ios: { minVersion: '0.1.0' },
          }),
        };
      } else {
        // Second call on foreground: minVersion bumped!
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ios: { minVersion: '0.2.0' },
          }),
        };
      }
    });

    const deps: VersionGateDeps = {
      installedVersion: '0.1.0',
      platform: 'ios',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      storage: createMemoryAsyncStorage(),
    };

    const { getByText, queryByTestId, findByTestId, queryByText } = render(
      <VersionGate deps={deps} subscribeToAppState={subscribeToAppState}>
        <Text>Normal App Content</Text>
      </VersionGate>,
    );

    await waitFor(() => {
      expect(getByText('Normal App Content')).toBeTruthy();
    });
    expect(queryByTestId('update-required-screen')).toBeNull();

    // Trigger foreground
    await act(async () => {
      appStateListener?.('active');
    });

    const blockedScreen = await findByTestId('update-required-screen');
    expect(blockedScreen).toBeTruthy();
    expect(queryByText('Normal App Content')).toBeNull();
  });
});
