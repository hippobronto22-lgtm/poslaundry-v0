import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { db } from './firebase';
import { 
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, 
  doc, setDoc, getDocs, query, orderBy, where 
} from 'firebase/firestore';

// ============================================================================
// INITIAL DATA SEEDING
// ============================================================================

const INITIAL_OUTLETS = [
  { id: 'o1', name: 'Outlet Pusat - Depok', address: 'Jl. Margonda Raya No. 1' },
  { id: 'o2', name: 'Cabang - Jakarta Selatan', address: 'Jl. Sudirman No. 10' }
];

const INITIAL_SERVICES = [
  { id: 's1', name: 'Cuci Kering Setrika', durationStr: '2 Hari', priceKiloan: 7000, priceSatuan: 15000 },
  { id: 's2', name: 'Cuci Kering Lipat <5kg', durationStr: '2 Hari', priceKiloan: 6000, priceSatuan: 0 },
  { id: 's3', name: 'Cuci Kering Lipat >5kg', durationStr: '2 Hari', priceKiloan: 5500, priceSatuan: 0 },
  { id: 's4', name: 'Setrika Saja', durationStr: '1 Hari', priceKiloan: 4000, priceSatuan: 8000 },
  { id: 's5', name: 'Cuci Kering Setrika EXPRESS', durationStr: '6 Jam', priceKiloan: 12000, priceSatuan: 25000 },
  { id: 's6', name: 'Cuci Kering Lipat EXPRESS <5kg', durationStr: '6 Jam', priceKiloan: 10000, priceSatuan: 0 },
  { id: 's7', name: 'Cuci Kering Lipat EXPRESS >5kg', durationStr: '6 Jam', priceKiloan: 9000, priceSatuan: 0 },
  { id: 's8', name: 'Setrika EXPRESS', durationStr: '6 Jam', priceKiloan: 8000, priceSatuan: 15000 },
];

const INITIAL_DEPOSIT_PACKAGES = [
  { id: 'dp1', name: 'Paket Silver', price: 500000, nominal: 550000, validityType: 'hari', validityValue: 30 },
  { id: 'dp2', name: 'Paket Sultan', price: 1000000, nominal: 1200000, validityType: 'tanpa_batas', validityValue: '' },
];

const INITIAL_CUSTOMERS = [
  { id: 'c1', customerId: 'CS-0001', name: 'Budi Santoso', phone: '081234567890', address: 'Jl. Margonda Raya 12', totalOrders: 5, depositBalance: 150000, depositPackage: 'Paket Silver', depositExpiry: '15/12/2026', firstWashDate: '10/01/2026', totalDepositAccumulated: 550000, totalTransactionValue: 400000, totalKg: 25.5, totalPcs: 10 },
  { id: 'c2', customerId: 'CS-0002', name: 'Siti Aminah', phone: '085711223344', address: 'Kukusan, Depok', totalOrders: 2, depositBalance: 0, depositPackage: '-', depositExpiry: '-', firstWashDate: '15/02/2026', totalDepositAccumulated: 0, totalTransactionValue: 150000, totalKg: 10, totalPcs: 0 },
  { id: 'c3', customerId: 'CS-0003', name: 'Andi Wijaya', phone: '081199887766', address: 'Pesona Khayangan', totalOrders: 12, depositBalance: 45000, depositPackage: 'Paket Sultan', depositExpiry: 'Tanpa Batas', firstWashDate: '01/11/2025', totalDepositAccumulated: 1200000, totalTransactionValue: 1155000, totalKg: 80, totalPcs: 35 },
];

const INITIAL_EMPLOYEES = [
  { id: 'emp1', noKtp: '3276012345678901', name: 'Ahmad Pegawai', dob: '1995-08-17', gender: 'Laki-laki', addressKtp: 'Jl. Pemuda No 10, Depok', addressDom: 'Jl. Pemuda No 10, Depok', sameAddress: true, photo: 'KTP_Ahmad.jpg' }
];

const INITIAL_EXPENSES = [
  { id: 'e1', outletId: 'o1', date: new Date().toISOString(), name: 'Beli Deterjen Cair 5L', category: 'OPEX', qty: 2, cost: 50000, total: 100000, note: 'Restock mingguan' },
  { id: 'e2', outletId: 'o1', date: new Date(new Date().setMonth(new Date().getMonth() - 2)).toISOString(), name: 'Mesin Cuci Front Load LG', category: 'CAPEX', qty: 1, cost: 6000000, total: 6000000, usefulLife: 24, monthlyDepreciation: 250000, note: 'Mesin baru' },
];

const INITIAL_RECEIPT_SETTINGS = {
  storeName: 'MONIC LAUNDRY',
  tagline: 'Premium Laundry Service',
  address: 'Jl. Margonda Raya No. 1, Depok',
  footerText: 'Terima kasih telah mempercayakan pakaian Anda kepada kami.',
  showQR: true,
  internalTitle: 'ORDER PRODUKSI',
  internalShowQR: true
};

// --- UTILITIES ---
const formatIDR = (amount) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount || 0);
};

// FIX #4: Perbaikan parsing tanggal dari format id-ID (DD/MM/YYYY)
const parseIdDate = (dateStr) => {
  if (!dateStr) return null;
  // Format dari toLocaleString('id-ID') bisa seperti "18/04/2026, 10:30:00"
  const datePart = dateStr.split(',')[0].trim();
  const parts = datePart.split('/');
  if (parts.length === 3) {
    // parts = [DD, MM, YYYY] -> new Date(YYYY, MM-1, DD)
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  return new Date(dateStr);
};

// --- EXCEL UTILITIES ---
const downloadExcel = (filename, headers) => {
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, filename);
};

const parseExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};


const calculatePengeluaran = (expenses, filterPeriod) => {
  const now = new Date();
  let total = 0;
  expenses.forEach(e => {
    const d = new Date(e.date);
    const isSameMonth = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    const isSameDay = d.toDateString() === now.toDateString();

    if (e.category === 'OPEX') {
      if (filterPeriod === 'Semua Waktu') total += e.total;
      else if (filterPeriod === 'Bulan Ini' && isSameMonth) total += e.total;
      else if (filterPeriod === 'Hari Ini' && isSameDay) total += e.total;
    } else if (e.category === 'CAPEX') {
      let monthsPassed = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()) + 1;
      if (monthsPassed < 0) monthsPassed = 0;
      if (monthsPassed > e.usefulLife) monthsPassed = e.usefulLife;

      if (filterPeriod === 'Semua Waktu') total += (monthsPassed * e.monthlyDepreciation);
      else if (filterPeriod === 'Bulan Ini') { if (monthsPassed > 0 && monthsPassed <= e.usefulLife) total += e.monthlyDepreciation; }
      else if (filterPeriod === 'Hari Ini') { if (monthsPassed > 0 && monthsPassed <= e.usefulLife) total += (e.monthlyDepreciation / 30); }
    }
  });
  return total;
};

