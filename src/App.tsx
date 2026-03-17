import React, { useState, useEffect, useMemo, useRef } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { Search, TrendingUp, Users, Target, Loader2, AlertCircle, RefreshCw, Gift, ShieldCheck, User as UserIcon, LogIn, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Fuse from "fuse.js";
import { db, auth, googleProvider, handleFirestoreError, OperationType } from "./firebase";
import { collection, getDocs, addDoc, serverTimestamp, doc, onSnapshot, getDoc } from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import Admin from "./components/Admin";
import ErrorBoundary from "./components/ErrorBoundary";

interface CampaignData {
  CampaignName?: string;
  TotalAmount?: number;
  GoalAmount?: number;
  Percentage?: number;
}

interface GroupData {
  ID: string;
  GroupName: string;
  TotalAmount: number;
  Goal: number;
  Percentage?: number;
}

interface RewardData {
  id: string;
  name: string;
  description: string;
  minAmount: number;
  price: number;
  image?: string;
}

interface BonusData {
  id: string;
  name: string;
  description: string;
  minPercentage: number;
}

interface CartItem {
  reward: RewardData | BonusData;
  type: 'reward' | 'bonus';
  paidInCash: boolean;
  amountToPay: number;
}

const App: React.FC = () => {
  const [mosad, setMosad] = useState("7011088");
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [manualGoal, setManualGoal] = useState<number | null>(null);
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [manualGroups, setManualGroups] = useState<GroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchFundraiser, setSearchFundraiser] = useState("");
  const [searchReward, setSearchReward] = useState("");
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);
  const [rewards, setRewards] = useState<RewardData[]>([]);
  const [bonuses, setBonuses] = useState<BonusData[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const lastFetchedMosad = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });

    // Listen to settings for mosadId
    const unsubSettings = onSnapshot(doc(db, "settings", "global"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.mosadId && data.mosadId !== lastFetchedMosad.current) {
          setMosad(data.mosadId);
          fetchData(data.mosadId);
        }
        if (data.manualGoal !== undefined) {
          setManualGoal(data.manualGoal);
        }
      } else if (!lastFetchedMosad.current) {
        // Fallback if not set and never fetched
        fetchData(mosad);
      }
    });

    return () => {
      unsubscribe();
      unsubSettings();
    };
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login error:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const displayGroups = groups.length > 0 ? groups : manualGroups;

  const fuse = useMemo(() => new Fuse(displayGroups, {
    keys: ["GroupName", "ID"],
    threshold: 0.35,
    distance: 100,
    includeMatches: true,
  }), [displayGroups]);

  const filteredGroups = useMemo(() => {
    if (!searchFundraiser.trim()) return displayGroups;
    return fuse.search(searchFundraiser).map(result => result.item);
  }, [fuse, searchFundraiser, displayGroups]);

  const selectedGroup = displayGroups.find(g => g.GroupName === selectedGroupName) || (filteredGroups.length === 1 ? filteredGroups[0] : null);

  const totalCollected = campaign?.TotalAmount || displayGroups.reduce((sum, g) => sum + (g.TotalAmount || 0), 0);
  const totalGoal = manualGoal || campaign?.Goal || displayGroups.reduce((sum, g) => sum + (g.Goal || 0), 0);
  const overallPercentage = totalGoal > 0 ? (totalCollected / totalGoal) * 100 : 0;

  const usedBudget = cart.reduce((sum, item) => item.type === 'reward' ? sum + (item.reward as RewardData).minAmount : sum, 0);
  const remainingBudget = selectedGroup ? selectedGroup.TotalAmount - usedBudget : 0;

  const eligibleRewards = selectedGroup 
    ? rewards.filter(r => (selectedGroup.TotalAmount >= r.minAmount) || ((r.minAmount - remainingBudget) <= (totalGoal * 0.1)))
    : [];

  const eligibleBonuses = selectedGroup
    ? bonuses.filter(b => (selectedGroup.Percentage || 0) >= b.minPercentage)
    : [];

  const nextReward = selectedGroup 
    ? rewards.find(r => remainingBudget < r.minAmount)
    : null;

  const handleAddToCart = (reward: RewardData | BonusData, type: 'reward' | 'bonus', paidInCash: boolean = false) => {
    if (!selectedGroup) return;
    
    let amountToPay = 0;
    if (paidInCash && type === 'reward') {
      const r = reward as RewardData;
      const diff = r.minAmount - remainingBudget;
      amountToPay = Math.round((diff / r.minAmount) * r.price);
    }

    setCart(prev => [...prev, { reward, type, paidInCash, amountToPay }]);
  };

  const handleRemoveFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const handleCheckout = async () => {
    if (!selectedGroup || cart.length === 0 || !user) return;
    setClaiming(true);
    try {
      for (const item of cart) {
        await addDoc(collection(db, "claims"), {
          fundraiserId: selectedGroup.ID,
          fundraiserName: selectedGroup.GroupName,
          rewardId: item.reward.id,
          rewardName: item.reward.name,
          type: item.type,
          timestamp: serverTimestamp(),
          status: 'pending',
          paidInCash: item.paidInCash,
          amountToPay: item.amountToPay,
          uid: user.uid
        });
      }
      alert("כל הבקשות נשלחו בהצלחה!");
      setCart([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "claims");
    } finally {
      setClaiming(false);
    }
  };

  const handleClaimReward = async (reward: RewardData | BonusData, type: 'reward' | 'bonus', paidInCash: boolean = false) => {
    handleAddToCart(reward, type, paidInCash);
  };

  const fetchData = async (targetMosad: string) => {
    const cleanMosad = String(targetMosad || "").trim();
    if (!cleanMosad) return;
    lastFetchedMosad.current = cleanMosad;
    setLoading(true);
    setError(null);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      console.log(`[App] Fetching data for mosad: ${cleanMosad}`);
      const response = await fetch(`/api/campaign/${cleanMosad}`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let parsedError;
        try { parsedError = JSON.parse(errorText); } catch(e) {}
        const message = parsedError?.error || `שגיאת שרת (${response.status}): ${errorText.substring(0, 100)}`;
        throw new Error(message);
      }
      const result = await response.json();
      console.log(`[App] Fetch result:`, result);
      
      let processedGroups: GroupData[] = [];
      if (result.success) {
        setCampaign(result.campaign);
        processedGroups = (result.groups || []).map((g: any) => {
          const totalAmount = Number(g.TotalAmount !== undefined ? g.TotalAmount : (g.Amount || g.Sum || g.Cumule || 0));
          const goal = Number(g.Goal !== undefined ? g.Goal : (g.Target || g.GoalAmount || 0));
          const groupName = String(g.GroupName || g.Name || g.Title || g.MatrimName || "ללא שם").trim();
          const groupId = String(g.ID || g.GroupId || g.Code || g.GroupCode || g.MatrimId || "").trim();
          
          return {
            ID: groupId,
            GroupName: groupName,
            TotalAmount: totalAmount,
            Goal: goal,
            Percentage: g.Percentage || (goal > 0 ? (totalAmount / goal) * 100 : 0)
          };
        }).filter((g: GroupData) => g.GroupName !== "ללא שם" || g.ID !== "")
          .sort((a: GroupData, b: GroupData) => b.TotalAmount - a.TotalAmount);
        
        setGroups(processedGroups);
      } else {
        console.warn("API returned success:false", result.error);
      }

      let manualData: GroupData[] = [];
      try {
        const fundraisersSnapshot = await getDocs(collection(db, "fundraisers"));
        manualData = fundraisersSnapshot.docs.map(doc => ({ ...doc.data() } as GroupData));
        setManualGroups(manualData.sort((a, b) => b.TotalAmount - a.TotalAmount));
      } catch (err: any) {
        console.error("Manual fundraisers fetch error:", err);
      }

      // Only set error if BOTH sources are empty
      if (processedGroups.length === 0 && manualData.length === 0) {
        setError("לא נמצאו מתרימים במערכת. וודא שקוד המוסד תקין או העלה נתונים ידנית.");
      }

      try {
        const rewardsSnapshot = await getDocs(collection(db, "rewards"));
        const rewardsData = rewardsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RewardData));
        setRewards(rewardsData.sort((a, b) => a.minAmount - b.minAmount));
      } catch (err: any) {
        console.error("Rewards fetch error:", err);
        setError(`שגיאה בטעינת צ'ופרים: ${err.message}`);
      }

      try {
        const bonusesSnapshot = await getDocs(collection(db, "goalBonuses"));
        const bonusesData = bonusesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BonusData));
        setBonuses(bonusesData.sort((a, b) => a.minPercentage - b.minPercentage));
      } catch (err: any) {
        console.error("Bonuses fetch error:", err);
        setError(`שגיאה בטעינת הנחות: ${err.message}`);
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError("החיבור לשרת נדרים פלוס איטי מדי. נסה לרענן.");
      } else {
        setError(err.message || "An error occurred while fetching data");
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const canPayForNextReward = selectedGroup && nextReward && totalGoal > 0 
    ? (nextReward.minAmount - remainingBudget) <= (totalGoal * 0.1)
    : false;

  const filteredRewards = eligibleRewards.filter(r => 
    r.name.toLowerCase().includes(searchReward.toLowerCase()) ||
    r.description.toLowerCase().includes(searchReward.toLowerCase()) ||
    r.id.toLowerCase().includes(searchReward.toLowerCase())
  );

  const filteredBonuses = eligibleBonuses.filter(b => 
    b.name.toLowerCase().includes(searchReward.toLowerCase()) ||
    b.description.toLowerCase().includes(searchReward.toLowerCase()) ||
    b.id.toLowerCase().includes(searchReward.toLowerCase())
  );

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#5A5A40]" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans selection:bg-[#5A5A40] selection:text-white" dir="rtl">
        <header className="bg-white border-b border-[#141414]/10 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <Link to="/" className="bg-[#5A5A40] p-2 rounded-xl">
                <TrendingUp className="text-white w-6 h-6" />
              </Link>
              <div>
                <h1 className="text-xl font-bold tracking-tight">מעקב קמפיין וצ'ופרים</h1>
                <p className="text-xs text-[#141414]/60 font-medium uppercase tracking-wider">
                  {campaign?.CampaignName || "טוען נתונים..."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto">
              {user ? (
                <div className="flex items-center gap-3 bg-[#F5F5F0] px-4 py-2 rounded-full">
                  <div className="w-8 h-8 bg-[#5A5A40] rounded-full flex items-center justify-center text-white overflow-hidden">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName || ""} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <UserIcon className="w-4 h-4" />
                    )}
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-xs font-bold leading-none">{user.displayName}</p>
                    <button onClick={handleLogout} className="text-[10px] text-red-500 font-bold hover:underline">התנתק</button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="flex items-center gap-2 bg-[#5A5A40] text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-[#4A4A30] transition-all"
                >
                  <LogIn className="w-4 h-4" />
                  התחבר
                </button>
              )}
              
              <div className="flex flex-col gap-2 w-full md:w-auto">
                <div className="flex gap-2 w-full md:w-auto">
                  <button 
                    onClick={() => fetchData(mosad)}
                    className="p-2 bg-white border border-[#141414]/10 rounded-full hover:bg-[#F5F5F0] transition-all"
                    title="רענן נתונים"
                  >
                    <RefreshCw className={`w-4 h-4 text-[#5A5A40] ${loading ? 'animate-spin' : ''}`} />
                  </button>
                  <div className="relative flex-1 md:w-64">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[#141414]/40 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="חיפוש מתרים (שם או קוד)..."
                      className="w-full bg-[#F5F5F0] border-none rounded-full py-2 pr-10 pl-4 text-sm focus:ring-2 focus:ring-[#5A5A40]/20 transition-all outline-none"
                      value={searchFundraiser}
                      onChange={(e) => setSearchFundraiser(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && fetchData(mosad)}
                    />
                  </div>
                  <button 
                    onClick={() => fetchData(mosad)}
                    className="bg-[#5A5A40] text-white px-4 py-2 rounded-full text-sm font-bold hover:bg-[#4A4A30] transition-all flex items-center gap-2 whitespace-nowrap"
                  >
                    <Search className="w-4 h-4" />
                    חפש
                  </button>
                </div>
                <div className="relative w-full md:w-64">
                  <Gift className="absolute right-3 top-1/2 -translate-y-1/2 text-[#141414]/40 w-4 h-4" />
                  <input
                    type="text"
                    placeholder={selectedGroup ? `חיפוש צ'ופר (שם או קוד) עבור ${selectedGroup.GroupName}...` : "בחר מתרים לבדיקת זכאות..."}
                    className="w-full bg-[#F5F5F0] border-none rounded-full py-2 pr-10 pl-4 text-sm focus:ring-2 focus:ring-[#5A5A40]/20 transition-all outline-none"
                    value={searchReward}
                    onChange={(e) => setSearchReward(e.target.value)}
                    disabled={!selectedGroup}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => fetchData(mosad)}
                  className="p-2 hover:bg-[#F5F5F0] rounded-full transition-colors"
                  title="רענן"
                >
                  <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <Link to="/admin" className="p-2 hover:bg-[#F5F5F0] rounded-full transition-colors" title="ניהול">
                  <ShieldCheck className="w-5 h-5 text-[#141414]/40" />
                </Link>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5" />
                <p className="font-medium">{error}</p>
              </div>
              <button 
                onClick={() => fetchData(mosad)}
                className="px-4 py-1.5 bg-red-600 text-white rounded-full text-sm font-bold hover:bg-red-700 transition-colors whitespace-nowrap"
              >
                נסה שוב
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-[32px] shadow-sm border border-[#141414]/5">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-50 p-2 rounded-lg"><Target className="text-blue-600 w-5 h-5" /></div>
                <span className="text-sm font-semibold text-[#141414]/60 uppercase tracking-wider">יעד ראשי</span>
              </div>
              <div className="text-3xl font-bold tracking-tighter">₪{totalGoal.toLocaleString()}</div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white p-6 rounded-[32px] shadow-sm border border-[#141414]/5">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-green-50 p-2 rounded-lg"><TrendingUp className="text-green-600 w-5 h-5" /></div>
                <span className="text-sm font-semibold text-[#141414]/60 uppercase tracking-wider">סה"כ נאסף</span>
              </div>
              <div className="text-3xl font-bold tracking-tighter">₪{totalCollected.toLocaleString()}</div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white p-6 rounded-[32px] shadow-sm border border-[#141414]/5">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-orange-50 p-2 rounded-lg"><Users className="text-orange-600 w-5 h-5" /></div>
                <span className="text-sm font-semibold text-[#141414]/60 uppercase tracking-wider">ביצוע כללי</span>
              </div>
              <div className="flex items-end gap-2">
                <div className="text-3xl font-bold tracking-tighter">{overallPercentage.toFixed(1)}%</div>
                <div className="w-full bg-[#F5F5F0] h-2 rounded-full mb-2 overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }} 
                    animate={{ width: `${Math.min(overallPercentage, 100)}%` }} 
                    className="h-full bg-orange-500" 
                  />
                </div>
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold serif italic">רשימת מתרימים</h2>
                <span className="text-sm text-[#141414]/40 font-mono">{filteredGroups.length} נמצאו</span>
              </div>

              <AnimatePresence mode="popLayout">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[#5A5A40]" />
                    <p className="text-[#141414]/60 font-medium">מעבד נתונים...</p>
                    <button 
                      onClick={() => fetchData(mosad)}
                      className="text-xs text-[#5A5A40] underline mt-2"
                    >
                      טען מחדש
                    </button>
                  </div>
                ) : filteredGroups.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredGroups.map((group, idx) => {
                      const isSelected = selectedGroup?.GroupName === group.GroupName;
                      return (
                        <motion.div 
                          key={group.GroupName} 
                          layout 
                          initial={{ opacity: 0, scale: 0.95 }} 
                          animate={{ opacity: 1, scale: 1 }} 
                          transition={{ delay: idx * 0.05 }} 
                          onClick={() => {
                            setSelectedGroupName(group.GroupName);
                            setCart([]);
                          }}
                          className={`bg-white p-5 rounded-2xl border cursor-pointer transition-all group ${isSelected ? 'border-[#5A5A40] ring-2 ring-[#5A5A40]/10 shadow-md' : 'border-[#141414]/5 hover:border-[#5A5A40]/20'}`}
                        >
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="font-bold text-lg group-hover:text-[#5A5A40] transition-colors">{group.GroupName}</h3>
                              <p className="text-xs text-[#141414]/40 font-mono">#{group.ID}</p>
                            </div>
                            <div className="text-left">
                              <div className="text-sm font-bold">₪{group.TotalAmount.toLocaleString()}</div>
                              <div className="text-[10px] text-[#141414]/40">מתוך ₪{group.Goal.toLocaleString()}</div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                              <span>התקדמות</span>
                              <span>{group.Percentage?.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-[#F5F5F0] h-1.5 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }} 
                                animate={{ width: `${Math.min(group.Percentage || 0, 100)}%` }} 
                                className="h-full bg-[#5A5A40]" 
                              />
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-20 bg-white rounded-[32px] border border-dashed border-[#141414]/10">
                    <p className="text-[#141414]/40">לא נמצאו מתרימים התואמים לחיפוש</p>
                  </div>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-6">
              <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#141414]/5 sticky top-28">
                <div className="flex items-center gap-3 mb-8">
                  <div className="bg-[#5A5A40]/10 p-2 rounded-xl">
                    <Gift className="text-[#5A5A40] w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-bold serif italic">זכאות לצ'ופרים</h2>
                </div>

                {!selectedGroup ? (
                  <div className="text-center py-12 space-y-4">
                    <div className="w-16 h-16 bg-[#F5F5F0] rounded-full flex items-center justify-center mx-auto">
                      <Users className="text-[#141414]/20 w-8 h-8" />
                    </div>
                    <p className="text-[#141414]/40 text-sm leading-relaxed">
                      בחר מתרים מהרשימה<br />כדי לראות לאילו צ'ופרים הוא זכאי
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="p-4 bg-[#F5F5F0] rounded-2xl">
                      <p className="text-xs text-[#141414]/40 font-bold uppercase tracking-wider mb-1">מתרים נבחר</p>
                      <p className="font-bold text-lg">{selectedGroup.GroupName}</p>
                      <div className="flex justify-between items-end mt-4">
                        <div>
                          <p className="text-xs text-[#141414]/40 font-bold uppercase tracking-wider mb-1">יתרה למימוש</p>
                          <p className="text-2xl font-bold text-[#5A5A40]">₪{remainingBudget.toLocaleString()}</p>
                        </div>
                        <div className="text-left">
                          <p className="text-xs text-[#141414]/40 font-bold uppercase tracking-wider mb-1">ביצוע</p>
                          <p className="font-mono font-bold">{selectedGroup.Percentage?.toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-[#141414]/40">צ'ופרים זמינים</h3>
                      <div className="space-y-3">
                        {filteredRewards.length > 0 ? filteredRewards.map((reward) => {
                          const isEligible = selectedGroup.TotalAmount >= reward.minAmount;
                          const canPayDiff = !isEligible && (reward.minAmount - remainingBudget) <= (totalGoal * 0.1);
                          const alreadyInCart = cart.some(item => item.reward.id === reward.id);

                          return (
                            <div 
                              key={reward.id} 
                              className={`p-4 rounded-2xl border transition-all ${isEligible || canPayDiff ? 'bg-white border-[#5A5A40]/20 shadow-sm' : 'bg-[#F5F5F0]/50 border-transparent opacity-60'}`}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <h4 className="font-bold">{reward.name}</h4>
                                <span className="text-xs font-mono font-bold text-[#5A5A40]">₪{reward.minAmount.toLocaleString()}</span>
                              </div>
                              <p className="text-xs text-[#141414]/60 mb-4">{reward.description}</p>
                              
                              {alreadyInCart ? (
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider">נוסף לסל</span>
                                  <button 
                                    onClick={() => handleRemoveFromCart(cart.findIndex(item => item.reward.id === reward.id))}
                                    className="text-[10px] text-red-500 font-bold hover:underline"
                                  >
                                    ביטול
                                  </button>
                                </div>
                              ) : isEligible ? (
                                <button 
                                  onClick={() => handleAddToCart(reward, 'reward')}
                                  className="w-full py-2 bg-[#5A5A40] text-white rounded-xl text-xs font-bold hover:bg-[#4A4A30] transition-colors"
                                >
                                  ממש צ'ופר
                                </button>
                              ) : canPayDiff ? (
                                <button 
                                  onClick={() => handleAddToCart(reward, 'reward', true)}
                                  className="w-full py-2 border border-[#5A5A40] text-[#5A5A40] rounded-xl text-xs font-bold hover:bg-[#5A5A40] hover:text-white transition-all"
                                >
                                  השלם במזומן (₪{Math.round(((reward.minAmount - remainingBudget) / reward.minAmount) * reward.price)})
                                </button>
                              ) : (
                                <div className="text-[10px] text-[#141414]/40 font-bold uppercase tracking-wider">
                                  חסר עוד ₪{(reward.minAmount - selectedGroup.TotalAmount).toLocaleString()} לזכאות
                                </div>
                              )}
                            </div>
                          );
                        }) : (
                          <p className="text-xs text-[#141414]/40 italic">לא נמצאו צ'ופרים התואמים לחיפוש</p>
                        )}
                      </div>
                    </div>

                    {filteredBonuses.length > 0 && (
                      <div className="space-y-4 pt-4 border-t border-[#141414]/5">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-[#141414]/40">בונוסים והנחות</h3>
                        <div className="space-y-3">
                          {filteredBonuses.map((bonus) => {
                            const alreadyInCart = cart.some(item => item.reward.id === bonus.id);
                            return (
                              <div key={bonus.id} className="p-4 bg-orange-50 rounded-2xl border border-orange-100">
                                <div className="flex justify-between items-start mb-2">
                                  <h4 className="font-bold text-orange-900">{bonus.name}</h4>
                                  <span className="text-xs font-mono font-bold text-orange-600">{bonus.minPercentage}%</span>
                                </div>
                                <p className="text-xs text-orange-800/60 mb-4">{bonus.description}</p>
                                {alreadyInCart ? (
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider">נוסף לסל</span>
                                    <button 
                                      onClick={() => handleRemoveFromCart(cart.findIndex(item => item.reward.id === bonus.id))}
                                      className="text-[10px] text-red-500 font-bold hover:underline"
                                    >
                                      ביטול
                                    </button>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={() => handleAddToCart(bonus, 'bonus')}
                                    className="w-full py-2 bg-orange-500 text-white rounded-xl text-xs font-bold hover:bg-orange-600 transition-colors"
                                  >
                                    ממש בונוס
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {cart.length > 0 && (
                      <div className="pt-6 border-t border-[#141414]/10">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold">סל מימושים ({cart.length})</h3>
                          <button onClick={() => setCart([])} className="text-xs text-red-500 font-bold hover:underline">נקה הכל</button>
                        </div>
                        <div className="space-y-2 mb-6">
                          {cart.map((item, i) => (
                            <div key={i} className="flex justify-between items-center text-xs p-2 bg-[#F5F5F0] rounded-lg">
                              <span>{item.reward.name}</span>
                              <span className="font-bold">{item.paidInCash ? `₪${item.amountToPay}` : 'חינם'}</span>
                            </div>
                          ))}
                        </div>
                        <button 
                          onClick={handleCheckout}
                          disabled={claiming || !user}
                          className="w-full py-4 bg-[#141414] text-white rounded-2xl font-bold hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                          {!user ? "התחבר כדי לממש" : "אשר מימוש צ'ופרים"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        <footer className="bg-white border-t border-[#141414]/10 py-12 mt-20">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <TrendingUp className="w-8 h-8 text-[#5A5A40] mx-auto mb-6" />
            <p className="text-sm text-[#141414]/40 font-medium">© 2024 מערכת מעקב קמפיין וצ'ופרים. כל הזכויות שמורות.</p>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
};

const AppWrapper: React.FC = () => (
  <Router>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  </Router>
);

export default AppWrapper;
