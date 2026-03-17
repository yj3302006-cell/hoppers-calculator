import React, { useState, useEffect, useRef } from "react";
import { auth, db, googleProvider, handleFirestoreError, OperationType } from "../firebase";
import { signInWithPopup, onAuthStateChanged, User } from "firebase/auth";
import { collection, getDocs, writeBatch, doc, addDoc, deleteDoc, setDoc, getDoc } from "firebase/firestore";
import * as XLSX from "xlsx";
import { Upload, LogIn, ShieldCheck, AlertCircle, Loader2, Trash2, FileSpreadsheet, Sparkles, Send, Bot, Gift, RefreshCw, TrendingUp, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI, Type } from "@google/genai";

const ADMIN_EMAIL = "yj3302006@gmail.com";

interface Message {
  role: "user" | "model";
  text: string;
}

export default function Admin() {
  console.log("Admin component rendering...");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordAuthenticated, setIsPasswordAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [rewards, setRewards] = useState<any[]>([]);
  const [bonuses, setBonuses] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [campaignData, setCampaignData] = useState<any>(null);
  const [fundraisers, setFundraisers] = useState<any[]>([]);
  const [showDataViewer, setShowDataViewer] = useState(false);
  const [activeTab, setActiveTab] = useState<"fundraisers" | "claims" | "rules" | "settings" | "admins">("fundraisers");
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
    danger?: boolean;
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [mosadId, setMosadId] = useState("7011088");
  const [manualGoal, setManualGoal] = useState<number | "">("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [admins, setAdmins] = useState<any[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [manualIdInput, setManualIdInput] = useState("");
  const [addingManualId, setAddingManualId] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ loading: boolean; data: any; error: string | null }>({ loading: false, data: null, error: null });
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  
  // AI Chat State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ name: string; args: any } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u && u.email === ADMIN_EMAIL) {
        setIsPasswordAuthenticated(true);
        fetchData();
      }
    });
    
    // Check session storage for password auth
    const savedAuth = sessionStorage.getItem("admin_auth");
    if (savedAuth === "true") {
      setIsPasswordAuthenticated(true);
      fetchData();
    }

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleManualIdAdd = async () => {
    if (!manualIdInput.trim()) return;
    setAddingManualId(true);
    try {
      const res = await fetch(`/api/campaign/${mosadId}?forceId=${manualIdInput.trim()}`);
      const result = await res.json();
      if (result.success) {
        setToast({ message: `המזהה ${manualIdInput} נוסף בהצלחה!`, type: "success" });
        setManualIdInput("");
        fetchData();
      } else {
        setToast({ message: result.error || "לא נמצאו נתונים עבור מזהה זה", type: "error" });
      }
    } catch (err) {
      setToast({ message: "שגיאת תקשורת עם השרת", type: "error" });
    } finally {
      setAddingManualId(false);
    }
  };

  const handlePasswordLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPasswordError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput })
      });
      const result = await res.json();
      if (result.success) {
        setIsPasswordAuthenticated(true);
        sessionStorage.setItem("admin_auth", "true");
        fetchData();
      } else {
        setPasswordError(result.error || "סיסמה שגויה");
      }
    } catch (err) {
      setPasswordError("שגיאת תקשורת עם השרת");
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchData = async () => {
    console.log("Admin: Fetching data...");
    try {
      const rewardsSnap = await getDocs(collection(db, "rewards")).catch(err => {
        console.warn("Rewards fetch failed (likely no auth):", err.message);
        return null;
      });
      if (rewardsSnap) {
        const rData = rewardsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRewards(rData);
      }

      const bonusesSnap = await getDocs(collection(db, "goalBonuses")).catch(err => {
        console.warn("Bonuses fetch failed (likely no auth):", err.message);
        return null;
      });
      if (bonusesSnap) {
        const bData = bonusesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setBonuses(bData);
      }

      const claimsSnap = await getDocs(collection(db, "claims")).catch(err => {
        console.warn("Claims fetch failed (likely no auth):", err.message);
        return null;
      });
      if (claimsSnap) {
        const cData = claimsSnap.docs.map(doc => {
          const data = doc.data();
          return { 
            id: doc.id, 
            ...data,
            date: data.timestamp?.toDate?.()?.toLocaleString() || "טרם"
          };
        });
        setClaims(cData.sort((a: any, b: any) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
      }

      const fundraisersSnap = await getDocs(collection(db, "fundraisers")).catch(err => {
        console.warn("Fundraisers fetch failed (likely no auth):", err.message);
        return null;
      });
      if (fundraisersSnap) {
        setFundraisers(fundraisersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }

      const settingsSnap = await getDoc(doc(db, "settings", "global")).catch(err => {
        console.warn("Settings fetch failed (likely no auth):", err.message);
        return null;
      });
      if (settingsSnap && settingsSnap.exists()) {
        const data = settingsSnap.data();
        setMosadId(data.mosadId);
        if (data.manualGoal !== undefined) {
          setManualGoal(data.manualGoal);
        }
      }

      const adminsSnap = await getDocs(collection(db, "users")).catch(() => null);
      if (adminsSnap) {
        setAdmins(adminsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((u: any) => u.role === 'admin'));
      }
    } catch (err) {
      console.error("Fetch data unexpected error:", err);
    }

    // Also fetch campaign data for AI context
    try {
      const settingsSnap = await getDoc(doc(db, "settings", "global")).catch(() => null);
      const currentMosad = settingsSnap?.exists() ? settingsSnap.data().mosadId : mosadId;
      
      const res = await fetch(`/api/campaign/${currentMosad}`);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`שגיאת שרת (${res.status}): ${errorText.substring(0, 100)}`);
      }
      const result = await res.json();
      if (result.success) {
        setCampaignData(result);
      }
    } catch (e: any) {
      console.error("Failed to fetch campaign data for AI", e);
    }
  };

  const testNedarimConnection = async () => {
    if (!mosadId) {
      setConfirmModal({
        title: "שגיאה",
        message: "נא להזין קוד מוסד תחילה.",
        onConfirm: () => setConfirmModal(null)
      });
      return;
    }
    
    setSavingSettings(true);
    try {
      const res = await fetch(`/api/campaign/${mosadId.trim()}`);
      const data = await res.json();
      
      if (data.success) {
        setConfirmModal({
          title: "חיבור הצליח!",
          message: `החיבור לנדרים פלוס תקין. נמצא קמפיין: ${data.campaign?.CampaignName || "ללא שם"}. נמצאו ${data.groups?.length || 0} מתרימים.`,
          onConfirm: () => setConfirmModal(null)
        });
      } else {
        setConfirmModal({
          title: "חיבור נכשל",
          message: data.error || "לא נמצאו נתונים עבור קוד מוסד זה.",
          danger: true,
          onConfirm: () => setConfirmModal(null)
        });
      }
    } catch (err) {
      setConfirmModal({
        title: "שגיאת תקשורת",
        message: "אירעה שגיאה בחיבור לשרת.",
        danger: true,
        onConfirm: () => setConfirmModal(null)
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await setDoc(doc(db, "settings", "global"), { 
        mosadId,
        manualGoal: manualGoal === "" ? null : Number(manualGoal)
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, "settings/global"));
      setToast({ message: "הגדרות נשמרו בהצלחה!", type: "success" });
      fetchData();
    } catch (error) {
      console.error("Save settings failed", error);
      setToast({ message: "שגיאה בשמירת ההגדרות", type: "error" });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleResetClaims = async () => {
    setConfirmModal({
      title: "איפוס בקשות צ'ופרים",
      message: "האם אתה בטוח שברצונך למחוק את כל בקשות הצ'ופרים? פעולה זו אינה ניתנת לביטול.",
      danger: true,
      onConfirm: async () => {
        try {
          const snap = await getDocs(collection(db, "claims"));
          const batch = writeBatch(db);
          snap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
          setClaims([]);
          setToast({ message: "כל הבקשות נמחקו בהצלחה.", type: "success" });
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, "claims");
        }
      }
    });
  };

  const handleResetBonuses = async () => {
    setConfirmModal({
      title: "איפוס הנחות יעד",
      message: "האם אתה בטוח שברצונך למחוק את כל הנחות היעד?",
      danger: true,
      onConfirm: async () => {
        try {
          const snap = await getDocs(collection(db, "goalBonuses"));
          const batch = writeBatch(db);
          snap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
          setBonuses([]);
          setToast({ message: "כל ההנחות נמחקו בהצלחה.", type: "success" });
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, "goalBonuses");
        }
      }
    });
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isTyping || pendingAction) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMessage }]);
    setIsTyping(true);

    try {
      const context = {
        campaign: campaignData?.campaign,
        fundraisers: campaignData?.groups?.slice(0, 100).map((g: any) => ({
          id: g.ID || g.GroupId || g.Code || g.GroupCode,
          name: g.GroupName || g.Name,
          collected: g.TotalAmount || g.Amount,
          goal: g.Goal,
          percentage: g.Percentage
        })),
        totalFundraisers: campaignData?.groups?.length || 0,
        rewardRules: rewards.map(r => ({ name: r.name, min: r.minAmount, price: r.price })),
        bonusRules: bonuses.map(b => ({ name: b.name, minPct: b.minPercentage }))
      };

      const res = await fetch("/api/admin/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages.concat({ role: "user", text: userMessage }),
          context
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to get AI response");
      }

      const result = await res.json();
      
      if (result.functionCalls && result.functionCalls.length > 0) {
        const call = result.functionCalls[0];
        setPendingAction({ name: call.name, args: call.args });
        
        let explanation = "";
        if (call.name === "addGoalBonus") {
          explanation = `אני הולך להוסיף הנחת יעד חדשה: **${call.args.name}**. 
ההנחה תינתן למי שיגיע ל-**${call.args.minPercentage}%** מהיעד שלו.
תיאור: ${call.args.description}`;
        } else if (call.name === "addReward") {
          explanation = `אני הולך להוסיף צ'ופר חדש: **${call.args.name}**. 
הצ'ופר יינתן למי שיאסוף לפחות **₪${Number(call.args.minAmount).toLocaleString()}**.
תיאור: ${call.args.description}`;
        }
        
        setMessages(prev => [...prev, { role: "model", text: explanation + "\n\nהאם לאשר את הפעולה?" }]);
      } else {
        const aiText = result.text || "מצטער, לא הצלחתי לעבד את הבקשה.";
        setMessages(prev => [...prev, { role: "model", text: aiText }]);
      }
    } catch (error: any) {
      console.error("AI Error:", error);
      let errorMsg = "אירעה שגיאה בתקשורת עם הבינה המלאכותית.";
      if (error.message === "API_KEY_MISSING") {
        errorMsg = "מפתח ה-API של Gemini חסר בשרת. אנא הגדר אותו בהגדרות הפרויקט.";
      } else {
        errorMsg += ` (${error.message || "שגיאה לא ידועה"})`;
      }
      setMessages(prev => [...prev, { role: "model", text: errorMsg }]);
    } finally {
      setIsTyping(false);
    }
  };

  const executePendingAction = async () => {
    if (!pendingAction) return;
    setIsTyping(true);
    try {
      if (pendingAction.name === "addGoalBonus") {
        const { name, minPercentage, description } = pendingAction.args;
        await addDoc(collection(db, "goalBonuses"), { name, minPercentage, description }).catch(err => handleFirestoreError(err, OperationType.CREATE, "goalBonuses"));
        setMessages(prev => [...prev, { role: "model", text: "הפעולה אושרה ובוצעה בהצלחה! הנחת היעד נוספה למערכת." }]);
      } else if (pendingAction.name === "addReward") {
        const { name, minAmount, price, description } = pendingAction.args;
        await addDoc(collection(db, "rewards"), { name, minAmount, price, description }).catch(err => handleFirestoreError(err, OperationType.CREATE, "rewards"));
        setMessages(prev => [...prev, { role: "model", text: "הפעולה אושרה ובוצעה בהצלחה! הצ'ופר נוסף למערכת." }]);
      }
      await fetchData();
    } catch (error) {
      console.error("Execution error:", error);
      setMessages(prev => [...prev, { role: "model", text: "אירעה שגיאה בביצוע הפעולה." }]);
    } finally {
      setPendingAction(null);
      setIsTyping(false);
    }
  };

  const cancelPendingAction = () => {
    setPendingAction(null);
    setMessages(prev => [...prev, { role: "model", text: "הפעולה בוטלה לבקשתך." }]);
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail.trim()) return;
    setAddingAdmin(true);
    try {
      // Find user by email or just add a placeholder that will be matched on login
      // In a real app, we'd use a cloud function or search users. 
      // Here we'll add a document to 'users' with role 'admin'.
      // Note: The user will need to login with this email to get the UID matched, 
      // or we can just store the email and check it in rules.
      // For simplicity with our rules, we'll assume we add by email and the rule checks the doc.
      await addDoc(collection(db, "users"), {
        email: newAdminEmail.toLowerCase(),
        role: "admin",
        uid: "" // Will be updated on their first login or we can use email-based rules
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, "users"));
      
      setNewAdminEmail("");
      setToast({ message: "מנהל נוסף בהצלחה!", type: "success" });
      fetchData();
    } catch (error) {
      console.error("Add admin failed", error);
    } finally {
      setAddingAdmin(false);
    }
  };

  const testNedarimConnection = async () => {
    setConnectionStatus({ loading: true, data: null, error: null });
    setShowConnectionModal(true);
    try {
      const res = await fetch(`/api/campaign/${mosadId.trim()}`);
      const result = await res.json();
      if (result.success) {
        setConnectionStatus({ loading: false, data: result, error: null });
      } else {
        setConnectionStatus({ loading: false, data: null, error: result.error || "שגיאה לא ידועה" });
      }
    } catch (err: any) {
      setConnectionStatus({ loading: false, data: null, error: err.message });
    }
  };

  const handleUpdateClaimStatus = async (claimId: string, newStatus: string) => {
    try {
      const batch = writeBatch(db);
      const claimRef = doc(db, "claims", claimId);
      batch.update(claimRef, { status: newStatus });
      await batch.commit().catch(err => handleFirestoreError(err, OperationType.UPDATE, `claims/${claimId}`));
      await fetchData();
    } catch (error) {
      console.error("Update claim failed", error);
    }
  };

  const handleTogglePaid = async (claimId: string, currentStatus: boolean) => {
    try {
      const batch = writeBatch(db);
      const claimRef = doc(db, "claims", claimId);
      batch.update(claimRef, { paidInCash: !currentStatus });
      await batch.commit().catch(err => handleFirestoreError(err, OperationType.UPDATE, `claims/${claimId}`));
      await fetchData();
    } catch (error) {
      console.error("Toggle paid failed", error);
    }
  };

  const exportClaimsToExcel = () => {
    const exportData = claims.map(c => ({
      "שם מתרים": c.fundraiserName,
      "קוד מתרים": c.fundraiserId,
      "שם צ'ופר": c.rewardName,
      "סוג": c.type === 'reward' ? 'סכום' : 'יעד %',
      "תאריך": c.date,
      "סטטוס": c.status === 'pending' ? 'ממתין' : 'בוצע',
      "שולם במזומן": c.paidInCash ? 'כן' : 'לא',
      "סכום לתשלום": c.amountToPay || 0
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "מימושי צ'ופרים");
    XLSX.writeFile(wb, `מימושי_צופרים_${new Date().toLocaleDateString()}.xlsx`);
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);
      
      // Check if it's percentage bonuses or absolute rewards or fundraisers
      const isPercentage = data.some((item: any) => item.minPercentage || item.MinPercentage);
      const isFundraisers = data.some((item: any) => item.GroupName || item.GroupNameHe || item.ID);
      
      if (isPercentage) {
        await saveBonuses(data);
      } else if (isFundraisers) {
        await saveFundraisers(data);
      } else {
        await saveRewards(data);
      }
    };
    reader.readAsBinaryString(file);
  };

  const saveFundraisers = async (data: any[]) => {
    setUploading(true);
    try {
      const batch = writeBatch(db);
      const existing = await getDocs(collection(db, "fundraisers")).catch(err => handleFirestoreError(err, OperationType.LIST, "fundraisers"));
      if (existing) {
        existing.docs.forEach(d => batch.delete(d.ref));
      }

      data.forEach((item) => {
        const fundraiserRef = doc(collection(db, "fundraisers"));
        batch.set(fundraiserRef, {
          ID: String(item.ID || item.id || item.code || item.Code || ""),
          GroupName: item.GroupName || item.GroupNameHe || item.name || item.Name || "ללא שם",
          TotalAmount: Number(item.TotalAmount || item.Amount || item.Sum || 0),
          Goal: Number(item.Goal || item.Target || 0),
          Percentage: Number(item.Percentage || 0) || (Number(item.Goal || 0) > 0 ? (Number(item.TotalAmount || 0) / Number(item.Goal || 0)) * 100 : 0)
        });
      });

      await batch.commit().catch(err => handleFirestoreError(err, OperationType.WRITE, "fundraisers"));
      await fetchData();
      setToast({ message: "רשימת המתרימים הועלתה בהצלחה!", type: "success" });
    } catch (error) {
      console.error("Fundraiser upload failed", error);
    } finally {
      setUploading(false);
    }
  };

  const saveBonuses = async (data: any[]) => {
    setUploading(true);
    try {
      const batch = writeBatch(db);
      const existing = await getDocs(collection(db, "goalBonuses")).catch(err => handleFirestoreError(err, OperationType.LIST, "goalBonuses"));
      if (existing) {
        existing.docs.forEach(d => batch.delete(d.ref));
      }

      data.forEach((item) => {
        const bonusRef = doc(collection(db, "goalBonuses"));
        batch.set(bonusRef, {
          name: item.name || item.Name || "הנחה/צ'ופר יעד",
          minPercentage: Number(item.minPercentage || item.MinPercentage || 0),
          description: item.description || item.Description || ""
        });
      });

      await batch.commit().catch(err => handleFirestoreError(err, OperationType.WRITE, "goalBonuses"));
      await fetchData();
      setToast({ message: "הנחות היעד הועלו בהצלחה!", type: "success" });
    } catch (error) {
      console.error("Bonus upload failed", error);
    } finally {
      setUploading(false);
    }
  };

  const saveRewards = async (data: any[]) => {
    setUploading(true);
    try {
      const batch = writeBatch(db);
      const existing = await getDocs(collection(db, "rewards")).catch(err => handleFirestoreError(err, OperationType.LIST, "rewards"));
      if (existing) {
        existing.docs.forEach(d => batch.delete(d.ref));
      }

      data.forEach((item) => {
        const rewardRef = doc(collection(db, "rewards"));
        batch.set(rewardRef, {
          name: item.name || item.Name || "ללא שם",
          minAmount: Number(item.minAmount || item.Goal || item.Amount || 0),
          price: Number(item.price || item.Price || item.מחיר || 0),
          description: item.description || item.Description || "",
          category: item.category || item.Category || ""
        });
      });

      await batch.commit().catch(err => handleFirestoreError(err, OperationType.WRITE, "rewards"));
      await fetchData();
      setToast({ message: "הצ'ופרים הועלו בהצלחה!", type: "success" });
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0]">
        <Loader2 className="w-10 h-10 animate-spin text-[#5A5A40]" />
      </div>
    );
  }

  if (!isPasswordAuthenticated) {
    console.log("Admin: Not authenticated, showing login form");
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0] p-4" dir="rtl">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-[32px] shadow-xl max-w-md w-full text-center border border-[#141414]/5"
        >
          <div className="flex justify-end mb-4">
             <button onClick={() => window.location.reload()} className="p-2 text-[#141414]/20 hover:text-[#5A5A40] transition-colors">
                <RefreshCw className="w-4 h-4" />
             </button>
          </div>
          <ShieldCheck className="w-16 h-16 text-[#5A5A40] mx-auto mb-6" />
          <h1 className="text-2xl font-bold mb-2">כניסת מנהל</h1>
          <p className="text-[#141414]/60 mb-8">אנא הזן סיסמה או התחבר עם גוגל</p>
          
          <form onSubmit={handlePasswordLogin} className="space-y-4 mb-6">
            <input 
              type="password" 
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="סיסמת מנהל"
              className="w-full bg-[#F5F5F0] border-none rounded-2xl py-4 px-6 text-center text-lg focus:ring-2 focus:ring-[#5A5A40]/20 transition-all outline-none"
            />
            {passwordError && <p className="text-red-500 text-sm font-bold">{passwordError}</p>}
            <button 
              type="submit"
              className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold hover:bg-[#4A4A30] transition-all"
            >
              התחבר עם סיסמה
            </button>
          </form>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#141414]/10"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-[#141414]/40">או</span></div>
          </div>

          <button 
            onClick={handleLogin}
            className="w-full border-2 border-[#5A5A40] text-[#5A5A40] py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-[#5A5A40]/5 transition-all"
          >
            <LogIn className="w-5 h-5" />
            התחבר עם Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans" dir="rtl">
      <header className="bg-white border-b border-[#141414]/10 p-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-[#5A5A40] w-8 h-8" />
            <h1 className="text-xl font-bold">פאנל ניהול צ'ופרים</h1>
          </div>
          <div className="flex items-center gap-4">
            <a 
              href="/"
              className="flex items-center gap-2 bg-[#F5F5F0] text-[#141414] px-4 py-2 rounded-xl text-sm font-bold hover:bg-[#141414]/5 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              חזור לאתר
            </a>
            <button 
              onClick={testNedarimConnection}
              className="flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-100 transition-all"
            >
              <TrendingUp className="w-4 h-4" />
              בדוק חיבור לנדרים
            </button>
            <button 
              onClick={() => setShowDataViewer(!showDataViewer)}
              className="flex items-center gap-2 bg-[#5A5A40]/10 text-[#5A5A40] px-4 py-2 rounded-xl text-sm font-bold hover:bg-[#5A5A40]/20 transition-all"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {showDataViewer ? "חזור לניהול" : "צפייה בנתונים ומימושים"}
            </button>
            <span className="text-sm text-[#141414]/60">{user?.email || "מנהל (סיסמה)"}</span>
            <button onClick={() => {
              auth.signOut();
              sessionStorage.removeItem("admin_auth");
              setIsPasswordAuthenticated(false);
            }} className="text-xs font-bold uppercase tracking-widest hover:text-red-500 transition-colors">התנתק</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {showDataViewer ? (
            <div className="space-y-8">
              <div className="bg-white p-4 rounded-2xl border border-[#141414]/5 flex gap-2">
                <button 
                  onClick={() => setActiveTab("fundraisers")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "fundraisers" ? "bg-[#5A5A40] text-white" : "hover:bg-[#F5F5F0]"}`}
                >
                  מתרימים
                </button>
                <button 
                  onClick={() => setActiveTab("claims")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "claims" ? "bg-[#5A5A40] text-white" : "hover:bg-[#F5F5F0]"}`}
                >
                  מימושי צ'ופרים
                </button>
                <button 
                  onClick={() => setActiveTab("rules")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "rules" ? "bg-[#5A5A40] text-white" : "hover:bg-[#F5F5F0]"}`}
                >
                  חוקי מחשבון
                </button>
                <button 
                  onClick={() => setActiveTab("settings")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "settings" ? "bg-[#5A5A40] text-white" : "hover:bg-[#F5F5F0]"}`}
                >
                  הגדרות
                </button>
                <button 
                  onClick={() => setActiveTab("admins")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "admins" ? "bg-[#5A5A40] text-white" : "hover:bg-[#F5F5F0]"}`}
                >
                  מנהלים
                </button>
              </div>

              {activeTab === "fundraisers" && (
                <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#141414]/5">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold flex items-center gap-3">
                      <Bot className="w-6 h-6 text-[#5A5A40]" />
                      חשבונות קמפיין (מתרימים)
                      {campaignData?.groups?.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">מחובר לנדרים פלוס ({campaignData.groups.length} מתרימים)</span>
                          <button 
                            onClick={fetchData}
                            className="p-1 hover:bg-[#141414]/5 rounded-full transition-all"
                            title="רענן נתונים"
                          >
                            <RefreshCw className="w-3 h-3 text-[#141414]/40" />
                          </button>
                        </div>
                      )}
                    </h2>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <input 
                          type="text"
                          placeholder="הוסף מזהה ידנית..."
                          className="text-xs border border-[#141414]/10 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-[#5A5A40]"
                          value={manualIdInput}
                          onChange={(e) => setManualIdInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleManualIdAdd()}
                        />
                      </div>
                      <button 
                        onClick={handleManualIdAdd}
                        disabled={addingManualId}
                        className="bg-[#5A5A40] text-white text-xs px-3 py-1.5 rounded-lg font-bold hover:bg-[#4A4A30] disabled:opacity-50 flex items-center gap-1"
                      >
                        {addingManualId ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        הוסף/רענן מזהה
                      </button>
                    </div>
                    {fundraisers.length > 0 && (
                      <button 
                        onClick={() => {
                          setConfirmModal({
                            title: "ניקוי נתונים ידניים",
                            message: "האם אתה בטוח שברצונך למחוק את כל נתוני המתרימים שהועלו ידנית? פעולה זו לא תמחק נתונים מנדרים פלוס.",
                            danger: true,
                            onConfirm: async () => {
                              const batch = writeBatch(db);
                              fundraisers.forEach(f => {
                                batch.delete(doc(db, "fundraisers", f.id));
                              });
                              await batch.commit();
                              setFundraisers([]);
                              setToast({ message: "הנתונים הידניים נמחקו.", type: "success" });
                            }
                          });
                        }}
                        className="text-xs text-red-500 font-bold hover:underline flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        נקה נתונים ידניים
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right">
                      <thead>
                        <tr className="border-b border-[#141414]/5 text-xs text-[#141414]/40 uppercase tracking-widest">
                          <th className="pb-4 font-bold">קוד</th>
                          <th className="pb-4 font-bold">שם</th>
                          <th className="pb-4 font-bold">נאסף</th>
                          <th className="pb-4 font-bold">יעד</th>
                          <th className="pb-4 font-bold">ביצוע</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {(campaignData?.groups?.length > 0 ? campaignData.groups : fundraisers)?.map((g: any, i: number) => (
                          <tr key={i} className="border-b border-[#141414]/5 last:border-0">
                            <td className="py-4 font-mono text-xs text-[#141414]/40">#{g.ID || g.GroupId || g.Code || g.GroupCode || "N/A"}</td>
                            <td className="py-4 font-bold">{g.GroupName || g.Name || "ללא שם"}</td>
                            <td className="py-4">₪{(g.TotalAmount || g.Amount || 0).toLocaleString()}</td>
                            <td className="py-4">₪{(g.Goal || 0).toLocaleString()}</td>
                            <td className="py-4">
                              <span className={`px-2 py-1 rounded-lg font-bold text-xs ${(g.Percentage || 0) >= 100 ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                                {Math.round(g.Percentage || 0)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === "claims" && (
                <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#141414]/5">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold flex items-center gap-3">
                      <Gift className="w-6 h-6 text-[#5A5A40]" />
                      מימושי צ'ופרים
                    </h2>
                    <button 
                      onClick={exportClaimsToExcel}
                      className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-700 transition-all"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      הורדה לאקסל
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right">
                      <thead>
                        <tr className="border-b border-[#141414]/5 text-xs text-[#141414]/40 uppercase tracking-widest">
                          <th className="pb-4 font-bold">מתרים</th>
                          <th className="pb-4 font-bold">צ'ופר</th>
                          <th className="pb-4 font-bold">תאריך</th>
                          <th className="pb-4 font-bold">שולם?</th>
                          <th className="pb-4 font-bold">סטטוס</th>
                          <th className="pb-4 font-bold">פעולות</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {claims.map((claim) => (
                          <tr key={claim.id} className="border-b border-[#141414]/5 last:border-0">
                            <td className="py-4">
                              <div className="font-bold">{claim.fundraiserName || "ללא שם"}</div>
                              <div className="text-[10px] text-[#141414]/40 font-mono">#{claim.fundraiserId || "N/A"}</div>
                            </td>
                            <td className="py-4">
                              <div className="font-bold">{claim.rewardName || "ללא שם"}</div>
                              <div className={`text-[10px] font-bold ${claim.type === 'reward' ? 'text-green-600' : 'text-purple-600'}`}>
                                {claim.type === 'reward' ? 'סכום' : 'יעד %'}
                              </div>
                            </td>
                            <td className="py-4 text-[#141414]/60">{claim.date || "טרם"}</td>
                            <td className="py-4">
                              {claim.paidInCash ? (
                                <button 
                                  onClick={() => handleTogglePaid(claim.id, true)}
                                  className="flex flex-col items-center gap-1 group"
                                >
                                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">₪{(claim.amountToPay || 0).toLocaleString()}</span>
                                  <span className="text-[9px] text-green-600 font-bold">שולם ✓</span>
                                </button>
                              ) : (claim.amountToPay || 0) > 0 ? (
                                <button 
                                  onClick={() => handleTogglePaid(claim.id, false)}
                                  className="flex flex-col items-center gap-1 group"
                                >
                                  <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">₪{(claim.amountToPay || 0).toLocaleString()}</span>
                                  <span className="text-[9px] text-red-400 font-bold group-hover:text-red-600">לא שולם</span>
                                </button>
                              ) : (
                                <span className="text-[10px] text-[#141414]/20">-</span>
                              )}
                            </td>
                            <td className="py-4">
                              <span className={`px-2 py-1 rounded-lg font-bold text-xs ${claim.status === 'completed' ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                {claim.status === 'completed' ? "בוצע" : "ממתין"}
                              </span>
                            </td>
                            <td className="py-4">
                              <div className="flex gap-2">
                                {claim.status !== 'completed' && (
                                  <button 
                                    onClick={() => handleUpdateClaimStatus(claim.id, 'completed')}
                                    className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                                    title="סמן כבוצע"
                                  >
                                    <ShieldCheck className="w-4 h-4" />
                                  </button>
                                )}
                                <button 
                                  onClick={() => setConfirmModal({
                                    title: "מחיקת בקשה",
                                    message: `האם אתה בטוח שברצונך למחוק את הבקשה של ${claim.fundraiserName}?`,
                                    danger: true,
                                    onConfirm: () => deleteDoc(doc(db, "claims", claim.id)).then(fetchData)
                                  })}
                                  className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                                  title="מחק בקשה"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === "rules" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#141414]/5">
                    <h2 className="text-xl font-bold mb-6">ניהול צ'ופרי סכום</h2>
                    <div className="space-y-4">
                      {rewards.map((reward) => (
                        <div key={reward.id} className="p-4 bg-[#F5F5F0] rounded-2xl flex justify-between items-center">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-sm">{reward.name || "ללא שם"}</h3>
                              <span className="text-[10px] text-[#141414]/30 font-mono">#{reward.id?.slice(-4).toUpperCase() || "????"}</span>
                            </div>
                            <p className="text-xs text-[#141414]/40">יעד: ₪{(reward.minAmount || 0).toLocaleString()} | מחיר: ₪{reward.price?.toLocaleString() || 0}</p>
                          </div>
                          <button 
                            onClick={() => setConfirmModal({
                              title: "מחיקת צ'ופר",
                              message: `האם אתה בטוח שברצונך למחוק את הצ'ופר ${reward.name}?`,
                              danger: true,
                              onConfirm: () => deleteDoc(doc(db, "rewards", reward.id)).then(fetchData)
                            })}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#141414]/5">
                    <h2 className="text-xl font-bold mb-6">ניהול הנחות יעד</h2>
                    <div className="space-y-4">
                      {bonuses.map((bonus) => (
                        <div key={bonus.id} className="p-4 bg-[#F5F5F0] rounded-2xl flex justify-between items-center">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-sm">{bonus.name || "ללא שם"}</h3>
                              <span className="text-[10px] text-[#141414]/30 font-mono">#{bonus.id?.slice(-4).toUpperCase() || "????"}</span>
                            </div>
                            <p className="text-xs text-[#141414]/40">{bonus.minPercentage || 0}% יעד</p>
                          </div>
                          <button 
                            onClick={() => setConfirmModal({
                              title: "מחיקת הנחת יעד",
                              message: `האם אתה בטוח שברצונך למחוק את הנחת היעד ${bonus.name}?`,
                              danger: true,
                              onConfirm: () => deleteDoc(doc(db, "goalBonuses", bonus.id)).then(fetchData)
                            })}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "settings" && (
                <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#141414]/5">
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                    <RefreshCw className="w-6 h-6 text-[#5A5A40]" />
                    הגדרות קמפיין
                  </h2>
                  <div className="space-y-6 max-w-md">
                    <div>
                      <label className="block text-sm font-bold mb-2">קוד מוסד (Mosad ID)</label>
                      <div className="flex gap-2 mb-2">
                        <input 
                          type="text" 
                          value={mosadId}
                          onChange={(e) => setMosadId(e.target.value)}
                          className="flex-1 bg-[#F5F5F0] border-none rounded-2xl py-4 px-6 focus:ring-2 focus:ring-[#5A5A40]/20 transition-all outline-none"
                          placeholder="למשל: 7011088"
                        />
                        <button 
                          onClick={testNedarimConnection}
                          className="px-6 bg-[#F5F5F0] text-[#5A5A40] rounded-2xl font-bold hover:bg-[#E5E5E0] transition-all"
                        >
                          בדיקה
                        </button>
                      </div>
                      <p className="text-[10px] text-[#141414]/40 mt-2">זהו הקוד שמושך את הנתונים האוטומטיים מהקמפיין.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-bold mb-2">יעד ידני (Manual Goal)</label>
                      <input 
                        type="number" 
                        value={manualGoal}
                        onChange={(e) => setManualGoal(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full bg-[#F5F5F0] border-none rounded-2xl py-4 px-6 focus:ring-2 focus:ring-[#5A5A40]/20 transition-all outline-none"
                        placeholder="השאר ריק לשימוש ביעד מנדרים פלוס"
                      />
                      <p className="text-[10px] text-[#141414]/40 mt-2">אם יוזן ערך, הוא ידרוס את היעד שמגיע מנדרים פלוס.</p>
                    </div>
                    <button 
                      onClick={handleSaveSettings}
                      disabled={savingSettings}
                      className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold hover:bg-[#4A4A30] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {savingSettings ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                      שמור הגדרות
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "admins" && (
                <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#141414]/5">
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                    <ShieldCheck className="w-6 h-6 text-[#5A5A40]" />
                    ניהול מנהלים
                  </h2>
                  
                  <form onSubmit={handleAddAdmin} className="flex gap-4 mb-8">
                    <input 
                      type="email" 
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder="אימייל של המנהל החדש"
                      className="flex-1 bg-[#F5F5F0] border-none rounded-2xl py-4 px-6 focus:ring-2 focus:ring-[#5A5A40]/20 transition-all outline-none"
                      required
                    />
                    <button 
                      type="submit"
                      disabled={addingAdmin}
                      className="bg-[#5A5A40] text-white px-8 py-4 rounded-2xl font-bold hover:bg-[#4A4A30] transition-all disabled:opacity-50"
                    >
                      {addingAdmin ? "מוסיף..." : "הוסף מנהל"}
                    </button>
                  </form>

                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 text-blue-700 rounded-2xl text-sm font-bold flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" />
                      מנהל ראשי: yj3302006@gmail.com
                    </div>
                    {admins.map((admin) => (
                      <div key={admin.id} className="p-4 bg-[#F5F5F0] rounded-2xl flex justify-between items-center">
                        <div>
                          <p className="font-bold">{admin.email}</p>
                          <p className="text-[10px] text-[#141414]/40">ID: {admin.id}</p>
                        </div>
                        {admin.email !== "yj3302006@gmail.com" && (
                          <button 
                            onClick={() => setConfirmModal({
                              title: "הסרת מנהל",
                              message: `האם אתה בטוח שברצונך להסיר את המנהל ${admin.email}?`,
                              danger: true,
                              onConfirm: () => deleteDoc(doc(db, "users", admin.id)).then(fetchData)
                            })}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#141414]/5">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <Upload className="w-6 h-6 text-[#5A5A40]" />
                  העלאת טבלאות
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="p-4 bg-[#F5F5F0] rounded-2xl">
                    <h3 className="font-bold mb-2">מתרימים (רשימה ידנית)</h3>
                    <p className="text-xs text-[#141414]/60">עמודות: ID, GroupName, TotalAmount, Goal</p>
                  </div>
                  <div className="p-4 bg-[#F5F5F0] rounded-2xl">
                    <h3 className="font-bold mb-2">צ'ופרים (לפי סכום)</h3>
                    <p className="text-xs text-[#141414]/60">עמודות: name, minAmount, description</p>
                  </div>
                  <div className="p-4 bg-[#F5F5F0] rounded-2xl">
                    <h3 className="font-bold mb-2">הנחות/בונוסים (לפי יעד %)</h3>
                    <p className="text-xs text-[#141414]/60">עמודות: name, minPercentage, description</p>
                  </div>
                </div>
                
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-[#141414]/10 rounded-[32px] cursor-pointer hover:bg-[#F5F5F0] transition-all group">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    {uploading ? (
                      <Loader2 className="w-12 h-12 text-[#5A5A40] animate-spin mb-4" />
                    ) : (
                      <FileSpreadsheet className="w-12 h-12 text-[#141414]/20 group-hover:text-[#5A5A40] mb-4 transition-colors" />
                    )}
                    <p className="mb-2 text-sm text-[#141414]/60"><span className="font-bold">לחץ להעלאה</span> או גרור קובץ לכאן</p>
                    <p className="text-xs text-[#141414]/40">המערכת תזהה אוטומטית את סוג הטבלה</p>
                  </div>
                  <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} disabled={uploading} />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#141414]/5">
                  <h2 className="text-xl font-bold mb-6">צ'ופרי סכום ({rewards.length})</h2>
                  <div className="space-y-4">
                    {rewards.map((reward) => (
                      <div key={reward.id} className="p-4 bg-[#F5F5F0] rounded-2xl">
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-sm">{reward.name}</h3>
                          <span className="bg-[#5A5A40] text-white px-2 py-0.5 rounded-full text-[10px] font-bold">₪{reward.minAmount.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-8 rounded-[32px] shadow-sm border border-[#141414]/5">
                  <h2 className="text-xl font-bold mb-6">הנחות יעד ({bonuses.length})</h2>
                  <div className="space-y-4">
                    {bonuses.map((bonus) => (
                      <div key={bonus.id} className="p-4 bg-[#F5F5F0] rounded-2xl">
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-sm">{bonus.name}</h3>
                          <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-[10px] font-bold">{bonus.minPercentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* System Management Section */}
              <div className="mt-12 bg-white p-8 rounded-[32px] shadow-sm border border-red-100">
                <h2 className="text-xl font-bold mb-6 text-red-600 flex items-center gap-2">
                  <ShieldCheck className="w-6 h-6" />
                  ניהול מערכת ואיפוס נתונים
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button 
                    onClick={handleResetClaims}
                    className="flex items-center justify-center gap-2 p-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-all font-bold border border-red-100"
                  >
                    <Trash2 className="w-5 h-5" />
                    איפוס כל בקשות הצ'ופרים (חשבונות)
                  </button>
                  <button 
                    onClick={handleResetBonuses}
                    className="flex items-center justify-center gap-2 p-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-all font-bold border border-red-100"
                  >
                    <Trash2 className="w-5 h-5" />
                    איפוס כל הנחות היעד
                  </button>
                </div>
                <p className="mt-4 text-xs text-red-400 text-center">שים לב: פעולות אלו מוחקות נתונים לצמיתות ממסד הנתונים.</p>
              </div>
            </>
          )}
        </div>

        {/* AI Assistant Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-[32px] shadow-sm border border-[#141414]/5 h-[calc(100vh-160px)] flex flex-col sticky top-24 overflow-hidden">
            <div className="p-6 border-b border-[#141414]/5 bg-[#5A5A40]/5 flex items-center gap-3">
              <div className="w-10 h-10 bg-[#5A5A40] rounded-2xl flex items-center justify-center">
                <Sparkles className="text-white w-6 h-6" />
              </div>
              <div>
                <h2 className="font-bold">עוזר AI חכם</h2>
                <p className="text-[10px] text-[#5A5A40] font-bold uppercase tracking-widest">ניתוח נתוני קמפיין</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-12">
                  <Bot className="w-12 h-12 text-[#141414]/10 mx-auto mb-4" />
                  <p className="text-sm text-[#141414]/40">שלום! אני כאן כדי לעזור לך לנהל את חוקי המחשבון ולנתח נתונים. מה תרצה לעשות?</p>
                  <div className="mt-6 space-y-2">
                    <p className="text-[10px] font-bold text-[#5A5A40] uppercase tracking-widest text-right mb-2">פקודות מחשבון (דוגמאות):</p>
                    <button onClick={() => setInput("תוסיף הנחה של 10% למי שמגיע ל-120% יעד")} className="block w-full text-right text-xs p-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors border border-purple-100">תוסיף הנחה של 10% למי שמגיע ל-120% יעד</button>
                    <button onClick={() => setInput("תוסיף צ'ופר 'ארוחת ערב' למי שאסף 5000 שקל")} className="block w-full text-right text-xs p-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors border border-green-100">תוסיף צ'ופר 'ארוחת ערב' למי שאסף 5000 שקל</button>
                    
                    <p className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest text-right mt-4 mb-2">ניתוח נתונים:</p>
                    <button onClick={() => setInput("מי המתרים המוביל כרגע?")} className="block w-full text-right text-xs p-2 bg-[#F5F5F0] rounded-lg hover:bg-[#5A5A40]/10 transition-colors">מי המתרים המוביל כרגע?</button>
                    <button onClick={() => setInput("מי זקוק לעידוד?")} className="block w-full text-right text-xs p-2 bg-[#F5F5F0] rounded-lg hover:bg-[#5A5A40]/10 transition-colors">מי זקוק לעידוד?</button>
                  </div>
                </div>
              )}
              
              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}
                  >
                    <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${
                      m.role === "user" 
                        ? "bg-[#F5F5F0] text-[#141414] rounded-tr-none" 
                        : "bg-[#5A5A40] text-white rounded-tl-none"
                    }`}>
                      {m.text}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {isTyping && (
                <div className="flex justify-end">
                  <div className="bg-[#5A5A40] text-white p-4 rounded-2xl rounded-tl-none">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>
              )}

              {pendingAction && !isTyping && (
                <div className="flex justify-end gap-2 pt-2">
                  <button 
                    onClick={executePendingAction}
                    className="bg-green-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-green-700 transition-colors"
                  >
                    אשר ביצוע
                  </button>
                  <button 
                    onClick={cancelPendingAction}
                    className="bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-600 transition-colors"
                  >
                    בטל
                  </button>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 border-t border-[#141414]/5 bg-white">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder={pendingAction ? "אנא אשר או בטל את הפעולה..." : "שאל את ה-AI..."}
                  disabled={!!pendingAction}
                  className="w-full bg-[#F5F5F0] border-none rounded-2xl py-3 pr-4 pl-12 text-sm focus:ring-2 focus:ring-[#5A5A40]/20 transition-all outline-none disabled:opacity-50"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isTyping || !!pendingAction}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-[#5A5A40] text-white rounded-xl flex items-center justify-center hover:bg-[#4A4A30] transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConnectionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white p-8 rounded-[32px] shadow-2xl max-w-2xl w-full border border-[#141414]/5 overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold flex items-center gap-3">
                  <TrendingUp className="w-6 h-6 text-blue-600" />
                  סטטוס חיבור לנדרים פלוס
                </h3>
                <button onClick={() => setShowConnectionModal(false)} className="p-2 hover:bg-[#F5F5F0] rounded-full transition-colors">
                  <RefreshCw className="w-5 h-5 rotate-45" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2">
                {connectionStatus.loading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                    <p className="font-bold text-blue-600">בודק חיבור מול השרתים...</p>
                  </div>
                ) : connectionStatus.error ? (
                  <div className="p-6 bg-red-50 border border-red-100 rounded-2xl text-red-700">
                    <div className="flex items-center gap-3 mb-2">
                      <AlertCircle className="w-6 h-6" />
                      <h4 className="font-bold">החיבור נכשל</h4>
                    </div>
                    <p className="text-sm">{connectionStatus.error}</p>
                    <div className="mt-4 p-4 bg-white/50 rounded-xl text-xs font-mono">
                      טיפ: וודא שקוד המוסד ({mosadId}) תקין ושהקמפיין פעיל בנדרים פלוס.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="p-6 bg-green-50 border border-green-100 rounded-2xl text-green-700">
                      <div className="flex items-center gap-3 mb-2">
                        <ShieldCheck className="w-6 h-6" />
                        <h4 className="font-bold">החיבור תקין!</h4>
                      </div>
                      <p className="text-sm">הנתונים נמשכו בהצלחה מנדרים פלוס.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-[#F5F5F0] rounded-2xl">
                        <p className="text-[10px] text-[#141414]/40 uppercase font-bold mb-1">שם קמפיין</p>
                        <p className="font-bold">{connectionStatus.data?.campaign?.CampaignName}</p>
                      </div>
                      <div className="p-4 bg-[#F5F5F0] rounded-2xl">
                        <p className="text-[10px] text-[#141414]/40 uppercase font-bold mb-1">מספר קבוצות</p>
                        <p className="font-bold">{connectionStatus.data?.groups?.length || 0}</p>
                      </div>
                    </div>

                    <div className="p-4 bg-[#F5F5F0] rounded-2xl">
                      <p className="text-[10px] text-[#141414]/40 uppercase font-bold mb-2">נתונים גולמיים (JSON)</p>
                      <pre className="text-[10px] font-mono bg-white/50 p-4 rounded-xl overflow-x-auto max-h-40">
                        {JSON.stringify(connectionStatus.data, null, 2)}
                      </pre>
                    </div>

                    <button 
                      onClick={async () => {
                        if (!connectionStatus.data?.groups) return;
                        setConnectionStatus(prev => ({ ...prev, loading: true }));
                        try {
                          await saveFundraisers(connectionStatus.data.groups);
                          setToast({ message: "הנתונים סונכרנו בהצלחה!", type: "success" });
                          setShowConnectionModal(false);
                        } catch (err) {
                          setConnectionStatus(prev => ({ ...prev, loading: false, error: "סנכרון נכשל" }));
                        }
                      }}
                      className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all"
                    >
                      <RefreshCw className="w-5 h-5" />
                      סנכרן נתונים למערכת
                    </button>
                  </div>
                )}
              </div>

              <button 
                onClick={() => setShowConnectionModal(false)}
                className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold mt-6 hover:bg-[#4A4A30] transition-all"
              >
                סגור
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl"
            >
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${confirmModal.danger ? 'bg-red-50 text-red-600' : 'bg-[#5A5A40]/10 text-[#5A5A40]'}`}>
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold mb-2">{confirmModal.title}</h3>
              <p className="text-[#141414]/60 mb-8">{confirmModal.message}</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 py-4 rounded-2xl font-bold bg-[#F5F5F0] hover:bg-[#E4E3E0] transition-all"
                >
                  ביטול
                </button>
                <button 
                  onClick={async () => {
                    await confirmModal.onConfirm();
                    setConfirmModal(null);
                  }}
                  className={`flex-1 py-4 rounded-2xl font-bold text-white transition-all ${confirmModal.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#5A5A40] hover:bg-[#4A4A30]'}`}
                >
                  אישור
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notifications */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3 border ${
              toast.type === 'success' ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'
            }`}
          >
            {toast.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-bold">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 hover:opacity-50">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
