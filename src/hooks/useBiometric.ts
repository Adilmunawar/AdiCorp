import { useState, useEffect, useCallback } from 'react';

export interface DeviceCapabilities {
  webauthn: boolean;
  platformAuthenticator: boolean; // Face ID, Touch ID, Windows Hello, fingerprint
  userVerification: boolean;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  os: string;
  biometricType: string[]; // e.g. ['face', 'fingerprint', 'iris', 'windows-hello']
  isSecureContext: boolean;
}

const detectOS = (): string => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  return 'Unknown';
};

const detectDeviceType = (): 'desktop' | 'mobile' | 'tablet' => {
  const ua = navigator.userAgent;
  if (/iPad|Android(?!.*Mobile)/.test(ua)) return 'tablet';
  if (/iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile/.test(ua)) return 'mobile';
  return 'desktop';
};

const detectBiometricTypes = (os: string, deviceType: string): string[] => {
  const types: string[] = [];
  if (os === 'iOS') {
    types.push('face'); // Face ID
    types.push('fingerprint'); // Touch ID
  } else if (os === 'macOS') {
    types.push('fingerprint'); // Touch ID on Mac
    types.push('face'); // Possible with camera
  } else if (os === 'Android') {
    types.push('fingerprint');
    types.push('face');
  } else if (os === 'Windows') {
    types.push('windows-hello');
    types.push('face'); // Windows Hello camera
    types.push('fingerprint'); // Windows Hello fingerprint
  } else if (os === 'Linux') {
    types.push('fingerprint'); // fprintd
  }
  return types;
};

export function useBiometric() {
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLockEnabled, setIsLockEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    detectCapabilities();
    // Check stored state
    try {
      const registered = localStorage.getItem('biometric_registered') === 'true' && !!localStorage.getItem('biometric_credential_id');
      const lockEnabled = localStorage.getItem('biometric_lock_enabled') === 'true';
      setIsRegistered(registered);
      setIsLockEnabled(lockEnabled);
      // Lock only when there is a credential to unlock with: a stale "lock on" flag without one
      // (left by an older version, or cleared credentials) would otherwise trap the app forever.
      setIsLocked(lockEnabled && registered && sessionStorage.getItem('biometric_unlocked') !== 'true');
    } catch {
      /* storage unavailable: no lock */
    }
  }, []);

  const detectCapabilities = async () => {
    try {
      const os = detectOS();
      const deviceType = detectDeviceType();
      const isSecureContext = window.isSecureContext;
      const webauthn = !!window.PublicKeyCredential;
      
      let platformAuthenticator = false;
      let userVerification = false;
      
      if (webauthn) {
        try {
          platformAuthenticator = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          userVerification = platformAuthenticator;
        } catch {
          platformAuthenticator = false;
        }
      }

      const biometricType = platformAuthenticator ? detectBiometricTypes(os, deviceType) : [];

      setCapabilities({
        webauthn,
        platformAuthenticator,
        userVerification,
        deviceType,
        os,
        biometricType,
        isSecureContext,
      });
    } catch (error) {
      console.error('Failed to detect biometric capabilities:', error);
    } finally {
      setLoading(false);
    }
  };

  const registerBiometric = useCallback(async (userId: string): Promise<boolean> => {
    if (!capabilities?.platformAuthenticator) return false;
    
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'AdiCorp HR', id: window.location.hostname },
          user: {
            id: new TextEncoder().encode(userId),
            name: userId,
            displayName: 'AdiCorp User',
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' },   // ES256
            { alg: -257, type: 'public-key' },  // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60000,
          attestation: 'none',
        },
      }) as PublicKeyCredential | null;

      if (credential) {
        // Store credential ID for future verification
        const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
        localStorage.setItem('biometric_credential_id', credentialId);
        localStorage.setItem('biometric_registered', 'true');
        setIsRegistered(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Biometric registration failed:', error);
      return false;
    }
  }, [capabilities]);

  const verifyBiometric = useCallback(async (): Promise<boolean> => {
    const credentialIdStr = localStorage.getItem('biometric_credential_id');
    if (!credentialIdStr) return false;

    try {
      const credentialId = Uint8Array.from(atob(credentialIdStr), c => c.charCodeAt(0));
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{
            id: credentialId,
            type: 'public-key',
            transports: ['internal'],
          }],
          userVerification: 'required',
          timeout: 60000,
        },
      });

      if (assertion) {
        sessionStorage.setItem('biometric_unlocked', 'true');
        setIsLocked(false);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Biometric verification failed:', error);
      return false;
    }
  }, []);

  const enableLock = useCallback(() => {
    localStorage.setItem('biometric_lock_enabled', 'true');
    setIsLockEnabled(true);
  }, []);

  const disableLock = useCallback(() => {
    localStorage.setItem('biometric_lock_enabled', 'false');
    sessionStorage.setItem('biometric_unlocked', 'true');
    setIsLockEnabled(false);
    setIsLocked(false);
  }, []);

  const removeBiometric = useCallback(() => {
    localStorage.removeItem('biometric_credential_id');
    localStorage.removeItem('biometric_registered');
    localStorage.removeItem('biometric_lock_enabled');
    sessionStorage.removeItem('biometric_unlocked');
    setIsRegistered(false);
    setIsLockEnabled(false);
    setIsLocked(false);
  }, []);

  const lockApp = useCallback(() => {
    if (isLockEnabled && isRegistered) {
      sessionStorage.removeItem('biometric_unlocked');
      setIsLocked(true);
    }
  }, [isLockEnabled, isRegistered]);

  return {
    capabilities,
    isRegistered,
    isLockEnabled,
    isLocked,
    loading,
    registerBiometric,
    verifyBiometric,
    enableLock,
    disableLock,
    removeBiometric,
    lockApp,
  };
}
