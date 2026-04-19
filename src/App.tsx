import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams, Link } from 'react-router-dom';
import { Home, Layout, CreditCard, CheckCircle, ShieldCheck, Plus, Trash2, LogOut, LogIn, Copy, ExternalLink, AlertTriangle, ChevronRight, MapPin, Clock, Tag, Search, FileText, Activity, Layers, Mail, Lock, X } from 'lucide-react';
import { FirebaseProvider, useFirebase } from './components/FirebaseProvider';
import ErrorBoundary from './components/ErrorBoundary';
import { db, collection, getDocs, query, where, onSnapshot, doc, setDoc, Timestamp, signInWithPopup, signInWithRedirect, googleProvider, auth, runTransaction, getDoc, limit, orderBy, deleteDoc, signInWithEmailAndPassword, createUserWithEmailAndPassword } from './firebase';
import { House, Plan, Voucher, Transaction } from './types';
import { nanoid } from 'nanoid';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { RainbowButton } from './components/ui/rainbow-borders-button';
import { RetroGrid } from './components/ui/retro-grid';
import { ScrollVelocityContainer, ScrollVelocityRow } from './components/ui/scroll-based-velocity';
import { usePaystackPayment } from 'react-paystack';
import { Toaster, toast } from 'sonner';

// --- Components ---

const AuthModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success("Successfully logged in!");
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        toast.success("Account created securely!");
      }
      onClose(); 
      setEmail('');
      setPassword('');
    } catch (error: any) {
      console.error("Auth Error:", error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        toast.error("Invalid email or password.");
      } else if (error.code === 'auth/email-already-in-use') {
        toast.error("An account with this email already exists.");
      } else if (error.code === 'auth/weak-password') {
        toast.error("Password should be at least 6 characters.");
      } else {
        toast.error("Authentication failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-md relative shadow-2xl"
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-50 rounded-full hover:bg-gray-200 transition-colors">
          <X className="w-5 h-5 text-gray-500" />
        </button>

        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          {isLogin ? 'Enter your details to access your vouchers.' : 'Sign up securely to manage your vouchers.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Email</label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-4 top-3.5 text-gray-400" />
              <input
                type="email"
                required
                className="w-full bg-gray-50 border border-gray-100 rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-4 top-3.5 text-gray-400" />
              <input
                type="password"
                required
                minLength={6}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 mt-2"
          >
            {loading ? 'Authenticating...' : (isLogin ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-500">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button 
            type="button" 
            onClick={() => setIsLogin(!isLogin)}
            className="font-bold text-gray-900 hover:underline"
          >
            {isLogin ? 'Sign Up' : 'Log In'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
    

const Navbar = () => {
  const { user, isAdmin } = useFirebase();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <nav className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md border-b border-gray-100 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-4">
            <Link to="/" className="flex items-center gap-2 font-black text-lg md:text-xl tracking-tighter text-gray-900">
              <div className="w-8 h-8 bg-gray-900 text-white rounded-xl flex items-center justify-center shadow-sm">
                <Tag className="w-4 h-4" />
              </div>
              <span className="hidden xs:inline">VoucherHub</span>
            </Link>
            <Link to="/">
              <RainbowButton className="h-8 md:h-9 px-3 md:px-4 text-xs md:text-sm font-bold flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Home</span>
              </RainbowButton>
            </Link>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <Link to="/lookup">
              <RainbowButton className="h-8 md:h-9 px-3 md:px-4 text-xs md:text-sm font-bold flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Find</span>
              </RainbowButton>
            </Link>
            
            {user && (
              <Link to="/my-vouchers">
                <RainbowButton className="h-8 md:h-9 px-3 md:px-4 text-xs md:text-sm font-bold flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">My Vouchers</span>
                </RainbowButton>
              </Link>
            )}
            
            {isAdmin && (
              <Link to="/admin">
                <RainbowButton className="h-8 md:h-9 px-3 md:px-4 text-xs md:text-sm font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">Admin</span>
                </RainbowButton>
              </Link>
            )}

            {user ? (
              <RainbowButton 
                onClick={() => auth.signOut()}
                className="h-8 md:h-9 px-3 md:px-4 text-xs md:text-sm font-bold flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </RainbowButton>
            ) : (
              <RainbowButton
                onClick={() => setIsAuthModalOpen(true)}
                className="h-8 md:h-9 px-3 md:px-4 text-xs md:text-sm font-bold flex items-center gap-1.5"
              >
                <LogIn className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Sign In</span>
                <span className="sm:hidden">In</span>
              </RainbowButton>
            )}
          </div>
        </div>
      </nav>
    </>
  );
};

const LookupPage = () => {
  const [email, setEmail] = useState('');
  const [reference, setReference] = useState('');
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const navigate = useNavigate();

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !reference) {
      toast.error("Please enter both email address and transaction reference.");
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({ email, reference });
      const response = await fetch(`/api/vouchers/lookup?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error ?? "No vouchers found.");
        setVouchers([]);
      } else {
        setVouchers(data.vouchers ?? []);
        if ((data.vouchers ?? []).length === 0) {
          toast.info("No vouchers found for that combination.");
        }
      }
    } catch {
      toast.error("Lookup failed — please check your connection and try again.");
      setVouchers([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pb-12 px-4 max-w-2xl mx-auto">
      <header className="mb-8 md:mb-12 text-center">
        <h1 className="text-2xl md:text-4xl font-bold text-gray-900 mb-3 tracking-tight">Find Your Voucher</h1>
        <p className="text-sm md:text-base text-gray-500">Lost your code? Retrieve it using your email or transaction reference.</p>
      </header>

      <div className="card p-6 md:p-8 mb-8">
        <form onSubmit={handleLookup} className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-wider">Email Address</label>
              <input
                type="email"
                placeholder="your@email.com"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-wider">Transaction Ref</label>
              <input
                type="text"
                placeholder="TXN-XXXXX"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold text-sm md:text-base hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search Vouchers'}
          </button>
        </form>
      </div>

      <AnimatePresence>
        {searched && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {vouchers.length > 0 ? (
              vouchers.map((v) => (
                <div key={v.id} className="card p-4 md:p-6 flex justify-between items-center hover:shadow-md transition-shadow">
                  <div>
                    <div className="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Voucher Code</div>
                    <div className="text-xl md:text-2xl font-mono font-bold text-gray-900">{v.code}</div>
                    <div className="text-xs md:text-sm text-gray-500 mt-1">Purchased on {new Date(v.createdAt).toLocaleDateString()}</div>
                  </div>
                  <button
                    onClick={() => navigate(`/result/${v.id}`)}
                    className="p-2 md:p-3 bg-gray-50 rounded-full hover:bg-gray-900 hover:text-white transition-all"
                  >
                    <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                </div>
              ))
            ) : !loading && (
              <div className="text-center py-12 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                <AlertTriangle className="w-10 h-10 md:w-12 md:h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-sm md:text-base text-gray-500 font-medium">No vouchers found matching your search.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const MyVouchersPage = () => {
  const { user } = useFirebase();
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    const unsubscribe = onSnapshot(
      query(collection(db, 'vouchers'), where('customerEmail', '==', user.email), orderBy('createdAt', 'desc')),
      (snapshot) => {
        try {
          const myVouchers = snapshot.docs.map(doc => ({
            id: doc.id,
            code: doc.data().code,
            planId: doc.data().planId,
            houseId: doc.data().houseId,
            createdAt: doc.data().createdAt.toDate(),
          }));
          setVouchers(myVouchers);
        } catch (error) {
          console.error("Error processing vouchers:", error);
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        console.error("Error listening to vouchers:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, navigate]);

  if (loading) return <LoadingScreen />;

  return (
    <div className="pb-12 px-4 max-w-2xl mx-auto">
      <header className="mb-8 md:mb-12 text-center">
        <h1 className="text-2xl md:text-4xl font-bold text-gray-900 mb-3 tracking-tight">My Vouchers</h1>
        <p className="text-sm md:text-base text-gray-500">View all your purchased voucher codes.</p>
      </header>

      <div className="space-y-4">
        {vouchers.length > 0 ? (
          vouchers.map((v) => (
            <div key={v.id} className="card p-4 md:p-6 flex justify-between items-center hover:shadow-md transition-shadow">
              <div>
                <div className="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Voucher Code</div>
                <div className="text-xl md:text-2xl font-mono font-bold text-gray-900">{v.code}</div>
                <div className="text-xs md:text-sm text-gray-500 mt-1">Purchased on {v.createdAt.toLocaleDateString()}</div>
              </div>
              <button
                onClick={() => navigate(`/result/${v.id}`)}
                className="p-2 md:p-3 bg-gray-50 rounded-full hover:bg-gray-900 hover:text-white transition-all"
              >
                <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>
          ))
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
            <Tag className="w-10 h-10 md:w-12 md:h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-sm md:text-base text-gray-500 font-medium">You haven't purchased any vouchers yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      <p className="text-gray-500 font-medium animate-pulse">Initializing VoucherHub...</p>
    </div>
  </div>
);

// --- User Pages ---

const HouseSelection = () => {
  const [houses, setHouses] = useState<House[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'houses'), (snapshot) => {
      setHouses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as House)));
      setLoading(false);
    }, (error) => {
      console.error('HouseSelection error:', error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <LoadingScreen />;

  return (
    <div className="pb-12 px-4 max-w-7xl mx-auto">
      <header className="mb-8 md:mb-12">
        <div className="relative flex w-full flex-col items-center justify-center overflow-hidden py-4 md:py-8">
          <ScrollVelocityContainer className="text-3xl font-bold tracking-[-0.02em] md:text-6xl md:leading-[1.2] text-gray-900">
            <ScrollVelocityRow baseVelocity={20} direction={1}>
              Select a House &nbsp;•&nbsp;
            </ScrollVelocityRow>
            <ScrollVelocityRow baseVelocity={20} direction={-1} className="text-xl md:text-3xl text-gray-400 mt-2">
              Choose the location where you want to purchase a voucher &nbsp;•&nbsp;
            </ScrollVelocityRow>
          </ScrollVelocityContainer>
          <div className="from-gray-50 pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r"></div>
          <div className="from-gray-50 pointer-events-none absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l"></div>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {houses.map((house) => (
          <motion.div
            key={house.id}
            whileHover={{ y: -4 }}
            className="card p-5 md:p-6 cursor-pointer hover:shadow-md transition-all group"
            onClick={() => navigate(`/house/${house.id}`)}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-gray-50 rounded-2xl flex items-center justify-center group-hover:bg-gray-900 group-hover:text-white transition-colors">
                <Home className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-gray-300 group-hover:text-gray-900 transition-colors" />
            </div>
            <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-1">{house.name}</h3>
            <div className="flex items-center gap-1.5 text-gray-500 text-sm md:text-base">
              <MapPin className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {house.location}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const PlanSelection = () => {
  const { houseId } = useParams();
  const [house, setHouse] = useState<House | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [stockStatus, setStockStatus] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!houseId) return;

    const fetchStock = async () => {
      try {
        const res = await fetch(`/api/houses/${houseId}/stock`);
        const data = await res.json();
        if (data.stock) setStockStatus(data.stock);
      } catch (err) {
        console.error("Failed to fetch stock:", err);
      }
    };
    fetchStock();

    const unsubHouse = onSnapshot(doc(db, 'houses', houseId), (houseDoc) => {
      if (houseDoc.exists()) {
        setHouse({ id: houseDoc.id, ...houseDoc.data() } as House);
      } else {
        setHouse(null);
      }
    }, (error) => {
      console.error('Error listening to house:', error);
    });

    const unsubPlans = onSnapshot(query(collection(db, 'plans'), where('houseId', '==', houseId)), (snapshot) => {
      setPlans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Plan)));
      setLoading(false);
    }, (error) => {
      console.error('PlanSelection error:', error);
      setLoading(false);
    });

    return () => {
      unsubHouse();
      unsubPlans();
    };
  }, [houseId]);

  if (loading) return <LoadingScreen />;
  if (!house) return <div className="py-12 text-center text-gray-500">House not found.</div>;

  return (
    <div className="pb-12 px-4 max-w-7xl mx-auto">
      <header className="mb-8 md:mb-12">
        <button
          onClick={() => navigate('/')}
          className="text-sm md:text-base font-bold text-gray-900 hover:text-gray-600 mb-6 flex items-center gap-2 group"
        >
          <div className="p-1.5 bg-gray-100 rounded-full group-hover:bg-gray-200 transition-colors">
            <ChevronRight className="w-3.5 h-3.5 rotate-180" />
          </div>
          Back to Houses
        </button>
        <h1 className="text-2xl md:text-4xl font-bold text-gray-900 mb-2 tracking-tight">{house.name}</h1>
        <p className="text-sm md:text-base text-gray-500 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 md:w-4 md:h-4" />
          {house.location}
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {plans.map((plan) => {
          const hasStock = stockStatus[plan.id] !== false; // true by default while loading
          return (
          <motion.div
            key={plan.id}
            whileHover={hasStock ? { y: -4 } : {}}
            className={cn("card p-6 md:p-8 relative overflow-hidden transition-all", hasStock ? "cursor-pointer hover:shadow-md group" : "opacity-80 grayscale-[0.5]")}
            onClick={() => hasStock && navigate(`/pay/${plan.id}`)}
          >
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-gray-500 text-xs md:text-sm font-medium mb-4 uppercase tracking-wider">
                <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />
                {plan.duration}
              </div>
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-6">{plan.name}</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-xl md:text-3xl font-light text-gray-900">₦</span>
                <span className="text-3xl md:text-5xl font-bold text-gray-900">{plan.price.toLocaleString()}</span>
              </div>
              <button 
                disabled={!hasStock}
                className={cn("mt-8 w-full py-3 rounded-xl font-medium text-sm md:text-base transition-colors flex items-center justify-center gap-2",
                  hasStock ? "bg-gray-900 text-white group-hover:bg-gray-800" : "bg-gray-200 text-gray-400 cursor-not-allowed")}
              >
                {hasStock ? (
                  <>Buy Now <ChevronRight className="w-4 h-4" /></>
                ) : (
                  "Out of Stock"
                )}
              </button>
            </div>
            {hasStock && <div className="absolute -right-4 -bottom-4 w-24 h-24 md:w-32 md:h-32 bg-gray-50 rounded-full group-hover:scale-150 transition-transform duration-500" />}
          </motion.div>
        )})}
      </div>
    </div>
  );
};

const PaymentPage = () => {
  const { planId } = useParams();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState("");
  const { user } = useFirebase();
  const navigate = useNavigate();

  // Generated exactly once per page mount — prevents reference mismatch
  // between what Paystack sees and what the server receives
  const [paymentRef] = useState(() => `TXN-${nanoid(10).toUpperCase()}`);

  useEffect(() => {
    if (user?.email && !receiptEmail) {
      setReceiptEmail(user.email);
    }
  }, [user, receiptEmail]);

  useEffect(() => {
    if (!planId) return;
    const unsub = onSnapshot(doc(db, 'plans', planId), (snap) => {
      setPlan(snap.exists() ? ({ id: snap.id, ...snap.data() } as Plan) : null);
      setLoading(false);
    }, (err) => { console.error(err); setLoading(false); });
    return unsub;
  }, [planId]);

  const paystackConfig = {
    reference: paymentRef,
    email:     receiptEmail,
    amount:    (plan?.price ?? 0) * 100,
    publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ?? "",
    metadata: {
      custom_fields: [
        { display_name: "Plan ID",  variable_name: "planId",  value: plan?.id      ?? "" },
        { display_name: "House ID", variable_name: "houseId", value: plan?.houseId ?? "" },
      ],
      planId:  plan?.id      ?? "",
      houseId: plan?.houseId ?? "",
    },
  };

  const initializePayment = usePaystackPayment(paystackConfig);

  const onSuccess = async (reference: any) => {
    try {
      setProcessing(true);
      const ref = typeof reference === 'object' ? reference.reference : reference;

      // Build headers — auth token is optional (server verifies via Paystack API instead)
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (auth.currentUser) {
        try {
          const token = await auth.currentUser.getIdToken();
          if (token) headers["Authorization"] = `Bearer ${token}`;
        } catch { /* proceed without token — server doesn't require it */ }
      }

      const response = await fetch("/api/payment/complete", {
        method: "POST",
        headers,
        body: JSON.stringify({
          reference: ref,
          planId:    plan!.id,
          houseId:   plan!.houseId,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Payment completion failed.");
      toast.success("Payment successful! Check your email for your voucher code.");
      navigate(`/result/${result.voucherId}`);
    } catch (err: any) {
      toast.error(err.message ?? "Payment failed. Please contact support.");
      setProcessing(false);
    }
  };

  const onClose = () => setProcessing(false);

  const handlePayment = () => {
    if (!plan) return;

    if (!receiptEmail) {
      toast.error("Please enter an email address to continue.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiptEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    if (!import.meta.env.VITE_PAYSTACK_PUBLIC_KEY) {
      toast.error("Payment is not configured yet. Please contact support.");
      return;
    }

    setProcessing(true);
    initializePayment({ onSuccess, onClose });
  };

  if (loading) return <LoadingScreen />;
  if (!plan)   return <div className="py-12 text-center text-gray-500">Plan not found.</div>;

  return (
    <div className="pb-12 px-4 max-w-md mx-auto">
      <div className="card p-6 md:p-8">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-6 text-center">
          Confirm Purchase
        </h2>

        <div className="space-y-4 mb-8">
          <div className="flex justify-between items-center pb-4 border-b border-gray-100">
            <span className="text-sm md:text-base text-gray-500">Plan</span>
            <span className="text-sm md:text-base font-semibold text-gray-900">{plan.name}</span>
          </div>
          <div className="flex justify-between items-center pb-4 border-b border-gray-100">
            <span className="text-sm md:text-base text-gray-500">Duration</span>
            <span className="text-sm md:text-base font-semibold text-gray-900">{plan.duration}</span>
          </div>
          <div className="flex justify-between items-center pt-2">
            <span className="text-gray-900 font-bold text-sm md:text-base">Total</span>
            <span className="text-xl md:text-2xl font-bold text-gray-900">
              ₦{plan.price.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="mb-6">
          <label htmlFor="receiptEmail" className="block text-sm font-medium text-gray-700 mb-2">
            Email Address for Receipt
          </label>
          <p className="text-xs text-gray-500 mb-3">We'll send your voucher code and transaction reference to this email.</p>
          <input
            type="email"
            id="receiptEmail"
            value={receiptEmail}
            onChange={(e) => setReceiptEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
            required
          />
        </div>

        <button
          onClick={handlePayment}
          disabled={processing}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-3 md:py-4 rounded-xl font-bold text-base md:text-lg transition-all shadow-sm",
            processing
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-gray-900 text-white hover:bg-gray-800"
          )}
        >
          {processing ? (
            <>
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              Pay ₦{plan.price.toLocaleString()}
            </>
          )}
        </button>

        <p className="mt-4 text-center text-xs md:text-sm text-gray-400">
          Secure payment powered by Paystack
        </p>
      </div>
    </div>
  );
};

const ResultPage = () => {
  const { voucherId } = useParams();
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [house, setHouse] = useState<House | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!voucherId) return;
    
    const unsubscribe = onSnapshot(doc(db, 'vouchers', voucherId), async (vDoc) => {
      if (vDoc.exists()) {
        const vData = { id: vDoc.id, ...vDoc.data() } as Voucher;
        setVoucher(vData);
        
        // Fetch plan and house if not already fetched
        setPlan(prev => {
          if (!prev || prev.id !== vData.planId) {
            getDoc(doc(db, 'plans', vData.planId)).then(pDoc => {
              if (pDoc.exists()) setPlan({ id: pDoc.id, ...pDoc.data() } as Plan);
            });
          }
          return prev;
        });
        
        setHouse(prev => {
          if (!prev || prev.id !== vData.houseId) {
            getDoc(doc(db, 'houses', vData.houseId)).then(hDoc => {
              if (hDoc.exists()) setHouse({ id: hDoc.id, ...hDoc.data() } as House);
            });
          }
          return prev;
        });
      }
      setLoading(false);
    }, (error) => {
      console.error("Error listening to voucher:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [voucherId]);

  const copyToClipboard = () => {
    if (voucher) {
      navigator.clipboard.writeText(voucher.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) return <LoadingScreen />;
  if (!voucher) return <div className="py-12 text-center text-gray-500">Voucher not found.</div>;

  return (
    <div className="pb-12 px-4 max-w-md mx-auto">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card p-6 md:p-8 text-center"
      >
        <div className="w-16 h-16 md:w-20 md:h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 md:w-10 md:h-10 text-green-500" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Payment Successful!</h2>
        <p className="text-sm md:text-base text-gray-500 mb-8">Your voucher code is ready to use.</p>

        <div className="bg-gray-50 rounded-2xl p-4 md:p-6 mb-8 border border-dashed border-gray-200 relative group">
          <div className="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Voucher Code</div>
          <div className="text-2xl md:text-4xl font-mono font-bold text-gray-900 tracking-wider mb-4 break-all">
            {voucher.code}
          </div>
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-2 mx-auto text-sm md:text-base font-semibold text-gray-900 hover:text-gray-600 transition-colors"
          >
            {copied ? (
              <span className="text-green-600 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 md:w-4 md:h-4" />
                Copied!
              </span>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 md:w-4 md:h-4" />
                Copy Code
              </>
            )}
          </button>
        </div>

        <div className="space-y-3 text-left bg-gray-50/50 rounded-xl p-4 mb-8">
          {voucher.transactionId && (
            <div className="flex justify-between text-sm md:text-base">
              <span className="text-gray-500">Transaction Ref</span>
              <span className="font-medium font-mono text-gray-900 text-xs md:text-sm">{voucher.transactionId}</span>
            </div>
          )}
          <div className="flex justify-between text-sm md:text-base">
            <span className="text-gray-500">House</span>
            <span className="font-medium text-gray-900">{house?.name}</span>
          </div>
          <div className="flex justify-between text-sm md:text-base">
            <span className="text-gray-500">Plan</span>
            <span className="font-medium text-gray-900">{plan?.name}</span>
          </div>
          <div className="flex justify-between text-sm md:text-base">
            <span className="text-gray-500">Duration</span>
            <span className="font-medium text-gray-900">{plan?.duration}</span>
          </div>
        </div>

        <div className="text-left mb-8">
          <h4 className="text-sm md:text-base font-bold text-gray-900 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-500" />
            How to use:
          </h4>
          <ol className="text-sm md:text-base text-gray-600 space-y-2 list-decimal list-inside">
            <li>Connect to the house Wi-Fi network.</li>
            <li>Open your browser and wait for the login page.</li>
            <li>Enter the voucher code above and click "Connect".</li>
          </ol>
        </div>

        <RainbowButton
          onClick={() => navigate('/')}
          className="w-full h-12 text-sm md:text-base font-bold flex items-center justify-center gap-2"
        >
          <Tag className="w-4 h-4" />
          <Home className="w-4 h-4" />
          Back to Home
        </RainbowButton>
      </motion.div>
    </div>
  );
};

// --- Admin Dashboard ---

const AdminDashboard = () => {
  const { isAdmin, loading: authLoading } = useFirebase();
  const [houses, setHouses] = useState<House[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'houses' | 'plans' | 'vouchers' | 'transactions' | 'logs'>('houses');
  const [logs, setLogs] = useState<any[]>([]);
  const navigate = useNavigate();

  // Form states
  const [newHouse, setNewHouse] = useState({ name: '', location: '' });
  const [newPlan, setNewPlan] = useState({ houseId: '', name: '', duration: '', price: 0, initialVouchers: '' });
  const [manualVoucherCodes, setManualVoucherCodes] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [voucherFilter, setVoucherFilter] = useState({ houseId: '', planId: '', status: '' });

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      navigate('/');
      return;
    }

    const unsubHouses = onSnapshot(collection(db, 'houses'), (s) => setHouses(s.docs.map(d => ({ id: d.id, ...d.data() } as House))), (e) => console.error('Admin Houses error:', e));
    const unsubPlans = onSnapshot(collection(db, 'plans'), (s) => setPlans(s.docs.map(d => ({ id: d.id, ...d.data() } as Plan))), (e) => console.error('Admin Plans error:', e));
    const unsubVouchers = onSnapshot(collection(db, 'vouchers'), (s) => setVouchers(s.docs.map(d => ({ id: d.id, ...d.data() } as Voucher))), (e) => console.error('Admin Vouchers error:', e));
    const unsubTxns = onSnapshot(collection(db, 'transactions'), (s) => setTransactions(s.docs.map(d => ({ id: d.id, ...d.data() } as Transaction))), (e) => console.error('Admin Transactions error:', e));
    const unsubLogs = onSnapshot(query(collection(db, 'logs'), orderBy('createdAt', 'desc'), limit(50)), (s) => setLogs(s.docs.map(d => ({ id: d.id, ...d.data() }))), (e) => console.error('Admin Logs error:', e));

    return () => {
      unsubHouses();
      unsubPlans();
      unsubVouchers();
      unsubTxns();
      unsubLogs();
    };
  }, [isAdmin, authLoading, navigate]);

  const filteredVouchers = vouchers.filter(v => {
    if (voucherFilter.houseId && v.houseId !== voucherFilter.houseId) return false;
    if (voucherFilter.planId && v.planId !== voucherFilter.planId) return false;
    if (voucherFilter.status && v.status !== voucherFilter.status) return false;
    return true;
  });

  const lowStockPlans = plans.filter(p => {
    const count = vouchers.filter(v => v.planId === p.id && v.status === 'unused').length;
    return count < 5;
  });

  const handleAddHouse = async () => {
    if (!newHouse.name || !newHouse.location) return;
    const id = nanoid();
    await setDoc(doc(db, 'houses', id), { ...newHouse, id, createdAt: Timestamp.now() });
    setNewHouse({ name: '', location: '' });
  };

  const handleAddPlan = async () => {
    if (!newPlan.houseId || !newPlan.name || !newPlan.duration || newPlan.price <= 0) return;
    const planId = nanoid();
    await setDoc(doc(db, 'plans', planId), { 
      id: planId, 
      houseId: newPlan.houseId, 
      name: newPlan.name, 
      duration: newPlan.duration, 
      price: newPlan.price, 
      createdAt: Timestamp.now() 
    });

    if (newPlan.initialVouchers.trim()) {
      const codes = newPlan.initialVouchers.split('\n').map(c => c.trim()).filter(c => c.length > 0);
      const batch = [];
      for (const code of codes) {
        const id = nanoid();
        batch.push(setDoc(doc(db, 'vouchers', id), {
          id,
          code: code.toUpperCase(),
          houseId: newPlan.houseId,
          planId: planId,
          status: 'unused',
          createdAt: Timestamp.now(),
        }));
      }
      await Promise.all(batch);
    }

    setNewPlan({ houseId: '', name: '', duration: '', price: 0, initialVouchers: '' });
  };

  const handleAddVouchers = async () => {
    if (!selectedPlanId || !manualVoucherCodes.trim()) return;
    const plan = plans.find(p => p.id === selectedPlanId);
    if (!plan) return;

    const codes = manualVoucherCodes.split('\n').map(c => c.trim()).filter(c => c.length > 0);
    if (codes.length === 0) return;

    const batch = [];
    for (const code of codes) {
      const id = nanoid();
      batch.push(setDoc(doc(db, 'vouchers', id), {
        id,
        code: code.toUpperCase(),
        houseId: plan.houseId,
        planId: plan.id,
        status: 'unused',
        createdAt: Timestamp.now(),
      }));
    }
    await Promise.all(batch);
    toast.success(`Added ${codes.length} vouchers!`);
    setManualVoucherCodes('');
  };

  const handleDeleteHouse = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'houses', id));
      toast.success('House deleted successfully');
    } catch (error: any) {
      toast.error(`Error deleting house: ${error.message}`);
    }
  };

  const handleDeletePlan = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'plans', id));
      toast.success('Plan deleted successfully');
    } catch (error: any) {
      toast.error(`Error deleting plan: ${error.message}`);
    }
  };

  const exportCSV = (type: 'transactions' | 'vouchers') => {
    let data: any[] = [];
    let headers: string[] = [];

    if (type === 'transactions') {
      headers = ['ID', 'Reference', 'Customer Email', 'Amount', 'Status', 'Date'];
      data = transactions.map(t => [
        t.id, t.reference, t.customerEmail, t.amount, t.status, t.createdAt?.toDate().toLocaleString() || ''
      ]);
    } else if (type === 'vouchers') {
      headers = ['ID', 'Code', 'Status', 'Transaction ID', 'Date'];
      data = filteredVouchers.map(v => [
        v.id, v.code, v.status, v.transactionId || '', v.createdAt?.toDate().toLocaleString() || ''
      ]);
    }

    const csvContent = [
      headers.join(','),
      ...data.map(row => row.map((cell: any) => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${type}_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`${type} exported successfully`);
  };

  if (authLoading) return <LoadingScreen />;

  return (
    <div className="pb-12 px-4 max-w-7xl mx-auto">
      <header className="mb-8 md:mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold text-gray-900 mb-2 tracking-tight">Admin Dashboard</h1>
          <p className="text-sm md:text-base text-gray-500">Manage houses, plans, and vouchers.</p>
        </div>
        <div className="flex overflow-x-auto hide-scrollbar gap-2 bg-gray-100 p-1.5 rounded-2xl w-full md:w-auto">
          {[
            { id: 'houses', label: 'Houses', icon: Home },
            { id: 'plans', label: 'Plans', icon: Layers },
            { id: 'vouchers', label: 'Vouchers', icon: Tag },
            { id: 'transactions', label: 'Sales', icon: Activity },
            { id: 'logs', label: 'Logs', icon: FileText },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "group flex items-center justify-center gap-2 px-3 md:px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold capitalize transition-all whitespace-nowrap flex-shrink-0",
                activeTab === tab.id ? "bg-white text-gray-900 shadow-md scale-[1.02]" : "text-gray-500 hover:text-gray-900 hover:bg-white/50"
              )}
            >
              <tab.icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className={cn(activeTab === tab.id ? "inline" : "hidden sm:inline group-hover:inline")}>{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 md:gap-8">
        {/* Stats Sidebar */}
        <div className="lg:col-span-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 md:gap-6">
          <div className="card p-5 md:p-6">
            <div className="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Total Sales</div>
            <div className="text-2xl md:text-3xl font-bold text-gray-900">₦{transactions.filter(t => t.status === 'completed').reduce((acc, t) => acc + t.amount, 0).toLocaleString()}</div>
          </div>
          <div className="card p-5 md:p-6">
            <div className="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Active Vouchers</div>
            <div className="text-2xl md:text-3xl font-bold text-gray-900">{vouchers.filter(v => v.status === 'unused').length}</div>
          </div>
          
          {lowStockPlans.length > 0 && (
            <div className="card p-5 md:p-6 border-amber-200 bg-amber-50 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 text-amber-600 font-bold text-xs md:text-sm uppercase tracking-widest mb-3">
                <AlertTriangle className="w-3.5 h-3.5 md:w-4 h-4" />
                Low Stock Alerts
              </div>
              <div className="space-y-2">
                {lowStockPlans.map(p => (
                  <div key={p.id} className="text-sm md:text-base text-amber-800 flex justify-between">
                    <span>{p.name}</span>
                    <span className="font-bold">{vouchers.filter(v => v.planId === p.id && v.status === 'unused').length} left</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-3">
          {activeTab === 'houses' && (
            <div className="space-y-6">
              <div className="card p-5 md:p-6">
                <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4">Add New House</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="House Name"
                    className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={newHouse.name}
                    onChange={(e) => setNewHouse({ ...newHouse, name: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="Location"
                    className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={newHouse.location}
                    onChange={(e) => setNewHouse({ ...newHouse, location: e.target.value })}
                  />
                </div>
                <div className="flex justify-end mt-6">
                  <RainbowButton
                    onClick={handleAddHouse}
                    className="w-full md:w-auto h-12 px-8 text-sm font-bold"
                  >
                    <Plus className="w-4 h-4" />
                    Add House
                  </RainbowButton>
                </div>
              </div>

              <div className="card overflow-x-auto">
                <table className="w-full text-left min-w-[500px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest">Name</th>
                      <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest">Location</th>
                      <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {houses.map((house) => (
                      <tr key={house.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900 text-sm">{house.name}</td>
                        <td className="px-6 py-4 text-gray-500 text-sm">{house.location}</td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleDeleteHouse(house.id)}
                            className="text-red-500 hover:text-red-700 p-3 md:p-4 hover:bg-red-50 rounded-full transition-colors"
                          >
                            <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'plans' && (
            <div className="space-y-6">
              <div className="card p-5 md:p-6">
                <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4">Add New Plan</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select
                    className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={newPlan.houseId}
                    onChange={(e) => setNewPlan({ ...newPlan, houseId: e.target.value })}
                  >
                    <option value="">Select House</option>
                    {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                  <input
                    type="text"
                    placeholder="Plan Name (e.g. 1 Hour Access)"
                    className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={newPlan.name}
                    onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="Duration (e.g. 1 Hour)"
                    className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={newPlan.duration}
                    onChange={(e) => setNewPlan({ ...newPlan, duration: e.target.value })}
                  />
                  <input
                    type="number"
                    placeholder="Price (₦)"
                    className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={newPlan.price || ''}
                    onChange={(e) => setNewPlan({ ...newPlan, price: Number(e.target.value) })}
                  />
                  <textarea
                    placeholder="Initial Voucher Codes (one per line)"
                    className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 h-24 resize-none md:col-span-2"
                    value={newPlan.initialVouchers}
                    onChange={(e) => setNewPlan({ ...newPlan, initialVouchers: e.target.value })}
                  />
                </div>
                <div className="flex justify-end mt-6">
                  <RainbowButton
                    onClick={handleAddPlan}
                    className="w-full md:w-auto h-12 px-8 text-sm font-bold"
                  >
                    <Plus className="w-4 h-4" />
                    Add Plan
                  </RainbowButton>
                </div>
              </div>

              <div className="card overflow-x-auto">
                <table className="w-full text-left min-w-[600px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest">Plan</th>
                      <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest">House</th>
                      <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest">Price</th>
                      <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {plans.map((plan) => (
                      <tr key={plan.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900 text-sm">
                          {plan.name}
                          <div className="text-xs text-gray-400">{plan.duration}</div>
                        </td>
                        <td className="px-6 py-4 text-gray-500 text-sm">{houses.find(h => h.id === plan.houseId)?.name}</td>
                        <td className="px-6 py-4 text-gray-900 font-semibold text-sm">₦{plan.price.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleDeletePlan(plan.id)}
                            className="text-red-500 hover:text-red-700 p-3 md:p-4 hover:bg-red-50 rounded-full transition-colors"
                          >
                            <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'vouchers' && (
            <div className="space-y-6">
              <div className="card p-5 md:p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base md:text-lg font-bold text-gray-900">Voucher Management</h3>
                  <button 
                    onClick={() => exportCSV('vouchers')}
                    className="text-sm font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors"
                  >
                    Export CSV
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <select
                    className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={voucherFilter.houseId}
                    onChange={(e) => setVoucherFilter({ ...voucherFilter, houseId: e.target.value })}
                  >
                    <option value="">All Houses</option>
                    {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                  <select
                    className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={voucherFilter.planId}
                    onChange={(e) => setVoucherFilter({ ...voucherFilter, planId: e.target.value })}
                  >
                    <option value="">All Plans</option>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select
                    className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={voucherFilter.status}
                    onChange={(e) => setVoucherFilter({ ...voucherFilter, status: e.target.value })}
                  >
                    <option value="">All Status</option>
                    <option value="unused">Unused</option>
                    <option value="used">Used</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>

                <div className="flex flex-col md:flex-row gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-gray-900 mb-2">Add Manual Vouchers</h4>
                    <div className="flex flex-col gap-2">
                      <select
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                        value={selectedPlanId}
                        onChange={(e) => setSelectedPlanId(e.target.value)}
                      >
                        <option value="">Select Plan</option>
                        {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <textarea
                        className="w-full h-24 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                        placeholder="Enter voucher codes (one per line)"
                        value={manualVoucherCodes}
                        onChange={(e) => setManualVoucherCodes(e.target.value)}
                      />
                      <RainbowButton
                        onClick={handleAddVouchers}
                        disabled={!selectedPlanId || !manualVoucherCodes.trim()}
                        className="h-11 text-xs font-bold disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Vouchers
                      </RainbowButton>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card overflow-x-auto">
                <table className="w-full text-left min-w-[600px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest">Code</th>
                      <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest">Plan</th>
                      <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest">Status</th>
                      <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest text-right">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredVouchers.slice(0, 50).map((voucher) => (
                      <tr key={voucher.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-gray-900 text-sm">{voucher.code}</td>
                        <td className="px-6 py-4 text-gray-500 text-sm">{plans.find(p => p.id === voucher.planId)?.name}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                            voucher.status === 'unused' ? "bg-green-50 text-green-600" :
                            voucher.status === 'used' ? "bg-gray-100 text-gray-500" : "bg-red-50 text-red-600"
                          )}>
                            {voucher.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-xs md:text-sm text-gray-400">
                          {voucher.createdAt?.toDate().toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredVouchers.length > 50 && (
                  <div className="p-4 text-center text-xs md:text-sm text-gray-400 bg-gray-50/50">
                    Showing first 50 vouchers. Total: {filteredVouchers.length}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="space-y-6">
              <div className="flex justify-end">
                <button 
                  onClick={() => exportCSV('transactions')}
                  className="text-sm font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors"
                >
                  Export CSV
                </button>
              </div>
              <div className="card overflow-x-auto">
                <table className="w-full text-left min-w-[700px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest">Reference</th>
                    <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest">Plan</th>
                    <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest">Amount</th>
                    <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest">Customer</th>
                    <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((txn) => (
                    <tr key={txn.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs md:text-sm text-gray-900">{txn.reference}</td>
                      <td className="px-6 py-4 text-gray-500 text-sm">{plans.find(p => p.id === txn.planId)?.name}</td>
                      <td className="px-6 py-4 text-gray-900 font-semibold text-sm">₦{txn.amount.toLocaleString()}</td>
                      <td className="px-6 py-4 text-gray-500 text-xs md:text-sm">{txn.customerEmail}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={cn(
                          "px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                          txn.status === 'completed' ? "bg-green-50 text-green-600" :
                          txn.status === 'pending' ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                        )}>
                          {txn.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="card overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest">Timestamp</th>
                    <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest">Action</th>
                    <th className="px-6 py-4 text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 text-xs md:text-sm text-gray-400 whitespace-nowrap">
                        {log.createdAt?.toDate().toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-bold uppercase tracking-wider">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate">
                        {log.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

const AppContent = () => {
  const { loading } = useFirebase();

  if (loading) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-gray-50 relative overflow-hidden">
      <RetroGrid className="absolute inset-0 z-0 size-full" />
      <div className="rainbow-screen-edge"></div>
      <Toaster position="top-center" />
      <Navbar />
      <main className="relative z-10 p-3 sm:p-4 md:p-8 pt-20 md:pt-24 w-full max-w-7xl mx-auto">
        <Routes>
          <Route path="/" element={<HouseSelection />} />
          <Route path="/house/:houseId" element={<PlanSelection />} />
          <Route path="/pay/:planId" element={<PaymentPage />} />
          <Route path="/result/:voucherId" element={<ResultPage />} />
          <Route path="/lookup" element={<LookupPage />} />
          <Route path="/my-vouchers" element={<MyVouchersPage />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </main>
    </div>
  );
};

const App = () => {
  return (
    <ErrorBoundary>
      <FirebaseProvider>
        <Router>
          <AppContent />
        </Router>
      </FirebaseProvider>
    </ErrorBoundary>
  );
};

export default App;