// ============================================================================
// KOMPONEN UTAMA (APP)
// ============================================================================
export default function App() {
  const [activeTab, setActiveTab] = useState('newOrder');

  // GLOBAL STATES
  const [outlets, setOutlets] = useState([]);
  const [activeOutletId, setActiveOutletId] = useState('all');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [transactions, setTransactions] = useState([]);
  const [services, setServices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [depositPackages, setDepositPackages] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [receiptSettings, setReceiptSettings] = useState(INITIAL_RECEIPT_SETTINGS);
  
  // AUTH STATES
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [pickups, setPickups] = useState([]);
  const [deliveries, setDeliveries] = useState([]);

  const [categories, setCategories] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);


  // --- FIREBASE SYNC LOGIC ---

  // Helper to Seed Data if Collection is Empty
  const seedCollection = async (collectionName, initialData) => {
    const querySnapshot = await getDocs(collection(db, collectionName));
    if (querySnapshot.empty) {
      console.log(`Seeding ${collectionName}...`);
      for (const item of initialData) {
        // Use provided id if exists, otherwise Firebase will generate one
        if (item.id) {
          await setDoc(doc(db, collectionName, item.id), item);
        } else {
          await addDoc(collection(db, collectionName), item);
        }
      }
    }
  };

  useEffect(() => {
    const initializeData = async () => {
      await seedCollection('outlets', INITIAL_OUTLETS);
      await seedCollection('services', INITIAL_SERVICES);
      await seedCollection('customers', INITIAL_CUSTOMERS);
      await seedCollection('deposit_packages', INITIAL_DEPOSIT_PACKAGES);
      await seedCollection('expenses', INITIAL_EXPENSES);
      await seedCollection('employees', INITIAL_EMPLOYEES);
      await seedCollection('pickups', [
        { id: 'p1', customerId: 'CS-0001', name: 'Budi Santoso', phone: '081234567890', date: '19/04/2026', time: '10:00', address: 'Jl. Margonda Raya 12', category: 'Kiloan', service: 'Cuci Kering Setrika', status: 'Pending', outletId: 'o1' }
      ]);
      await seedCollection('deliveries', [
        { id: 'd1', customerId: 'CS-0003', name: 'Andi Wijaya', phone: '081199887766', invoiceNo: 'INV-123456', date: '19/04/2026', time: '15:00', category: 'Satuan', service: 'Setrika Saja', note: 'Titip di satpam', status: 'On Process', outletId: 'o1' }
      ]);
      await seedCollection('categories', ['Kiloan', 'Satuan'].map(c => ({ name: c })));
      await seedCollection('payment_methods', ['Cash', 'Transfer', 'QRIS', 'Deposit'].map(m => ({ name: m })));
      
      // Receipt Settings (Special case: single doc)
      const settingsSnap = await getDocs(collection(db, 'settings'));
      if (settingsSnap.empty) {
        await setDoc(doc(db, 'settings', 'general'), INITIAL_RECEIPT_SETTINGS);
      }

      // User Seeding (Initial Owner)
      const userSnap = await getDocs(collection(db, 'users'));
      const hasOwner = !userSnap.empty && userSnap.docs.some(d => d.data().username === 'owner');
      
      if (!hasOwner) {
        console.log("Seeding initial Owner and Kasir accounts...");
        await addDoc(collection(db, 'users'), {
          name: 'Owner Monic',
          username: 'owner',
          password: 'owner123',
          role: 'Owner',
          outletId: 'all'
        });
        
        // Only seed kasir if collection is really empty
        if (userSnap.empty) {
          await addDoc(collection(db, 'users'), {
            name: 'Kasir Utama',
            username: 'kasir',
            password: 'kasir123',
            role: 'Kasir',
            outletId: 'o1'
          });
        }
      }
    };

    initializeData();

    // Listeners for Real-time Updates
    const unsubscribeList = [
      onSnapshot(collection(db, 'outlets'), (snapshot) => setOutlets(snapshot.docs.map(d => ({ ...d.data(), id: d.id })))),
      onSnapshot(query(collection(db, 'transactions'), orderBy('date', 'desc')), (snapshot) => setTransactions(snapshot.docs.map(d => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, 'services'), (snapshot) => setServices(snapshot.docs.map(d => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, 'customers'), (snapshot) => setCustomers(snapshot.docs.map(d => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, 'deposit_packages'), (snapshot) => setDepositPackages(snapshot.docs.map(d => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, 'expenses'), (snapshot) => setExpenses(snapshot.docs.map(d => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, 'employees'), (snapshot) => setEmployees(snapshot.docs.map(d => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, 'pickups'), (snapshot) => setPickups(snapshot.docs.map(d => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, 'deliveries'), (snapshot) => setDeliveries(snapshot.docs.map(d => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, 'categories'), (snapshot) => setCategories(snapshot.docs.map(d => d.data().name))),
      onSnapshot(collection(db, 'payment_methods'), (snapshot) => setPaymentMethods(snapshot.docs.map(d => d.data().name))),
      onSnapshot(collection(db, 'users'), (snapshot) => setUsers(snapshot.docs.map(d => ({ ...d.data(), id: d.id })))),
      onSnapshot(doc(db, 'settings', 'general'), (doc) => { if (doc.exists()) setReceiptSettings(doc.data()); })
    ];

    return () => unsubscribeList.forEach(unsub => unsub());
  }, []);

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    
    // Check local session
    const savedUser = localStorage.getItem('monic_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }
    setAuthLoading(false);

    return () => document.head.removeChild(link);
  }, []);

  // Update effect to lock outlet for Kasir
  useEffect(() => {
    if (currentUser && currentUser.role === 'Kasir' && currentUser.outletId) {
      setActiveOutletId(currentUser.outletId);
    }
  }, [currentUser]);

  // FIX #3 & #6: handleAddTransaction mengelola semua perubahan customer terpusat di sini
  // termasuk update saldo deposit untuk pembayaran pakai deposit maupun top up
  const handleAddTransaction = async (newTrx) => {
    const trxWithOutlet = { ...newTrx, outletId: activeOutletId };
    await addDoc(collection(db, 'transactions'), trxWithOutlet);

    const isTopUp = newTrx.type === 'TopUp';
    const kgInTrx = newTrx.items ? newTrx.items.filter(i => i.unit === 'Kg').reduce((s, i) => s + i.qty, 0) : 0;
    const pcsInTrx = newTrx.items ? newTrx.items.filter(i => i.unit === 'Pcs').reduce((s, i) => s + i.qty, 0) : 0;
    const trxValue = !isTopUp ? newTrx.payment.total : 0;
    const orderIncrement = !isTopUp ? 1 : 0;

    if (newTrx.customer.isNew) {
      const newCustId = `CS-${String(customers.length + 1).padStart(4, '0')}`;
      const newCust = {
        customerId: newCustId,
        name: newTrx.customer.name,
        phone: newTrx.customer.phone,
        address: newTrx.customerAddress || '-',
        totalOrders: orderIncrement,
        depositBalance: isTopUp ? (newTrx.depositNominal || 0) : 0,
        depositPackage: isTopUp ? (newTrx.depositPackageName || '-') : '-',
        depositExpiry: isTopUp ? (newTrx.depositExpiry || '-') : '-',
        firstWashDate: !isTopUp ? new Date().toLocaleDateString('id-ID') : '-',
        totalDepositAccumulated: isTopUp ? (newTrx.depositNominal || 0) : 0,
        totalTransactionValue: trxValue,
        totalKg: kgInTrx,
        totalPcs: pcsInTrx,
        outletId: activeOutletId
      };
      await addDoc(collection(db, 'customers'), newCust);
    } else {
      const targetCust = customers.find(c => c.phone === newTrx.customer.phone);
      if (targetCust) {
        let depositBalance = targetCust.depositBalance || 0;
        let totalDepositAccumulated = targetCust.totalDepositAccumulated || 0;
        let depositPackage = targetCust.depositPackage;
        let depositExpiry = targetCust.depositExpiry;

        if (isTopUp) {
          depositBalance += (newTrx.depositNominal || 0);
          totalDepositAccumulated += (newTrx.depositNominal || 0);
          depositPackage = newTrx.depositPackageName || depositPackage;
          depositExpiry = newTrx.depositExpiry || depositExpiry;
        } else if (newTrx.payment.method === 'Deposit') {
          depositBalance -= (newTrx.payment.paidAmount || 0);
          if (depositBalance < 0) depositBalance = 0;
        }

        const updatedCust = {
          ...targetCust,
          totalOrders: targetCust.totalOrders + orderIncrement,
          totalTransactionValue: (targetCust.totalTransactionValue || 0) + trxValue,
          totalKg: (targetCust.totalKg || 0) + kgInTrx,
          totalPcs: (targetCust.totalPcs || 0) + pcsInTrx,
          firstWashDate: (!targetCust.firstWashDate || targetCust.firstWashDate === '-') && !isTopUp
            ? new Date().toLocaleDateString('id-ID')
            : targetCust.firstWashDate,
          depositBalance,
          totalDepositAccumulated,
          depositPackage,
          depositExpiry
        };
        // Remove 'id' before saving to avoid duplicate field or merge issues
        const { id, ...saveData } = updatedCust;
        await setDoc(doc(db, 'customers', id), saveData);
      }
    }

    // Auto-create Delivery Record
    if (newTrx.isDelivery) {
      const targetCust = customers.find(c => c.phone === newTrx.customer.phone);
      const custId = targetCust ? targetCust.customerId : `CS-${String(customers.length + 1).padStart(4, '0')}`;
      
      const deliveryData = {
        customerId: custId,
        name: newTrx.customer.name,
        phone: newTrx.customer.phone,
        invoiceNo: newTrx.invoiceNo,
        date: new Date().toLocaleDateString('id-ID'),
        time: 'ASAP',
        category: newTrx.items?.[0]?.categoryId || 'Laundry',
        service: newTrx.items?.[0]?.serviceName || 'Antar Pesanan',
        note: `Alamat: ${newTrx.deliveryAddress}`,
        status: 'Pending',
        outletId: trxWithOutlet.outletId
      };
      await addDoc(collection(db, 'deliveries'), deliveryData);
    }
  };


  const handleUpdateTransaction = async (updatedTrx) => {
    const { id, ...data } = updatedTrx;
    await updateDoc(doc(db, 'transactions', id), data);
  };


  if (authLoading) return <div className="h-screen w-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-700"></div></div>;

  if (!currentUser) {
    return <LoginView users={users} onLogin={(user) => {
      setCurrentUser(user);
      localStorage.setItem('monic_user', JSON.stringify(user));
    }} />;
  }

  const handleLogout = () => {
    localStorage.removeItem('monic_user');
    setCurrentUser(null);
  };

  return (
    <div className="flex bg-slate-50 font-['Inter'] text-slate-900 h-[100dvh] overflow-hidden selection:bg-blue-100 selection:text-blue-900">
      <style dangerouslySetInnerHTML={{ __html: `
        body { font-family: 'Inter', sans-serif; }
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
        @keyframes fadeUp { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
        .animate-fade-up { animation: fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        @keyframes fadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }
        .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
        @keyframes barGrow { 0% { transform: scaleY(0); opacity: 0; } 100% { transform: scaleY(1); opacity: 1; } }
        .animate-bar-grow { animation: barGrow 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; transform-origin: bottom; }
      `}} />

      {/* --- SIDEBAR BACKDROP (MOBILE/TABLET) --- */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-800/50 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)}></div>
      )}

      {/* --- SIDEBAR --- */}
      <aside className={`w-64 fixed left-0 top-0 h-[100dvh] z-50 flex flex-col bg-white border-r border-slate-200 shadow-sm transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col gap-2 p-4 h-full">
          <div className="mb-8 px-2 mt-2">
            <h1 className="text-blue-800 font-black tracking-wider text-xl">MONIC POS</h1>
            <p className="text-xs font-medium text-slate-500">Premium Laundry Service</p>
          </div>
          <nav className="flex flex-col gap-2 flex-grow overflow-y-auto custom-scrollbar">
            <NavItem icon="dashboard" label="Dashboard" isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
            <NavItem icon="point_of_sale" label="Kasir (POS)" isActive={activeTab === 'newOrder'} onClick={() => setActiveTab('newOrder')} />
            <NavItem icon="account_balance_wallet" label="Deposit Pelanggan" isActive={activeTab === 'deposit'} onClick={() => setActiveTab('deposit')} />
            <NavItem icon="receipt_long" label="Data Transaksi" isActive={activeTab === 'orders'} onClick={() => setActiveTab('orders')} badge={transactions.length} />
            <NavItem icon="money_off" label="Pengeluaran" isActive={activeTab === 'pengeluaran'} onClick={() => setActiveTab('pengeluaran')} />
            {currentUser.role !== 'Kasir' && <NavItem icon="assessment" label="Laporan Keuangan" isActive={activeTab === 'laporan'} onClick={() => setActiveTab('laporan')} />}
            <NavItem icon="group" label="Data Pelanggan" isActive={activeTab === 'customers'} onClick={() => setActiveTab('customers')} />
            <NavItem icon="moped" label="Antar Jemput" isActive={activeTab === 'antarJemput'} onClick={() => setActiveTab('antarJemput')} />
            {currentUser.role !== 'Kasir' && <NavItem icon="badge" label="Data Karyawan" isActive={activeTab === 'karyawan'} onClick={() => setActiveTab('karyawan')} />}
            <div className="my-2 border-t border-slate-100"></div>
            {currentUser.role !== 'Kasir' && <NavItem icon="database" label="Master Data" isActive={activeTab === 'master'} onClick={() => setActiveTab('master')} />}
            {currentUser.role !== 'Kasir' && <NavItem icon="print" label="Format Nota" isActive={activeTab === 'nota'} onClick={() => setActiveTab('nota')} />}
          </nav>
          <div className="mt-auto pt-4 border-t border-slate-100">
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-red-500 hover:bg-red-50 transition-all font-bold text-sm">
              <span className="material-symbols-outlined">logout</span>
              Keluar
            </button>
          </div>
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      <main className="lg:ml-64 flex-1 flex flex-col h-[100dvh] overflow-hidden w-full transition-all duration-300">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 flex justify-between items-center px-4 md:px-8 py-4 z-30 shrink-0 gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden text-slate-800 hover:bg-slate-100 p-2 rounded-xl transition-all flex items-center justify-center -ml-2">
              <span className="material-symbols-outlined text-[24px]">menu</span>
            </button>
            <h2 className="text-lg md:text-xl font-bold text-slate-800 truncate">
            {activeTab === 'dashboard' && 'Dashboard Rekapitulasi'}
            {activeTab === 'newOrder' && 'Point of Sale (Kasir)'}
            {activeTab === 'deposit' && 'Manajemen Deposit Pelanggan'}
            {activeTab === 'orders' && 'Riwayat Transaksi'}
            {activeTab === 'pengeluaran' && 'Manajemen Pengeluaran'}
            {activeTab === 'laporan' && 'Laporan Keuangan Detail'}
            {activeTab === 'customers' && 'Data Pelanggan'}
            {activeTab === 'antarJemput' && 'Layanan Antar Jemput'}
            {activeTab === 'karyawan' && 'Manajemen Data Karyawan'}
            {activeTab === 'master' && 'Master Data Settings'}
            {activeTab === 'nota' && 'Pengaturan Format Nota'}
          </h2>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-xl border border-slate-200 shadow-inner">
              <span className="material-symbols-outlined text-slate-500 text-[20px]">storefront</span>
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Outlet Aktif</span>
                <select
                  value={activeOutletId}
                  onChange={(e) => setActiveOutletId(e.target.value)}
                  disabled={currentUser.role === 'Kasir'}
                  className={`bg-transparent text-sm font-bold text-blue-700 outline-none cursor-pointer leading-none appearance-none ${currentUser.role === 'Kasir' ? 'opacity-70 grayscale pointer-events-none' : ''}`}
                >
                  <option value="all">Semua Outlet</option>
                  {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              {currentUser.role !== 'Kasir' && <span className="material-symbols-outlined text-slate-400 text-[16px] ml-1 pointer-events-none">expand_more</span>}
            </div>

            <div className="flex items-center gap-3 border-l border-slate-200 pl-6">
              <div className="text-right hidden md:block">
                <p className="text-sm font-bold text-slate-800">{currentUser.name}</p>
                <p className="text-xs font-medium text-slate-500">{currentUser.role === 'Owner' ? 'Business Owner' : currentUser.role}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border-2 border-blue-200">
                {currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50">
          {/* Data Filtered Globally */}
          {(() => {
            const filteredTransactions = transactions.filter(t => activeOutletId === 'all' || t.outletId === activeOutletId);
            const filteredExpenses = expenses.filter(e => activeOutletId === 'all' || e.outletId === activeOutletId);
            const filteredPickups = pickups.filter(p => activeOutletId === 'all' || p.outletId === activeOutletId);
            const filteredDeliveries = deliveries.filter(d => activeOutletId === 'all' || d.outletId === activeOutletId);
            const filteredCustomers = customers.filter(c => activeOutletId === 'all' || c.outletId === activeOutletId);
            const filteredEmployees = employees.filter(e => activeOutletId === 'all' || e.outletId === activeOutletId);

            return (
              <>
                {activeTab === 'dashboard' && <DashboardView transactions={filteredTransactions} customers={filteredCustomers} expenses={filteredExpenses} outlets={outlets} />}
                {activeTab === 'antarJemput' && <DeliveryView pickups={filteredPickups} setPickups={setPickups} deliveries={filteredDeliveries} setDeliveries={setDeliveries} customers={filteredCustomers} transactions={filteredTransactions} activeOutletId={activeOutletId} categories={categories} services={services} />}
                {activeTab === 'newOrder' && (
                  activeOutletId === 'all' ? (
                    <div className="flex flex-col items-center justify-center h-full p-20 text-center animate-fade-in">
                      <div className="bg-white p-10 rounded-3xl shadow-sm border border-slate-200 max-w-md">
                        <span className="material-symbols-outlined text-6xl text-amber-500 mb-4 scale-125 block">storefront</span>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">Pilih Outlet Terlebih Dahulu</h3>
                        <p className="text-slate-500 text-sm leading-relaxed">Menu Kasir hanya dapat digunakan saat Anda memilih salah satu outlet spesifik untuk mencatat transaksi.</p>
                      </div>
                    </div>
                  ) : (
                    <POSView addTransaction={handleAddTransaction} services={services} customers={filteredCustomers} setCustomers={setCustomers} receiptSettings={receiptSettings} categories={categories} paymentMethods={paymentMethods} activeOutletId={activeOutletId} outlets={outlets} />
                  )
                )}
                {activeTab === 'deposit' && (
                  activeOutletId === 'all' ? (
                    <div className="flex flex-col items-center justify-center h-full p-20 text-center animate-fade-in">
                      <div className="bg-white p-10 rounded-3xl shadow-sm border border-slate-200 max-w-md">
                        <span className="material-symbols-outlined text-6xl text-amber-500 mb-4 scale-125 block">account_balance_wallet</span>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">Pilih Outlet Terlebih Dahulu</h3>
                        <p className="text-slate-500 text-sm leading-relaxed">Manajemen Deposit memerlukan konteks outlet aktif untuk mencatat transaksi top-up.</p>
                      </div>
                    </div>
                  ) : (
                    <DepositView customers={filteredCustomers} setCustomers={setCustomers} depositPackages={depositPackages} paymentMethods={paymentMethods} addTransaction={handleAddTransaction} activeOutletId={activeOutletId} />
                  )
                )}
                {activeTab === 'orders' && <OrdersView transactions={filteredTransactions} updateTransaction={handleUpdateTransaction} receiptSettings={receiptSettings} paymentMethods={paymentMethods} outlets={outlets} />}
                {activeTab === 'pengeluaran' && <ExpensesView expenses={filteredExpenses} setExpenses={setExpenses} activeOutletId={activeOutletId} outlets={outlets} />}
                {activeTab === 'laporan' && <ReportsView transactions={filteredTransactions} expenses={filteredExpenses} outlets={outlets} customers={filteredCustomers} />}
                {activeTab === 'customers' && <CustomersView customers={filteredCustomers} activeOutletId={activeOutletId} outlets={outlets} />}
                {activeTab === 'karyawan' && <EmployeesView employees={filteredEmployees} activeOutletId={activeOutletId} outlets={outlets} />}
                {activeTab === 'master' && <MasterDataView services={services} setServices={setServices} categories={categories} setCategories={setCategories} paymentMethods={paymentMethods} setPaymentMethods={setPaymentMethods} depositPackages={depositPackages} setDepositPackages={setDepositPackages} outlets={outlets} setOutlets={setOutlets} users={users} currentUser={currentUser} />}
                {activeTab === 'nota' && <NotaSettingsView settings={receiptSettings} setSettings={setReceiptSettings} />}
              </>
            );
          })()}
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// NAV ITEM
// ============================================================================
// ============================================================================
// 8. ANTAR JEMPUT
// ============================================================================
function DeliveryView({ pickups, setPickups, deliveries, setDeliveries, customers, transactions, activeOutletId, categories, services }) {
  const [activeSubTab, setActiveSubTab] = useState('jadwal'); // jadwal, jemput, antar
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({});
  const [search, setSearch] = useState('');
  const [selectedEntity, setSelectedEntity] = useState(null);

  const statuses = ['Pending', 'On Process', 'Completed', 'Cancelled'];
  const todayStr = new Date().toLocaleDateString('id-ID');

  const scheduleData = useMemo(() => {
    const pToday = pickups.filter(p => p.date === todayStr || (p.status !== 'Completed' && p.status !== 'Cancelled'));
    const dToday = deliveries.filter(d => d.date === todayStr || (d.status !== 'Completed' && d.status !== 'Cancelled'));
    
    return [
      ...pToday.map(p => ({ ...p, type: 'Jemput' })),
      ...dToday.map(d => ({ ...d, type: 'Antar' }))
    ].sort((a, b) => {
        // Simple sort by date and then time
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
    });
  }, [pickups, deliveries, todayStr]);

  const handleSaveJemput = async () => {
    if (!formData.name || !formData.date || !formData.time) return alert('Data wajib diisi!');
    const newEntry = {
      ...formData,
      outletId: activeOutletId,
      status: formData.status || 'Pending'
    };
    if (formData.id) {
        const { id, ...data } = newEntry;
        await updateDoc(doc(db, 'pickups', id), data);
    } else {
        await addDoc(collection(db, 'pickups'), newEntry);
    }
    setShowModal(false);
  };

  const handleSaveAntar = async () => {
    if (!formData.invoiceNo || !formData.date || !formData.time) return alert('Data wajib diisi!');
    const newEntry = {
      ...formData,
      outletId: activeOutletId,
      status: formData.status || 'Pending'
    };
    if (formData.id) {
        const { id, ...data } = newEntry;
        await updateDoc(doc(db, 'deliveries', id), data);
    } else {
        await addDoc(collection(db, 'deliveries'), newEntry);
    }
    setShowModal(false);
  };

  const updateStatus = async (id, type, newStatus) => {
    const t = type.toLowerCase();
    const collectionName = t === 'jemput' ? 'pickups' : 'deliveries';
    await updateDoc(doc(db, collectionName, id), { status: newStatus });
  };


  return (
    <div className="p-8 max-w-[1440px] mx-auto animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4 border-b border-slate-200 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Layanan Antar Jemput</h2>
          <p className="text-sm text-slate-500">Logistik pengambilan dan pengiriman pakaian pelanggan.</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button onClick={() => setActiveSubTab('jadwal')} className={`relative px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'jadwal' ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}>
            Jadwal Hari Ini
            {scheduleData.length > 0 && <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[9px] text-white ring-2 ring-white">!</span>}
          </button>
          <button onClick={() => setActiveSubTab('jemput')} className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'jemput' ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}>Data Jemput</button>
          <button onClick={() => setActiveSubTab('antar')} className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'antar' ? 'bg-white shadow text-blue-700' : 'text-slate-500'}`}>Data Antar</button>
        </div>

        <button
          onClick={() => {
            setFormData({});
            setSelectedEntity(null);
            setSearch('');
            setShowModal(true);
          }}
          className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          {activeSubTab === 'jemput' ? 'Tambah Jemputan' : 'Tambah Antaran'}
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl shadow-md transition-all duration-300">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                <th className="p-4 font-bold">Pelanggan</th>
                {activeSubTab === 'jadwal' && <th className="p-4 font-bold">Tipe</th>}
                <th className="p-4 font-bold">{activeSubTab === 'jemput' ? 'Waktu Jemput' : activeSubTab === 'antar' ? 'Waktu Antar' : 'Jadwal Waktu'}</th>
                {(activeSubTab === 'antar' || activeSubTab === 'jadwal') && <th className="p-4 font-bold">Invoice</th>}
                <th className="p-4 font-bold">{activeSubTab === 'jemput' ? 'Alamat' : 'Keterangan/Alamat'}</th>
                <th className="p-4 font-bold">Layanan</th>
                <th className="p-4 font-bold text-center">Status</th>
                <th className="p-4 font-bold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const data = activeSubTab === 'jadwal' ? scheduleData : (activeSubTab === 'jemput' ? pickups : deliveries);
                if (data.length === 0) return <tr><td colSpan="8" className="p-10 text-center text-slate-400 font-medium">Belum ada data yang ditampilkan.</td></tr>;
                
                return data.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors text-sm">
                    <td className="p-4">
                      <div className="font-bold text-slate-800">{item.name}</div>
                      <div className="text-[10px] text-slate-500">{item.customerId}</div>
                    </td>
                    {activeSubTab === 'jadwal' && (
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${item.type === 'Jemput' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {item.type}
                        </span>
                      </td>
                    )}
                    <td className="p-4">
                      <div className="font-bold text-slate-700">{item.date}</div>
                      <div className="text-xs text-slate-500">{item.time}</div>
                    </td>
                    {(activeSubTab === 'antar' || activeSubTab === 'jadwal') && <td className="p-4 font-bold text-blue-700">{item.invoiceNo || '-'}</td>}
                    <td className="p-4 text-slate-600 max-w-[200px] truncate" title={item.address || item.note}>
                      {item.address || item.note || '-'}
                    </td>
                    <td className="p-4">
                      <span className="bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded font-bold uppercase">{item.category}</span>
                      <div className="text-xs font-bold text-slate-700 mt-0.5">{item.service}</div>
                    </td>
                    <td className="p-4">
                      <select
                        value={item.status}
                        onChange={(e) => updateStatus(item.id, item.type || activeSubTab, e.target.value)}
                        className={`block mx-auto text-[10px] font-bold px-2 py-1 rounded outline-none cursor-pointer border-0 ${
                          item.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                          item.status === 'On Process' ? 'bg-blue-100 text-blue-700' :
                          item.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {statuses.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                      </select>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center gap-2">
                         <button onClick={() => { setFormData(item); setShowModal(true); }} className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-200 transition-colors"><span className="material-symbols-outlined text-[16px]">edit</span></button>
                         <button onClick={() => {
                           if (window.confirm('Hapus data ini?')) {
                             const type = item.type?.toLowerCase() || activeSubTab;
                             if (type === 'jemput') setPickups(prev => prev.filter(p => p.id !== item.id));
                             else setDeliveries(prev => prev.filter(d => d.id !== item.id));
                           }
                         }} className="w-8 h-8 rounded-full bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-colors"><span className="material-symbols-outlined text-[16px]">delete</span></button>
                      </div>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>


      {/* MODAL FORM */}
      {showModal && (
        <div className="fixed inset-0 z-[999] bg-slate-800/30 backdrop-blur-sm flex overflow-y-auto p-4 sm:p-8 animate-fade-in items-start sm:items-center justify-center">
          <div className="bg-white rounded-[32px] shadow-2xl max-w-lg w-full overflow-hidden animate-fade-up border border-white/20 m-auto mt-8 sm:mt-auto mb-8 sm:mb-auto">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600">{activeSubTab === 'jemput' ? 'move_to_inbox' : 'local_shipping'}</span>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">{formData.id ? 'Edit' : 'Tambah'} {activeSubTab === 'jemput' ? 'Jemputan' : 'Antaran'}</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="px-8 pb-4 pt-2 grid grid-cols-2 gap-5 ">
              <div className="col-span-full">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Cari {activeSubTab === 'jemput' ? 'Pelanggan' : 'Invoice'}</label>
                <div className="relative">
                  <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setSelectedEntity(null); }} placeholder={activeSubTab === 'jemput' ? "Ketik nama/WA..." : "Ketik No. Invoice..."} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all" />
                  {search && !selectedEntity && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-40 overflow-y-auto">
                      {(activeSubTab === 'jemput' ? customers : transactions)
                        .filter(item => { const s = search.toLowerCase(); return activeSubTab === 'jemput' ? item.name.toLowerCase().includes(s) || item.phone.includes(s) : item.invoiceNo.toLowerCase().includes(s); })
                        .map(item => (
                          <button key={item.id} onClick={() => { setSelectedEntity(item); setSearch(activeSubTab === 'jemput' ? item.name : item.invoiceNo); if (activeSubTab === 'jemput') setFormData({ ...formData, customerId: item.customerId, name: item.name, address: item.address, phone: item.phone }); else setFormData({ ...formData, customerId: item.customer.customerId, name: item.customer.name, phone: item.customer.phone, invoiceNo: item.invoiceNo, category: item.items?.[0]?.categoryId || 'Kiloan', service: item.items?.[0]?.serviceName || '' }); }} className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-slate-50 last:border-0 transition-colors">
                            <div className="font-black text-slate-800 text-sm">{activeSubTab === 'jemput' ? item.name : item.invoiceNo}</div>
                            <div className="text-[10px] text-slate-500 font-bold">{activeSubTab === 'jemput' ? item.customerId : item.customer.name}</div>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
              <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Tanggal</label><input type="date" value={formData.date || ''} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 outline-none" /></div>
              <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Waktu</label><input type="time" value={formData.time || ''} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 outline-none" /></div>
              <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Kategori</label><select value={formData.category || 'Kiloan'} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 outline-none appearance-none cursor-pointer">{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Layanan</label><select value={formData.service || ''} onChange={e => setFormData({...formData, service: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 outline-none appearance-none cursor-pointer"><option value="">Pilih Layanan</option>{services.filter(s => formData.category === 'Kiloan' ? s.priceKiloan > 0 : s.priceSatuan > 0).map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</select></div>
              <div className="col-span-full"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">{activeSubTab === 'jemput' ? 'Alamat' : 'Catatan'}</label><textarea rows="2" value={activeSubTab === 'jemput' ? (formData.address || '') : (formData.note || '')} onChange={e => setFormData({ ...formData, [activeSubTab === 'jemput' ? 'address' : 'note']: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-medium text-slate-700 outline-none resize-none"></textarea></div>
            </div>
            <div className="px-8 pt-4 pb-8 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-6 py-3.5 text-slate-500 font-bold hover:bg-slate-200 rounded-2xl transition-all">Batal</button>
              <button onClick={activeSubTab === 'jemput' ? handleSaveJemput : handleSaveAntar} className="px-8 py-3.5 bg-blue-700 text-white font-black rounded-2xl hover:bg-blue-800 shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 active:scale-95">
                <span className="material-symbols-outlined text-[20px]">check_circle</span> Simpan {activeSubTab === 'jemput' ? 'Jemputan' : 'Antaran'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const NavItem = ({ icon, label, isActive, onClick, badge }) => (
  <a onClick={onClick} className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all duration-300 select-none ${isActive ? 'bg-blue-50 text-blue-700 shadow-sm font-bold' : 'text-slate-500 hover:bg-slate-50 font-medium'}`}>
    <div className="flex items-center gap-3">
      <span className="material-symbols-outlined" style={{fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0"}}>{icon}</span>
      <span className="text-sm">{label}</span>
    </div>
    {badge > 0 && <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{badge}</span>}
  </a>
);

// ============================================================================
// SUMMARY CARD
// ============================================================================
// FIX #7: formatIDR sekarang punya default fallback sehingga tidak crash jika tidak di-pass
const SummaryCard = ({ item, formatIDR: fmt = formatIDR, index = 0, baseDelay = 0 }) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all duration-300 group flex flex-col justify-between min-h-[140px] animate-fade-up relative overflow-hidden" style={{ animationDelay: `${baseDelay + (index * 0.08)}s` }}>
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-2xl ${item.bg} ${item.color} group-hover:scale-110 transition-transform duration-300 shadow-sm`}>
        <span className="material-symbols-outlined text-[24px]" style={{fontVariationSettings: "'FILL' 1"}}>{item.icon}</span>
      </div>
      <div className="opacity-0 group-hover:opacity-10 transition-opacity absolute right-2 top-2 pointer-events-none">
        <span className="material-symbols-outlined text-[60px]">{item.icon}</span>
      </div>
    </div>
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 line-clamp-1" title={item.label}>{item.label}</p>
      <div className="flex items-end gap-1">
        <h4 className={`text-2xl font-black tracking-tight ${item.isExpense ? 'text-red-600' : 'text-slate-800'}`}>
          {item.isExpense ? '-' : ''}{item.type === 'currency' ? fmt(item.value) : item.value}
        </h4>
        {item.suffix && <span className="text-xs font-bold text-slate-400 mb-1.5">{item.suffix}</span>}
      </div>
    </div>
  </div>
);

// ============================================================================
// 1. DASHBOARD
// ============================================================================
function DashboardView({ transactions, customers, expenses, outlets }) {
  const totalRevenue = transactions.filter(t => t.payment.method !== 'Deposit').reduce((sum, trx) => sum + (trx.payment.paidAmount || 0), 0);
  const totalPiutang = transactions.reduce((sum, trx) => sum + (trx.payment.remainingAmount || 0), 0);
  const totalKg = transactions.reduce((sum, trx) => sum + (trx.items ? trx.items.filter(i => i.unit === 'Kg').reduce((s, i) => s + i.qty, 0) : 0), 0);
  const totalPcs = transactions.reduce((sum, trx) => sum + (trx.items ? trx.items.filter(i => i.unit === 'Pcs' || i.unit === 'Paket').reduce((s, i) => s + i.qty, 0) : 0), 0);
  const paymentCash = transactions.filter(t => t.payment.method === 'Cash').reduce((sum, t) => sum + (t.payment.paidAmount || 0), 0);
  const paymentTransfer = transactions.filter(t => t.payment.method === 'Transfer').reduce((sum, t) => sum + (t.payment.paidAmount || 0), 0);
  const paymentQris = transactions.filter(t => t.payment.method === 'QRIS').reduce((sum, t) => sum + (t.payment.paidAmount || 0), 0);
  const paymentDeposit = transactions.filter(t => t.payment.method === 'Deposit').reduce((sum, t) => sum + (t.payment.paidAmount || 0), 0);
  const totalTopUp = transactions.filter(t => t.type === 'TopUp').reduce((sum, t) => sum + (t.payment.paidAmount || 0), 0);
  const pelangganBaru = customers.filter(c => c.totalOrders <= 1).length;
  const pelangganLama = customers.filter(c => c.totalOrders > 1).length;
  const realPengeluaran = calculatePengeluaran(expenses, 'Semua Waktu');
  const nettIncome = totalRevenue - realPengeluaran;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeDepositBalance = customers.reduce((sum, c) => {
    if (c.depositBalance <= 0) return sum;
    if (c.depositExpiry === 'Tanpa Batas' || c.depositExpiry === '-') return sum + c.depositBalance;
    const parts = c.depositExpiry.split('/');
    if (parts.length === 3) {
      const expDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (expDate >= today) return sum + c.depositBalance;
    }
    return sum;
  }, 0);

  const data = {
    keuangan: [
      { label: 'Total Pemasukan (Cash/TF/QRIS)', value: totalRevenue, type: 'currency', icon: 'task_alt', color: 'text-emerald-600', bg: 'bg-emerald-100' },
      { label: 'Pembayaran Pakai Deposit', value: paymentDeposit, type: 'currency', icon: 'account_balance_wallet', color: 'text-purple-600', bg: 'bg-purple-100' },
      { label: 'Total Piutang (Belum Lunas)', value: totalPiutang, type: 'currency', icon: 'pending_actions', color: 'text-amber-600', bg: 'bg-amber-100' },
      { label: 'Dana Masuk dari Top Up', value: totalTopUp, type: 'currency', icon: 'payments', color: 'text-blue-600', bg: 'bg-blue-100' },
      { label: 'Saldo Deposit Aktif', value: activeDepositBalance, type: 'currency', icon: 'savings', color: 'text-indigo-600', bg: 'bg-indigo-100' },
      { label: 'Pengeluaran (Termasuk CAPEX)', value: realPengeluaran, type: 'currency', isExpense: true, icon: 'money_off', color: 'text-red-600', bg: 'bg-red-100' },
    ],
    operasional: [
      { label: 'Transaksi Berhasil', value: transactions.length, suffix: 'Trx', icon: 'check_circle', color: 'text-emerald-600', bg: 'bg-emerald-100' },
      { label: 'Transaksi Cancel', value: 0, suffix: 'Trx', icon: 'cancel', color: 'text-red-600', bg: 'bg-red-100' },
      { label: 'Laundry Kiloan', value: totalKg.toFixed(1), suffix: 'Kg', icon: 'scale', color: 'text-blue-600', bg: 'bg-blue-100' },
      { label: 'Laundry Satuan', value: totalPcs, suffix: 'Pcs', icon: 'checkroom', color: 'text-cyan-600', bg: 'bg-cyan-100' },
      { label: 'Pelanggan Baru', value: pelangganBaru, suffix: 'Org', icon: 'person_add', color: 'text-purple-600', bg: 'bg-purple-100' },
      { label: 'Pelanggan Lama', value: pelangganLama, suffix: 'Org', icon: 'group', color: 'text-indigo-600', bg: 'bg-indigo-100' },
    ],
    pembayaran: [
      { label: 'Cash (Tunai)', value: paymentCash, type: 'currency', icon: 'payments', color: 'text-green-600', bg: 'bg-green-100' },
      { label: 'Transfer Bank', value: paymentTransfer, type: 'currency', icon: 'account_balance', color: 'text-blue-600', bg: 'bg-blue-100' },
      { label: 'QRIS', value: paymentQris, type: 'currency', icon: 'qr_code_scanner', color: 'text-purple-600', bg: 'bg-purple-100' },
      { label: 'Via Deposit', value: paymentDeposit, type: 'currency', icon: 'wallet', color: 'text-teal-600', bg: 'bg-teal-100' },
    ]
  };

  return (
    <div className="p-8 max-w-[1440px] mx-auto overflow-x-hidden animate-fade-up">
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-slate-200 pb-6 animate-fade-up">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Rekapitulasi Penjualan</h2>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Periode</label>
            <select className="bg-white border border-slate-300 text-slate-700 font-bold text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm">
              <option>Bulan Ini</option><option>Hari Ini</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5 justify-end">
            <button className="h-[42px] px-5 rounded-xl bg-blue-700 text-white font-bold text-sm hover:bg-blue-800 shadow-md shadow-blue-700/20 transition-all flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">download</span> Export
            </button>
          </div>
        </div>
      </div>

      <div className="mb-10 bg-gradient-to-r from-blue-700 to-blue-900 rounded-3xl p-8 shadow-lg text-white flex justify-between items-center relative overflow-hidden animate-fade-up" style={{ animationDelay: '0.1s' }}>
        <div className="z-10">
          <p className="text-blue-200 font-medium mb-1">Total Nett Income (Pendapatan - Pengeluaran & Depresiasi)</p>
          <h3 className="text-4xl md:text-5xl font-black tracking-tight">{formatIDR(nettIncome)}</h3>
        </div>
        <div className="z-10 bg-white/20 p-4 rounded-full backdrop-blur-sm hidden md:block">
          <span className="material-symbols-outlined text-5xl text-white" style={{fontVariationSettings: "'FILL' 1"}}>account_balance</span>
        </div>
        <div className="absolute -right-4 -top-10 opacity-10 pointer-events-none"><span className="material-symbols-outlined text-[200px]">trending_up</span></div>
      </div>

      <div className="flex flex-col gap-10">
        <div>
          <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 animate-fade-up" style={{ animationDelay: '0.3s' }}><span className="material-symbols-outlined text-blue-600">payments</span>Ringkasan Keuangan</h4>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">{data.keuangan.map((item, idx) => <SummaryCard key={idx} item={item} fmt={formatIDR} index={idx} baseDelay={0.4} />)}</div>
        </div>
        <div>
          <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 animate-fade-up" style={{ animationDelay: '0.6s' }}><span className="material-symbols-outlined text-blue-600">analytics</span>Data Transaksi & Operasional</h4>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">{data.operasional.map((item, idx) => <SummaryCard key={idx} item={item} index={idx} baseDelay={0.7} />)}</div>
        </div>
        <div>
          <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 animate-fade-up" style={{ animationDelay: '0.9s' }}><span className="material-symbols-outlined text-blue-600">account_balance_wallet</span>Metode Pembayaran</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{data.pembayaran.map((item, idx) => <SummaryCard key={idx} item={item} fmt={formatIDR} index={idx} baseDelay={1.0} />)}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 2. KASIR (POS)
// ============================================================================
function POSView({ addTransaction, services, customers, setCustomers, receiptSettings, categories, paymentMethods, activeOutletId, outlets }) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');

  const [posCategory, setPosCategory] = useState(categories[0] || 'Kiloan');
  const [posService, setPosService] = useState('');
  const [posQty, setPosQty] = useState('');
  const [posNote, setPosNote] = useState('');

  const [cart, setCart] = useState([]);
  const [discountType, setDiscountType] = useState('Rp');
  const [discountVal, setDiscountVal] = useState('');

  const [paymentMethod, setPaymentMethod] = useState(paymentMethods[0] || 'Cash');
  const [paymentStatus, setPaymentStatus] = useState('Lunas');
  const [dpAmount, setDpAmount] = useState('');

  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  
  const activeCustomerInfo = useMemo(() => {
    if (!selectedCustomer) return null;
    return customers.find(c => c.customerId === selectedCustomer.customerId) || null;
  }, [selectedCustomer, customers]);

  const activeOutletName = outlets.find(o => o.id === activeOutletId)?.name || 'Outlet';

  const [isDelivery, setIsDelivery] = useState(false);

  const [deliveryAddress, setDeliveryAddress] = useState('');

  // Sync address with selected customer
  useEffect(() => {
    if (activeCustomerInfo) {
      setDeliveryAddress(activeCustomerInfo.address !== '-' ? activeCustomerInfo.address : '');
    } else {
      setDeliveryAddress('');
    }
  }, [activeCustomerInfo]);

  const handleSearchCustomer = (e) => {
    const val = e.target.value;
    setCustomerSearch(val);
    const found = customers.find(c =>
      c.phone.includes(val) ||
      c.name.toLowerCase().includes(val.toLowerCase()) ||
      c.customerId.toLowerCase() === val.toLowerCase()
    );
    if (found && val.length >= 3) {
      setSelectedCustomer(found);
      setCustName(found.name);
      setCustPhone(found.phone);
    } else {
      setSelectedCustomer(null);
      if (val !== custPhone && val !== custName) setCustPhone(val.replace(/\D/g, ''));
    }
  };

  const handleClearCustomer = () => {
    setCustomerSearch(''); setSelectedCustomer(null); setCustName(''); setCustPhone('');
  };

  const availableServices = useMemo(() => {
    return services.filter(srv => posCategory === 'Kiloan' ? srv.priceKiloan > 0 : srv.priceSatuan > 0);
  }, [posCategory, services]);

  const selectedServiceDetail = useMemo(() => availableServices.find(s => s.id === posService), [posService, availableServices]);

  const handleAddToCart = () => {
    if (!posService || !posQty || isNaN(posQty) || posQty <= 0) return alert('Pilih layanan dan Qty!');
    const srv = selectedServiceDetail;
    const price = posCategory === 'Kiloan' ? srv.priceKiloan : srv.priceSatuan;
    setCart([...cart, {
      id: Date.now().toString(),
      categoryId: posCategory, serviceId: srv.id, serviceName: srv.name, durationStr: srv.durationStr,
      price: price, qty: parseFloat(posQty), unit: posCategory === 'Kiloan' ? 'Kg' : 'Pcs', note: posNote
    }]);
    setPosQty(''); setPosNote(''); setPosService('');
  };

  const removeFromCart = (id) => setCart(cart.filter(item => item.id !== id));

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const discountAmount = useMemo(() => {
    if (!discountVal || isNaN(discountVal)) return 0;
    const val = parseFloat(discountVal);
    return discountType === '%' ? subtotal * (val / 100) : val;
  }, [subtotal, discountVal, discountType]);
  const grandTotal = Math.max(0, subtotal - discountAmount);

  const handleProcessCheckout = () => {
    if (!custName) return alert('Nama Pelanggan wajib diisi!');
    if (!custPhone) return alert('No. WhatsApp Pelanggan mandatori wajib diisi!');
    if (cart.length === 0) return alert('Keranjang masih kosong!');
    if (paymentStatus === 'DP') {
      if (!dpAmount || isNaN(dpAmount) || Number(dpAmount) <= 0) return alert('Nominal DP wajib diisi dengan benar!');
      if (Number(dpAmount) >= grandTotal) return alert('Nominal DP tidak boleh lebih besar atau sama dengan Total Tagihan.');
    }
    if (paymentMethod === 'Deposit') {
      if (!activeCustomerInfo) return alert('Pembayaran Deposit hanya berlaku untuk pelanggan terdaftar!');
      // Split Bill is now handled in the confirmation modal.
    }
    if (isDelivery && !deliveryAddress.trim()) return alert('Alamat pengiriman wajib diisi untuk layanan Antar!');
    setShowConfirm(true);
  };


  // FIX #3: Update saldo deposit TIDAK dilakukan di sini lagi.
  // Semua update customer (termasuk saldo deposit) dikelola oleh handleAddTransaction di App.
  const confirmTransaction = () => {
    let costToPay = paymentStatus === 'DP' ? Number(dpAmount) : grandTotal;
    let finalStatus = paymentStatus;

    // Split Bill Logic for Deposit
    if (paymentMethod === 'Deposit' && activeCustomerInfo) {
      if (activeCustomerInfo.depositBalance < grandTotal) {
        // Insufficient funds -> Auto Split Bill
        costToPay = activeCustomerInfo.depositBalance;
        finalStatus = 'DP'; // Remaining balance becomes debt
      }
    }

    const invoiceData = {
      id: Date.now().toString(),
      invoiceNo: `INV-${new Date().getTime().toString().slice(-6)}`,
      type: 'Laundry',
      date: new Date().toLocaleString('id-ID'),
      customer: { name: custName, phone: custPhone, isNew: !selectedCustomer },
      items: [...cart],
      isDelivery,
      deliveryAddress,
      customerAddress: deliveryAddress, // For updating customer profile
      payment: {
        method: paymentMethod,
        subtotal,
        discount: discountAmount,
        total: grandTotal,
        status: finalStatus,
        paidAmount: costToPay,
        remainingAmount: grandTotal - costToPay
      }
    };
    addTransaction(invoiceData);
    setCart([]); handleClearCustomer(); setDiscountVal(''); setDpAmount(''); setPaymentStatus('Lunas'); setIsDelivery(false); setDeliveryAddress(''); setShowConfirm(false);
    setShowSuccessToast(true); setTimeout(() => setShowSuccessToast(false), 3000);
  };

  return (
    <div className="p-8 max-w-[1440px] mx-auto animate-fade-in flex flex-col lg:flex-row gap-8 min-h-[calc(100vh-100px)]">
      {showSuccessToast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-6 py-3 rounded-full shadow-lg font-bold flex items-center gap-2 animate-fade-in">
          <span className="material-symbols-outlined">check_circle</span>Transaksi Berhasil Disimpan di {activeOutletName}!
        </div>
      )}

      {/* KIRI: FORM */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-md font-bold text-slate-800 mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-blue-600">person_add</span> Data Pelanggan</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-full relative">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Cari ID Pelanggan / Nama / No WA</label>
              <div className="flex items-center bg-slate-50 rounded-xl px-4 py-3 border border-slate-200 focus-within:border-blue-500 transition-all">
                <span className="material-symbols-outlined text-slate-400 mr-2">search</span>
                <input type="text" placeholder="Ketik ID / Nama / No WA..." className="bg-transparent border-none outline-none text-sm w-full font-medium" value={customerSearch} onChange={handleSearchCustomer} />
                {(custName || custPhone) && <button onClick={handleClearCustomer} className="text-slate-400 hover:text-red-500"><span className="material-symbols-outlined text-[18px]">close</span></button>}
              </div>
              {custName && (
                <div className="absolute right-0 -top-6">
                  {selectedCustomer
                    ? <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-1 rounded-md font-bold flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">check_circle</span> Pelanggan {selectedCustomer.customerId}</span>
                    : <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-1 rounded-md font-bold flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">person_add</span> Pelanggan Baru</span>
                  }
                </div>
              )}
            </div>
            <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Nama Pelanggan <span className="text-red-500">*</span></label><input type="text" value={custName} onChange={(e) => setCustName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-blue-500" placeholder="Nama Lengkap" /></div>
            <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">No. WhatsApp <span className="text-red-500">*</span></label><input type="text" value={custPhone} onChange={(e) => setCustPhone(e.target.value.replace(/\D/g, ''))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-blue-500" placeholder="08xxxxxxxxxx" /></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-md font-bold text-slate-800 mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-blue-600">local_laundry_service</span> Detail Layanan</h3>
          <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
            {categories.map(cat => (
              <button key={cat} onClick={() => { setPosCategory(cat); setPosService(''); }} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${posCategory === cat ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Laundry {cat}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            <div className="md:col-span-7">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Jenis Layanan</label>
              <div className="relative">
                <select value={posService} onChange={(e) => setPosService(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-blue-500 appearance-none cursor-pointer">
                  <option value="" disabled>Pilih Layanan...</option>
                  {availableServices.map(srv => <option key={srv.id} value={srv.id}>{srv.name} — {formatIDR(posCategory === 'Kiloan' ? srv.priceKiloan : srv.priceSatuan)} /{posCategory === 'Kiloan' ? 'Kg' : 'Pcs'}</option>)}
                </select>
                <span className="material-symbols-outlined absolute right-4 top-3.5 text-slate-400 pointer-events-none">expand_more</span>
              </div>
            </div>
            <div className="md:col-span-5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Jumlah ({posCategory === 'Kiloan' ? 'Kg' : 'Pcs'})</label>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:border-blue-500 transition-colors">
                <input type="number" min="0.1" step="0.1" value={posQty} onChange={(e) => setPosQty(e.target.value)} className="w-full bg-transparent px-4 py-3 text-sm font-bold outline-none" placeholder="0" />
                <div className="bg-slate-200/50 px-4 py-3 text-sm font-bold text-slate-500 border-l border-slate-200">{posCategory === 'Kiloan' ? 'Kg' : 'Pcs'}</div>
              </div>
            </div>
            <div className="md:col-span-12"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Catatan Khusus (Opsional)</label><textarea value={posNote} onChange={(e) => setPosNote(e.target.value)} rows="2" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-blue-500 resize-none custom-scrollbar" placeholder="Cth: Jangan dijemur di terik matahari..."></textarea></div>
          </div>
          <button onClick={handleAddToCart} className="mt-6 w-full py-3.5 bg-blue-50 text-blue-700 font-bold rounded-xl border border-blue-200 border-dashed hover:bg-blue-100 hover:border-blue-400 transition-colors flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[20px]">add_shopping_cart</span> Tambah ke Keranjang
          </button>
        </div>
      </div>

      {/* KANAN: KERANJANG */}
      <div className="w-full lg:w-[450px] flex-shrink-0 bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center z-10 shrink-0">
          <div><h3 className="text-lg font-bold text-slate-800">Keranjang</h3><p className="text-xs text-slate-500 font-medium">{cart.length} Item Layanan</p></div>
          {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">Kosongkan</button>}
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/30 min-h-0">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400"><span className="material-symbols-outlined text-5xl text-slate-300 mb-2">shopping_bag</span><p className="font-medium text-sm">Keranjang Kosong</p></div>
          ) : (
            <div className="flex flex-col gap-3">
              {cart.map(item => (
                <div key={item.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm relative group animate-fade-in">
                  <button onClick={() => removeFromCart(item.id)} className="absolute -top-2 -right-2 bg-red-100 text-red-600 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"><span className="material-symbols-outlined text-[14px]">close</span></button>
                  <div className="flex justify-between items-start mb-1"><h4 className="font-bold text-sm text-slate-800 pr-4 leading-tight">{item.serviceName}</h4><span className="font-black text-slate-800 text-sm">{formatIDR(item.price * item.qty)}</span></div>
                  <div className="flex justify-between items-center text-xs text-slate-500 font-medium mt-1"><span className="bg-slate-100 px-2 py-0.5 rounded-md">{item.qty} {item.unit} x {formatIDR(item.price)}</span></div>
                  {item.note && <p className="text-[10px] text-amber-600 bg-amber-50 p-1.5 rounded-md mt-2 border border-amber-100 line-clamp-1 italic">Catatan: {item.note}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 md:p-5 bg-white border-t border-slate-200 shadow-[0_-5px_15px_-10px_rgba(0,0,0,0.1)] z-10 shrink-0 flex flex-col gap-3">
          <div className="bg-slate-50 p-1 rounded-xl flex gap-1 border border-slate-200">
            <button onClick={() => setPaymentStatus('Lunas')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${paymentStatus === 'Lunas' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>Dibayar Lunas</button>
            <button onClick={() => setPaymentStatus('DP')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${paymentStatus === 'DP' ? 'bg-white text-amber-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>Down Payment (DP)</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 md:col-span-1">
              <label className="text-[10px] font-bold text-slate-500 mb-1.5 block">Metode Pembayaran</label>
              <div className="relative">
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 appearance-none">
                  {paymentMethods.map(method => <option key={method} value={method}>{method}</option>)}
                </select>
                <span className="material-symbols-outlined absolute right-2 top-2.5 text-slate-400 pointer-events-none text-[18px]">expand_more</span>
              </div>
            </div>

            <div className="col-span-2 md:col-span-1">
              <label className="text-[10px] font-bold text-slate-500 mb-1.5 flex justify-between">
                Diskon
                <span className="text-[9px] text-blue-600 cursor-pointer hover:underline" onClick={() => setDiscountType(discountType === 'Rp' ? '%' : 'Rp')}>Ubah ke {discountType === 'Rp' ? '%' : 'Rp'}</span>
              </label>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden focus-within:border-blue-500">
                <div className="bg-slate-200/50 px-2.5 py-2 text-sm font-bold text-slate-500 border-r border-slate-200">{discountType}</div>
                <input type="number" value={discountVal} onChange={(e) => setDiscountVal(e.target.value)} className="w-full bg-transparent px-2.5 py-2 text-sm font-bold outline-none" placeholder="0" />
              </div>
            </div>

            {paymentMethod === 'Deposit' && (
              <div className={`col-span-2 p-2 rounded-lg border flex justify-between items-center text-[10px] font-bold ${activeCustomerInfo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                <span>Sisa Saldo Deposit:</span><span>{activeCustomerInfo ? formatIDR(activeCustomerInfo.depositBalance) : 'Pelanggan belum terdaftar'}</span>
              </div>
            )}

            {paymentStatus === 'DP' && (
              <div className="col-span-full animate-fade-in bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-amber-800 mb-1 block">Nominal DP Dibayarkan</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-amber-700 font-bold text-sm">Rp</span>
                    <input type="number" value={dpAmount} onChange={(e) => setDpAmount(e.target.value)} className="w-full bg-white border border-amber-300 rounded-lg pl-8 pr-3 py-2 text-sm font-black text-slate-800 outline-none focus:border-amber-500 shadow-sm" placeholder="0" />
                  </div>
                </div>
                <div className="flex-1 text-right">
                  <span className="text-[10px] font-bold text-amber-700 block">Sisa Tagihan</span>
                  <span className="text-base font-black text-red-500">{dpAmount > 0 ? formatIDR(Math.max(0, grandTotal - Number(dpAmount))) : '-'}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-2 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 mb-2">
            <label className="flex items-center gap-2 cursor-pointer group mb-2">
              <input type="checkbox" checked={isDelivery} onChange={(e) => setIsDelivery(e.target.checked)} className="w-5 h-5 rounded-lg text-blue-600 focus:ring-blue-500 bg-white border-slate-200 cursor-pointer" />
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-700 group-hover:text-blue-800 transition-colors flex items-center gap-2">Di Antar (Delivery) <span className="material-symbols-outlined text-[18px] text-blue-600">local_shipping</span></span>
                <span className="text-[10px] text-slate-500 font-medium">Aktifkan untuk menambahkan ke daftar pengantaran</span>
              </div>
            </label>
            {isDelivery && (
              <div className="mt-3 animate-fade-in">
                <label className="text-[10px] font-black text-blue-700 uppercase tracking-widest mb-1.5 block">Alamat Tujuan Pengiriman</label>
                <textarea 
                  value={deliveryAddress} 
                  onChange={(e) => setDeliveryAddress(e.target.value)} 
                  rows="2" 
                  className="w-full bg-white border border-blue-200 rounded-xl px-3 py-3 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all resize-none shadow-sm" 
                  placeholder="Ketik alamat lengkap pengantaran..."
                ></textarea>
              </div>
            )}
          </div>


          <div className="flex flex-col gap-1 mt-1">
            <div className="flex justify-between text-xs text-slate-500"><span>Subtotal Tagihan</span><span>{formatIDR(subtotal)}</span></div>
            {discountAmount > 0 && <div className="flex justify-between text-xs text-red-500"><span>Potongan Diskon</span><span>- {formatIDR(discountAmount)}</span></div>}
            <div className="flex justify-between items-end mt-1 pt-2 border-t border-dashed border-slate-200">
              <span className="text-sm font-bold text-slate-800">Total Tagihan Akhir</span>
              <span className="text-2xl font-black text-blue-700 tracking-tight">{formatIDR(grandTotal)}</span>
            </div>
          </div>

          <button disabled={cart.length === 0} onClick={handleProcessCheckout} className="w-full bg-gradient-to-r from-blue-700 to-blue-600 disabled:from-slate-300 disabled:to-slate-300 disabled:text-slate-500 text-white font-bold py-3 rounded-xl shadow-md hover:shadow-blue-700/30 transition-all flex justify-center items-center gap-2 active:scale-95 mt-1">
            <span className="material-symbols-outlined text-[20px]">point_of_sale</span> PROSES TRANSAKSI
          </button>
        </div>
      </div>

      {/* MODAL KONFIRMASI */}
      {showConfirm && (
        <div className="fixed inset-0 z-[999] bg-slate-800/30 backdrop-blur-sm flex overflow-y-auto p-4 sm:p-8 animate-fade-in items-start sm:items-center justify-center">
          <div className="bg-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] max-w-lg w-full overflow-hidden animate-fade-up border border-white/20">
            {/* Standardized Header */}
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <span className="material-symbols-outlined text-blue-600">fact_check</span>
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800 tracking-tight leading-none mb-1">Konfirmasi Transaksi</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Detail Checkout POS</p>
                </div>
              </div>
              <button onClick={() => setShowConfirm(false)} className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="p-8">
              {/* Customer & Payment Method */}
              <div className="flex justify-between items-center mb-6 bg-slate-50 p-4 rounded-3xl border border-slate-100">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1 leading-none">Pelanggan</span>
                  <span className="font-black text-slate-800 text-sm">{custName}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1 leading-none">Metode Pembayaran</span>
                  <div className="bg-blue-600 text-white px-4 py-1.5 rounded-full text-[11px] font-black shadow-md shadow-blue-500/20">{paymentMethod}</div>
                </div>
              </div>
              
              {/* Shopping List Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                  <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Daftar Belanja</span>
                  <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">{cart.length} Item</span>
                </div>
                <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                  {cart.map((item, i) => (
                    <div key={i} className="flex justify-between items-center group">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-slate-800">{item.serviceName}</span>
                        <span className="text-[10px] text-slate-500 font-bold">{item.qty} {item.unit} x {formatIDR(item.price)}</span>
                      </div>
                      <span className="font-black text-slate-800 text-sm">{formatIDR(item.price * item.qty)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Deposit Info Section (Split Bill Logic) */}
              {paymentMethod === 'Deposit' && activeCustomerInfo && (
                <div className="mb-8 animate-fade-in">
                  <div className="bg-slate-50 rounded-[28px] border border-slate-200 p-6 overflow-hidden relative">
                    <div className="flex justify-between items-start mb-4 relative z-10">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saldo Deposit Sekarang</p>
                        <h4 className="text-lg font-black text-slate-800">{formatIDR(activeCustomerInfo.depositBalance)}</h4>
                      </div>
                      <div className="bg-white/50 backdrop-blur-sm p-2 rounded-xl">
                        <span className="material-symbols-outlined text-blue-600">account_balance_wallet</span>
                      </div>
                    </div>
                    
                    {activeCustomerInfo.depositBalance >= grandTotal ? (
                      <div className="flex justify-between items-center pt-4 border-t border-slate-200/50 relative z-10">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Estimasi Sisa Saldo</p>
                        <p className="text-sm font-black text-emerald-600">{formatIDR(activeCustomerInfo.depositBalance - grandTotal)}</p>
                      </div>
                    ) : (
                      <div className="pt-4 border-t border-red-100 relative z-10">
                        <div className="bg-red-50 text-red-600 p-3 rounded-2xl flex items-center gap-3">
                          <span className="material-symbols-outlined text-[18px]">warning</span>
                          <div className="flex-1">
                            <p className="text-[10px] font-black uppercase leading-none mb-1">Saldo Tidak Cukup</p>
                            <p className="text-[11px] font-bold leading-tight">Mode Split Bill Aktif: Deposit sisa {formatIDR(activeCustomerInfo.depositBalance)} akan digunakan, selisih {formatIDR(grandTotal - activeCustomerInfo.depositBalance)} akan dicatat sebagai piutang.</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Background decoration */}
                    <div className="absolute -right-4 -bottom-4 opacity-[0.03] pointer-events-none">
                      <span className="material-symbols-outlined text-[100px]">wallet</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Financial Summary Card (High Contrast) */}
              <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-2xl relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[11px] font-black text-blue-200 uppercase tracking-[0.2em]">Total Tagihan</span>
                    <span className={`text-[10px] font-black px-3 py-1 rounded-full ${paymentStatus === 'Lunas' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                      {paymentStatus.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-4xl font-black mb-6 tracking-tighter">{formatIDR(grandTotal)}</div>
                  
                  {paymentStatus === 'DP' && (
                    <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/10">
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                        <p className="text-[10px] text-blue-200 font-black uppercase tracking-widest mb-1.5 opacity-60">DP Dibayar</p>
                        <p className="text-lg font-black text-emerald-400">{formatIDR(Number(dpAmount))}</p>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                        <p className="text-[10px] text-blue-200 font-black uppercase tracking-widest mb-1.5 opacity-60">Sisa Piutang</p>
                        <p className="text-lg font-black text-red-400">{formatIDR(grandTotal - Number(dpAmount))}</p>
                      </div>
                    </div>
                  )}
                </div>
                {/* Visual Accent */}
                <div className="absolute -right-8 -top-8 bg-blue-600/10 w-32 h-32 rounded-full blur-3xl"></div>
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="px-8 pt-4 pb-8 flex justify-end gap-3">
              <button onClick={() => setShowConfirm(false)} className="px-6 py-3.5 text-slate-500 font-black text-xs uppercase tracking-widest hover:bg-slate-200 rounded-2xl transition-all">Batal</button>
              <button onClick={confirmTransaction} className="px-8 py-3.5 bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-500/25 hover:bg-blue-800 flex items-center justify-center gap-3 active:scale-95 transition-all">
                <span className="material-symbols-outlined text-[22px]">check_circle</span> Konfirmasi & Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 3. DATA TRANSAKSI
// ============================================================================
function OrdersView({ transactions, updateTransaction, receiptSettings, paymentMethods, outlets }) {
  const [activeOrderTab, setActiveOrderTab] = useState('all');
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [pelunasanData, setPelunasanData] = useState(null);
  const [pelunasanMethod, setPelunasanMethod] = useState(paymentMethods[0]);

  const filteredTransactions = useMemo(() => {
    if (activeOrderTab === 'all') return transactions;
    return transactions.filter(t => t.payment.status === 'DP');
  }, [transactions, activeOrderTab]);

  const handleProsesPelunasan = () => {
    if (!pelunasanData) return;
    const updated = {
      ...pelunasanData,
      payment: {
        ...pelunasanData.payment,
        status: 'Lunas',
        paidAmount: pelunasanData.payment.total,
        remainingAmount: 0,
        pelunasanMethod
      }
    };
    updateTransaction(updated);
    setPelunasanData(null);
    alert("Pelunasan Berhasil Disimpan!");
  };

  const handleDeleteTransaction = async (id) => {
    if (window.confirm('PERINGATAN: Menghapus transaksi akan menghapus data ini secara permanen dari cloud. Yakin ingin melanjutkan?')) {
        await deleteDoc(doc(db, 'transactions', id));
    }
  };

  const getOutletName = (id) => outlets.find(o => o.id === id)?.name || 'Unknown Outlet';

  return (
    <div className="p-8 max-w-[1440px] mx-auto animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 border-b border-slate-200 pb-4">
        <div><h2 className="text-2xl font-bold text-slate-800">Data Transaksi & Pelunasan</h2><p className="text-sm text-slate-500">Kelola riwayat pesanan dan pelunasan tagihan DP.</p></div>
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button onClick={() => setActiveOrderTab('all')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeOrderTab === 'all' ? 'bg-white shadow text-blue-700' : 'text-slate-500'}`}>Semua Transaksi</button>
          <button onClick={() => setActiveOrderTab('dp')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${activeOrderTab === 'dp' ? 'bg-white shadow text-amber-600' : 'text-slate-500'}`}>Belum Lunas (DP) <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-full">{transactions.filter(t => t.payment.status === 'DP').length}</span></button>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-3xl shadow-md transition-all duration-300">
        {filteredTransactions.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400"><span className="material-symbols-outlined text-6xl mb-4 opacity-50">receipt_long</span><p className="font-medium">Tidak ada data transaksi ditemukan.</p></div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="p-4 font-bold">Invoice</th><th className="p-4 font-bold">Tanggal & Waktu</th><th className="p-4 font-bold">Nama Pelanggan</th><th className="p-4 font-bold">No. WhatsApp</th><th className="p-4 font-bold text-right">Total Tagihan</th><th className="p-4 font-bold text-center">Status</th><th className="p-4 font-bold text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((trx, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-slate-800 text-sm">{trx.invoiceNo}</div>
                      <div className="text-[10px] text-blue-600 mt-0.5 bg-blue-50 px-1.5 py-0.5 rounded w-max">{getOutletName(trx.outletId)}</div>
                    </td>
                    <td className="p-4 text-xs text-slate-600 whitespace-nowrap">{trx.date}</td>
                    <td className="p-4 font-bold text-slate-800 text-sm">{trx.customer.name}</td>
                    <td className="p-4 text-xs text-slate-600">{trx.customer.phone}</td>
                    <td className="p-4 text-right font-black text-slate-800 whitespace-nowrap">{formatIDR(trx.payment.total)}</td>
                    <td className="p-4 text-center">
                      {trx.type === 'TopUp' ? (<span className="bg-purple-100 text-purple-700 font-bold text-[10px] px-2 py-1 rounded uppercase block w-max mx-auto">TOP UP DEPOSIT</span>) : trx.payment.status === 'Lunas' ? (<span className="bg-emerald-100 text-emerald-700 font-bold text-[10px] px-2 py-1 rounded uppercase block w-max mx-auto">LUNAS</span>) : (<div className="flex flex-col items-center gap-1"><span className="bg-amber-100 text-amber-700 font-bold text-[10px] px-2 py-0.5 rounded uppercase block w-max">DP: {formatIDR(trx.payment.paidAmount)}</span><span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100 w-max">Sisa: {formatIDR(trx.payment.remainingAmount)}</span></div>)}
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => setSelectedDetail(trx)} className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center transition-colors" title="Lihat Detail"><span className="material-symbols-outlined text-[16px]">visibility</span></button>
                        {trx.payment.status === 'DP' && (<button onClick={() => setPelunasanData(trx)} className="w-8 h-8 rounded-full bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 flex items-center justify-center transition-colors" title="Lunasi Tagihan"><span className="material-symbols-outlined text-[16px]">payments</span></button>)}
                        <button onClick={() => setSelectedReceipt(trx)} className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 flex items-center justify-center transition-colors" title="Cetak Nota"><span className="material-symbols-outlined text-[16px]">print</span></button>
                        <button onClick={() => handleDeleteTransaction(trx.id)} className="w-8 h-8 rounded-full bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 flex items-center justify-center transition-colors" title="Hapus Transaksi"><span className="material-symbols-outlined text-[16px]">delete</span></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL PELUNASAN */}
      {pelunasanData && (
        <div className="fixed inset-0 z-[999] bg-slate-800/30 backdrop-blur-sm flex overflow-y-auto p-4 sm:p-8 animate-fade-in items-start sm:items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-up border-t-8 border-t-amber-500 m-auto mt-8 sm:mt-auto mb-8 sm:mb-auto">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-600">payments</span>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">Pelunasan Tagihan</h2>
              </div>
              <button onClick={() => setPelunasanData(null)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="px-8 pb-4 pt-2 flex flex-col gap-5 ">
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Ringkasan Tagihan</p>
                <div className="flex justify-between text-sm mb-2 text-slate-600"><span>Invoice</span><span className="font-bold text-slate-800">{pelunasanData.invoiceNo}</span></div>
                <div className="flex justify-between text-sm mb-4 text-slate-600 pb-4 border-b border-slate-100"><span>Pelanggan</span><span className="font-bold text-slate-800">{pelunasanData.customer.name}</span></div>
                <div className="flex justify-between text-sm mb-2 text-slate-600"><span>Total Transaksi</span><span className="font-bold text-slate-800">{formatIDR(pelunasanData.payment.total)}</span></div>
                <div className="flex justify-between text-sm mb-4 text-emerald-600 font-bold"><span>Sudah Dibayar (DP)</span><span>{formatIDR(pelunasanData.payment.paidAmount)}</span></div>
                <div className="flex justify-between text-xl font-black text-red-600 pt-4 border-t border-red-50 border-dashed"><span>Sisa Pelunasan</span><span>{formatIDR(pelunasanData.payment.remainingAmount)}</span></div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 mb-3 block uppercase tracking-widest">Pilih Metode Pelunasan</label>
                <div className="grid grid-cols-3 gap-3">
                  {paymentMethods.map(m => (
                    <button key={m} onClick={() => setPelunasanMethod(m)} className={`py-3.5 rounded-2xl text-[11px] font-black border transition-all flex flex-col items-center gap-1.5 ${pelunasanMethod === m ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'}`}>
                      <span className="material-symbols-outlined text-[18px]">{m === 'Cash' ? 'payments' : m === 'Transfer' ? 'account_balance' : 'qr_code_Scanner'}</span>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-8 pt-4 pb-8 flex justify-end gap-3">
              <button onClick={() => setPelunasanData(null)} className="px-6 py-3.5 text-slate-500 font-bold hover:bg-slate-200 rounded-2xl transition-all">Batal</button>
              <button onClick={handleProsesPelunasan} className="px-8 py-3.5 bg-blue-700 text-white font-black rounded-2xl hover:bg-blue-800 shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[20px]">check_circle</span> Proses Pelunasan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETAIL */}
      {selectedDetail && (
        <div className="fixed inset-0 z-[999] bg-slate-800/30 backdrop-blur-sm flex overflow-y-auto p-4 sm:p-8 animate-fade-in items-start sm:items-center justify-center">
          <div className="bg-white rounded-[32px] shadow-2xl max-w-lg w-full overflow-hidden animate-fade-up border border-slate-100 m-auto mt-8 sm:mt-auto mb-8 sm:mb-auto">
            {/* Header dengan Gradient Blue */}
            <div className="bg-gradient-to-r from-blue-700 to-blue-800 p-6 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                  <span className="material-symbols-outlined text-white text-[24px]">receipt_long</span>
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-tight leading-tight">Detail Transaksi</h2>
                  <p className="text-[10px] text-blue-100 font-bold uppercase tracking-wider">{selectedDetail.invoiceNo}</p>
                </div>
              </div>
              <button onClick={() => setSelectedDetail(null)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all">
                <span className="material-symbols-outlined text-white">close</span>
              </button>
            </div>

            <div className="px-8 pb-4 pt-2 ">
              {/* Seksi Info Pelanggan */}
              <div className="flex justify-between items-start mb-8">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-700">
                    <span className="material-symbols-outlined text-[28px]">person</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Pelanggan</p>
                    <h3 className="font-black text-slate-800 text-lg leading-tight">{selectedDetail.customer.name}</h3>
                    <p className="text-sm text-slate-500 font-medium">{selectedDetail.customer.phone}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Status Pembayaran</p>
                  {selectedDetail.payment.status === 'Lunas' ? (
                    <span className="bg-emerald-100 text-emerald-700 px-3 py-1 text-[10px] font-black rounded-full shadow-sm shadow-emerald-200">LUNAS</span>
                  ) : (
                    <span className="bg-amber-100 text-amber-700 px-3 py-1 text-[10px] font-black rounded-full shadow-sm shadow-amber-200">BELUM LUNAS</span>
                  )}
                </div>
              </div>

              {/* Seksi Item Layanan */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-blue-600 text-[18px]">list_alt</span>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Item Layanan</h4>
                </div>
                <div className="bg-slate-50/50 rounded-3xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100/50 text-[10px] font-bold text-slate-500 uppercase">
                        <th className="px-6 py-3 text-left">Layanan</th>
                        <th className="px-6 py-3 text-right">Harga</th>
                        <th className="px-6 py-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedDetail.items && selectedDetail.items.map((item, i) => (
                        <tr key={i} className="hover:bg-white transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-700">{item.serviceName}</div>
                            <div className="text-[10px] text-slate-400 font-bold">{item.qty} {item.unit}</div>
                          </td>
                          <td className="px-6 py-4 text-right text-slate-500 font-medium">{formatIDR(item.price)}</td>
                          <td className="px-6 py-4 text-right font-bold text-slate-800">{formatIDR(item.price * item.qty)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Seksi Ringkasan Pembayaran */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-blue-600 text-[18px]">payments</span>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Ringkasan Pembayaran</h4>
                </div>
                <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-xl relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="flex justify-between text-blue-200 text-xs mb-2">
                      <span>Subtotal</span>
                      <span className="font-bold">{formatIDR(selectedDetail.payment.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-red-300 text-xs mb-6 pb-4 border-b border-white/10 border-dashed">
                      <span>Diskon</span>
                      <span className="font-bold">-{formatIDR(selectedDetail.payment.discount)}</span>
                    </div>
                    <div className="flex justify-between items-center mb-8">
                      <span className="text-sm font-bold text-blue-100">TOTAL TRANSAKSI</span>
                      <span className="text-3xl font-black text-white">{formatIDR(selectedDetail.payment.total)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/10">
                      <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                        <p className="text-[9px] text-blue-200 font-bold uppercase mb-1">Metode</p>
                        <p className="text-sm font-black">{selectedDetail.payment.method}</p>
                      </div>
                      <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                        <p className="text-[9px] text-emerald-300 font-bold uppercase mb-1">Telah Dibayar</p>
                        <p className="text-sm font-black text-emerald-400">{formatIDR(selectedDetail.payment.paidAmount)}</p>
                      </div>
                    </div>
                    {selectedDetail.payment.remainingAmount > 0 && (
                      <div className="mt-4 p-4 rounded-2xl bg-red-500/20 border border-red-500/30 flex justify-between items-center">
                        <p className="text-[10px] text-red-200 font-black uppercase">Sisa Kekurangan</p>
                        <p className="text-lg font-black text-red-400">{formatIDR(selectedDetail.payment.remainingAmount)}</p>
                      </div>
                    )}
                  </div>
                  {/* Dekorasi Background */}
                  <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
                    <span className="material-symbols-outlined text-[180px]">receipt_long</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-8 pt-4 pb-8 flex justify-end gap-3">
              <button onClick={() => setSelectedDetail(null)} className="px-6 py-3.5 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-200 rounded-2xl transition-all">Tutup</button>
              <button onClick={() => { setSelectedReceipt(selectedDetail); setSelectedDetail(null); }} className="px-8 py-3.5 bg-blue-700 text-white font-black text-xs uppercase tracking-widest hover:bg-blue-800 rounded-2xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]">print</span> Cetak Nota
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedReceipt && <ReceiptModal invoice={selectedReceipt} settings={receiptSettings} onClose={() => setSelectedReceipt(null)} />}
    </div>
  );
}

// ============================================================================
// FIX #1a: RECEIPT MODAL (KOMPONEN YANG HILANG)
// ============================================================================
function ReceiptModal({ invoice, settings, onClose }) {
  const handlePrint = () => window.print();
  return (
    <div className="fixed inset-0 z-[999] bg-slate-800/30 backdrop-blur-sm flex overflow-y-auto p-4 sm:p-8 animate-fade-in items-start sm:items-center justify-center">
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-fade-up m-auto mt-8 sm:mt-auto mb-8 sm:mb-auto">
        <div className="px-8 pt-8 pb-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-600">receipt</span>
            <h2 className="text-lg font-black text-slate-800 tracking-tight">Cetak Nota Digital</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="px-8 pb-4 pt-2 ">
          <div className="bg-white p-6 border border-slate-200 rounded-xl font-mono text-xs">
            <div className="text-center mb-4 border-b border-dashed border-slate-300 pb-4">
              <h3 className="font-black text-lg text-slate-800 tracking-wider">{settings.storeName}</h3>
              <p className="text-slate-500 text-[10px] mt-1">{settings.tagline}</p>
              <p className="text-slate-500 text-[10px]">{settings.address}</p>
            </div>
            <div className="grid grid-cols-2 gap-y-1 text-[10px] mb-4">
              <span className="text-slate-500">No. Nota:</span><span className="text-right font-bold">{invoice.invoiceNo}</span>
              <span className="text-slate-500">Tanggal:</span><span className="text-right">{invoice.date}</span>
              <span className="text-slate-500">Pelanggan:</span><span className="text-right font-bold">{invoice.customer.name}</span>
              <span className="text-slate-500">No. WA:</span><span className="text-right">{invoice.customer.phone}</span>
            </div>
            <div className="border-y border-dashed border-slate-300 py-3 mb-3">
              {invoice.items && invoice.items.map((item, i) => (
                <div key={i} className="flex justify-between mb-2">
                  <div><div className="font-bold">{item.serviceName}</div><div className="text-[9px] text-slate-400">{item.qty}{item.unit} x {formatIDR(item.price)}</div></div>
                  <div className="font-bold">{formatIDR(item.price * item.qty)}</div>
                </div>
              ))}
            </div>
            <div className="text-[10px] grid grid-cols-2 gap-y-1 mb-1">
              <span className="text-slate-500">Subtotal:</span><span className="text-right">{formatIDR(invoice.payment.subtotal)}</span>
              {invoice.payment.discount > 0 && <><span className="text-slate-500">Diskon:</span><span className="text-right text-red-500">-{formatIDR(invoice.payment.discount)}</span></>}
            </div>
            <div className="flex justify-between font-black text-sm border-t border-slate-200 pt-2 mb-2">
              <span>TOTAL:</span><span>{formatIDR(invoice.payment.total)}</span>
            </div>
            <div className="text-[10px] grid grid-cols-2 gap-y-1 text-slate-500 mb-3">
              <span>Metode:</span><span className="text-right font-bold text-slate-700">{invoice.payment.method}</span>
              <span>Dibayar:</span><span className="text-right font-bold text-emerald-600">{formatIDR(invoice.payment.paidAmount)}</span>
              {invoice.payment.remainingAmount > 0 && <><span className="text-red-500 font-bold">Sisa Hutang:</span><span className="text-right font-bold text-red-500">{formatIDR(invoice.payment.remainingAmount)}</span></>}
            </div>
            {settings.showQR && (
              <div className="flex flex-col items-center border-t border-dashed border-slate-300 pt-4 mt-2">
                <span className="material-symbols-outlined text-[80px] text-slate-800 leading-none">qr_code_2</span>
                <p className="text-[9px] text-slate-400 mt-1">Scan untuk cek status</p>
              </div>
            )}
            <p className="text-center text-[9px] italic text-slate-400 mt-4">{settings.footerText}</p>
          </div>
        </div>
        <div className="px-8 pt-4 pb-8 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-3.5 text-slate-500 font-bold hover:bg-slate-200 rounded-2xl transition-all">Batal</button>
          <button onClick={handlePrint} className="px-8 py-3.5 bg-blue-700 text-white font-black rounded-2xl hover:bg-blue-800 shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 active:scale-95">
            <span className="material-symbols-outlined text-[20px]">print</span> Cetak Struk
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 4. PENGELUARAN
// ============================================================================
function ExpensesView({ expenses, setExpenses, activeOutletId, outlets }) {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ id: null, name: '', category: 'OPEX', qty: 1, cost: 0, usefulLife: 12, note: '' });

  const activeOutletName = outlets.find(o => o.id === activeOutletId)?.name || 'Outlet Aktif';

  const handleSave = async () => {
    if (!formData.name || !formData.cost || formData.cost <= 0) return alert("Nama dan Biaya wajib diisi dengan benar!");
    if (formData.category === 'CAPEX' && (!formData.usefulLife || formData.usefulLife <= 0)) return alert("Masa manfaat CAPEX wajib diisi!");
    const totalBiaya = Number(formData.qty) * Number(formData.cost);
    const newExpense = {
      ...formData,
      outletId: activeOutletId,
      qty: Number(formData.qty),
      cost: Number(formData.cost),
      total: totalBiaya,
      date: formData.id ? formData.date : new Date().toISOString(),
      monthlyDepreciation: formData.category === 'CAPEX' ? Math.round(totalBiaya / Number(formData.usefulLife)) : 0
    };
    if (formData.id) {
        const { id, ...data } = newExpense;
        await updateDoc(doc(db, 'expenses', id), data);
    } else {
        await addDoc(collection(db, 'expenses'), newExpense);
    }
    setShowModal(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Yakin ingin menghapus data pengeluaran ini?')) {
      await deleteDoc(doc(db, 'expenses', id));
    }
  };

  const getOutletName = (id) => outlets.find(o => o.id === id)?.name || 'Unknown';

  return (
    <div className="p-8 max-w-[1440px] mx-auto animate-fade-in">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Manajemen Pengeluaran</h2>
          <p className="text-sm text-slate-500">Catat OPEX dan CAPEX untuk outlet <span className="font-bold text-blue-600">{activeOutletName}</span>.</p>
        </div>
        <button onClick={() => { setFormData({ id: null, name: '', category: 'OPEX', qty: 1, cost: 0, usefulLife: 12, note: '' }); setShowModal(true); }} className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-colors flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">money_off</span> Tambah Pengeluaran
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl shadow-md transition-all duration-300">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                <th className="p-4 font-bold">Tanggal</th><th className="p-4 font-bold">Outlet</th><th className="p-4 font-bold">Kategori</th><th className="p-4 font-bold">Nama Pengeluaran</th><th className="p-4 font-bold text-right">Biaya Satuan</th><th className="p-4 font-bold text-center">Qty</th><th className="p-4 font-bold text-right">Total Biaya</th><th className="p-4 font-bold text-right">Amortisasi (Bln)</th><th className="p-4 font-bold">Keterangan</th><th className="p-4 font-bold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr><td colSpan="10" className="p-10 text-center text-slate-400 font-medium">Belum ada data pengeluaran dicatat.</td></tr>
              ) : expenses.map((exp) => (
                <tr key={exp.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors text-sm">
                  <td className="p-4 text-slate-600 whitespace-nowrap">{new Date(exp.date).toLocaleDateString('id-ID')}</td>
                  <td className="p-4 font-bold text-blue-700 text-xs">{getOutletName(exp.outletId)}</td>
                  <td className="p-4"><span className={`px-2 py-0.5 rounded font-bold text-[10px] ${exp.category === 'CAPEX' ? 'bg-purple-100 text-purple-700' : 'bg-red-100 text-red-700'}`}>{exp.category}</span></td>
                  <td className="p-4 font-bold text-slate-800">{exp.name}</td>
                  <td className="p-4 text-right text-slate-600">{formatIDR(exp.cost)}</td>
                  <td className="p-4 text-center font-bold text-slate-800">{exp.qty}</td>
                  <td className="p-4 text-right font-black text-red-600">{formatIDR(exp.total)}</td>
                  <td className="p-4 text-right">{exp.category === 'CAPEX' ? (<div><div className="font-bold text-slate-800">{formatIDR(exp.monthlyDepreciation)}</div><div className="text-[10px] text-slate-500">Slm {exp.usefulLife} Bln</div></div>) : <span className="text-slate-300">-</span>}</td>
                  <td className="p-4 text-slate-600 max-w-[150px] truncate" title={exp.note}>{exp.note || '-'}</td>
                  <td className="p-4 text-center whitespace-nowrap">
                    <button onClick={() => { setFormData(exp); setShowModal(true); }} className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 inline-flex items-center justify-center transition-all mr-2"><span className="material-symbols-outlined text-[16px]">edit</span></button>
                    <button onClick={() => handleDelete(exp.id)} className="w-8 h-8 rounded-full bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 inline-flex items-center justify-center transition-all"><span className="material-symbols-outlined text-[16px]">delete</span></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[999] bg-slate-800/30 backdrop-blur-sm flex overflow-y-auto p-4 sm:p-8 animate-fade-in items-start sm:items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-fade-up m-auto mt-8 sm:mt-auto mb-8 sm:mb-auto">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600">account_balance_wallet</span>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">
                  {formData.id ? 'Edit Pengeluaran' : 'Catat Pengeluaran Baru'}
                </h2>
              </div>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="px-8 pb-4 pt-2 grid grid-cols-2 gap-5 ">
              <div className="col-span-full"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Nama / Deskripsi Pengeluaran</label><input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-medium" placeholder="Misal: Beli Plastik Packing..." /></div>
              <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Kategori</label><select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-bold appearance-none cursor-pointer"><option value="OPEX">OPEX (Operasional)</option><option value="CAPEX">CAPEX (Aset/Investasi)</option></select></div>
              <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Jumlah (Qty)</label><input type="number" min="1" value={formData.qty} onChange={e => setFormData({ ...formData, qty: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-bold" /></div>
              <div className="col-span-full"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Biaya / Harga Satuan (Rp)</label><input type="number" min="0" value={formData.cost} onChange={e => setFormData({ ...formData, cost: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-black text-slate-800" /></div>
              {formData.category === 'CAPEX' && (
                <div className="col-span-full bg-purple-50 border border-purple-200 p-5 rounded-2xl animate-fade-in flex flex-col gap-3">
                  <label className="text-[10px] font-black text-purple-800 uppercase tracking-widest block">Masa Manfaat (Bulan)</label>
                  <input type="number" min="1" value={formData.usefulLife} onChange={e => setFormData({ ...formData, usefulLife: e.target.value })} className="w-full bg-white border border-purple-300 rounded-xl px-4 py-3 text-sm outline-none focus:border-purple-500 font-bold" />
                  <p className="text-[10px] text-purple-600 italic">Depresiasi rata-rata selama {formData.usefulLife || 0} bulan.</p>
                </div>
              )}
              <div className="col-span-full"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Keterangan Opsional</label><textarea rows="2" value={formData.note} onChange={e => setFormData({ ...formData, note: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-[20px] px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-medium resize-none"></textarea></div>
              <div className="col-span-full mt-2 pt-4 border-t border-slate-200 flex justify-between items-center">
                <span className="text-sm font-bold text-slate-500">TOTAL BIAYA:</span>
                <span className="text-xl font-black text-red-600">{formatIDR(Number(formData.qty) * Number(formData.cost))}</span>
              </div>
            </div>
            <div className="px-8 pt-4 pb-8 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition-all">Batal</button>
              <button onClick={handleSave} className="flex-2 py-3 bg-blue-700 text-white font-black rounded-xl hover:bg-blue-800 shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]">save</span> Simpan Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 5. LAPORAN KEUANGAN
// ============================================================================
function ReportsView({ transactions, expenses, outlets, customers }) {
  const [filterPeriod, setFilterPeriod] = useState('Semua Waktu');
  const [activeSubTab, setActiveSubTab] = useState('laba_rugi'); // 'laba_rugi' or 'grafik'

  const now = new Date();
  
  // Filtering logic for the main table (Laba Rugi) - remains the same for backward compatibility
  let filteredTransactions = [...transactions];
  let filteredExpenses = [...expenses];

  if (filterPeriod === 'Bulan Ini') {
    filteredTransactions = transactions.filter(t => {
      const d = parseIdDate(t.date);
      return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    filteredExpenses = expenses.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  } else if (filterPeriod === 'Hari Ini') {
    filteredTransactions = transactions.filter(t => {
      const d = parseIdDate(t.date);
      return d && d.toDateString() === now.toDateString();
    });
    filteredExpenses = expenses.filter(e => {
      const d = new Date(e.date);
      return d.toDateString() === now.toDateString();
    });
  }

  const totalOmset = filteredTransactions.reduce((sum, t) => sum + t.payment.total, 0);
  const totalDiskon = filteredTransactions.reduce((sum, t) => sum + (t.payment.discount || 0), 0);
  const totalPiutang = filteredTransactions.reduce((sum, t) => sum + (t.payment.remainingAmount || 0), 0);
  const totalDepositUsed = filteredTransactions.filter(t => t.payment.method === 'Deposit').reduce((sum, t) => sum + (t.payment.paidAmount || 0), 0);
  const totalKasRiilMasuk = filteredTransactions.filter(t => t.payment.method !== 'Deposit').reduce((sum, t) => sum + (t.payment.paidAmount || 0), 0);
  const totalPengeluaran = calculatePengeluaran(filteredExpenses, filterPeriod);
  const nettIncome = totalKasRiilMasuk - totalPengeluaran;

  const getOutletName = (id) => outlets.find(o => o.id === id)?.name || 'Unknown';

  return (
    <div className="p-8 max-w-[1440px] mx-auto animate-fade-in">
      {/* Tab Navigation */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit mb-8 gap-1">
        <button 
          onClick={() => setActiveSubTab('laba_rugi')}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeSubTab === 'laba_rugi' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span> Laba Rugi
        </button>
        <button 
          onClick={() => setActiveSubTab('grafik')}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeSubTab === 'grafik' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <span className="material-symbols-outlined text-[20px]">monitoring</span> Data Grafik
        </button>
      </div>

      {activeSubTab === 'laba_rugi' ? (
        <>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4 border-b border-slate-200 pb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Laporan Laba Rugi</h2>
              <p className="text-sm text-slate-500">Rincian pendapatan riil, pengeluaran, dan nett income.</p>
            </div>

        <div className="flex flex-wrap items-center gap-3">
          <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} className="bg-white border border-slate-300 text-slate-700 font-bold text-sm rounded-xl px-4 py-2.5 outline-none shadow-sm">
            <option value="Semua Waktu">Semua Waktu</option>
            <option value="Hari Ini">Hari Ini</option>
            <option value="Bulan Ini">Bulan Ini</option>
          </select>
          <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-colors flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">download</span> Export Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-300 transition-colors">
          <p className="text-xs font-bold text-emerald-600 mb-1 uppercase tracking-wider">Total Kas Masuk</p>
          <h3 className="text-3xl font-black text-slate-800">{formatIDR(totalKasRiilMasuk)}</h3>
          <p className="text-[10px] text-slate-400 mt-2">Hanya uang cash/transfer yang telah diterima</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-red-300 transition-colors">
          <p className="text-xs font-bold text-red-600 mb-1 uppercase tracking-wider">Total Pengeluaran & Beban</p>
          <h3 className="text-3xl font-black text-slate-800">{formatIDR(totalPengeluaran)}</h3>
          <p className="text-[10px] text-slate-400 mt-2">OPEX Kasir + Beban Amortisasi CAPEX</p>
        </div>
        <div className="bg-gradient-to-br from-blue-700 to-blue-900 p-6 rounded-2xl shadow-md text-white">
          <p className="text-xs font-bold text-blue-200 mb-1 uppercase tracking-wider">Laba Bersih (Nett Income)</p>
          <h3 className="text-3xl font-black">{formatIDR(nettIncome)}</h3>
          <p className="text-[10px] text-blue-300 mt-2">Laba bersih operasional periode ini</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between"><div><p className="text-[10px] font-bold text-slate-500 uppercase">Total Omset Tagihan</p><h4 className="font-bold text-slate-800">{formatIDR(totalOmset)}</h4></div><span className="material-symbols-outlined text-slate-300 text-3xl">monitoring</span></div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between"><div><p className="text-[10px] font-bold text-slate-500 uppercase">Dibayar pakai Deposit</p><h4 className="font-bold text-slate-800">{formatIDR(totalDepositUsed)}</h4></div><span className="material-symbols-outlined text-slate-300 text-3xl">loyalty</span></div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between"><div><p className="text-[10px] font-bold text-slate-500 uppercase">Total Piutang Berjalan</p><h4 className="font-bold text-red-500">{formatIDR(totalPiutang)}</h4></div><span className="material-symbols-outlined text-slate-300 text-3xl">pending_actions</span></div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl shadow-md transition-all duration-300">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><span className="material-symbols-outlined text-blue-600">table_chart</span> Rincian Arus Pemasukan</h3>
        </div>
        {filteredTransactions.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400"><span className="material-symbols-outlined text-6xl mb-4 opacity-50">receipt_long</span><p className="font-medium">Belum ada data keuangan pada periode ini.</p></div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-xs text-slate-600 uppercase tracking-wider">
                  <th className="p-4 font-bold">Tanggal</th><th className="p-4 font-bold">Invoice & Outlet</th><th className="p-4 font-bold">Jenis</th><th className="p-4 font-bold">Pelanggan</th><th className="p-4 font-bold text-right">Total</th><th className="p-4 font-bold text-right">Diskon</th><th className="p-4 font-bold text-right text-emerald-700 bg-emerald-50">Kas Masuk</th><th className="p-4 font-bold text-right text-red-700 bg-red-50">Piutang</th><th className="p-4 font-bold text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((trx, i) => {
                  const isTopUp = trx.type === 'TopUp';
                  const isDepositPay = trx.payment.method === 'Deposit';
                  const kasMasuk = isDepositPay ? 0 : (trx.payment.paidAmount || 0);
                  return (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors text-sm">
                      <td className="p-4 text-slate-600 whitespace-nowrap">{trx.date.split(',')[0]}</td>
                      <td className="p-4"><div className="font-bold text-blue-700">{trx.invoiceNo}</div><div className="text-[10px] text-slate-500 mt-0.5">{getOutletName(trx.outletId)}</div></td>
                      <td className="p-4">{isTopUp ? <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Top Up</span> : <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Laundry</span>}</td>
                      <td className="p-4 font-bold text-slate-800 whitespace-nowrap">{trx.customer.name}</td>
                      <td className="p-4 text-right font-bold text-slate-800">{formatIDR(trx.payment.total)}</td>
                      <td className="p-4 text-right text-red-500">{trx.payment.discount > 0 ? `-${formatIDR(trx.payment.discount)}` : '-'}</td>
                      <td className="p-4 text-right font-bold text-emerald-600 bg-emerald-50/30">{formatIDR(kasMasuk)}{isDepositPay && <div className="text-[9px] text-purple-600 mt-1">(Saldo Deposit)</div>}</td>
                      <td className="p-4 text-right font-bold text-red-600 bg-red-50/30">{trx.payment.remainingAmount > 0 ? formatIDR(trx.payment.remainingAmount) : '-'}</td>
                      <td className="p-4 text-center">{isTopUp ? <span className="text-slate-500 font-bold text-xs">-</span> : trx.payment.status === 'Lunas' ? <span className="text-emerald-600 font-bold text-xs flex items-center justify-center gap-1"><span className="material-symbols-outlined text-[14px]">check_circle</span>LUNAS</span> : <span className="text-amber-600 font-bold text-xs flex items-center justify-center gap-1"><span className="material-symbols-outlined text-[14px]">pending_actions</span>DP</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td colSpan="4" className="p-4 font-black text-slate-800 text-right uppercase text-xs tracking-wider">Total Keseluruhan</td>
                  <td className="p-4 font-black text-slate-800 text-right">{formatIDR(totalOmset)}</td>
                  <td className="p-4 font-bold text-red-500 text-right">-{formatIDR(totalDiskon)}</td>
                  <td className="p-4 font-black text-emerald-700 text-right bg-emerald-100">{formatIDR(totalKasRiilMasuk)}</td>
                  <td className="p-4 font-black text-red-700 text-right bg-red-100">{formatIDR(totalPiutang)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
        </>
      ) : (
        <GraphicalReport transactions={transactions} expenses={expenses} customers={customers} />
      )}
    </div>
  );
}

// ============================================================================
// DATA GRAPHICS COMPONENT
// ============================================================================
function GraphicalReport({ transactions, expenses, customers }) {
  const [period, setPeriod] = useState('Bulanan'); // Harian, Mingguan, Bulanan, Tahunan

  const chartData = useMemo(() => {
    const data = [];
    const now = new Date();
    
    // Grouping keys generator
    const getGroupKey = (date, mode) => {
      const d = new Date(date);
      if (mode === 'Harian') return d.toLocaleDateString('id-ID');
      if (mode === 'Mingguan') {
        const first = d.getDate() - d.getDay(); 
        const sunday = new Date(d.setDate(first));
        return sunday.toLocaleDateString('id-ID');
      }
      if (mode === 'Bulanan') return `${d.getMonth() + 1}/${d.getFullYear()}`;
      if (mode === 'Tahunan') return `${d.getFullYear()}`;
      return '';
    };

    // Determine range
    const items = [];
    const count = period === 'Harian' ? 30 : period === 'Mingguan' ? 12 : period === 'Bulanan' ? 12 : 5;
    
    for (let i = 0; i < count; i++) {
        const d = new Date();
        if (period === 'Harian') d.setDate(now.getDate() - (count - 1 - i));
        else if (period === 'Mingguan') d.setDate(now.getDate() - ((count - 1 - i) * 7));
        else if (period === 'Bulanan') d.setMonth(now.getMonth() - (count - 1 - i));
        else if (period === 'Tahunan') d.setFullYear(now.getFullYear() - (count - 1 - i));
        
        items.push({
            key: getGroupKey(d, period),
            label: period === 'Bulanan' ? d.toLocaleString('id-ID', { month: 'short', year: '2-digit' }) : 
                   period === 'Tahunan' ? d.getFullYear().toString() :
                   d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' }),
            pemasukan: 0,
            pengeluaran: 0,
            deposit: 0,
            transaksi: 0,
            laba: 0,
            newCustomers: 0
        });
    }

    // Aggregate Transactions
    transactions.forEach(t => {
      const d = parseIdDate(t.date);
      if (!d) return;
      const key = getGroupKey(d, period);
      const item = items.find(it => it.key === key);
      if (item) {
        if (t.type === 'TopUp') {
            item.deposit += (t.payment.paidAmount || 0);
        } else {
            item.pemasukan += t.payment.method !== 'Deposit' ? (t.payment.paidAmount || 0) : 0;
            item.transaksi += 1;
        }
      }
    });

    // Aggregate Expenses
    expenses.forEach(e => {
      const d = new Date(e.date);
      const key = getGroupKey(d, period);
      const item = items.find(it => it.key === key);
      if (item) {
        item.pengeluaran += (e.total || 0);
      }
    });

    // Aggregate Customers (Growth)
    customers.forEach(c => {
        // Assuming firstWashDate as registration date
        const d = parseIdDate(c.firstWashDate);
        if (!d) return;
        const key = getGroupKey(d, period);
        const item = items.find(it => it.key === key);
        if (item) item.newCustomers += 1;
    });

    // Calculate Laba
    items.forEach(it => {
        it.laba = it.pemasukan - it.pengeluaran;
    });

    return items;
  }, [transactions, expenses, customers, period]);

  // Payment method data (Pie chart)
  const paymentData = useMemo(() => {
    const counts = {};
    transactions.filter(t => t.type !== 'TopUp').forEach(t => {
      const m = t.payment.method || 'Lainnya';
      counts[m] = (counts[m] || 0) + 1;
    });
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  }, [transactions]);

  const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

  return (
    <div className="animate-fade-up">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-800">Visualisasi Data Bisnis</h2>
        <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {['Harian', 'Mingguan', 'Bulanan', 'Tahunan'].map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${period === p ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{p}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Laba Bersih */}
        <ChartCard title="Grafik Laba Bersih" icon="payments" color="blue">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorLaba" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `Rp${v/1000}k`} />
              <Tooltip formatter={(v) => formatIDR(v)} />
              <Area type="monotone" dataKey="laba" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorLaba)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 2. Pemasukan */}
        <ChartCard title="Grafik Pemasukan (Cash In)" icon="trending_up" color="emerald">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `Rp${v/1000}k`} />
              <Tooltip formatter={(v) => formatIDR(v)} />
              <Bar dataKey="pemasukan" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 3. Pengeluaran */}
        <ChartCard title="Grafik Pengeluaran" icon="trending_down" color="red">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `Rp${v/1000}k`} />
              <Tooltip formatter={(v) => formatIDR(v)} />
              <Bar dataKey="pengeluaran" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 4. Deposit */}
        <ChartCard title="Grafik Top Up Deposit" icon="account_balance_wallet" color="purple">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `Rp${v/1000}k`} />
              <Tooltip formatter={(v) => formatIDR(v)} />
              <Line type="monotone" dataKey="deposit" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 5. Jumlah Transaksi */}
        <ChartCard title="Grafik Jumlah Transaksi" icon="receipt_long" color="amber">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="transaksi" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 6. Jenis Pembayaran */}
        <ChartCard title="Metode Pembayaran (%)" icon="pie_chart" color="slate">
          <div className="flex items-center justify-around h-[250px]">
            <ResponsiveContainer width="50%" height="100%">
              <PieChart>
                <Pie data={paymentData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {paymentData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2">
              {paymentData.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                  <span>{d.name}: {d.value} trx</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        {/* 7. Jumlah Customer */}
        <ChartCard title="Pertumbuhan Customer Baru" icon="group_add" color="indigo" fullWidth>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip />
              <Area type="stepAfter" dataKey="newCustomers" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, icon, color, children, fullWidth }) {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    red: 'text-red-600 bg-red-50',
    purple: 'text-purple-600 bg-purple-50',
    amber: 'text-amber-600 bg-amber-50',
    slate: 'text-slate-600 bg-slate-50',
    indigo: 'text-indigo-600 bg-indigo-50',
  };

  return (
    <div className={`bg-white p-6 rounded-3xl border border-slate-200 shadow-sm ${fullWidth ? 'lg:col-span-2' : ''}`}>
      <div className="flex items-center gap-3 mb-6">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${colorClasses[color] || colorClasses.blue}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
        <h3 className="font-bold text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}


// ============================================================================
// FIX #1b: DEPOSIT VIEW (KOMPONEN YANG HILANG)
// ============================================================================
function DepositView({ customers, depositPackages, paymentMethods, addTransaction }) {
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedPackage, setSelectedPackage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(paymentMethods.filter(m => m !== 'Deposit')[0] || 'Cash');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.customerId.toLowerCase().includes(search.toLowerCase())
  );

  const pkgDetail = depositPackages.find(p => p.id === selectedPackage);

  const formatValidity = (type, value) => {
    if (type === 'tanpa_batas') return 'Tanpa Batas';
    if (type === 'tanggal') return `S.d ${new Date(value).toLocaleDateString('id-ID')}`;
    const label = type === 'hari' ? 'Hari' : type === 'bulan' ? 'Bulan' : 'Tahun';
    return `${value} ${label}`;
  };

  const calcExpiry = (pkg) => {
    if (!pkg) return '-';
    if (pkg.validityType === 'tanpa_batas') return 'Tanpa Batas';
    const d = new Date();
    if (pkg.validityType === 'hari') d.setDate(d.getDate() + Number(pkg.validityValue));
    else if (pkg.validityType === 'bulan') d.setMonth(d.getMonth() + Number(pkg.validityValue));
    else if (pkg.validityType === 'tahun') d.setFullYear(d.getFullYear() + Number(pkg.validityValue));
    else if (pkg.validityType === 'tanggal') return new Date(pkg.validityValue).toLocaleDateString('id-ID');
    return d.toLocaleDateString('id-ID');
  };

  const handleTopUp = () => {
    if (!selectedCustomer) return alert('Pilih pelanggan terlebih dahulu!');
    if (!pkgDetail) return alert('Pilih paket deposit!');
    setShowConfirm(true);
  };

  const confirmTopUp = () => {
    const expiry = calcExpiry(pkgDetail);
    const trxData = {
      id: Date.now().toString(),
      invoiceNo: `TU-${new Date().getTime().toString().slice(-6)}`,
      type: 'TopUp',
      date: new Date().toLocaleString('id-ID'),
      customer: { name: selectedCustomer.name, phone: selectedCustomer.phone, isNew: false },
      items: [],
      depositNominal: pkgDetail.nominal,
      depositPackageName: pkgDetail.name,
      depositExpiry: expiry,
      payment: {
        method: paymentMethod,
        subtotal: pkgDetail.price,
        discount: 0,
        total: pkgDetail.price,
        status: 'Lunas',
        paidAmount: pkgDetail.price,
        remainingAmount: 0
      }
    };
    addTransaction(trxData);
    setShowConfirm(false);
    setSelectedCustomer(null);
    setSelectedPackage('');
    setSearch('');
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  return (
    <div className="p-8 max-w-[1440px] mx-auto animate-fade-in relative">
      {showSuccess && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-6 py-3 rounded-full shadow-lg font-bold flex items-center gap-2 animate-fade-in">
          <span className="material-symbols-outlined">check_circle</span>Top Up Deposit Berhasil!
        </div>
      )}

      <div className="mb-6"><h2 className="text-2xl font-bold text-slate-800">Manajemen Deposit Pelanggan</h2><p className="text-sm text-slate-500">Top up saldo deposit dan pantau status deposit pelanggan.</p></div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* FORM TOP UP */}
        <div className="lg:col-span-1 flex flex-col gap-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-blue-600">account_balance_wallet</span>Form Top Up Deposit</h3>

            <div className="mb-4">
              <label className="text-xs font-bold text-slate-500 mb-1.5 block">Cari Pelanggan</label>
              <input type="text" value={search} onChange={e => { setSearch(e.target.value); setSelectedCustomer(null); }} className="w-full bg-slate-50 border border-slate-200 rounded-[20px] px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-medium" placeholder="Nama / No WA / ID..." />
              {search && !selectedCustomer && (
                <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  {filteredCustomers.slice(0, 5).map(c => (
                    <button key={c.id} onClick={() => { setSelectedCustomer(c); setSearch(c.name); }} className="w-full px-4 py-3 text-left text-sm hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0">
                      <div className="font-bold text-slate-800">{c.name}</div>
                      <div className="text-[10px] text-slate-500">{c.customerId} • {c.phone}</div>
                    </button>
                  ))}
                  {filteredCustomers.length === 0 && <div className="px-4 py-3 text-sm text-slate-400">Pelanggan tidak ditemukan</div>}
                </div>
              )}
              {selectedCustomer && (
                <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <div className="flex justify-between items-start">
                    <div><div className="font-bold text-emerald-800 text-sm">{selectedCustomer.name}</div><div className="text-[10px] text-emerald-600">{selectedCustomer.customerId} • {selectedCustomer.phone}</div></div>
                    <button onClick={() => { setSelectedCustomer(null); setSearch(''); }} className="text-emerald-400 hover:text-red-500"><span className="material-symbols-outlined text-[16px]">close</span></button>
                  </div>
                  <div className="mt-2 pt-2 border-t border-emerald-200 flex justify-between text-xs font-bold">
                    <span className="text-emerald-700">Saldo Saat Ini:</span>
                    <span className="text-emerald-800">{formatIDR(selectedCustomer.depositBalance)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="text-xs font-bold text-slate-500 mb-1.5 block">Pilih Paket Deposit</label>
              <div className="flex flex-col gap-2">
                {depositPackages.map(pkg => (
                  <button key={pkg.id} onClick={() => setSelectedPackage(pkg.id)} className={`p-3 rounded-xl border text-left transition-all ${selectedPackage === pkg.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
                    <div className="font-bold text-slate-800 text-sm">{pkg.name}</div>
                    <div className="flex justify-between text-xs mt-1">
                      <span className="text-slate-500">Bayar: <span className="font-bold text-slate-700">{formatIDR(pkg.price)}</span></span>
                      <span className="text-emerald-600 font-bold">Dapat: {formatIDR(pkg.nominal)}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">Berlaku: {formatValidity(pkg.validityType, pkg.validityValue)}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="text-xs font-bold text-slate-500 mb-1.5 block">Metode Pembayaran Top Up</label>
              <div className="grid grid-cols-2 gap-2">
                {paymentMethods.filter(m => m !== 'Deposit').map(m => (
                  <button key={m} onClick={() => setPaymentMethod(m)} className={`py-2 rounded-lg text-xs font-bold border transition-all ${paymentMethod === m ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-600'}`}>{m}</button>
                ))}
              </div>
            </div>

            {pkgDetail && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm">
                <div className="flex justify-between mb-1"><span className="text-amber-700">Harga Paket:</span><span className="font-black text-amber-900">{formatIDR(pkgDetail.price)}</span></div>
                <div className="flex justify-between mb-1"><span className="text-emerald-700">Saldo Didapat:</span><span className="font-black text-emerald-700">+{formatIDR(pkgDetail.nominal)}</span></div>
                <div className="flex justify-between text-[10px] mt-2 pt-2 border-t border-amber-200"><span className="text-amber-600">Ekspirasi:</span><span className="font-bold text-amber-800">{calcExpiry(pkgDetail)}</span></div>
              </div>
            )}

            <button disabled={!selectedCustomer || !pkgDetail} onClick={handleTopUp} className="w-full py-3 bg-gradient-to-r from-blue-700 to-blue-600 disabled:from-slate-300 disabled:to-slate-300 disabled:text-slate-500 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[20px]">add_card</span> Proses Top Up
            </button>
          </div>
        </div>

        {/* TABEL DAFTAR DEPOSIT */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><span className="material-symbols-outlined text-blue-600">group</span>Daftar Saldo Deposit Pelanggan</h3>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="p-4 font-bold">Pelanggan</th><th className="p-4 font-bold">Paket Deposit</th><th className="p-4 font-bold text-right">Saldo</th><th className="p-4 font-bold text-center">Berlaku s.d</th><th className="p-4 font-bold text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {customers.filter(c => c.depositBalance > 0 || c.depositPackage !== '-').map(c => {
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  let isExpired = false;
                  if (c.depositExpiry !== 'Tanpa Batas' && c.depositExpiry !== '-') {
                    const parts = c.depositExpiry.split('/');
                    if (parts.length === 3) {
                      const exp = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                      isExpired = exp < today;
                    }
                  }
                  return (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors text-sm">
                      <td className="p-4"><div className="font-bold text-slate-800">{c.name}</div><div className="text-[10px] text-slate-500">{c.customerId} • {c.phone}</div></td>
                      <td className="p-4 text-slate-600">{c.depositPackage}</td>
                      <td className="p-4 text-right font-black text-blue-700">{formatIDR(c.depositBalance)}</td>
                      <td className="p-4 text-center text-xs text-slate-600">{c.depositExpiry}</td>
                      <td className="p-4 text-center">
                        {c.depositExpiry === 'Tanpa Batas' || c.depositExpiry === '-' ? (
                          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold text-[10px]">Tanpa Batas</span>
                        ) : isExpired ? (
                          <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold text-[10px]">EXPIRED</span>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold text-[10px]">AKTIF</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {customers.filter(c => c.depositBalance > 0 || c.depositPackage !== '-').length === 0 && (
                  <tr><td colSpan="5" className="p-10 text-center text-slate-400">Belum ada pelanggan dengan deposit aktif.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL KONFIRMASI TOP UP */}
      {showConfirm && pkgDetail && selectedCustomer && (
        <div className="fixed inset-0 z-[999] bg-slate-800/30 backdrop-blur-sm flex overflow-y-auto p-4 sm:p-8 animate-fade-in items-start sm:items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-fade-up m-auto mt-8 sm:mt-auto mb-8 sm:mb-auto">
            <div className="bg-blue-700 p-8 text-white text-center relative overflow-hidden">
              <div className="relative z-10">
                <span className="material-symbols-outlined text-5xl mb-2">add_card</span>
                <h2 className="text-xl font-black tracking-tight uppercase">Konfirmasi Top Up</h2>
              </div>
              <div className="absolute -right-6 -bottom-6 opacity-10 pointer-events-none transform rotate-12">
                <span className="material-symbols-outlined text-[120px]">payments</span>
              </div>
            </div>
            <div className="p-8 flex flex-col gap-4">
              <div className="flex justify-between items-center text-sm"><span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Pelanggan</span><span className="font-black text-slate-800">{selectedCustomer.name}</span></div>
              <div className="flex justify-between items-center text-sm"><span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Paket</span><span className="font-black text-blue-700 bg-blue-50 px-3 py-1 rounded-full">{pkgDetail.name}</span></div>
              <div className="flex justify-between items-center text-sm"><span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Harga Jual</span><span className="font-black text-slate-800">{formatIDR(pkgDetail.price)}</span></div>
              <div className="flex justify-between items-center text-sm p-3 bg-emerald-50 rounded-2xl border border-emerald-100"><span className="text-emerald-600 font-black uppercase tracking-widest text-[10px]">Saldo Didapat</span><span className="text-lg font-black text-emerald-700">+{formatIDR(pkgDetail.nominal)}</span></div>
              <div className="flex justify-between items-center text-sm"><span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Metode</span><span className="font-black text-slate-800">{paymentMethod}</span></div>
              <div className="flex justify-between items-center pt-4 border-t border-slate-100"><span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Saldo Setelah</span><span className="text-xl font-black text-blue-700">{formatIDR((selectedCustomer.depositBalance || 0) + pkgDetail.nominal)}</span></div>
            </div>
            <div className="px-8 pt-4 pb-8 flex justify-end gap-3">
              <button onClick={() => setShowConfirm(false)} className="px-6 py-3.5 text-slate-500 font-bold hover:bg-slate-200 rounded-2xl transition-all">Batal</button>
              <button onClick={confirmTopUp} className="px-8 py-3.5 bg-blue-700 text-white font-black rounded-2xl shadow-lg shadow-blue-500/20 hover:bg-blue-800 flex items-center justify-center gap-2 active:scale-95 transition-all">
                <span className="material-symbols-outlined text-[20px]">task_alt</span> Simpan Top Up
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// FIX #1c: CUSTOMERS VIEW (KOMPONEN YANG HILANG)
// ============================================================================
function CustomersView({ customers, activeOutletId, outlets }) {
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({});

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await parseExcel(file);
      if (data.length === 0) return alert('File Excel kosong atau tidak valid!');
      
      const newCustomers = data.map((row, idx) => ({
        customerId: `CS-${String(customers.length + idx + 1).padStart(4, '0')}`,
        name: row.Name || row.name || row.Nama || row.nama || 'Tanpa Nama',
        phone: row.Phone || row.phone || row.WA || row.wa || row.Telepon || row.telepon || '',
        address: row.Address || row.address || row.Alamat || row.alamat || '-',
        totalOrders: 0,
        depositBalance: 0,
        depositPackage: '-',
        depositExpiry: '-',
        firstWashDate: '-',
        totalDepositAccumulated: 0,
        totalTransactionValue: 0,
        totalKg: 0,
        totalPcs: 0
      }));

      for (const cust of newCustomers) {
          await addDoc(collection(db, 'customers'), cust);
      }
      
      alert(`${newCustomers.length} data pelanggan berhasil diimpor!`);
    } catch (error) {
      console.error(error);
      alert('Gagal membaca file Excel. Pastikan file dalam format .xlsx atau .xls');
    }
    e.target.value = '';
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.customerId.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = () => {
    setFormData({
        name: '',
        phone: '',
        address: '',
        outletId: activeOutletId === 'all' ? '' : activeOutletId,
        totalOrders: 0,
        depositBalance: 0,
        depositPackage: '-',
        depositExpiry: '-',
        firstWashDate: '-',
        totalDepositAccumulated: 0,
        totalTransactionValue: 0,
        totalKg: 0,
        totalPcs: 0
    });
    setShowModal(true);
  };

  const handleEdit = (c) => {
    setFormData({ ...c });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.phone) return alert('Nama dan No. WA wajib diisi!');
    if (!formData.outletId || formData.outletId === 'all') return alert('Silakan pilih outlet terlebih dahulu!');
    if (formData.id) {
        const { id, ...data } = formData;
        await updateDoc(doc(db, 'customers', id), data);
    } else {
        const nextId = customers.length + 1;
        const newCust = {
            ...formData,
            customerId: `CS-${String(nextId).padStart(4, '0')}`
        };
        await addDoc(collection(db, 'customers'), newCust);
    }
    setShowModal(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Yakin ingin menghapus data pelanggan ini?')) {
      await deleteDoc(doc(db, 'customers', id));
      if (selectedCustomer?.id === id) setSelectedCustomer(null);
    }
  };

  return (
    <div className="p-8 max-w-[1440px] mx-auto animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b border-slate-200 pb-4 gap-4">
        <div><h2 className="text-2xl font-bold text-slate-800">Data Pelanggan</h2><p className="text-sm text-slate-500">{customers.length} pelanggan terdaftar</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <input id="importCust" type="file" accept=".xlsx, .xls" hidden onChange={handleImport} />
          <button onClick={() => downloadExcel('template_pelanggan.xlsx', ['Name', 'Phone', 'Address'])} className="bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">download</span> Template Excel
          </button>
          <button onClick={() => document.getElementById('importCust').click()} className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-sm hover:bg-blue-100 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">upload_file</span> Import Excel
          </button>
           <button onClick={handleAdd} className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2.5 rounded-2xl text-xs font-bold shadow-sm transition-all flex items-center gap-2 active:scale-95">
            <span className="material-symbols-outlined text-[18px]">person_add</span> Tambah Pelanggan
          </button>
          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 shadow-sm w-64 focus-within:border-blue-500 transition-colors">
            <span className="material-symbols-outlined text-slate-400 text-[20px]">search</span>
            <input value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent text-sm outline-none w-full font-medium" placeholder="Cari pelanggan..." />
          </div>
        </div>
      </div>



      <div className="bg-white border border-slate-200 rounded-3xl shadow-md transition-all duration-300">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                <th className="p-4 font-bold">ID</th><th className="p-4 font-bold">Nama Pelanggan</th><th className="p-4 font-bold">No. WA</th><th className="p-4 font-bold text-center">Total Order</th><th className="p-4 font-bold text-right">Total Transaksi</th><th className="p-4 font-bold text-right">Saldo Deposit</th><th className="p-4 font-bold">Paket Deposit</th><th className="p-4 font-bold">Pertama Cuci</th><th className="p-4 font-bold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="9" className="p-10 text-center text-slate-400">Pelanggan tidak ditemukan.</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors text-sm">
                  <td className="p-4 font-bold text-blue-700">{c.customerId}</td>
                  <td className="p-4 font-bold text-slate-800">{c.name}</td>
                  <td className="p-4 text-slate-600">{c.phone}</td>
                  <td className="p-4 text-center"><span className="bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded text-xs">{c.totalOrders} order</span></td>
                  <td className="p-4 text-right font-bold text-slate-800">{formatIDR(c.totalTransactionValue)}</td>
                  <td className="p-4 text-right font-black text-blue-700">{formatIDR(c.depositBalance)}</td>
                  <td className="p-4 text-slate-600 text-xs">{c.depositPackage}</td>
                  <td className="p-4 text-slate-600 text-xs">{c.firstWashDate || '-'}</td>
                  <td className="p-4 text-center">
                    <button onClick={() => handleEdit(c)} className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 inline-flex items-center justify-center mr-2 transition-all"><span className="material-symbols-outlined text-[16px]">edit</span></button>
                    <button onClick={() => handleDelete(c.id)} className="w-8 h-8 rounded-full bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 inline-flex items-center justify-center transition-colors"><span className="material-symbols-outlined text-[16px]">delete</span></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[999] bg-slate-800/30 backdrop-blur-sm flex overflow-y-auto p-4 sm:p-8 animate-fade-in items-start sm:items-center justify-center">
          <div className="bg-white rounded-[32px] shadow-2xl max-w-lg w-full overflow-hidden animate-fade-up border border-white/20 m-auto mt-8 sm:mt-auto mb-8 sm:mb-auto">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600">{formData.id ? 'person_edit' : 'person_add'}</span>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">{formData.id ? 'Edit Data Pelanggan' : 'Tambah Pelanggan Baru'}</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="px-8 pb-4 pt-2 grid grid-cols-2 gap-5 ">
              <div className="col-span-full">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Nama Lengkap</label>
                <input value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all" placeholder="Cth: Budi Santoso..." />
              </div>
              <div className="col-span-full">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">WhatsApp / No. Telepon</label>
                <input value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all" placeholder="Cth: 0812..." />
              </div>
              <div className="col-span-full">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Pilih Outlet</label>
                <select 
                  value={formData.outletId || ''} 
                  onChange={e => setFormData({ ...formData, outletId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all appearance-none cursor-pointer"
                >
                  <option value="" disabled>-- Pilih Outlet --</option>
                  {outlets.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-full">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Alamat Tinggal</label>
                <textarea rows="3" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all resize-none" placeholder="Alamat lengkap pelanggan..."></textarea>
              </div>
            </div>
            <div className="px-8 pt-4 pb-8 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-6 py-3.5 text-slate-500 font-bold hover:bg-slate-200 rounded-2xl transition-all">Batal</button>
              <button onClick={handleSave} className="px-8 py-3.5 bg-blue-700 text-white font-black rounded-2xl hover:bg-blue-800 shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 active:scale-95">
                <span className="material-symbols-outlined text-[20px]">check_circle</span> {formData.id ? 'Simpan Perubahan' : 'Tambah Pelanggan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// FIX #1d: EMPLOYEES VIEW (KOMPONEN YANG HILANG)
// ============================================================================
function EmployeesView({ employees, activeOutletId, outlets }) {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ id: null, noKtp: '', name: '', dob: '', gender: 'Laki-laki', addressKtp: '', addressDom: '', sameAddress: false, outletId: '' });

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await parseExcel(file);
      if (data.length === 0) return alert('File Excel kosong atau tidak valid!');
      
      const newEmployees = data.map((row, idx) => ({
        noKtp: row.NoKTP || row.noktp || row.KTP || row.ktp || '',
        name: row.Name || row.name || row.Nama || row.nama || 'Tanpa Nama',
        dob: row.DOB || row.dob || row.TanggalLahir || row.tanggallahir || '',
        gender: row.Gender || row.gender || row.JenisKelamin || row.jeniskelamin || 'Laki-laki',
        addressKtp: row.AddressKtp || row.addressktp || row.AlamatKTP || row.alamatktp || row.Alamat || row.alamat || '-',
        addressDom: row.AddressKtp || row.addressktp || row.AlamatKTP || row.alamatktp || row.Alamat || row.alamat || '-',
        sameAddress: true
      }));

      for (const emp of newEmployees) {
          await addDoc(collection(db, 'employees'), emp);
      }
      
      alert(`${newEmployees.length} data karyawan berhasil diimpor!`);
    } catch (error) {
      console.error(error);
      alert('Gagal membaca file Excel. Pastikan file dalam format .xlsx atau .xls');
    }
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!formData.name || !formData.noKtp) return alert('Nama dan No. KTP wajib diisi!');
    if (!formData.outletId) return alert('Pilih outlet terlebih dahulu!');
    const data = { ...formData, addressDom: formData.sameAddress ? formData.addressKtp : formData.addressDom };
    if (formData.id) {
        const { id, ...saveData } = data;
        await updateDoc(doc(db, 'employees', id), saveData);
    } else {
        await addDoc(collection(db, 'employees'), data);
    }
    setShowModal(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Yakin ingin menghapus data karyawan?')) {
        await deleteDoc(doc(db, 'employees', id));
    }
  };

  return (
    <div className="p-8 max-w-[1440px] mx-auto animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b border-slate-200 pb-4 gap-4">
        <div><h2 className="text-2xl font-bold text-slate-800">Data Karyawan</h2><p className="text-sm text-slate-500">{employees.length} karyawan terdaftar</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <input id="importEmp" type="file" accept=".xlsx, .xls" hidden onChange={handleImport} />
          <button onClick={() => downloadExcel('template_karyawan.xlsx', ['Name', 'NoKTP', 'DOB', 'Gender', 'AddressKtp'])} className="bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">download</span> Template Excel
          </button>
          <button onClick={() => document.getElementById('importEmp').click()} className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-sm hover:bg-blue-100 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">upload_file</span> Import Excel
          </button>
          <button onClick={() => { setFormData({ id: null, noKtp: '', name: '', dob: '', gender: 'Laki-laki', addressKtp: '', addressDom: '', sameAddress: false, outletId: activeOutletId === 'all' ? '' : activeOutletId }); setShowModal(true); }} className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2.5 rounded-2xl text-sm font-bold shadow-sm transition-all flex items-center gap-2 active:scale-95">
            <span className="material-symbols-outlined text-[18px]">person_add</span> Tambah Karyawan
          </button>
        </div>
      </div>



      <div className="bg-white border border-slate-200 rounded-3xl shadow-md transition-all duration-300">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                <th className="p-4 font-bold">Nama Karyawan</th><th className="p-4 font-bold">No. KTP</th><th className="p-4 font-bold">Tanggal Lahir</th><th className="p-4 font-bold">Jenis Kelamin</th><th className="p-4 font-bold">Alamat KTP</th><th className="p-4 font-bold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr><td colSpan="6" className="p-10 text-center text-slate-400">Belum ada data karyawan.</td></tr>
              ) : employees.map(emp => (
                <tr key={emp.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors text-sm">
                  <td className="p-4 font-bold text-slate-800">{emp.name}</td>
                  <td className="p-4 text-slate-600 font-mono text-xs">{emp.noKtp}</td>
                  <td className="p-4 text-slate-600">{emp.dob ? new Date(emp.dob).toLocaleDateString('id-ID') : '-'}</td>
                  <td className="p-4 text-slate-600">{emp.gender}</td>
                  <td className="p-4 text-slate-600 max-w-[200px] truncate" title={emp.addressKtp}>{emp.addressKtp}</td>
                  <td className="p-4 text-center">
                    <button onClick={() => { setFormData(emp); setShowModal(true); }} className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 inline-flex items-center justify-center mr-2 transition-colors"><span className="material-symbols-outlined text-[16px]">edit</span></button>
                    <button onClick={() => handleDelete(emp.id)} className="w-8 h-8 rounded-full bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 inline-flex items-center justify-center transition-colors"><span className="material-symbols-outlined text-[16px]">delete</span></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[999] bg-slate-800/30 backdrop-blur-sm flex overflow-y-auto p-4 sm:p-8 animate-fade-in items-start sm:items-center justify-center">
          <div className="bg-white rounded-[32px] shadow-2xl max-w-lg w-full overflow-hidden animate-fade-up border border-white/20 m-auto mt-8 sm:mt-auto mb-8 sm:mb-auto">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600">badge</span>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">{formData.id ? 'Edit Karyawan' : 'Tambah Karyawan'}</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="px-8 pb-4 pt-2 grid grid-cols-2 gap-5 ">
              <div className="col-span-full">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Nama Lengkap</label>
                <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all" />
              </div>
              <div className="col-span-full">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">No. KTP</label>
                <input value={formData.noKtp} onChange={e => setFormData({ ...formData, noKtp: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-mono font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all" maxLength={16} />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Tgl Lahir</label>
                <input type="date" value={formData.dob} onChange={e => setFormData({ ...formData, dob: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Gender</label>
                <select value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 outline-none appearance-none cursor-pointer"><option>Laki-laki</option><option>Perempuan</option></select>
              </div>
              <div className="col-span-full">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Pilih Outlet</label>
                <select 
                  value={formData.outletId || ''} 
                  onChange={e => setFormData({ ...formData, outletId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all appearance-none cursor-pointer"
                >
                  <option value="" disabled>-- Pilih Outlet --</option>
                  {outlets.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-full">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Alamat Sesuai KTP</label>
                <textarea rows="2" value={formData.addressKtp} onChange={e => setFormData({ ...formData, addressKtp: e.target.value, addressDom: formData.sameAddress ? e.target.value : formData.addressDom })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-medium text-slate-700 outline-none resize-none"></textarea>
              </div>
              <div className="col-span-full flex items-center gap-3 bg-blue-50 p-4 rounded-2xl">
                <input type="checkbox" id="sameAddr" checked={formData.sameAddress} onChange={e => setFormData({ ...formData, sameAddress: e.target.checked, addressDom: e.target.checked ? formData.addressKtp : formData.addressDom })} className="w-5 h-5 accent-blue-600 rounded-lg" />
                <label htmlFor="sameAddr" className="text-sm font-bold text-slate-700">Alamat domisili sama dengan KTP</label>
              </div>
            </div>
            <div className="px-8 pt-4 pb-8 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-6 py-3.5 text-slate-500 font-bold hover:bg-slate-200 rounded-2xl transition-all">Batal</button>
              <button onClick={handleSave} className="px-8 py-3.5 bg-blue-700 text-white font-black rounded-2xl hover:bg-blue-800 shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 active:scale-95">
                <span className="material-symbols-outlined text-[20px]">check_circle</span> Simpan Karyawan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 6. MASTER DATA
// ============================================================================
function MasterDataView({ services, setServices, categories, setCategories, paymentMethods, setPaymentMethods, depositPackages, setDepositPackages, outlets, setOutlets, users, currentUser }) {
  const [activeMasterTab, setActiveMasterTab] = useState('layanan');
  const [showModalSrv, setShowModalSrv] = useState(false);
  const [formDataSrv, setFormDataSrv] = useState({ id: null, name: '', durationStr: '', priceKiloan: 0, priceSatuan: 0 });
  
  const handleImportService = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await parseExcel(file);
      if (data.length === 0) return alert('File Excel kosong atau tidak valid!');
      
      const newServices = data.map((row, idx) => ({
        name: row.Name || row.name || row.Layanan || row.layanan || 'Tanpa Nama',
        durationStr: row.Duration || row.duration || row.Estimasi || row.estimasi || '2 Hari',
        priceKiloan: Number(row.PriceKiloan || row.pricekiloan || row.HargaKiloan || row.hargakiloan || 0),
        priceSatuan: Number(row.PriceSatuan || row.pricesatuan || row.HargaSatuan || row.hargasatuan || 0)
      }));
      for (const srv of newServices) {
          await addDoc(collection(db, 'services'), srv);
      }
      alert(`${newServices.length} data layanan berhasil diimpor!`);
    } catch (error) {
      console.error(error);
      alert('Gagal membaca file Excel. Pastikan file dalam format .xlsx atau .xls');
    }
    e.target.value = '';
  };


  const [showModalDep, setShowModalDep] = useState(false);
  const [formDataDep, setFormDataDep] = useState({ id: null, name: '', price: 0, nominal: 0, validityType: 'hari', validityValue: '' });
  const [showModalOutlet, setShowModalOutlet] = useState(false);
  const [formDataOutlet, setFormDataOutlet] = useState({ id: null, name: '', address: '' });
  const [showModalCat, setShowModalCat] = useState(false);
  const [formDataCat, setFormDataCat] = useState({ oldName: '', newName: '' });
  const [showModalPay, setShowModalPay] = useState(false);
  const [formDataPay, setFormDataPay] = useState({ oldName: '', newName: '' });

  const [showModalUser, setShowModalUser] = useState(false);
  const [formDataUser, setFormDataUser] = useState({ id: null, name: '', username: '', password: '', role: 'Kasir', outletId: '' });

  const handleSaveCat = async () => {
    if (!formDataCat.newName) return alert("Nama kategori wajib diisi!");
    if (formDataCat.oldName) {
      // Find the doc by name and update it
      const q = query(collection(db, 'categories'), where('name', '==', formDataCat.oldName));
      const snap = await getDocs(q);
      if (!snap.empty) {
          await updateDoc(doc(db, 'categories', snap.docs[0].id), { name: formDataCat.newName });
      }
    } else {
      await addDoc(collection(db, 'categories'), { name: formDataCat.newName });
    }
    setShowModalCat(false);
  };

  const handleSavePay = async () => {
    if (!formDataPay.newName) return alert("Nama metode wajib diisi!");
    if (formDataPay.oldName) {
      const q = query(collection(db, 'payment_methods'), where('name', '==', formDataPay.oldName));
      const snap = await getDocs(q);
      if (!snap.empty) {
          await updateDoc(doc(db, 'payment_methods', snap.docs[0].id), { name: formDataPay.newName });
      }
    } else {
      await addDoc(collection(db, 'payment_methods'), { name: formDataPay.newName });
    }
    setShowModalPay(false);
  };

  const formatValidity = (type, value) => {
    if (type === 'tanpa_batas') return 'Tanpa Batas';
    if (type === 'tanggal') return `S.d ${new Date(value).toLocaleDateString('id-ID')}`;
    const typeLabel = type === 'hari' ? 'Hari' : type === 'bulan' ? 'Bulan' : 'Tahun';
    return `${value} ${typeLabel}`;
  };

  const handleSaveOutlet = async () => {
    if (!formDataOutlet.name) return alert('Nama outlet wajib diisi!');
    if (formDataOutlet.id) {
        const { id, ...data } = formDataOutlet;
        await updateDoc(doc(db, 'outlets', id), data);
    } else {
        await addDoc(collection(db, 'outlets'), formDataOutlet);
    }
    setShowModalOutlet(false);
  };

  const handleSaveUser = async () => {
    if (!formDataUser.name || !formDataUser.username || !formDataUser.password) return alert('Semua field wajib diisi!');
    if (formDataUser.id) {
        const { id, ...data } = formDataUser;
        await updateDoc(doc(db, 'users', id), data);
    } else {
        await addDoc(collection(db, 'users'), formDataUser);
    }
    setShowModalUser(false);
  };

  return (
    <div className="p-8 max-w-[1440px] mx-auto animate-fade-in">
      <div className="mb-8"><h2 className="text-2xl font-bold text-slate-800">Pengaturan Master Data</h2></div>
      <div className="flex border-b border-slate-200 mb-8 gap-6 overflow-x-auto custom-scrollbar">
        {[
          ['layanan', 'Layanan Cucian'], 
          ['deposit', 'Program Deposit'], 
          ['kategori', 'Kategori Layanan'], 
          ['pembayaran', 'Metode Pembayaran'], 
          ['outlet', 'Data Cabang / Outlet'],
          ...(currentUser.role === 'Owner' ? [['user', 'Manajemen User']] : [])
        ].map(([key, label]) => (
          <button key={key} onClick={() => setActiveMasterTab(key)} className={`pb-3 font-bold text-sm border-b-2 transition-all whitespace-nowrap ${activeMasterTab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
        ))}
      </div>

      {activeMasterTab === 'layanan' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-8 pt-8 pb-4 flex justify-between items-center">
            <h3 className="text-md font-bold text-slate-800 flex items-center gap-2"><span className="material-symbols-outlined text-purple-600">laundry</span> Master Layanan Cucian</h3>
            <div className="flex items-center gap-3">
              <input id="importSrv" type="file" accept=".xlsx, .xls" hidden onChange={handleImportService} />
              <button onClick={() => downloadExcel('template_layanan.xlsx', ['Name', 'Duration', 'PriceKiloan', 'PriceSatuan'])} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">download</span> Template Excel
              </button>
              <button onClick={() => document.getElementById('importSrv').click()} className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-xl text-xs font-bold shadow-sm hover:bg-blue-100 transition-all flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">upload_file</span> Import Excel
              </button>
              <button onClick={() => { setFormDataSrv({ id: null, name: '', durationStr: '', priceKiloan: 0, priceSatuan: 0 }); setShowModalSrv(true); }} className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all"><span className="material-symbols-outlined text-[18px]">add</span> Tambah</button>
            </div>
          </div>


          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider"><th className="p-4 font-bold">Nama Layanan</th><th className="p-4 font-bold">Estimasi</th><th className="p-4 font-bold text-right">Harga Kiloan</th><th className="p-4 font-bold text-right">Harga Satuan</th><th className="p-4 font-bold text-center">Aksi</th></tr></thead>
              <tbody>
                {services.map(srv => (
                  <tr key={srv.id} className="border-b border-slate-100 hover:bg-slate-50/50 text-sm">
                    <td className="p-4 font-bold text-slate-800">{srv.name}</td>
                    <td className="p-4 text-slate-500 text-xs">{srv.durationStr}</td>
                    <td className="p-4 text-right text-slate-600">{srv.priceKiloan > 0 ? formatIDR(srv.priceKiloan) : '-'}</td>
                    <td className="p-4 text-right text-slate-600">{srv.priceSatuan > 0 ? formatIDR(srv.priceSatuan) : '-'}</td>
                    <td className="p-4 text-center whitespace-nowrap">
                      <button onClick={() => { setFormDataSrv(srv); setShowModalSrv(true); }} className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 inline-flex items-center justify-center mr-2 transition-all"><span className="material-symbols-outlined text-[16px]">edit</span></button>
                      <button onClick={async () => { if (window.confirm('Yakin hapus?')) await deleteDoc(doc(db, 'services', srv.id)); }} className="w-8 h-8 rounded-full bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 inline-flex items-center justify-center transition-all"><span className="material-symbols-outlined text-[16px]">delete</span></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeMasterTab === 'deposit' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
          <div className="px-8 pt-8 pb-4 flex justify-between items-center">
            <h3 className="text-md font-bold text-slate-800 flex items-center gap-2"><span className="material-symbols-outlined text-amber-600">loyalty</span> Master Program Deposit</h3>
            <button onClick={() => { setFormDataDep({ id: null, name: '', price: 0, nominal: 0, validityType: 'hari', validityValue: '' }); setShowModalDep(true); }} className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all"><span className="material-symbols-outlined text-[18px]">add</span> Tambah</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider"><th className="p-4 font-bold">Nama Program</th><th className="p-4 font-bold text-right">Harga Jual</th><th className="p-4 font-bold text-right">Nominal Saldo</th><th className="p-4 font-bold text-center">Masa Berlaku</th><th className="p-4 font-bold text-center">Aksi</th></tr></thead>
              <tbody>
                {depositPackages.map(pkg => (
                  <tr key={pkg.id} className="border-b border-slate-100 hover:bg-slate-50/50 text-sm">
                    <td className="p-4 font-bold text-slate-800">{pkg.name}</td>
                    <td className="p-4 text-right font-medium text-slate-800">{formatIDR(pkg.price)}</td>
                    <td className="p-4 text-right font-bold text-emerald-600">{formatIDR(pkg.nominal)}</td>
                    <td className="p-4 text-center font-medium text-slate-600">{formatValidity(pkg.validityType, pkg.validityValue)}</td>
                    <td className="p-4 text-center">
                      <button onClick={() => { setFormDataDep({ ...pkg }); setShowModalDep(true); }} className="text-blue-600 hover:text-blue-800 mr-3"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                      <button onClick={async () => { if (window.confirm('Yakin hapus?')) await deleteDoc(doc(db, 'deposit_packages', pkg.id)); }} className="text-slate-400 hover:text-red-600"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeMasterTab === 'kategori' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 animate-fade-in max-w-2xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-md font-bold text-slate-800 flex items-center gap-2"><span className="material-symbols-outlined text-blue-600">category</span> Kategori Sistem</h3>
            <button onClick={() => { setFormDataCat({ oldName: '', newName: '' }); setShowModalCat(true); }} className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"><span className="material-symbols-outlined text-[18px]">add</span> Tambah Baru</button>
          </div>
          <div className="flex flex-col gap-3">
            {categories.map((cat, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl text-sm font-black text-slate-700 flex justify-between items-center group hover:border-blue-300 transition-all">
                <span className="tracking-wide">{cat}</span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setFormDataCat({ oldName: cat, newName: cat }); setShowModalCat(true); }} className="text-blue-600 hover:bg-blue-100 p-2 rounded-xl transition-all"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                  <button onClick={async () => { 
                       if (window.confirm(`Hapus kategori ${cat}?`)) {
                           const q = query(collection(db, 'categories'), where('name', '==', cat));
                           const snap = await getDocs(q);
                           if (!snap.empty) await deleteDoc(doc(db, 'categories', snap.docs[0].id));
                       }
                   }} className="text-red-500 hover:bg-red-50 p-2 rounded-xl transition-all"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeMasterTab === 'pembayaran' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 animate-fade-in max-w-2xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-md font-bold text-slate-800 flex items-center gap-2"><span className="material-symbols-outlined text-green-600">payments</span> Metode Pembayaran</h3>
            <button onClick={() => { setFormDataPay({ oldName: '', newName: '' }); setShowModalPay(true); }} className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"><span className="material-symbols-outlined text-[18px]">add</span> Tambah Baru</button>
          </div>
          <div className="flex flex-col gap-3">
            {paymentMethods.map((method, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl text-sm font-black text-slate-700 flex justify-between items-center group hover:border-blue-300 transition-all">
                <span className="tracking-wide">{method}</span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setFormDataPay({ oldName: method, newName: method }); setShowModalPay(true); }} className="text-blue-600 hover:bg-blue-100 p-2 rounded-xl transition-all"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                  <button onClick={async () => { 
                       if (window.confirm(`Hapus metode ${method}?`)) {
                           const q = query(collection(db, 'payment_methods'), where('name', '==', method));
                           const snap = await getDocs(q);
                           if (!snap.empty) await deleteDoc(doc(db, 'payment_methods', snap.docs[0].id));
                       }
                   }} className="text-red-500 hover:bg-red-50 p-2 rounded-xl transition-all"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeMasterTab === 'outlet' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in max-w-4xl">
          <div className="px-8 pt-8 pb-4 flex justify-between items-center">
            <h3 className="text-md font-bold text-slate-800 flex items-center gap-2"><span className="material-symbols-outlined text-blue-600">storefront</span> Master Data Outlet / Cabang</h3>
            <button onClick={() => { setFormDataOutlet({ id: null, name: '', address: '' }); setShowModalOutlet(true); }} className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all"><span className="material-symbols-outlined text-[18px]">add</span> Tambah</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider"><th className="p-4 font-bold">ID</th><th className="p-4 font-bold">Nama Outlet</th><th className="p-4 font-bold">Alamat</th><th className="p-4 font-bold text-center">Aksi</th></tr></thead>
              <tbody>
                {outlets.map(o => (
                  <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50/50 text-sm">
                    <td className="p-4 font-bold text-blue-700">{o.id}</td>
                    <td className="p-4 font-bold text-slate-800">{o.name}</td>
                    <td className="p-4 text-slate-600 max-w-[250px] truncate" title={o.address}>{o.address}</td>
                    <td className="p-4 text-center whitespace-nowrap">
                      <button onClick={() => { setFormDataOutlet(o); setShowModalOutlet(true); }} className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 inline-flex items-center justify-center mr-2 transition-all"><span className="material-symbols-outlined text-[16px]">edit</span></button>
                      <button onClick={async () => { if (window.confirm('Yakin hapus outlet?')) await deleteDoc(doc(db, 'outlets', o.id)); }} className="w-8 h-8 rounded-full bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 inline-flex items-center justify-center transition-all"><span className="material-symbols-outlined text-[16px]">delete</span></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {activeMasterTab === 'user' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in max-w-5xl">
          <div className="px-8 pt-8 pb-4 flex justify-between items-center">
            <h3 className="text-md font-bold text-slate-800 flex items-center gap-2"><span className="material-symbols-outlined text-blue-600">manage_accounts</span> Manajemen Akun Sistem</h3>
            <button onClick={() => { setFormDataUser({ id: null, name: '', username: '', password: '', role: 'Kasir', outletId: outlets[0]?.id || '' }); setShowModalUser(true); }} className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all"><span className="material-symbols-outlined text-[18px]">person_add</span> Tambah User</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider"><th className="p-4 font-bold">Nama Lengkap</th><th className="p-4 font-bold">Username</th><th className="p-4 font-bold text-center">Role</th><th className="p-4 font-bold">Penugasan Outlet</th><th className="p-4 font-bold text-center">Aksi</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50/50 text-sm">
                    <td className="p-4 font-bold text-slate-800">{u.name}</td>
                    <td className="p-4 text-slate-500">{u.username}</td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${u.role === 'Owner' ? 'bg-purple-100 text-purple-700' : u.role === 'Admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>{u.role}</span>
                    </td>
                    <td className="p-4 text-xs font-medium text-slate-600">{u.outletId === 'all' ? 'Semua Cabang' : outlets.find(o => o.id === u.outletId)?.name || '-'}</td>
                    <td className="p-4 text-center whitespace-nowrap">
                      <button onClick={() => { setFormDataUser({ ...u }); setShowModalUser(true); }} className="text-blue-600 hover:text-blue-800 mr-3 transition-all"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                      <button onClick={async () => { if (u.username === 'admin') return alert('User admin default tidak bisa dihapus!'); if (window.confirm('Yakin hapus user ini?')) await deleteDoc(doc(db, 'users', u.id)); }} className="text-slate-300 hover:text-red-500 transition-all"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Layanan */}
      {showModalSrv && (
        <div className="fixed inset-0 z-[999] bg-slate-800/30 backdrop-blur-sm flex overflow-y-auto p-4 sm:p-8 animate-fade-in items-start sm:items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-fade-up m-auto mt-8 sm:mt-auto mb-8 sm:mb-auto">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600">settings_laundry</span>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">{formDataSrv.id ? 'Edit Layanan' : 'Tambah Layanan'}</h2>
              </div>
              <button onClick={() => setShowModalSrv(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="px-8 pb-4 pt-2 grid grid-cols-2 gap-5 ">
              <div className="col-span-full"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Nama Layanan</label><input type="text" value={formDataSrv.name} onChange={e => setFormDataSrv({ ...formDataSrv, name: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-bold" /></div>
              <div className="col-span-full"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Estimasi Waktu</label><input type="text" value={formDataSrv.durationStr} onChange={e => setFormDataSrv({ ...formDataSrv, durationStr: e.target.value })} placeholder="Cth: 2 Hari, 6 Jam..." className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-medium" /></div>
              <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Harga Kiloan (Rp)</label><input type="number" value={formDataSrv.priceKiloan} onChange={e => setFormDataSrv({ ...formDataSrv, priceKiloan: Number(e.target.value) })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-bold" /></div>
              <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Harga Satuan (Rp)</label><input type="number" value={formDataSrv.priceSatuan} onChange={e => setFormDataSrv({ ...formDataSrv, priceSatuan: Number(e.target.value) })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-bold" /></div>
            </div>
            <div className="px-8 pt-4 pb-8 flex justify-end gap-3">
              <button onClick={() => setShowModalSrv(false)} className="px-6 py-3.5 text-slate-500 font-black hover:bg-slate-200 rounded-2xl transition-all">Batal</button>
              <button onClick={async () => { 
                   if (!formDataSrv.name) return alert("Nama wajib!"); 
                   if (formDataSrv.id) {
                       const { id, ...data } = formDataSrv;
                       await updateDoc(doc(db, 'services', id), data);
                   } else {
                       await addDoc(collection(db, 'services'), formDataSrv);
                   }
                   setShowModalSrv(false); 
               }} className="px-8 py-3.5 bg-blue-700 text-white font-black rounded-2xl hover:bg-blue-800 shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 active:scale-95">
                <span className="material-symbols-outlined text-[18px]">save</span> Simpan Layanan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Deposit Pkg */}
      {showModalDep && (
        <div className="fixed inset-0 z-[999] bg-slate-800/30 backdrop-blur-sm flex overflow-y-auto p-4 sm:p-8 animate-fade-in items-start sm:items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-up m-auto mt-8 sm:mt-auto mb-8 sm:mb-auto">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600">stars</span>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">{formDataDep.id ? 'Edit Program' : 'Tambah Program Deposit'}</h2>
              </div>
              <button onClick={() => setShowModalDep(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="px-8 pb-4 pt-2 flex flex-col gap-4 ">
              <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Nama Program</label><input type="text" value={formDataDep.name} onChange={e => setFormDataDep({ ...formDataDep, name: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-bold" /></div>
              <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Harga Jual</label><input type="number" value={formDataDep.price} onChange={e => setFormDataDep({ ...formDataDep, price: Number(e.target.value) })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-bold" /></div>
              <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Nominal Saldo</label><input type="number" value={formDataDep.nominal} onChange={e => setFormDataDep({ ...formDataDep, nominal: Number(e.target.value) })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-black text-emerald-600" /></div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Masa Berlaku</label>
                <div className="flex gap-2">
                  <select value={formDataDep.validityType} onChange={e => setFormDataDep({ ...formDataDep, validityType: e.target.value, validityValue: '' })} className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none w-2/5 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all">
                    <option value="hari">Hari</option><option value="bulan">Bulan</option><option value="tahun">Tahun</option><option value="tanggal">Hingga Tanggal</option><option value="tanpa_batas">Tanpa Batas</option>
                  </select>
                  {formDataDep.validityType !== 'tanpa_batas' && (
                    <input type={formDataDep.validityType === 'tanggal' ? 'date' : 'number'} value={formDataDep.validityValue} onChange={e => setFormDataDep({ ...formDataDep, validityValue: e.target.value })} className="w-3/5 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all" />
                  )}
                </div>
              </div>
            </div>
            <div className="px-8 pt-4 pb-8 flex justify-end gap-3">
              <button onClick={() => setShowModalDep(false)} className="px-6 py-3.5 text-slate-500 font-black hover:bg-slate-200 rounded-2xl transition-all">Batal</button>
              <button onClick={async () => { 
                   if (!formDataDep.name) return alert("Nama Paket wajib!"); 
                   if (formDataDep.validityType !== 'tanpa_batas' && !formDataDep.validityValue) return alert("Masa berlaku wajib!"); 
                   if (formDataDep.id) {
                       const { id, ...data } = formDataDep;
                       await updateDoc(doc(db, 'deposit_packages', id), data);
                   } else {
                       await addDoc(collection(db, 'deposit_packages'), formDataDep);
                   }
                   setShowModalDep(false); 
               }} className="px-8 py-3.5 bg-blue-700 text-white font-black rounded-2xl hover:bg-blue-800 shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 active:scale-95">
                <span className="material-symbols-outlined text-[18px]">save</span> Simpan Program
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Outlet */}
      {showModalOutlet && (
        <div className="fixed inset-0 z-[999] bg-slate-800/30 backdrop-blur-sm flex overflow-y-auto p-4 sm:p-8 animate-fade-in items-start sm:items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-up m-auto mt-8 sm:mt-auto mb-8 sm:mb-auto">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600">store</span>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">{formDataOutlet.id ? 'Edit Outlet' : 'Tambah Outlet'}</h2>
              </div>
              <button onClick={() => setShowModalOutlet(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="px-8 pb-4 pt-2 flex flex-col gap-5 ">
              <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Nama Outlet</label><input type="text" value={formDataOutlet.name} onChange={e => setFormDataOutlet({ ...formDataOutlet, name: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-black text-slate-800" /></div>
              <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Alamat Lengkap</label><textarea rows="3" value={formDataOutlet.address} onChange={e => setFormDataOutlet({ ...formDataOutlet, address: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-medium resize-none"></textarea></div>
            </div>
            <div className="px-8 pt-4 pb-8 flex justify-end gap-3">
              <button onClick={() => setShowModalOutlet(false)} className="px-6 py-3.5 text-slate-500 font-black hover:bg-slate-200 rounded-2xl transition-all">Batal</button>
              <button onClick={handleSaveOutlet} className="px-8 py-3.5 bg-blue-700 text-white font-black rounded-2xl hover:bg-blue-800 shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 active:scale-95">
                <span className="material-symbols-outlined text-[20px]">save</span> Simpan Cabang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Kategori */}
      {showModalCat && (
        <div className="fixed inset-0 z-[999] bg-slate-800/30 backdrop-blur-sm flex overflow-y-auto p-4 sm:p-8 animate-fade-in items-start sm:items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-up m-auto mt-8 sm:mt-auto mb-8 sm:mb-auto">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600">category</span>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">{formDataCat.oldName ? 'Edit Kategori' : 'Tambah Kategori'}</h2>
              </div>
              <button onClick={() => setShowModalCat(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="px-8 pb-4 pt-2 ">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Nama Kategori</label>
              <input type="text" value={formDataCat.newName} onChange={e => setFormDataCat({ ...formDataCat, newName: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-black text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all" autoFocus />
            </div>
            <div className="px-8 pt-4 pb-8 flex justify-end gap-3">
              <button onClick={() => setShowModalCat(false)} className="px-6 py-3.5 text-slate-500 font-black hover:bg-slate-200 rounded-2xl transition-all">Batal</button>
              <button onClick={handleSaveCat} className="px-8 py-3.5 bg-blue-700 text-white font-black rounded-2xl shadow-lg hover:bg-blue-800 transition-all active:scale-95">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pembayaran */}
      {showModalPay && (
        <div className="fixed inset-0 z-[999] bg-slate-800/30 backdrop-blur-sm flex overflow-y-auto p-4 sm:p-8 animate-fade-in items-start sm:items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-up m-auto mt-8 sm:mt-auto mb-8 sm:mb-auto">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-green-600">payments</span>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">{formDataPay.oldName ? 'Edit Metode' : 'Tambah Metode'}</h2>
              </div>
              <button onClick={() => setShowModalPay(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="px-8 pb-4 pt-2 ">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Nama Metode Pembayaran</label>
              <input type="text" value={formDataPay.newName} onChange={e => setFormDataPay({ ...formDataPay, newName: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-black text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all" autoFocus />
            </div>
            <div className="px-8 pt-4 pb-8 flex justify-end gap-3">
              <button onClick={() => setShowModalPay(false)} className="px-6 py-3.5 text-slate-500 font-black hover:bg-slate-200 rounded-2xl transition-all">Batal</button>
              <button onClick={handleSavePay} className="px-8 py-3.5 bg-blue-700 text-white font-black rounded-2xl shadow-lg hover:bg-blue-800 transition-all active:scale-95">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {showModalUser && (
        <div className="fixed inset-0 z-[999] bg-slate-800/30 backdrop-blur-sm flex overflow-y-auto p-4 sm:p-8 animate-fade-in items-start sm:items-center justify-center">
          <div className="bg-white rounded-[32px] shadow-2xl max-w-md w-full overflow-hidden animate-fade-up m-auto mt-8 sm:mt-auto mb-8 sm:mb-auto">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <h2 className="text-lg font-black text-slate-800 tracking-tight">{formDataUser.id ? 'Edit User' : 'Tambah User Baru'}</h2>
              <button onClick={() => setShowModalUser(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all"><span className="material-symbols-outlined text-[20px]">close</span></button>
            </div>
            <div className="px-8 pb-4 pt-2 flex flex-col gap-5">
              <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Nama Lengkap</label><input type="text" value={formDataUser.name} onChange={e => setFormDataUser({ ...formDataUser, name: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-black text-slate-800 outline-none focus:border-blue-500 transition-all" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Username (Login)</label><input type="text" value={formDataUser.username} onChange={e => setFormDataUser({ ...formDataUser, username: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-black text-slate-800 outline-none focus:border-blue-500 transition-all" /></div>
                <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Password</label><input type="password" value={formDataUser.password} onChange={e => setFormDataUser({ ...formDataUser, password: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-black text-slate-800 outline-none focus:border-blue-500 transition-all" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Role Akses</label>
                  <select value={formDataUser.role} onChange={e => setFormDataUser({ ...formDataUser, role: e.target.value, outletId: e.target.value === 'Kasir' ? outlets[0]?.id : 'all' })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 transition-all">
                    <option value="Owner">Owner</option>
                    <option value="Admin">Admin</option>
                    <option value="Kasir">Kasir</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Penugasan Outlet</label>
                  <select value={formDataUser.outletId} onChange={e => setFormDataUser({ ...formDataUser, outletId: e.target.value })} disabled={formDataUser.role !== 'Kasir'} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 transition-all disabled:opacity-50">
                    <option value="all">Semua Cabang</option>
                    {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="px-8 pt-4 pb-8 flex justify-end gap-3">
              <button onClick={() => setShowModalUser(false)} className="px-6 py-3.5 text-slate-500 font-black hover:bg-slate-200 rounded-2xl transition-all">Batal</button>
              <button onClick={handleSaveUser} className="px-8 py-3.5 bg-blue-700 text-white font-black rounded-2xl shadow-lg hover:bg-blue-800 transition-all active:scale-95">Simpan User</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 7. FORMAT NOTA
// ============================================================================
function NotaSettingsView({ settings, setSettings }) {
  const handleChange = async (key, value) => { 
    const newSettings = { ...settings, [key]: value };
    await setDoc(doc(db, 'settings', 'general'), newSettings);
  };

  return (
    <div className="p-8 max-w-[1440px] mx-auto animate-fade-in">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">Pengaturan Format Nota</h2>
        <p className="text-sm text-slate-500">Sesuaikan tampilan struk untuk cetak dan WhatsApp.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="flex flex-col gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-6">
            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2"><span className="material-symbols-outlined text-blue-600">receipt</span> Informasi Toko (Nota Pelanggan)</h3>
            <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Nama Toko (Header)</label><input type="text" value={settings.storeName} onChange={e => handleChange('storeName', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-black outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all" /></div>
            <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Tagline / Slogan</label><input type="text" value={settings.tagline} onChange={e => handleChange('tagline', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all" /></div>
            <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Alamat Toko</label><textarea rows="2" value={settings.address} onChange={e => handleChange('address', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all resize-none"></textarea></div>
            <div><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Pesan Penutup (Footer)</label><textarea rows="2" value={settings.footerText} onChange={e => handleChange('footerText', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all resize-none"></textarea></div>
            <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <input type="checkbox" id="showQR" checked={settings.showQR} onChange={e => handleChange('showQR', e.target.checked)} className="w-5 h-5 accent-blue-600 rounded cursor-pointer" />
              <label htmlFor="showQR" className="text-sm font-bold text-slate-700 cursor-pointer">Tampilkan QR Code (Pelanggan)</label>
            </div>
          </div>

          <div className="bg-yellow-50 rounded-2xl shadow-sm border border-yellow-200 p-6 flex flex-col gap-6">
            <h3 className="font-bold text-yellow-800 border-b border-yellow-200 pb-3 flex items-center gap-2"><span className="material-symbols-outlined">label</span> Label Internal (Produksi)</h3>
            <div><label className="text-[10px] font-black text-yellow-700 mb-2 block uppercase tracking-widest">Judul Label Internal</label><input type="text" value={settings.internalTitle} onChange={e => handleChange('internalTitle', e.target.value)} className="w-full bg-white border border-yellow-200 rounded-2xl px-4 py-3.5 text-sm font-black text-slate-800 outline-none focus:border-yellow-500 focus:ring-4 focus:ring-yellow-500/5 transition-all" /></div>
            <div className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-yellow-200">
              <input type="checkbox" id="internalShowQR" checked={settings.internalShowQR} onChange={e => handleChange('internalShowQR', e.target.checked)} className="w-5 h-5 accent-yellow-600 rounded cursor-pointer" />
              <label htmlFor="internalShowQR" className="text-sm font-bold text-slate-700 cursor-pointer">Tampilkan QR Code (Internal)</label>
            </div>
          </div>
        </div>

        <div className="bg-slate-200/50 rounded-2xl border border-slate-200 p-8 flex flex-col items-center gap-8 overflow-y-auto  custom-scrollbar flex-1">
          <h3 className="font-bold text-slate-500 uppercase tracking-widest text-xs">Preview Nota Pelanggan</h3>
          <div className="bg-white p-8 w-full max-w-[350px] shadow-lg rounded-sm border-t-8 border-t-blue-600 relative overflow-hidden shrink-0">
            <div className="text-center mb-6 border-b border-dashed border-slate-300 pb-4">
              <h3 className="font-black text-2xl text-slate-800 tracking-wider">{settings.storeName || 'NAMA TOKO'}</h3>
              <p className="text-xs text-slate-500 mt-1">{settings.tagline}<br />{settings.address}</p>
            </div>
            <div className="text-xs text-slate-600 mb-4 grid grid-cols-2 gap-y-1"><span>No. Nota:</span><span className="text-right font-bold">INV-PREV</span><span>Tanggal:</span><span className="text-right">18 Apr 2026</span></div>
            <table className="w-full text-xs text-slate-700 mb-4 border-y border-dashed border-slate-300 py-2">
              <tbody><tr><td className="py-2">Cuci Kering Setrika<br /><span className="text-[10px] text-slate-400">2Kg x Rp 7.000</span></td><td className="py-2 text-right font-bold">Rp 14.000</td></tr></tbody>
            </table>
            <div className="text-xs grid grid-cols-2 gap-y-1 mb-6">
              <span className="font-bold text-sm mt-2 pt-2 border-t border-slate-200">TOTAL:</span><span className="font-black text-lg text-right mt-2 pt-2 border-t border-slate-200">Rp 14.000</span>
            </div>
            {settings.showQR && (
              <div className="flex flex-col items-center justify-center mt-6 pt-4 border-t border-dashed border-slate-300">
                <span className="material-symbols-outlined text-[100px] text-slate-800 leading-none">qr_code_2</span>
                <p className="text-[10px] text-slate-400 mt-2 text-center">Scan Cek Status</p>
              </div>
            )}
            <div className="text-center mt-6 mb-4 text-[10px] italic text-slate-500">{settings.footerText}</div>
          </div>

          <h3 className="font-bold text-slate-500 uppercase tracking-widest text-xs mt-4">Preview Label Internal</h3>
          <div className="bg-yellow-50 p-6 w-full max-w-[350px] shadow-md border border-yellow-200 relative overflow-hidden shrink-0 mx-auto">
            <div className="absolute top-0 left-0 bg-yellow-300 text-yellow-800 text-[10px] font-bold px-3 py-1 rounded-br-lg">INTERNAL LABEL</div>
            <h3 className="font-black text-xl text-slate-800 text-center mt-4">{settings.internalTitle || 'ORDER PRODUKSI'}</h3>
            <div className="text-center text-4xl font-black text-blue-700 my-4 border-y border-dashed border-slate-300 py-2">PREV</div>
            <div className="text-sm font-bold text-slate-800 mb-1">John Doe</div>
            <div className="bg-white border border-slate-200 p-3 rounded-lg mb-4 shadow-sm">
              <p className="text-[10px] text-slate-500 font-bold mb-1 uppercase tracking-widest">Detail Item</p>
              <ul className="text-xs font-bold text-slate-800"><li>• Cuci Kering Setrika (2Kg)</li></ul>
            </div>
            {settings.internalShowQR && (
              <div className="flex justify-center mt-6 border-t border-dashed border-yellow-300 pt-4">
                <span className="material-symbols-outlined text-[100px] text-slate-800 leading-none">qr_code_2</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// AUTH COMPONENTS
// ============================================================================
function LoginView({ users, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      const user = users.find(u => u.username === username && u.password === password);
      if (user) {
        onLogin(user);
      } else {
        setError('Username atau Password salah!');
      }
      setLoading(false);
    }, 800);
  };

  return (
    <div className="h-screen w-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] rounded-full"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full"></div>
      
      <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden relative z-10 animate-fade-in border border-white/10">
        <div className="bg-gradient-to-br from-blue-700 to-indigo-800 p-10 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_white_1px,_transparent_1px)] bg-[length:20px_20px]"></div>
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur-md rounded-3xl mb-6 shadow-xl border border-white/30 animate-fade-up">
            <span className="material-symbols-outlined text-white text-4xl">laundry</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-2">MONIC POS</h1>
          <p className="text-blue-100 font-medium text-sm">Masuk ke sistem operasional laundry</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-10 flex flex-col gap-6">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-3 animate-fade-in">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Username</label>
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">person</span>
              <input 
                type="text" 
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-blue-500 focus:bg-white transition-all font-medium text-slate-800"
                placeholder="Masukkan username"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Password</label>
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">lock</span>
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-blue-500 focus:bg-white transition-all font-medium text-slate-800"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-700 hover:bg-blue-800 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-500/30 transition-all active:scale-95 flex items-center justify-center gap-3 mt-4"
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <span className="material-symbols-outlined">login</span>
                <span>MASUK SEKARANG</span>
              </>
            )}
          </button>
          
          <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 text-center">Demo Accounts</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <p className="text-[9px] font-black text-purple-600 uppercase mb-1">Owner</p>
                <p className="text-xs font-bold text-slate-700">owner / owner123</p>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <p className="text-[9px] font-black text-blue-600 uppercase mb-1">Kasir</p>
                <p className="text-xs font-bold text-slate-700">kasir / kasir123</p>
              </div>
            </div>
          </div>
          
          <p className="text-center text-xs text-slate-400 font-medium mt-2">
            Lupa password? Hubungi Admin / Owner.
          </p>
        </form>
      </div>
    </div>
  );
}
