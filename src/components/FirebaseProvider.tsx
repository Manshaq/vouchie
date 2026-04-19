import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, onAuthStateChanged, User, db, setDoc, doc, Timestamp, getDoc, onSnapshot } from '../firebase';
import { UserProfile } from '../types';

interface FirebaseContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Separate flag driven by Firebase Auth custom claims (set by set-admin.ts).
  // This is the primary, most reliable source of admin truth because it is
  // embedded in the JWT token and cannot be overwritten by the client.
  const [claimsAdmin, setClaimsAdmin] = useState(false);

  useEffect(() => {
    let profileUnsubscribe: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        // ── Step 1: Read custom claims from the ID token ──────────────────────
        // Force-refresh (true) so we always get up-to-date claims even if the
        // admin was granted after the last sign-in.
        let hasAdminClaim = false;
        try {
          const tokenResult = await currentUser.getIdTokenResult(true);
          hasAdminClaim = tokenResult.claims['admin'] === true;
          setClaimsAdmin(hasAdminClaim);
        } catch (err) {
          console.error('Error reading ID token claims:', err);
        }

        // ── Step 2: Ensure the Firestore user document exists ─────────────────
        const userDocRef = doc(db, 'users', currentUser.uid);
        try {
          const snap = await getDoc(userDocRef);
          if (!snap.exists()) {
            // New user — create document. Respect the admin claim so an admin
            // who signs up for the first time still gets the right role.
            await setDoc(userDocRef, {
              id: currentUser.uid,
              email: currentUser.email || '',
              role: hasAdminClaim ? 'admin' : 'user',
              createdAt: Timestamp.now(),
            } as UserProfile);
          }
        } catch (error) {
          console.error('Error checking/creating user profile:', error);
        }

        // ── Step 3: Listen for real-time profile updates ──────────────────────
        // setLoading(false) is inside the callback so the UI waits until we
        // actually know the user's role before rendering protected routes.
        profileUnsubscribe = onSnapshot(
          userDocRef,
          (docSnap) => {
            if (docSnap.exists()) {
              setUserProfile(docSnap.data() as UserProfile);
            } else if (hasAdminClaim) {
              // Firestore doc doesn't exist yet but claim says admin — synthesise
              // a temporary profile so the button appears immediately.
              setUserProfile({
                id: currentUser.uid,
                email: currentUser.email || '',
                role: 'admin',
                createdAt: Timestamp.now(),
              });
            }
            setLoading(false);
          },
          (error: any) => {
            console.error('Error listening to user profile:', error);
            // Even if Firestore read fails, honour the custom claim so the admin
            // can still access the panel.
            if (hasAdminClaim) {
              setUserProfile({
                id: currentUser.uid,
                email: currentUser.email || '',
                role: 'admin',
                createdAt: Timestamp.now(),
              });
            }
            setLoading(false);
          }
        );
      } else {
        // Signed out — clear everything and unblock.
        setClaimsAdmin(false);
        setUserProfile(null);
        if (profileUnsubscribe) {
          profileUnsubscribe();
          profileUnsubscribe = undefined;
        }
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (profileUnsubscribe) {
        profileUnsubscribe();
      }
    };
  }, []);

  // Admin if EITHER the JWT custom claim OR the Firestore role says so.
  // This makes the check resilient to Firestore latency / rule errors.
  const isAdmin = claimsAdmin || userProfile?.role === 'admin';

  return (
    <FirebaseContext.Provider value={{ user, userProfile, loading, isAdmin }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};
