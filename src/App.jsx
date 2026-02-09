import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ComposedChart } from 'recharts';

// ============================================
// FIREBASE CONFIGURATION
// ============================================

// Firebase SDK loaded via CDN in index.html
// Initialize Firebase - Replace with your own config from Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyCtIB4MK6U0Ti_TC3aj5UA8AcKZ6c_2k5U",
  authDomain: "procureflow-de7c3.firebaseapp.com",
  projectId: "procureflow-de7c3",
  storageBucket: "procureflow-de7c3.firebasestorage.app",
  messagingSenderId: "418723183377",
  appId: "1:418723183377:web:1835726a7867ef13232ab0"
};
// Firebase initialization (will be set when Firebase loads)
let db = null;
let firebaseAuth = null;
let firebaseInitialized = false;

const initializeFirebase = () => {
  if (typeof window !== 'undefined' && window.firebase && !firebaseInitialized) {
    try {
      // Check if already initialized
      if (!window.firebase.apps?.length) {
        window.firebase.initializeApp(firebaseConfig);
      }
      db = window.firebase.firestore();
      firebaseAuth = window.firebase.auth();
      firebaseInitialized = true;
      console.log('Firebase initialized successfully');
      return true;
    } catch (error) {
      console.log('Firebase not configured, using local storage:', error.message);
      return false;
    }
  }
  return false;
};

// Cloud Storage Functions
const cloudStorage = {
  isAvailable: () => firebaseInitialized && db !== null,
  
  // Save data to Firestore
  saveData: async (userId, key, data) => {
    if (!cloudStorage.isAvailable() || !userId) {
      return false;
    }
    try {
      await db.collection('users').doc(userId).collection('data').doc(key).set({
        data: JSON.stringify(data),
        updatedAt: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error(`Cloud save error (${key}):`, error);
      return false;
    }
  },
  
  // Load data from Firestore
  loadData: async (userId, key) => {
    if (!cloudStorage.isAvailable() || !userId) {
      return null;
    }
    try {
      const doc = await db.collection('users').doc(userId).collection('data').doc(key).get();
      if (doc.exists) {
        return JSON.parse(doc.data().data);
      }
      return null;
    } catch (error) {
      console.error(`Cloud load error (${key}):`, error);
      return null;
    }
  },
  
  // Load all user data
  loadAllData: async (userId) => {
    if (!cloudStorage.isAvailable() || !userId) {
      return null;
    }
    try {
      const snapshot = await db.collection('users').doc(userId).collection('data').get();
      const data = {};
      snapshot.forEach(doc => {
        try {
          data[doc.id] = JSON.parse(doc.data().data);
        } catch (e) {
          data[doc.id] = doc.data().data;
        }
      });
      return Object.keys(data).length > 0 ? data : null;
    } catch (error) {
      console.error('Cloud load all error:', error);
      return null;
    }
  },
  
  // Save all data at once
  saveAllData: async (userId, allData) => {
    if (!cloudStorage.isAvailable() || !userId) {
      return false;
    }
    try {
      const batch = db.batch();
      Object.entries(allData).forEach(([key, value]) => {
        const ref = db.collection('users').doc(userId).collection('data').doc(key);
        batch.set(ref, {
          data: JSON.stringify(value),
          updatedAt: new Date().toISOString()
        });
      });
      await batch.commit();
      return true;
    } catch (error) {
      console.error('Cloud save all error:', error);
      return false;
    }
  }
};

// ============================================
// AUTHENTICATION SYSTEM
// ============================================

// Simple hash function for passwords (for demo - use bcrypt in production)
const simpleHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
};

// Auth Helper Functions
const authStorage = {
  getUsers: () => JSON.parse(localStorage.getItem('procureflow_users') || '[]'),
  saveUsers: (users) => localStorage.setItem('procureflow_users', JSON.stringify(users)),
  getCurrentUser: () => JSON.parse(localStorage.getItem('procureflow_current_user') || 'null'),
  setCurrentUser: (user) => localStorage.setItem('procureflow_current_user', JSON.stringify(user)),
  clearCurrentUser: () => localStorage.removeItem('procureflow_current_user'),
};

// Data Storage Helper Functions - Supports both local and cloud storage
const dataStorage = {
  getData: (key, defaultValue) => {
    try {
      const saved = localStorage.getItem(`procureflow_${key}`);
      if (saved && saved !== 'undefined') {
        return JSON.parse(saved);
      }
      return defaultValue;
    } catch (e) {
      console.error(`Error loading ${key}:`, e);
      return defaultValue;
    }
  },
  saveData: (key, value) => {
    try {
      localStorage.setItem(`procureflow_${key}`, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`Error saving ${key}:`, e);
      return false;
    }
  },
  loadAllData: () => {
    return {
      companies: dataStorage.getData('companies', null),
      budgets: dataStorage.getData('budgets', null),
      actuals: dataStorage.getData('actuals', null),
      fleet: dataStorage.getData('fleet', null),
      jobs: dataStorage.getData('jobs', null),
      assets: dataStorage.getData('assets', null),
      selectedCompanyId: dataStorage.getData('selectedCompanyId', null),
    };
  },
  // Sync with cloud (call after saving locally)
  syncToCloud: async (userId, key, value) => {
    if (cloudStorage.isAvailable() && userId) {
      await cloudStorage.saveData(userId, key, value);
    }
  },
  // Load from cloud and merge with local
  syncFromCloud: async (userId) => {
    if (!cloudStorage.isAvailable() || !userId) {
      return null;
    }
    try {
      const cloudData = await cloudStorage.loadAllData(userId);
      if (cloudData) {
        // Save cloud data to local storage as backup
        Object.entries(cloudData).forEach(([key, value]) => {
          if (value) {
            localStorage.setItem(`procureflow_${key}`, JSON.stringify(value));
          }
        });
      }
      return cloudData;
    } catch (e) {
      console.error('Cloud sync error:', e);
      return null;
    }
  }
};

// Login/Register Component
const AuthScreen = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      if (isLogin) {
        // Login
        const users = authStorage.getUsers();
        const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
        
        if (!user) {
          setError('No account found with this email');
          setLoading(false);
          return;
        }
        
        if (user.passwordHash !== simpleHash(password)) {
          setError('Incorrect password');
          setLoading(false);
          return;
        }
        
        const sessionUser = { id: user.id, email: user.email, name: user.name };
        authStorage.setCurrentUser(sessionUser);
        onLogin(sessionUser);
      } else {
        // Register
        if (!name.trim()) {
          setError('Please enter your name');
          setLoading(false);
          return;
        }
        
        if (!email.includes('@')) {
          setError('Please enter a valid email');
          setLoading(false);
          return;
        }
        
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          setLoading(false);
          return;
        }
        
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        
        const users = authStorage.getUsers();
        if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
          setError('An account with this email already exists');
          setLoading(false);
          return;
        }
        
        const newUser = {
          id: String(Date.now()),
          email: email.toLowerCase(),
          name: name.trim(),
          passwordHash: simpleHash(password),
          createdAt: new Date().toISOString()
        };
        
        users.push(newUser);
        authStorage.saveUsers(users);
        
        const sessionUser = { id: newUser.id, email: newUser.email, name: newUser.name };
        authStorage.setCurrentUser(sessionUser);
        onLogin(sessionUser);
      }
      setLoading(false);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">ProcureFlow</h1>
          <p className="text-blue-200 mt-2">Multi-Company Job Costing System</p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {isLogin ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="text-slate-500 mb-6">
            {isLogin ? 'Sign in to your account' : 'Get started with ProcureFlow'}
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required={!isLogin}
                />
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                required
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required={!isLogin}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  {isLogin ? 'Signing in...' : 'Creating account...'}
                </span>
              ) : (
                isLogin ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-600">
              {isLogin ? "Don't have an account?" : "Already have an account?"}
              <button
                type="button"
                onClick={() => { setIsLogin(!isLogin); setError(''); }}
                className="ml-2 text-blue-600 font-semibold hover:text-blue-700"
              >
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-blue-200/60 text-sm mt-6">
          © {new Date().getFullYear()} ProcureFlow. All rights reserved.
        </p>
      </div>
    </div>
  );
};

// ============================================
// MULTI-COMPANY & INDUSTRY CONFIG
// ============================================

const initialCompanies = [
  { id: '1', code: 'THL', name: 'Transhaul Logistics', tradingAs: 'Transhaul', industry: 'haulage', regNo: '2020/123456/07', vatNo: '4123456789', status: 'Active' },
  { id: '2', code: 'MBC', name: 'Master Builders Construction', tradingAs: 'MBC Projects', industry: 'construction', regNo: '2018/987654/07', vatNo: '4987654321', status: 'Active' },
  { id: '3', code: 'EAC', name: 'Excel Academy College', tradingAs: 'Excel Academy', industry: 'education', regNo: '2015/456789/21', vatNo: '4567891234', status: 'Active' },
];

const industryConfig = {
  haulage: { label: 'Truck Haulage', color: 'from-blue-500 to-cyan-600', icon: 'Truck', modules: ['dashboard', 'fleet', 'jobs', 'cost-analysis', 'actuals', 'budgets', 'budgeted-revenue', 'depreciation', 'reports'] },
  construction: { label: 'Construction', color: 'from-amber-500 to-orange-600', icon: 'Building', modules: ['dashboard', 'projects', 'actuals', 'budgets', 'budgeted-revenue', 'depreciation', 'reports'] },
  education: { label: 'Education', color: 'from-purple-500 to-indigo-600', icon: 'GraduationCap', modules: ['dashboard', 'programs', 'actuals', 'budgets', 'budgeted-revenue', 'depreciation', 'reports'] },
};

// Industry-Specific Expense Categories
const industryCategories = {
  haulage: [
    { id: 'fuel', name: 'Fuel', icon: 'Fuel', type: 'direct' },
    { id: 'driverSalaries', name: 'Driver Salaries', icon: 'Users', type: 'direct' },
    { id: 'directLabour', name: 'Direct Labour', icon: 'Users', type: 'direct' },
    { id: 'tollFees', name: 'Toll Fees', icon: 'Receipt', type: 'direct' },
    { id: 'repairs', name: 'Repairs & Maintenance', icon: 'Wrench', type: 'direct' },
    { id: 'tyres', name: 'Tyres', icon: 'Circle', type: 'direct' },
    { id: 'travelAllowance', name: 'Travel Allowance', icon: 'MapPin', type: 'direct' },
    { id: 'parking', name: 'Parking Fees', icon: 'ParkingCircle', type: 'direct' },
    { id: 'depreciation', name: 'Depreciation', icon: 'TrendingDown', type: 'direct' },
    { id: 'licensing', name: 'Licensing & Permits', icon: 'FileText', type: 'indirect' },
    { id: 'insurance', name: 'Insurance', icon: 'Shield', type: 'indirect' },
    { id: 'adminSalaries', name: 'Admin Salaries', icon: 'User', type: 'admin' },
    { id: 'officeRental', name: 'Office Rental', icon: 'Building', type: 'admin' },
    { id: 'utilities', name: 'Utilities', icon: 'Zap', type: 'admin' },
    { id: 'itServices', name: 'IT Services', icon: 'Monitor', type: 'admin' },
    { id: 'communications', name: 'Communications', icon: 'Phone', type: 'admin' },
    { id: 'bankCharges', name: 'Bank Charges', icon: 'CreditCard', type: 'admin' },
    { id: 'other', name: 'Other Expenses', icon: 'MoreHorizontal', type: 'admin' },
  ],
  construction: [
    { id: 'materials', name: 'Materials & Supplies', icon: 'Package', type: 'direct' },
    { id: 'subcontractors', name: 'Subcontractors', icon: 'Users', type: 'direct' },
    { id: 'siteLabour', name: 'Site Labour', icon: 'HardHat', type: 'direct' },
    { id: 'equipmentHire', name: 'Equipment Hire', icon: 'Wrench', type: 'direct' },
    { id: 'plantFuel', name: 'Plant & Vehicle Fuel', icon: 'Fuel', type: 'direct' },
    { id: 'siteCosts', name: 'Site Establishment', icon: 'Building', type: 'direct' },
    { id: 'scaffolding', name: 'Scaffolding & Formwork', icon: 'Layers', type: 'direct' },
    { id: 'concrete', name: 'Concrete & Cement', icon: 'Package', type: 'direct' },
    { id: 'depreciation', name: 'Depreciation', icon: 'TrendingDown', type: 'direct' },
    { id: 'siteServices', name: 'Site Services (Water/Elec)', icon: 'Zap', type: 'indirect' },
    { id: 'healthSafety', name: 'Health & Safety', icon: 'Shield', type: 'indirect' },
    { id: 'qualityControl', name: 'Quality Control', icon: 'Check', type: 'indirect' },
    { id: 'insurance', name: 'Contract Insurance', icon: 'Shield', type: 'indirect' },
    { id: 'permits', name: 'Permits & Approvals', icon: 'FileText', type: 'indirect' },
    { id: 'adminSalaries', name: 'Admin & Management', icon: 'User', type: 'admin' },
    { id: 'officeRental', name: 'Office Rental', icon: 'Building', type: 'admin' },
    { id: 'professional', name: 'Professional Fees', icon: 'Briefcase', type: 'admin' },
    { id: 'bankCharges', name: 'Bank & Finance', icon: 'CreditCard', type: 'admin' },
    { id: 'other', name: 'Other Expenses', icon: 'MoreHorizontal', type: 'admin' },
  ],
  education: [
    { id: 'academicSalaries', name: 'Academic Staff Salaries', icon: 'Users', type: 'direct' },
    { id: 'supportStaff', name: 'Support Staff Salaries', icon: 'Users', type: 'direct' },
    { id: 'learningMaterials', name: 'Learning Materials', icon: 'BookOpen', type: 'direct' },
    { id: 'examinations', name: 'Examinations & Assessment', icon: 'FileText', type: 'direct' },
    { id: 'studentServices', name: 'Student Services', icon: 'Users', type: 'direct' },
    { id: 'practicals', name: 'Practical & Lab Supplies', icon: 'Package', type: 'direct' },
    { id: 'depreciation', name: 'Depreciation', icon: 'TrendingDown', type: 'direct' },
    { id: 'facilities', name: 'Facilities Maintenance', icon: 'Building', type: 'indirect' },
    { id: 'utilities', name: 'Utilities', icon: 'Zap', type: 'indirect' },
    { id: 'security', name: 'Security Services', icon: 'Shield', type: 'indirect' },
    { id: 'cleaning', name: 'Cleaning & Hygiene', icon: 'Wrench', type: 'indirect' },
    { id: 'itInfrastructure', name: 'IT Infrastructure', icon: 'Monitor', type: 'indirect' },
    { id: 'accreditation', name: 'Accreditation Fees', icon: 'FileText', type: 'indirect' },
    { id: 'adminSalaries', name: 'Admin Salaries', icon: 'User', type: 'admin' },
    { id: 'marketing', name: 'Marketing & Recruitment', icon: 'TrendingUp', type: 'admin' },
    { id: 'insurance', name: 'Insurance', icon: 'Shield', type: 'admin' },
    { id: 'bankCharges', name: 'Bank Charges', icon: 'CreditCard', type: 'admin' },
    { id: 'other', name: 'Other Expenses', icon: 'MoreHorizontal', type: 'admin' },
  ],
};

// Get categories for a specific industry
const getIndustryCategories = (industry) => {
  return industryCategories[industry] || industryCategories.haulage;
};

// ============================================
// FINANCIAL YEAR UTILITIES
// ============================================
const financialYears = ['2024', '2025', '2026'];

const generateMonths = (year) => {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    const label = new Date(parseInt(year), m - 1, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
    months.push({ key, label });
  }
  return months;
};

const getMonthLabel = (monthKey) => {
  if (!monthKey || monthKey === 'annual') return 'Annual';
  const [y, m] = monthKey.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
};

const getAvailableMonths = (dataObj) => {
  if (!dataObj) return [];
  const months = new Set();
  Object.values(dataObj).forEach(companyData => {
    if (companyData?.monthly) {
      Object.keys(companyData.monthly).forEach(m => months.add(m));
    }
  });
  return Array.from(months).sort();
};

// Financial Year month selector component
const MonthYearSelector = ({ value, onChange, includeAnnual = false, years = financialYears }) => (
  <Select value={value} onChange={onChange}>
    {includeAnnual && years.map(y => (
      <option key={`annual-${y}`} value={`annual-${y}`}>Annual {y}</option>
    ))}
    {years.map(y => (
      <optgroup key={y} label={`FY ${y}`}>
        {generateMonths(y).map(m => (
          <option key={m.key} value={m.key}>{m.label}</option>
        ))}
      </optgroup>
    ))}
  </Select>
);

// Mock Data - Budgets (FY2024 & FY2025 - Full 12 months each)
const initialBudgets = {
  '1': { // Transhaul - Haulage
    annual: {
      revenue: 4500000,
      fuel: 850000, driverSalaries: 1080000, directLabour: 180000, tollFees: 120000,
      repairs: 280000, tyres: 150000, travelAllowance: 96000, parking: 48000, depreciation: 540000,
      licensing: 85000, insurance: 320000, adminSalaries: 420000, officeRental: 516000,
      utilities: 36000, itServices: 66000, communications: 48000, bankCharges: 12000, other: 60000
    },
    monthly: {
      '2024-01': { revenue: 297500, fuel: 61200, driverSalaries: 90000, directLabour: 12750, tollFees: 8500, repairs: 21250, tyres: 10200, travelAllowance: 6800, parking: 3400, depreciation: 45000, licensing: 5950, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 2550, itServices: 5500, communications: 4000, bankCharges: 1000, other: 4250 },
      '2024-02': { revenue: 315000, fuel: 64800, driverSalaries: 90000, directLabour: 13500, tollFees: 9000, repairs: 22500, tyres: 10800, travelAllowance: 7200, parking: 3600, depreciation: 45000, licensing: 6300, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 2700, itServices: 5500, communications: 4000, bankCharges: 1000, other: 4500 },
      '2024-03': { revenue: 332500, fuel: 68400, driverSalaries: 90000, directLabour: 14250, tollFees: 9500, repairs: 23750, tyres: 11400, travelAllowance: 7600, parking: 3800, depreciation: 45000, licensing: 6650, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 2850, itServices: 5500, communications: 4000, bankCharges: 1000, other: 4750 },
      '2024-04': { revenue: 350000, fuel: 72000, driverSalaries: 90000, directLabour: 15000, tollFees: 10000, repairs: 25000, tyres: 12000, travelAllowance: 8000, parking: 4000, depreciation: 45000, licensing: 7000, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 3000, itServices: 5500, communications: 4000, bankCharges: 1000, other: 5000 },
      '2024-05': { revenue: 367500, fuel: 75600, driverSalaries: 90000, directLabour: 15750, tollFees: 10500, repairs: 26250, tyres: 12600, travelAllowance: 8400, parking: 4200, depreciation: 45000, licensing: 7350, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 3150, itServices: 5500, communications: 4000, bankCharges: 1000, other: 5250 },
      '2024-06': { revenue: 357000, fuel: 73440, driverSalaries: 90000, directLabour: 15300, tollFees: 10200, repairs: 25500, tyres: 12240, travelAllowance: 8160, parking: 4080, depreciation: 45000, licensing: 7140, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 3060, itServices: 5500, communications: 4000, bankCharges: 1000, other: 5100 },
      '2024-07': { revenue: 343000, fuel: 70560, driverSalaries: 90000, directLabour: 14700, tollFees: 9800, repairs: 24500, tyres: 11760, travelAllowance: 7840, parking: 3920, depreciation: 45000, licensing: 6860, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 2940, itServices: 5500, communications: 4000, bankCharges: 1000, other: 4900 },
      '2024-08': { revenue: 350000, fuel: 72000, driverSalaries: 90000, directLabour: 15000, tollFees: 10000, repairs: 25000, tyres: 12000, travelAllowance: 8000, parking: 4000, depreciation: 45000, licensing: 7000, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 3000, itServices: 5500, communications: 4000, bankCharges: 1000, other: 5000 },
      '2024-09': { revenue: 367500, fuel: 75600, driverSalaries: 90000, directLabour: 15750, tollFees: 10500, repairs: 26250, tyres: 12600, travelAllowance: 8400, parking: 4200, depreciation: 45000, licensing: 7350, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 3150, itServices: 5500, communications: 4000, bankCharges: 1000, other: 5250 },
      '2024-10': { revenue: 385000, fuel: 79200, driverSalaries: 90000, directLabour: 16500, tollFees: 11000, repairs: 27500, tyres: 13200, travelAllowance: 8800, parking: 4400, depreciation: 45000, licensing: 7700, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 3300, itServices: 5500, communications: 4000, bankCharges: 1000, other: 5500 },
      '2024-11': { revenue: 350000, fuel: 72000, driverSalaries: 90000, directLabour: 15000, tollFees: 10000, repairs: 25000, tyres: 12000, travelAllowance: 8000, parking: 4000, depreciation: 45000, licensing: 7000, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 3000, itServices: 5500, communications: 4000, bankCharges: 1000, other: 5000 },
      '2024-12': { revenue: 308000, fuel: 63360, driverSalaries: 90000, directLabour: 13200, tollFees: 8800, repairs: 22000, tyres: 10560, travelAllowance: 7040, parking: 3520, depreciation: 45000, licensing: 6160, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 2640, itServices: 5500, communications: 4000, bankCharges: 1000, other: 4400 },
      '2025-01': { revenue: 323000, fuel: 61200, driverSalaries: 90000, directLabour: 12750, tollFees: 8500, repairs: 21250, tyres: 10200, travelAllowance: 6800, parking: 3400, depreciation: 45000, licensing: 5950, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 2550, itServices: 5500, communications: 4000, bankCharges: 1000, other: 4250 },
      '2025-02': { revenue: 342000, fuel: 64800, driverSalaries: 90000, directLabour: 13500, tollFees: 9000, repairs: 22500, tyres: 10800, travelAllowance: 7200, parking: 3600, depreciation: 45000, licensing: 6300, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 2700, itServices: 5500, communications: 4000, bankCharges: 1000, other: 4500 },
      '2025-03': { revenue: 361000, fuel: 68400, driverSalaries: 90000, directLabour: 14250, tollFees: 9500, repairs: 23750, tyres: 11400, travelAllowance: 7600, parking: 3800, depreciation: 45000, licensing: 6650, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 2850, itServices: 5500, communications: 4000, bankCharges: 1000, other: 4750 },
      '2025-04': { revenue: 380000, fuel: 72000, driverSalaries: 90000, directLabour: 15000, tollFees: 10000, repairs: 25000, tyres: 12000, travelAllowance: 8000, parking: 4000, depreciation: 45000, licensing: 7000, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 3000, itServices: 5500, communications: 4000, bankCharges: 1000, other: 5000 },
      '2025-05': { revenue: 399000, fuel: 75600, driverSalaries: 90000, directLabour: 15750, tollFees: 10500, repairs: 26250, tyres: 12600, travelAllowance: 8400, parking: 4200, depreciation: 45000, licensing: 7350, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 3150, itServices: 5500, communications: 4000, bankCharges: 1000, other: 5250 },
      '2025-06': { revenue: 387600, fuel: 73440, driverSalaries: 90000, directLabour: 15300, tollFees: 10200, repairs: 25500, tyres: 12240, travelAllowance: 8160, parking: 4080, depreciation: 45000, licensing: 7140, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 3060, itServices: 5500, communications: 4000, bankCharges: 1000, other: 5100 },
      '2025-07': { revenue: 372400, fuel: 70560, driverSalaries: 90000, directLabour: 14700, tollFees: 9800, repairs: 24500, tyres: 11760, travelAllowance: 7840, parking: 3920, depreciation: 45000, licensing: 6860, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 2940, itServices: 5500, communications: 4000, bankCharges: 1000, other: 4900 },
      '2025-08': { revenue: 380000, fuel: 72000, driverSalaries: 90000, directLabour: 15000, tollFees: 10000, repairs: 25000, tyres: 12000, travelAllowance: 8000, parking: 4000, depreciation: 45000, licensing: 7000, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 3000, itServices: 5500, communications: 4000, bankCharges: 1000, other: 5000 },
      '2025-09': { revenue: 399000, fuel: 75600, driverSalaries: 90000, directLabour: 15750, tollFees: 10500, repairs: 26250, tyres: 12600, travelAllowance: 8400, parking: 4200, depreciation: 45000, licensing: 7350, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 3150, itServices: 5500, communications: 4000, bankCharges: 1000, other: 5250 },
      '2025-10': { revenue: 418000, fuel: 79200, driverSalaries: 90000, directLabour: 16500, tollFees: 11000, repairs: 27500, tyres: 13200, travelAllowance: 8800, parking: 4400, depreciation: 45000, licensing: 7700, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 3300, itServices: 5500, communications: 4000, bankCharges: 1000, other: 5500 },
      '2025-11': { revenue: 380000, fuel: 72000, driverSalaries: 90000, directLabour: 15000, tollFees: 10000, repairs: 25000, tyres: 12000, travelAllowance: 8000, parking: 4000, depreciation: 45000, licensing: 7000, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 3000, itServices: 5500, communications: 4000, bankCharges: 1000, other: 5000 },
      '2025-12': { revenue: 334400, fuel: 63360, driverSalaries: 90000, directLabour: 13200, tollFees: 8800, repairs: 22000, tyres: 10560, travelAllowance: 7040, parking: 3520, depreciation: 45000, licensing: 6160, insurance: 27000, adminSalaries: 35000, officeRental: 43000, utilities: 2640, itServices: 5500, communications: 4000, bankCharges: 1000, other: 4400 }
    },
    byTruck: {
      'TA-001': { revenue: 1800000, fuel: 340000, repairs: 112000, tyres: 60000, tolls: 48000, depreciation: 166000 },
      'TA-002': { revenue: 1500000, fuel: 290000, repairs: 95000, tyres: 50000, tolls: 40000, depreciation: 166000 },
      'TA-003': { revenue: 1200000, fuel: 220000, repairs: 73000, tyres: 40000, tolls: 32000, depreciation: 208000 },
    },
    byRoute: {
      'DBN-JHB': { revenue: 2000000, trips: 350, fuel: 380000, tolls: 52000 },
      'DBN-PE': { revenue: 1200000, trips: 180, fuel: 240000, tolls: 28000 },
      'DBN-BFN': { revenue: 800000, trips: 140, fuel: 150000, tolls: 24000 },
      'JHB-CT': { revenue: 500000, trips: 60, fuel: 80000, tolls: 16000 },
    }
  },
  '2': { // Master Builders - Construction
    annual: {
      revenue: 45000000,
      materials: 12500000, subcontractors: 8500000, siteLabour: 6200000, equipmentHire: 2800000,
      plantFuel: 1200000, siteCosts: 850000, scaffolding: 650000, concrete: 3200000, depreciation: 1800000,
      siteServices: 420000, healthSafety: 380000, qualityControl: 280000, insurance: 950000, permits: 180000,
      adminSalaries: 1850000, officeRental: 480000, professional: 650000, bankCharges: 85000, other: 320000
    },
    monthly: {
      '2024-01': { revenue: 2975000, materials: 892500, subcontractors: 612000, siteLabour: 442000, equipmentHire: 199750, plantFuel: 85000, siteCosts: 61200, scaffolding: 46750, concrete: 229500, depreciation: 150000, siteServices: 29750, healthSafety: 27200, qualityControl: 20400, insurance: 80000, permits: 12750, adminSalaries: 155000, officeRental: 40000, professional: 46750, bankCharges: 5950, other: 22950 },
      '2024-02': { revenue: 3325000, materials: 997500, subcontractors: 684000, siteLabour: 494000, equipmentHire: 223250, plantFuel: 95000, siteCosts: 68400, scaffolding: 52250, concrete: 256500, depreciation: 150000, siteServices: 33250, healthSafety: 30400, qualityControl: 22800, insurance: 80000, permits: 14250, adminSalaries: 155000, officeRental: 40000, professional: 52250, bankCharges: 6650, other: 25650 },
      '2024-03': { revenue: 3500000, materials: 1050000, subcontractors: 720000, siteLabour: 520000, equipmentHire: 235000, plantFuel: 100000, siteCosts: 72000, scaffolding: 55000, concrete: 270000, depreciation: 150000, siteServices: 35000, healthSafety: 32000, qualityControl: 24000, insurance: 80000, permits: 15000, adminSalaries: 155000, officeRental: 40000, professional: 55000, bankCharges: 7000, other: 27000 },
      '2024-04': { revenue: 3675000, materials: 1102500, subcontractors: 756000, siteLabour: 546000, equipmentHire: 246750, plantFuel: 105000, siteCosts: 75600, scaffolding: 57750, concrete: 283500, depreciation: 150000, siteServices: 36750, healthSafety: 33600, qualityControl: 25200, insurance: 80000, permits: 15750, adminSalaries: 155000, officeRental: 40000, professional: 57750, bankCharges: 7350, other: 28350 },
      '2024-05': { revenue: 3850000, materials: 1155000, subcontractors: 792000, siteLabour: 572000, equipmentHire: 258500, plantFuel: 110000, siteCosts: 79200, scaffolding: 60500, concrete: 297000, depreciation: 150000, siteServices: 38500, healthSafety: 35200, qualityControl: 26400, insurance: 80000, permits: 16500, adminSalaries: 155000, officeRental: 40000, professional: 60500, bankCharges: 7700, other: 29700 },
      '2024-06': { revenue: 3675000, materials: 1102500, subcontractors: 756000, siteLabour: 546000, equipmentHire: 246750, plantFuel: 105000, siteCosts: 75600, scaffolding: 57750, concrete: 283500, depreciation: 150000, siteServices: 36750, healthSafety: 33600, qualityControl: 25200, insurance: 80000, permits: 15750, adminSalaries: 155000, officeRental: 40000, professional: 57750, bankCharges: 7350, other: 28350 },
      '2024-07': { revenue: 3325000, materials: 997500, subcontractors: 684000, siteLabour: 494000, equipmentHire: 223250, plantFuel: 95000, siteCosts: 68400, scaffolding: 52250, concrete: 256500, depreciation: 150000, siteServices: 33250, healthSafety: 30400, qualityControl: 22800, insurance: 80000, permits: 14250, adminSalaries: 155000, officeRental: 40000, professional: 52250, bankCharges: 6650, other: 25650 },
      '2024-08': { revenue: 3150000, materials: 945000, subcontractors: 648000, siteLabour: 468000, equipmentHire: 211500, plantFuel: 90000, siteCosts: 64800, scaffolding: 49500, concrete: 243000, depreciation: 150000, siteServices: 31500, healthSafety: 28800, qualityControl: 21600, insurance: 80000, permits: 13500, adminSalaries: 155000, officeRental: 40000, professional: 49500, bankCharges: 6300, other: 24300 },
      '2024-09': { revenue: 3500000, materials: 1050000, subcontractors: 720000, siteLabour: 520000, equipmentHire: 235000, plantFuel: 100000, siteCosts: 72000, scaffolding: 55000, concrete: 270000, depreciation: 150000, siteServices: 35000, healthSafety: 32000, qualityControl: 24000, insurance: 80000, permits: 15000, adminSalaries: 155000, officeRental: 40000, professional: 55000, bankCharges: 7000, other: 27000 },
      '2024-10': { revenue: 3675000, materials: 1102500, subcontractors: 756000, siteLabour: 546000, equipmentHire: 246750, plantFuel: 105000, siteCosts: 75600, scaffolding: 57750, concrete: 283500, depreciation: 150000, siteServices: 36750, healthSafety: 33600, qualityControl: 25200, insurance: 80000, permits: 15750, adminSalaries: 155000, officeRental: 40000, professional: 57750, bankCharges: 7350, other: 28350 },
      '2024-11': { revenue: 3780000, materials: 1134000, subcontractors: 777600, siteLabour: 561600, equipmentHire: 253800, plantFuel: 108000, siteCosts: 77760, scaffolding: 59400, concrete: 291600, depreciation: 150000, siteServices: 37800, healthSafety: 34560, qualityControl: 25920, insurance: 80000, permits: 16200, adminSalaries: 155000, officeRental: 40000, professional: 59400, bankCharges: 7560, other: 29160 },
      '2024-12': { revenue: 2870000, materials: 861000, subcontractors: 590400, siteLabour: 426400, equipmentHire: 192700, plantFuel: 82000, siteCosts: 59040, scaffolding: 45100, concrete: 221400, depreciation: 150000, siteServices: 28700, healthSafety: 26240, qualityControl: 19680, insurance: 80000, permits: 12300, adminSalaries: 155000, officeRental: 40000, professional: 45100, bankCharges: 5740, other: 22140 },
      '2025-01': { revenue: 3230000, materials: 892500, subcontractors: 612000, siteLabour: 442000, equipmentHire: 199750, plantFuel: 85000, siteCosts: 61200, scaffolding: 46750, concrete: 229500, depreciation: 150000, siteServices: 29750, healthSafety: 27200, qualityControl: 20400, insurance: 80000, permits: 12750, adminSalaries: 155000, officeRental: 40000, professional: 46750, bankCharges: 5950, other: 22950 },
      '2025-02': { revenue: 3610000, materials: 997500, subcontractors: 684000, siteLabour: 494000, equipmentHire: 223250, plantFuel: 95000, siteCosts: 68400, scaffolding: 52250, concrete: 256500, depreciation: 150000, siteServices: 33250, healthSafety: 30400, qualityControl: 22800, insurance: 80000, permits: 14250, adminSalaries: 155000, officeRental: 40000, professional: 52250, bankCharges: 6650, other: 25650 },
      '2025-03': { revenue: 3800000, materials: 1050000, subcontractors: 720000, siteLabour: 520000, equipmentHire: 235000, plantFuel: 100000, siteCosts: 72000, scaffolding: 55000, concrete: 270000, depreciation: 150000, siteServices: 35000, healthSafety: 32000, qualityControl: 24000, insurance: 80000, permits: 15000, adminSalaries: 155000, officeRental: 40000, professional: 55000, bankCharges: 7000, other: 27000 },
      '2025-04': { revenue: 3990000, materials: 1102500, subcontractors: 756000, siteLabour: 546000, equipmentHire: 246750, plantFuel: 105000, siteCosts: 75600, scaffolding: 57750, concrete: 283500, depreciation: 150000, siteServices: 36750, healthSafety: 33600, qualityControl: 25200, insurance: 80000, permits: 15750, adminSalaries: 155000, officeRental: 40000, professional: 57750, bankCharges: 7350, other: 28350 },
      '2025-05': { revenue: 4180000, materials: 1155000, subcontractors: 792000, siteLabour: 572000, equipmentHire: 258500, plantFuel: 110000, siteCosts: 79200, scaffolding: 60500, concrete: 297000, depreciation: 150000, siteServices: 38500, healthSafety: 35200, qualityControl: 26400, insurance: 80000, permits: 16500, adminSalaries: 155000, officeRental: 40000, professional: 60500, bankCharges: 7700, other: 29700 },
      '2025-06': { revenue: 3990000, materials: 1102500, subcontractors: 756000, siteLabour: 546000, equipmentHire: 246750, plantFuel: 105000, siteCosts: 75600, scaffolding: 57750, concrete: 283500, depreciation: 150000, siteServices: 36750, healthSafety: 33600, qualityControl: 25200, insurance: 80000, permits: 15750, adminSalaries: 155000, officeRental: 40000, professional: 57750, bankCharges: 7350, other: 28350 },
      '2025-07': { revenue: 3610000, materials: 997500, subcontractors: 684000, siteLabour: 494000, equipmentHire: 223250, plantFuel: 95000, siteCosts: 68400, scaffolding: 52250, concrete: 256500, depreciation: 150000, siteServices: 33250, healthSafety: 30400, qualityControl: 22800, insurance: 80000, permits: 14250, adminSalaries: 155000, officeRental: 40000, professional: 52250, bankCharges: 6650, other: 25650 },
      '2025-08': { revenue: 3420000, materials: 945000, subcontractors: 648000, siteLabour: 468000, equipmentHire: 211500, plantFuel: 90000, siteCosts: 64800, scaffolding: 49500, concrete: 243000, depreciation: 150000, siteServices: 31500, healthSafety: 28800, qualityControl: 21600, insurance: 80000, permits: 13500, adminSalaries: 155000, officeRental: 40000, professional: 49500, bankCharges: 6300, other: 24300 },
      '2025-09': { revenue: 3800000, materials: 1050000, subcontractors: 720000, siteLabour: 520000, equipmentHire: 235000, plantFuel: 100000, siteCosts: 72000, scaffolding: 55000, concrete: 270000, depreciation: 150000, siteServices: 35000, healthSafety: 32000, qualityControl: 24000, insurance: 80000, permits: 15000, adminSalaries: 155000, officeRental: 40000, professional: 55000, bankCharges: 7000, other: 27000 },
      '2025-10': { revenue: 3990000, materials: 1102500, subcontractors: 756000, siteLabour: 546000, equipmentHire: 246750, plantFuel: 105000, siteCosts: 75600, scaffolding: 57750, concrete: 283500, depreciation: 150000, siteServices: 36750, healthSafety: 33600, qualityControl: 25200, insurance: 80000, permits: 15750, adminSalaries: 155000, officeRental: 40000, professional: 57750, bankCharges: 7350, other: 28350 },
      '2025-11': { revenue: 4104000, materials: 1134000, subcontractors: 777600, siteLabour: 561600, equipmentHire: 253800, plantFuel: 108000, siteCosts: 77760, scaffolding: 59400, concrete: 291600, depreciation: 150000, siteServices: 37800, healthSafety: 34560, qualityControl: 25920, insurance: 80000, permits: 16200, adminSalaries: 155000, officeRental: 40000, professional: 59400, bankCharges: 7560, other: 29160 },
      '2025-12': { revenue: 3116000, materials: 861000, subcontractors: 590400, siteLabour: 426400, equipmentHire: 192700, plantFuel: 82000, siteCosts: 59040, scaffolding: 45100, concrete: 221400, depreciation: 150000, siteServices: 28700, healthSafety: 26240, qualityControl: 19680, insurance: 80000, permits: 12300, adminSalaries: 155000, officeRental: 40000, professional: 45100, bankCharges: 5740, other: 22140 }
    },
    byProject: {
      'PRJ-001': { revenue: 18000000, materials: 5000000, subcontractors: 3400000, labour: 2500000, equipment: 1200000, depreciation: 720000 },
      'PRJ-002': { revenue: 15000000, materials: 4200000, subcontractors: 2800000, labour: 2100000, equipment: 900000, depreciation: 600000 },
      'PRJ-003': { revenue: 12000000, materials: 3300000, subcontractors: 2300000, labour: 1600000, equipment: 700000, depreciation: 480000 },
    }
  },
  '3': { // Excel Academy - Education
    annual: {
      revenue: 12500000,
      academicSalaries: 4200000, supportStaff: 1850000, learningMaterials: 680000, examinations: 420000,
      studentServices: 380000, practicals: 520000, depreciation: 450000,
      facilities: 580000, utilities: 320000, security: 280000, cleaning: 180000, itInfrastructure: 650000, accreditation: 185000,
      adminSalaries: 920000, marketing: 380000, insurance: 220000, bankCharges: 45000, other: 180000
    },
    monthly: {
      '2024-01': { revenue: 1045000, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 63800, examinations: 38500, studentServices: 35200, practicals: 48400, depreciation: 37500, facilities: 53900, utilities: 29700, security: 24000, cleaning: 16500, itInfrastructure: 60500, accreditation: 17050, adminSalaries: 77000, marketing: 35200, insurance: 18500, bankCharges: 4180, other: 16500 },
      '2024-02': { revenue: 997500, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 60900, examinations: 36750, studentServices: 33600, practicals: 46200, depreciation: 37500, facilities: 51450, utilities: 28350, security: 24000, cleaning: 15750, itInfrastructure: 57750, accreditation: 16275, adminSalaries: 77000, marketing: 33600, insurance: 18500, bankCharges: 3990, other: 15750 },
      '2024-03': { revenue: 950000, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 58000, examinations: 35000, studentServices: 32000, practicals: 44000, depreciation: 37500, facilities: 49000, utilities: 27000, security: 24000, cleaning: 15000, itInfrastructure: 55000, accreditation: 15500, adminSalaries: 77000, marketing: 32000, insurance: 18500, bankCharges: 3800, other: 15000 },
      '2024-04': { revenue: 902500, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 55100, examinations: 33250, studentServices: 30400, practicals: 41800, depreciation: 37500, facilities: 46550, utilities: 25650, security: 24000, cleaning: 14250, itInfrastructure: 52250, accreditation: 14725, adminSalaries: 77000, marketing: 30400, insurance: 18500, bankCharges: 3610, other: 14250 },
      '2024-05': { revenue: 855000, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 52200, examinations: 31500, studentServices: 28800, practicals: 39600, depreciation: 37500, facilities: 44100, utilities: 24300, security: 24000, cleaning: 13500, itInfrastructure: 49500, accreditation: 13950, adminSalaries: 77000, marketing: 28800, insurance: 18500, bankCharges: 3420, other: 13500 },
      '2024-06': { revenue: 807500, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 49300, examinations: 29750, studentServices: 27200, practicals: 37400, depreciation: 37500, facilities: 41650, utilities: 22950, security: 24000, cleaning: 12750, itInfrastructure: 46750, accreditation: 13175, adminSalaries: 77000, marketing: 27200, insurance: 18500, bankCharges: 3230, other: 12750 },
      '2024-07': { revenue: 760000, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 46400, examinations: 28000, studentServices: 25600, practicals: 35200, depreciation: 37500, facilities: 39200, utilities: 21600, security: 24000, cleaning: 12000, itInfrastructure: 44000, accreditation: 12400, adminSalaries: 77000, marketing: 25600, insurance: 18500, bankCharges: 3040, other: 12000 },
      '2024-08': { revenue: 779000, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 47560, examinations: 28700, studentServices: 26240, practicals: 36080, depreciation: 37500, facilities: 40180, utilities: 22140, security: 24000, cleaning: 12300, itInfrastructure: 45100, accreditation: 12710, adminSalaries: 77000, marketing: 26240, insurance: 18500, bankCharges: 3116, other: 12300 },
      '2024-09': { revenue: 902500, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 55100, examinations: 33250, studentServices: 30400, practicals: 41800, depreciation: 37500, facilities: 46550, utilities: 25650, security: 24000, cleaning: 14250, itInfrastructure: 52250, accreditation: 14725, adminSalaries: 77000, marketing: 30400, insurance: 18500, bankCharges: 3610, other: 14250 },
      '2024-10': { revenue: 997500, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 60900, examinations: 36750, studentServices: 33600, practicals: 46200, depreciation: 37500, facilities: 51450, utilities: 28350, security: 24000, cleaning: 15750, itInfrastructure: 57750, accreditation: 16275, adminSalaries: 77000, marketing: 33600, insurance: 18500, bankCharges: 3990, other: 15750 },
      '2024-11': { revenue: 1026000, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 62640, examinations: 37800, studentServices: 34560, practicals: 47520, depreciation: 37500, facilities: 52920, utilities: 29160, security: 24000, cleaning: 16200, itInfrastructure: 59400, accreditation: 16740, adminSalaries: 77000, marketing: 34560, insurance: 18500, bankCharges: 4104, other: 16200 },
      '2024-12': { revenue: 712500, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 43500, examinations: 26250, studentServices: 24000, practicals: 33000, depreciation: 37500, facilities: 36750, utilities: 20250, security: 24000, cleaning: 11250, itInfrastructure: 41250, accreditation: 11625, adminSalaries: 77000, marketing: 24000, insurance: 18500, bankCharges: 2850, other: 11250 },
      '2025-01': { revenue: 1155000, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 63800, examinations: 38500, studentServices: 35200, practicals: 48400, depreciation: 37500, facilities: 53900, utilities: 29700, security: 24000, cleaning: 16500, itInfrastructure: 60500, accreditation: 17050, adminSalaries: 77000, marketing: 35200, insurance: 18500, bankCharges: 4180, other: 16500 },
      '2025-02': { revenue: 1102500, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 60900, examinations: 36750, studentServices: 33600, practicals: 46200, depreciation: 37500, facilities: 51450, utilities: 28350, security: 24000, cleaning: 15750, itInfrastructure: 57750, accreditation: 16275, adminSalaries: 77000, marketing: 33600, insurance: 18500, bankCharges: 3990, other: 15750 },
      '2025-03': { revenue: 1050000, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 58000, examinations: 35000, studentServices: 32000, practicals: 44000, depreciation: 37500, facilities: 49000, utilities: 27000, security: 24000, cleaning: 15000, itInfrastructure: 55000, accreditation: 15500, adminSalaries: 77000, marketing: 32000, insurance: 18500, bankCharges: 3800, other: 15000 },
      '2025-04': { revenue: 997500, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 55100, examinations: 33250, studentServices: 30400, practicals: 41800, depreciation: 37500, facilities: 46550, utilities: 25650, security: 24000, cleaning: 14250, itInfrastructure: 52250, accreditation: 14725, adminSalaries: 77000, marketing: 30400, insurance: 18500, bankCharges: 3610, other: 14250 },
      '2025-05': { revenue: 945000, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 52200, examinations: 31500, studentServices: 28800, practicals: 39600, depreciation: 37500, facilities: 44100, utilities: 24300, security: 24000, cleaning: 13500, itInfrastructure: 49500, accreditation: 13950, adminSalaries: 77000, marketing: 28800, insurance: 18500, bankCharges: 3420, other: 13500 },
      '2025-06': { revenue: 892500, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 49300, examinations: 29750, studentServices: 27200, practicals: 37400, depreciation: 37500, facilities: 41650, utilities: 22950, security: 24000, cleaning: 12750, itInfrastructure: 46750, accreditation: 13175, adminSalaries: 77000, marketing: 27200, insurance: 18500, bankCharges: 3230, other: 12750 },
      '2025-07': { revenue: 840000, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 46400, examinations: 28000, studentServices: 25600, practicals: 35200, depreciation: 37500, facilities: 39200, utilities: 21600, security: 24000, cleaning: 12000, itInfrastructure: 44000, accreditation: 12400, adminSalaries: 77000, marketing: 25600, insurance: 18500, bankCharges: 3040, other: 12000 },
      '2025-08': { revenue: 861000, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 47560, examinations: 28700, studentServices: 26240, practicals: 36080, depreciation: 37500, facilities: 40180, utilities: 22140, security: 24000, cleaning: 12300, itInfrastructure: 45100, accreditation: 12710, adminSalaries: 77000, marketing: 26240, insurance: 18500, bankCharges: 3116, other: 12300 },
      '2025-09': { revenue: 997500, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 55100, examinations: 33250, studentServices: 30400, practicals: 41800, depreciation: 37500, facilities: 46550, utilities: 25650, security: 24000, cleaning: 14250, itInfrastructure: 52250, accreditation: 14725, adminSalaries: 77000, marketing: 30400, insurance: 18500, bankCharges: 3610, other: 14250 },
      '2025-10': { revenue: 1102500, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 60900, examinations: 36750, studentServices: 33600, practicals: 46200, depreciation: 37500, facilities: 51450, utilities: 28350, security: 24000, cleaning: 15750, itInfrastructure: 57750, accreditation: 16275, adminSalaries: 77000, marketing: 33600, insurance: 18500, bankCharges: 3990, other: 15750 },
      '2025-11': { revenue: 1134000, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 62640, examinations: 37800, studentServices: 34560, practicals: 47520, depreciation: 37500, facilities: 52920, utilities: 29160, security: 24000, cleaning: 16200, itInfrastructure: 59400, accreditation: 16740, adminSalaries: 77000, marketing: 34560, insurance: 18500, bankCharges: 4104, other: 16200 },
      '2025-12': { revenue: 787500, academicSalaries: 350000, supportStaff: 155000, learningMaterials: 43500, examinations: 26250, studentServices: 24000, practicals: 33000, depreciation: 37500, facilities: 36750, utilities: 20250, security: 24000, cleaning: 11250, itInfrastructure: 41250, accreditation: 11625, adminSalaries: 77000, marketing: 24000, insurance: 18500, bankCharges: 2850, other: 11250 }
    },
    byProgram: {
      'BBA': { revenue: 5500000, academicSalaries: 1850000, materials: 300000, practicals: 180000, depreciation: 200000 },
      'DIP-IT': { revenue: 4200000, academicSalaries: 1400000, materials: 250000, practicals: 220000, depreciation: 150000 },
      'CERT-ACC': { revenue: 2800000, academicSalaries: 950000, materials: 130000, practicals: 120000, depreciation: 100000 },
    }
  }
};

// Mock Data - Actuals (FY2024 & FY2025 - Full 12 months each)
const initialActuals = {
  '1': { // Transhaul - Haulage
    monthly: {
      '2024-01': { revenue: 284666, fuel: 58990, driverSalaries: 93030, directLabour: 11587, tollFees: 8693, repairs: 23133, tyres: 9581, travelAllowance: 7247, parking: 3251, depreciation: 48350, licensing: 5614, insurance: 25510, adminSalaries: 38033, officeRental: 40619, utilities: 2300, itServices: 5932, communications: 4134, bankCharges: 1028, other: 3939 },
      '2024-02': { revenue: 291862, fuel: 61177, driverSalaries: 98257, directLabour: 12575, tollFees: 9449, repairs: 24069, tyres: 10271, travelAllowance: 6922, parking: 3498, depreciation: 45086, licensing: 6490, insurance: 26892, adminSalaries: 36553, officeRental: 43432, utilities: 2571, itServices: 5120, communications: 3775, bankCharges: 1024, other: 4396 },
      '2024-03': { revenue: 356309, fuel: 67357, driverSalaries: 83178, directLabour: 14077, tollFees: 9875, repairs: 22587, tyres: 11230, travelAllowance: 7741, parking: 4023, depreciation: 48340, licensing: 7208, insurance: 26787, adminSalaries: 36520, officeRental: 40654, utilities: 2780, itServices: 6010, communications: 4053, bankCharges: 1005, other: 5013 },
      '2024-04': { revenue: 375763, fuel: 73044, driverSalaries: 92887, directLabour: 14647, tollFees: 9057, repairs: 25929, tyres: 12631, travelAllowance: 8206, parking: 3973, depreciation: 45181, licensing: 7611, insurance: 26516, adminSalaries: 36486, officeRental: 46013, utilities: 3019, itServices: 5957, communications: 4248, bankCharges: 943, other: 4903 },
      '2024-05': { revenue: 334173, fuel: 71243, driverSalaries: 87229, directLabour: 14213, tollFees: 10993, repairs: 26527, tyres: 12533, travelAllowance: 8109, parking: 4518, depreciation: 41209, licensing: 7209, insurance: 25231, adminSalaries: 37098, officeRental: 43204, utilities: 3303, itServices: 4957, communications: 4142, bankCharges: 936, other: 5581 },
      '2024-06': { revenue: 322128, fuel: 69537, driverSalaries: 81356, directLabour: 15484, tollFees: 10663, repairs: 27235, tyres: 11319, travelAllowance: 7840, parking: 4122, depreciation: 46790, licensing: 6975, insurance: 28945, adminSalaries: 32605, officeRental: 39047, utilities: 2994, itServices: 5099, communications: 3700, bankCharges: 913, other: 5471 },
      '2024-07': { revenue: 339936, fuel: 73598, driverSalaries: 82178, directLabour: 15906, tollFees: 8990, repairs: 22925, tyres: 12084, travelAllowance: 7474, parking: 4161, depreciation: 43779, licensing: 6838, insurance: 28437, adminSalaries: 34367, officeRental: 42400, utilities: 2807, itServices: 5913, communications: 4286, bankCharges: 1037, other: 4446 },
      '2024-08': { revenue: 323525, fuel: 76582, driverSalaries: 83020, directLabour: 15243, tollFees: 10760, repairs: 27115, tyres: 11848, travelAllowance: 8588, parking: 3698, depreciation: 42069, licensing: 7147, insurance: 27393, adminSalaries: 36034, officeRental: 45560, utilities: 2767, itServices: 5215, communications: 3738, bankCharges: 1006, other: 4725 },
      '2024-09': { revenue: 378932, fuel: 77442, driverSalaries: 89819, directLabour: 15755, tollFees: 11414, repairs: 24988, tyres: 12073, travelAllowance: 7583, parking: 4063, depreciation: 46190, licensing: 7235, insurance: 27810, adminSalaries: 35420, officeRental: 41340, utilities: 3261, itServices: 5209, communications: 3681, bankCharges: 944, other: 5762 },
      '2024-10': { revenue: 403720, fuel: 72109, driverSalaries: 83295, directLabour: 17756, tollFees: 10969, repairs: 29940, tyres: 14277, travelAllowance: 8125, parking: 4421, depreciation: 42901, licensing: 8431, insurance: 27530, adminSalaries: 37983, officeRental: 46581, utilities: 3378, itServices: 5281, communications: 4321, bankCharges: 1015, other: 5772 },
      '2024-11': { revenue: 328369, fuel: 75079, driverSalaries: 90974, directLabour: 13588, tollFees: 9838, repairs: 26188, tyres: 12999, travelAllowance: 8219, parking: 4323, depreciation: 47141, licensing: 7216, insurance: 24660, adminSalaries: 36769, officeRental: 45701, utilities: 2756, itServices: 5137, communications: 3884, bankCharges: 916, other: 4866 },
      '2024-12': { revenue: 317886, fuel: 59358, driverSalaries: 82024, directLabour: 12451, tollFees: 9284, repairs: 22741, tyres: 10410, travelAllowance: 7146, parking: 3565, depreciation: 47182, licensing: 6143, insurance: 28401, adminSalaries: 34461, officeRental: 43178, utilities: 2706, itServices: 5475, communications: 4181, bankCharges: 1099, other: 4695 },
      '2025-01': { revenue: 326021, fuel: 65600, driverSalaries: 84814, directLabour: 13352, tollFees: 7852, repairs: 20588, tyres: 11001, travelAllowance: 7292, parking: 3645, depreciation: 43496, licensing: 6212, insurance: 29529, adminSalaries: 38228, officeRental: 41933, utilities: 2668, itServices: 5539, communications: 3913, bankCharges: 989, other: 4445 },
      '2025-02': { revenue: 370085, fuel: 60187, driverSalaries: 96325, directLabour: 13751, tollFees: 8745, repairs: 22982, tyres: 9887, travelAllowance: 6926, parking: 3381, depreciation: 41837, licensing: 6853, insurance: 25697, adminSalaries: 33955, officeRental: 42342, utilities: 2965, itServices: 5174, communications: 3959, bankCharges: 1069, other: 4580 },
      '2025-03': { revenue: 340485, fuel: 64333, driverSalaries: 86526, directLabour: 14143, tollFees: 10342, repairs: 23208, tyres: 10570, travelAllowance: 7844, parking: 3793, depreciation: 41609, licensing: 6710, insurance: 26206, adminSalaries: 33430, officeRental: 43305, utilities: 2746, itServices: 5718, communications: 3753, bankCharges: 990, other: 4418 },
      '2025-04': { revenue: 408269, fuel: 70667, driverSalaries: 86451, directLabour: 15751, tollFees: 10164, repairs: 25092, tyres: 12070, travelAllowance: 7745, parking: 4227, depreciation: 42043, licensing: 6437, insurance: 28370, adminSalaries: 35717, officeRental: 45129, utilities: 2855, itServices: 5548, communications: 4254, bankCharges: 1061, other: 4682 },
      '2025-05': { revenue: 375324, fuel: 68206, driverSalaries: 91287, directLabour: 14975, tollFees: 10490, repairs: 25774, tyres: 12022, travelAllowance: 8952, parking: 4465, depreciation: 41187, licensing: 7566, insurance: 24803, adminSalaries: 32067, officeRental: 39593, utilities: 3292, itServices: 5677, communications: 3674, bankCharges: 1017, other: 5110 },
      '2025-06': { revenue: 371666, fuel: 74187, driverSalaries: 88072, directLabour: 16076, tollFees: 9845, repairs: 25797, tyres: 11301, travelAllowance: 8105, parking: 4052, depreciation: 48934, licensing: 7368, insurance: 29108, adminSalaries: 35253, officeRental: 41125, utilities: 2867, itServices: 5195, communications: 3606, bankCharges: 1037, other: 5136 },
      '2025-07': { revenue: 373750, fuel: 63631, driverSalaries: 90150, directLabour: 15702, tollFees: 10601, repairs: 26067, tyres: 12416, travelAllowance: 8141, parking: 4158, depreciation: 41458, licensing: 6741, insurance: 26301, adminSalaries: 33581, officeRental: 46187, utilities: 3127, itServices: 5590, communications: 4118, bankCharges: 915, other: 4512 },
      '2025-08': { revenue: 343724, fuel: 67535, driverSalaries: 89973, directLabour: 14175, tollFees: 9708, repairs: 25699, tyres: 11005, travelAllowance: 8041, parking: 4120, depreciation: 42275, licensing: 7097, insurance: 25132, adminSalaries: 34244, officeRental: 46817, utilities: 2930, itServices: 5822, communications: 3813, bankCharges: 928, other: 4770 },
      '2025-09': { revenue: 415836, fuel: 71899, driverSalaries: 88153, directLabour: 15269, tollFees: 10391, repairs: 26035, tyres: 11616, travelAllowance: 8012, parking: 4481, depreciation: 42123, licensing: 7887, insurance: 26936, adminSalaries: 33422, officeRental: 43348, utilities: 3350, itServices: 5579, communications: 3631, bankCharges: 1078, other: 5219 },
      '2025-10': { revenue: 414624, fuel: 73022, driverSalaries: 86024, directLabour: 15863, tollFees: 11894, repairs: 26473, tyres: 12795, travelAllowance: 8921, parking: 4707, depreciation: 46309, licensing: 7969, insurance: 27257, adminSalaries: 34465, officeRental: 40162, utilities: 3585, itServices: 5874, communications: 4351, bankCharges: 1017, other: 5131 },
      '2025-11': { revenue: 390686, fuel: 76913, driverSalaries: 82322, directLabour: 14987, tollFees: 10464, repairs: 24564, tyres: 11628, travelAllowance: 8095, parking: 3899, depreciation: 40599, licensing: 6638, insurance: 25512, adminSalaries: 38365, officeRental: 43267, utilities: 3050, itServices: 5044, communications: 4209, bankCharges: 940, other: 5220 },
      '2025-12': { revenue: 331374, fuel: 57774, driverSalaries: 96567, directLabour: 13847, tollFees: 8858, repairs: 20193, tyres: 10888, travelAllowance: 7302, parking: 3699, depreciation: 43004, licensing: 6161, insurance: 28622, adminSalaries: 35905, officeRental: 41905, utilities: 2428, itServices: 5136, communications: 4172, bankCharges: 1046, other: 4143 }
    },
    byTruck: {
      'TA-001': { revenue: 520000, fuel: 95000, repairs: 45000, tyres: 8850, tolls: 12500, depreciation: 27639 },
      'TA-002': { revenue: 430000, fuel: 78000, repairs: 19075, tyres: 0, tolls: 9800, depreciation: 27639 },
      'TA-003': { revenue: 333320, fuel: 72753, repairs: 2700, tyres: 17600, tolls: 5800, depreciation: 36667 },
    },
    byRoute: {
      'DBN-JHB': { revenue: 580000, trips: 98, fuel: 110000, tolls: 14500 },
      'DBN-PE': { revenue: 320000, trips: 48, fuel: 64000, tolls: 7200 },
      'DBN-BFN': { revenue: 245000, trips: 42, fuel: 48000, tolls: 5800 },
      'JHB-CT': { revenue: 138320, trips: 15, fuel: 23753, tolls: 2600 },
    },
    byTrip: [
      { tripId: 'TRIP-001', date: '2025-01-15', truck: 'TA-001', route: 'DBN-JHB', budgetRevenue: 5800, actualRevenue: 5420, budgetFuel: 1100, actualFuel: 1180, budgetTolls: 280, actualTolls: 280 },
      { tripId: 'TRIP-002', date: '2025-01-15', truck: 'TA-002', route: 'DBN-PE', budgetRevenue: 6500, actualRevenue: 6800, budgetFuel: 1350, actualFuel: 1280, budgetTolls: 320, actualTolls: 310 },
      { tripId: 'TRIP-003', date: '2025-02-16', truck: 'TA-001', route: 'JHB-DBN', budgetRevenue: 2900, actualRevenue: 2750, budgetFuel: 1100, actualFuel: 1150, budgetTolls: 280, actualTolls: 295 },
      { tripId: 'TRIP-004', date: '2025-03-17', truck: 'TA-003', route: 'DBN-BFN', budgetRevenue: 5200, actualRevenue: 4850, budgetFuel: 1050, actualFuel: 1120, budgetTolls: 175, actualTolls: 175 },
      { tripId: 'TRIP-005', date: '2024-06-10', truck: 'TA-001', route: 'DBN-JHB', budgetRevenue: 5500, actualRevenue: 5200, budgetFuel: 1050, actualFuel: 1100, budgetTolls: 280, actualTolls: 280 },
      { tripId: 'TRIP-006', date: '2024-09-22', truck: 'TA-002', route: 'JHB-CT', budgetRevenue: 26000, actualRevenue: 25500, budgetFuel: 4800, actualFuel: 5100, budgetTolls: 850, actualTolls: 850 },
    ]
  },
  '2': { // Master Builders - Construction
    monthly: {
      '2024-01': { revenue: 2852766, materials: 968880, subcontractors: 664462, siteLabour: 407617, equipmentHire: 198099, plantFuel: 81025, siteCosts: 63766, scaffolding: 43212, concrete: 212561, depreciation: 161183, siteServices: 31343, healthSafety: 27367, qualityControl: 19793, insurance: 75600, permits: 13914, adminSalaries: 164392, officeRental: 43826, professional: 47871, bankCharges: 6159, other: 23743 },
      '2024-02': { revenue: 3594418, materials: 1040819, subcontractors: 694128, siteLabour: 484790, equipmentHire: 208188, plantFuel: 99699, siteCosts: 64342, scaffolding: 49421, concrete: 241440, depreciation: 151584, siteServices: 36355, healthSafety: 33400, qualityControl: 23762, insurance: 80926, permits: 13829, adminSalaries: 140151, officeRental: 40591, professional: 54899, bankCharges: 6909, other: 23233 },
      '2024-03': { revenue: 3730829, materials: 1108429, subcontractors: 721376, siteLabour: 542229, equipmentHire: 211517, plantFuel: 107328, siteCosts: 74007, scaffolding: 54369, concrete: 266300, depreciation: 162995, siteServices: 38041, healthSafety: 29240, qualityControl: 24426, insurance: 87160, permits: 15535, adminSalaries: 149982, officeRental: 38802, professional: 56690, bankCharges: 7197, other: 27715 },
      '2024-04': { revenue: 3402953, materials: 1175427, subcontractors: 770162, siteLabour: 593038, equipmentHire: 228180, plantFuel: 96467, siteCosts: 77058, scaffolding: 53420, concrete: 310065, depreciation: 144298, siteServices: 35386, healthSafety: 32803, qualityControl: 23405, insurance: 75965, permits: 16306, adminSalaries: 160605, officeRental: 42794, professional: 57710, bankCharges: 6780, other: 25832 },
      '2024-05': { revenue: 4116807, materials: 1201698, subcontractors: 758285, siteLabour: 615281, equipmentHire: 268206, plantFuel: 104434, siteCosts: 81008, scaffolding: 66043, concrete: 300584, depreciation: 136270, siteServices: 41684, healthSafety: 34467, qualityControl: 27623, insurance: 78355, permits: 17797, adminSalaries: 142613, officeRental: 41421, professional: 58209, bankCharges: 8156, other: 29090 },
      '2024-06': { revenue: 3487416, materials: 1079184, subcontractors: 817186, siteLabour: 521053, equipmentHire: 235255, plantFuel: 107537, siteCosts: 73027, scaffolding: 56490, concrete: 284724, depreciation: 147185, siteServices: 40127, healthSafety: 32761, qualityControl: 26572, insurance: 87969, permits: 16569, adminSalaries: 140723, officeRental: 38062, professional: 58387, bankCharges: 6952, other: 29405 },
      '2024-07': { revenue: 3338988, materials: 1039120, subcontractors: 691878, siteLabour: 459156, equipmentHire: 231064, plantFuel: 87214, siteCosts: 74595, scaffolding: 56241, concrete: 251361, depreciation: 156664, siteServices: 33418, healthSafety: 31717, qualityControl: 22980, insurance: 83947, permits: 13973, adminSalaries: 145807, officeRental: 36535, professional: 52328, bankCharges: 6666, other: 24247 },
      '2024-08': { revenue: 2995749, materials: 990069, subcontractors: 663613, siteLabour: 480897, equipmentHire: 192413, plantFuel: 95869, siteCosts: 67294, scaffolding: 46055, concrete: 241312, depreciation: 155634, siteServices: 29311, healthSafety: 29450, qualityControl: 19569, insurance: 72951, permits: 13565, adminSalaries: 160892, officeRental: 39629, professional: 54406, bankCharges: 6720, other: 22807 },
      '2024-09': { revenue: 3690576, materials: 1132590, subcontractors: 662237, siteLabour: 535358, equipmentHire: 237075, plantFuel: 94598, siteCosts: 71446, scaffolding: 58360, concrete: 253074, depreciation: 153718, siteServices: 35049, healthSafety: 32914, qualityControl: 23583, insurance: 76461, permits: 14002, adminSalaries: 142164, officeRental: 40679, professional: 49856, bankCharges: 6777, other: 25850 },
      '2024-10': { revenue: 3460078, materials: 1041265, subcontractors: 814853, siteLabour: 560477, equipmentHire: 234776, plantFuel: 106765, siteCosts: 68344, scaffolding: 53564, concrete: 266410, depreciation: 161233, siteServices: 37238, healthSafety: 30825, qualityControl: 23353, insurance: 81122, permits: 16826, adminSalaries: 153694, officeRental: 41716, professional: 60401, bankCharges: 7084, other: 29580 },
      '2024-11': { revenue: 4022708, materials: 1185856, subcontractors: 824735, siteLabour: 615236, equipmentHire: 268174, plantFuel: 118276, siteCosts: 80496, scaffolding: 64430, concrete: 280683, depreciation: 153314, siteServices: 41317, healthSafety: 37044, qualityControl: 23841, insurance: 77947, permits: 15688, adminSalaries: 167452, officeRental: 42907, professional: 59067, bankCharges: 7172, other: 31490 },
      '2024-12': { revenue: 3002817, materials: 885078, subcontractors: 552158, siteLabour: 447055, equipmentHire: 204459, plantFuel: 80330, siteCosts: 60984, scaffolding: 47357, concrete: 205217, depreciation: 150109, siteServices: 26478, healthSafety: 26670, qualityControl: 19719, insurance: 74320, permits: 11811, adminSalaries: 143323, officeRental: 41860, professional: 43590, bankCharges: 6079, other: 23728 },
      '2025-01': { revenue: 3065347, materials: 873617, subcontractors: 643660, siteLabour: 472581, equipmentHire: 190775, plantFuel: 77131, siteCosts: 60735, scaffolding: 48602, concrete: 217546, depreciation: 160884, siteServices: 29762, healthSafety: 27599, qualityControl: 20162, insurance: 74584, permits: 13928, adminSalaries: 161799, officeRental: 37311, professional: 47367, bankCharges: 5991, other: 21870 },
      '2025-02': { revenue: 3788567, materials: 928423, subcontractors: 724230, siteLabour: 493936, equipmentHire: 211245, plantFuel: 102042, siteCosts: 68392, scaffolding: 47064, concrete: 248597, depreciation: 159980, siteServices: 31001, healthSafety: 28742, qualityControl: 24096, insurance: 84564, permits: 13523, adminSalaries: 142914, officeRental: 43240, professional: 56258, bankCharges: 7230, other: 24537 },
      '2025-03': { revenue: 3953914, materials: 1031327, subcontractors: 666665, siteLabour: 518232, equipmentHire: 220626, plantFuel: 102729, siteCosts: 66157, scaffolding: 59573, concrete: 253874, depreciation: 138829, siteServices: 34725, healthSafety: 32314, qualityControl: 25630, insurance: 81061, permits: 15721, adminSalaries: 170050, officeRental: 38489, professional: 58867, bankCharges: 6634, other: 24848 },
      '2025-04': { revenue: 4292292, materials: 1101336, subcontractors: 717827, siteLabour: 521368, equipmentHire: 271192, plantFuel: 113007, siteCosts: 79375, scaffolding: 60856, concrete: 274027, depreciation: 156944, siteServices: 39451, healthSafety: 34247, qualityControl: 26940, insurance: 76741, permits: 14604, adminSalaries: 152982, officeRental: 41204, professional: 61904, bankCharges: 7079, other: 30440 },
      '2025-05': { revenue: 4171903, materials: 1167544, subcontractors: 847537, siteLabour: 609462, equipmentHire: 244987, plantFuel: 99803, siteCosts: 78951, scaffolding: 57035, concrete: 289962, depreciation: 146378, siteServices: 40461, healthSafety: 36159, qualityControl: 25852, insurance: 86279, permits: 16797, adminSalaries: 143958, officeRental: 40151, professional: 57357, bankCharges: 8092, other: 28555 },
      '2025-06': { revenue: 3605378, materials: 1142137, subcontractors: 706209, siteLabour: 537925, equipmentHire: 267236, plantFuel: 108939, siteCosts: 72340, scaffolding: 56920, concrete: 257702, depreciation: 154393, siteServices: 33819, healthSafety: 31208, qualityControl: 27241, insurance: 85641, permits: 16211, adminSalaries: 159155, officeRental: 43323, professional: 57489, bankCharges: 8069, other: 30344 },
      '2025-07': { revenue: 3496284, materials: 943216, subcontractors: 617783, siteLabour: 465839, equipmentHire: 204521, plantFuel: 94819, siteCosts: 72863, scaffolding: 50192, concrete: 249301, depreciation: 150321, siteServices: 31683, healthSafety: 27961, qualityControl: 22755, insurance: 77483, permits: 14623, adminSalaries: 162880, officeRental: 38640, professional: 56012, bankCharges: 6983, other: 25471 },
      '2025-08': { revenue: 3392529, materials: 980493, subcontractors: 666602, siteLabour: 485876, equipmentHire: 196487, plantFuel: 90453, siteCosts: 65610, scaffolding: 53887, concrete: 244435, depreciation: 147874, siteServices: 29674, healthSafety: 30908, qualityControl: 20288, insurance: 80975, permits: 12510, adminSalaries: 167609, officeRental: 41843, professional: 49577, bankCharges: 6650, other: 24390 },
      '2025-09': { revenue: 3433064, materials: 1099552, subcontractors: 656724, siteLabour: 500613, equipmentHire: 233995, plantFuel: 101251, siteCosts: 67059, scaffolding: 54624, concrete: 258764, depreciation: 144495, siteServices: 34850, healthSafety: 33032, qualityControl: 24803, insurance: 82643, permits: 14999, adminSalaries: 166453, officeRental: 40607, professional: 54445, bankCharges: 7393, other: 27299 },
      '2025-10': { revenue: 3841707, materials: 994723, subcontractors: 736085, siteLabour: 535638, equipmentHire: 246017, plantFuel: 110788, siteCosts: 74178, scaffolding: 53289, concrete: 275397, depreciation: 141639, siteServices: 36270, healthSafety: 35662, qualityControl: 24286, insurance: 76271, permits: 15390, adminSalaries: 160874, officeRental: 37147, professional: 60492, bankCharges: 8001, other: 26528 },
      '2025-11': { revenue: 4318628, materials: 1245498, subcontractors: 714755, siteLabour: 581975, equipmentHire: 268076, plantFuel: 108633, siteCosts: 84255, scaffolding: 63740, concrete: 311113, depreciation: 154200, siteServices: 35446, healthSafety: 35137, qualityControl: 25303, insurance: 87820, permits: 15951, adminSalaries: 169939, officeRental: 43738, professional: 64327, bankCharges: 8223, other: 29312 },
      '2025-12': { revenue: 3317834, materials: 848861, subcontractors: 568472, siteLabour: 437890, equipmentHire: 204177, plantFuel: 78659, siteCosts: 62777, scaffolding: 42351, concrete: 236229, depreciation: 141891, siteServices: 25898, healthSafety: 23940, qualityControl: 18055, insurance: 73877, permits: 11425, adminSalaries: 141055, officeRental: 37856, professional: 43044, bankCharges: 6312, other: 22018 }
    },
    byProject: {
      'PRJ-001': { revenue: 5200000, materials: 1450000, subcontractors: 980000, labour: 720000, equipment: 345000, depreciation: 210000 },
      'PRJ-002': { revenue: 4800000, materials: 1350000, subcontractors: 920000, labour: 680000, equipment: 295000, depreciation: 195000 },
      'PRJ-003': { revenue: 2700000, materials: 720000, subcontractors: 435000, labour: 405000, equipment: 175000, depreciation: 105000 },
    }
  },
  '3': { // Excel Academy - Education
    monthly: {
      '2024-01': { revenue: 1089903, academicSalaries: 317891, supportStaff: 157617, learningMaterials: 57725, examinations: 37549, studentServices: 34247, practicals: 44172, depreciation: 35650, facilities: 49702, utilities: 29609, security: 25867, cleaning: 15082, itInfrastructure: 58923, accreditation: 16906, adminSalaries: 81110, marketing: 32512, insurance: 18198, bankCharges: 3784, other: 17248 },
      '2024-02': { revenue: 933946, academicSalaries: 341552, supportStaff: 140917, learningMaterials: 61562, examinations: 39600, studentServices: 36859, practicals: 43650, depreciation: 37374, facilities: 52423, utilities: 26863, security: 21715, cleaning: 14262, itInfrastructure: 61984, accreditation: 16593, adminSalaries: 82439, marketing: 32429, insurance: 16792, bankCharges: 4347, other: 15133 },
      '2024-03': { revenue: 953078, academicSalaries: 320720, supportStaff: 160288, learningMaterials: 55402, examinations: 33774, studentServices: 29189, practicals: 47749, depreciation: 33758, facilities: 52247, utilities: 25399, security: 23000, cleaning: 15055, itInfrastructure: 53688, accreditation: 15347, adminSalaries: 75319, marketing: 29297, insurance: 20223, bankCharges: 3592, other: 14074 },
      '2024-04': { revenue: 898719, academicSalaries: 376303, supportStaff: 166595, learningMaterials: 56465, examinations: 30388, studentServices: 27602, practicals: 41149, depreciation: 40884, facilities: 46918, utilities: 25140, security: 26084, cleaning: 14271, itInfrastructure: 53246, accreditation: 14776, adminSalaries: 70955, marketing: 27375, insurance: 17574, bankCharges: 3845, other: 12964 },
      '2024-05': { revenue: 913930, academicSalaries: 368861, supportStaff: 169863, learningMaterials: 48256, examinations: 31605, studentServices: 29116, practicals: 35746, depreciation: 33895, facilities: 42917, utilities: 22574, security: 22863, cleaning: 13137, itInfrastructure: 52398, accreditation: 13752, adminSalaries: 80165, marketing: 26275, insurance: 19541, bankCharges: 3291, other: 12475 },
      '2024-06': { revenue: 861752, academicSalaries: 345761, supportStaff: 167688, learningMaterials: 47184, examinations: 32449, studentServices: 25060, practicals: 40215, depreciation: 33753, facilities: 38631, utilities: 24082, security: 22435, cleaning: 13174, itInfrastructure: 45237, accreditation: 12893, adminSalaries: 78233, marketing: 29186, insurance: 17721, bankCharges: 3211, other: 13037 },
      '2024-07': { revenue: 714510, academicSalaries: 334106, supportStaff: 153687, learningMaterials: 50862, examinations: 27574, studentServices: 25539, practicals: 32571, depreciation: 36733, facilities: 40231, utilities: 23659, security: 21654, cleaning: 11438, itInfrastructure: 45363, accreditation: 12833, adminSalaries: 70217, marketing: 26768, insurance: 19871, bankCharges: 2852, other: 10986 },
      '2024-08': { revenue: 736278, academicSalaries: 371177, supportStaff: 155370, learningMaterials: 43813, examinations: 27785, studentServices: 23803, practicals: 38629, depreciation: 36943, facilities: 36608, utilities: 22923, security: 24893, cleaning: 12211, itInfrastructure: 40611, accreditation: 12323, adminSalaries: 72307, marketing: 28609, insurance: 19310, bankCharges: 2822, other: 12956 },
      '2024-09': { revenue: 814722, academicSalaries: 319545, supportStaff: 168899, learningMaterials: 50818, examinations: 32843, studentServices: 33300, practicals: 37653, depreciation: 40314, facilities: 43732, utilities: 24041, security: 23674, cleaning: 13256, itInfrastructure: 48708, accreditation: 13643, adminSalaries: 70150, marketing: 32324, insurance: 19689, bankCharges: 3673, other: 14676 },
      '2024-10': { revenue: 911120, academicSalaries: 355052, supportStaff: 165259, learningMaterials: 56476, examinations: 36865, studentServices: 34337, practicals: 50244, depreciation: 37085, facilities: 53811, utilities: 29291, security: 25696, cleaning: 16187, itInfrastructure: 62884, accreditation: 15674, adminSalaries: 69518, marketing: 33831, insurance: 18269, bankCharges: 3729, other: 15172 },
      '2024-11': { revenue: 1045874, academicSalaries: 323731, supportStaff: 150078, learningMaterials: 56586, examinations: 38028, studentServices: 32091, practicals: 50676, depreciation: 35618, facilities: 55404, utilities: 26522, security: 25398, cleaning: 16848, itInfrastructure: 62375, accreditation: 15295, adminSalaries: 80679, marketing: 33251, insurance: 16729, bankCharges: 4116, other: 17761 },
      '2024-12': { revenue: 670857, academicSalaries: 366094, supportStaff: 140112, learningMaterials: 46396, examinations: 28047, studentServices: 24758, practicals: 33767, depreciation: 37383, facilities: 38695, utilities: 21062, security: 24489, cleaning: 10315, itInfrastructure: 43806, accreditation: 10677, adminSalaries: 72209, marketing: 25240, insurance: 19567, bankCharges: 3116, other: 11866 },
      '2025-01': { revenue: 1242482, academicSalaries: 381507, supportStaff: 160047, learningMaterials: 65905, examinations: 37482, studentServices: 31764, practicals: 46230, depreciation: 34941, facilities: 55162, utilities: 27210, security: 25757, cleaning: 15683, itInfrastructure: 56769, accreditation: 17807, adminSalaries: 73748, marketing: 38029, insurance: 19474, bankCharges: 3957, other: 17359 },
      '2025-02': { revenue: 1141231, academicSalaries: 333177, supportStaff: 139994, learningMaterials: 59767, examinations: 39427, studentServices: 36279, practicals: 45829, depreciation: 35410, facilities: 52063, utilities: 25515, security: 24054, cleaning: 14559, itInfrastructure: 57080, accreditation: 15273, adminSalaries: 69894, marketing: 33854, insurance: 16696, bankCharges: 3702, other: 15484 },
      '2025-03': { revenue: 1122896, academicSalaries: 327086, supportStaff: 140494, learningMaterials: 55413, examinations: 35948, studentServices: 29884, practicals: 43484, depreciation: 34739, facilities: 50799, utilities: 24618, security: 23266, cleaning: 13739, itInfrastructure: 50698, accreditation: 16284, adminSalaries: 81404, marketing: 35156, insurance: 19102, bankCharges: 3938, other: 15725 },
      '2025-04': { revenue: 1031711, academicSalaries: 317054, supportStaff: 163076, learningMaterials: 53526, examinations: 34266, studentServices: 27601, practicals: 40755, depreciation: 35315, facilities: 48477, utilities: 24759, security: 22319, cleaning: 15665, itInfrastructure: 51466, accreditation: 15698, adminSalaries: 84552, marketing: 30314, insurance: 16761, bankCharges: 3409, other: 13650 },
      '2025-05': { revenue: 1032682, academicSalaries: 341985, supportStaff: 155854, learningMaterials: 56092, examinations: 34478, studentServices: 31319, practicals: 41535, depreciation: 33874, facilities: 46237, utilities: 23538, security: 23201, cleaning: 13402, itInfrastructure: 53408, accreditation: 13582, adminSalaries: 80472, marketing: 28585, insurance: 19562, bankCharges: 3499, other: 13820 },
      '2025-06': { revenue: 950920, academicSalaries: 339663, supportStaff: 152073, learningMaterials: 53364, examinations: 31940, studentServices: 24876, practicals: 40905, depreciation: 40792, facilities: 41871, utilities: 23624, security: 23075, cleaning: 13883, itInfrastructure: 44295, accreditation: 12071, adminSalaries: 73045, marketing: 28110, insurance: 17122, bankCharges: 3017, other: 12641 },
      '2025-07': { revenue: 833017, academicSalaries: 380183, supportStaff: 139965, learningMaterials: 45443, examinations: 27943, studentServices: 27324, practicals: 36835, depreciation: 33825, facilities: 40337, utilities: 22891, security: 24248, cleaning: 13128, itInfrastructure: 46205, accreditation: 12128, adminSalaries: 75284, marketing: 23844, insurance: 16912, bankCharges: 3039, other: 11368 },
      '2025-08': { revenue: 844029, academicSalaries: 350984, supportStaff: 143921, learningMaterials: 44588, examinations: 26808, studentServices: 24901, practicals: 34610, depreciation: 39508, facilities: 38657, utilities: 23134, security: 22849, cleaning: 11103, itInfrastructure: 45580, accreditation: 12722, adminSalaries: 80963, marketing: 25260, insurance: 17020, bankCharges: 3099, other: 11132 },
      '2025-09': { revenue: 949792, academicSalaries: 380644, supportStaff: 149360, learningMaterials: 60037, examinations: 31526, studentServices: 32232, practicals: 42989, depreciation: 40254, facilities: 45503, utilities: 26511, security: 22044, cleaning: 14216, itInfrastructure: 55390, accreditation: 13480, adminSalaries: 72189, marketing: 31866, insurance: 16712, bankCharges: 3533, other: 14935 },
      '2025-10': { revenue: 1099556, academicSalaries: 341818, supportStaff: 142410, learningMaterials: 55379, examinations: 33709, studentServices: 35867, practicals: 46825, depreciation: 37005, facilities: 52895, utilities: 27427, security: 24262, cleaning: 16347, itInfrastructure: 58129, accreditation: 16307, adminSalaries: 73901, marketing: 32833, insurance: 19297, bankCharges: 4170, other: 15072 },
      '2025-11': { revenue: 1234109, academicSalaries: 364298, supportStaff: 146505, learningMaterials: 58363, examinations: 39518, studentServices: 35584, practicals: 51793, depreciation: 34356, facilities: 52553, utilities: 27288, security: 25927, cleaning: 16090, itInfrastructure: 56678, accreditation: 17826, adminSalaries: 72721, marketing: 37489, insurance: 16878, bankCharges: 3788, other: 17255 },
      '2025-12': { revenue: 744336, academicSalaries: 354047, supportStaff: 156087, learningMaterials: 43784, examinations: 23834, studentServices: 21675, practicals: 30021, depreciation: 36444, facilities: 36574, utilities: 18862, security: 26263, cleaning: 11880, itInfrastructure: 42472, accreditation: 11986, adminSalaries: 72708, marketing: 22879, insurance: 18787, bankCharges: 2823, other: 10267 }
    },
    byProgram: {
      'BBA': { revenue: 1650000, academicSalaries: 540000, materials: 92000, practicals: 55000, depreciation: 62000 },
      'DIP-IT': { revenue: 1280000, academicSalaries: 420000, materials: 78000, practicals: 68000, depreciation: 48000 },
      'CERT-ACC': { revenue: 820000, academicSalaries: 280000, materials: 38000, practicals: 35000, depreciation: 28000 },
    }
  }
};

// Mock Data - Budgeted Revenue (per trip, per month, per truck) - FY2024 & FY2025
const initialBudgetedRevenue = {
  '1': { // Transhaul - Haulage
    monthly: {
      '2024-01': { totalRevenue: 310000, tripsPlanned: 38, avgRevenuePerTrip: 8158, target: 330000 },
      '2024-02': { totalRevenue: 325000, tripsPlanned: 40, avgRevenuePerTrip: 8125, target: 345000 },
      '2024-03': { totalRevenue: 340000, tripsPlanned: 42, avgRevenuePerTrip: 8095, target: 360000 },
      '2024-04': { totalRevenue: 355000, tripsPlanned: 43, avgRevenuePerTrip: 8256, target: 375000 },
      '2024-05': { totalRevenue: 365000, tripsPlanned: 44, avgRevenuePerTrip: 8295, target: 385000 },
      '2024-06': { totalRevenue: 350000, tripsPlanned: 42, avgRevenuePerTrip: 8333, target: 370000 },
      '2024-07': { totalRevenue: 330000, tripsPlanned: 40, avgRevenuePerTrip: 8250, target: 350000 },
      '2024-08': { totalRevenue: 345000, tripsPlanned: 42, avgRevenuePerTrip: 8214, target: 365000 },
      '2024-09': { totalRevenue: 360000, tripsPlanned: 44, avgRevenuePerTrip: 8182, target: 380000 },
      '2024-10': { totalRevenue: 375000, tripsPlanned: 46, avgRevenuePerTrip: 8152, target: 395000 },
      '2024-11': { totalRevenue: 345000, tripsPlanned: 42, avgRevenuePerTrip: 8214, target: 365000 },
      '2024-12': { totalRevenue: 300000, tripsPlanned: 36, avgRevenuePerTrip: 8333, target: 320000 },
      '2025-01': { totalRevenue: 380000, tripsPlanned: 45, avgRevenuePerTrip: 8444, target: 400000 },
      '2025-02': { totalRevenue: 400000, tripsPlanned: 48, avgRevenuePerTrip: 8333, target: 420000 },
      '2025-03': { totalRevenue: 420000, tripsPlanned: 52, avgRevenuePerTrip: 8077, target: 450000 },
      '2025-04': { totalRevenue: 440000, tripsPlanned: 54, avgRevenuePerTrip: 8148, target: 465000 },
      '2025-05': { totalRevenue: 460000, tripsPlanned: 56, avgRevenuePerTrip: 8214, target: 485000 },
      '2025-06': { totalRevenue: 445000, tripsPlanned: 54, avgRevenuePerTrip: 8241, target: 470000 },
      '2025-07': { totalRevenue: 420000, tripsPlanned: 51, avgRevenuePerTrip: 8235, target: 445000 },
      '2025-08': { totalRevenue: 435000, tripsPlanned: 53, avgRevenuePerTrip: 8208, target: 460000 },
      '2025-09': { totalRevenue: 455000, tripsPlanned: 55, avgRevenuePerTrip: 8273, target: 480000 },
      '2025-10': { totalRevenue: 475000, tripsPlanned: 58, avgRevenuePerTrip: 8190, target: 500000 },
      '2025-11': { totalRevenue: 440000, tripsPlanned: 53, avgRevenuePerTrip: 8302, target: 465000 },
      '2025-12': { totalRevenue: 380000, tripsPlanned: 46, avgRevenuePerTrip: 8261, target: 400000 },
    },
    byTruck: {
      'TA-001': {
        truckName: 'UD Quester GWE 420 (TA-001)',
        driver: 'John Nkosi',
        monthly: {
          '2024-01': { revenue: 128000, trips: 15, avgPerTrip: 8533, target: 135000 },
          '2024-06': { revenue: 140000, trips: 17, avgPerTrip: 8235, target: 148000 },
          '2024-12': { revenue: 120000, trips: 14, avgPerTrip: 8571, target: 128000 },
          '2025-01': { revenue: 152000, trips: 18, avgPerTrip: 8444, target: 160000 },
          '2025-02': { revenue: 160000, trips: 19, avgPerTrip: 8421, target: 168000 },
          '2025-03': { revenue: 168000, trips: 21, avgPerTrip: 8000, target: 180000 },
          '2025-06': { revenue: 178000, trips: 22, avgPerTrip: 8091, target: 188000 },
          '2025-09': { revenue: 182000, trips: 22, avgPerTrip: 8273, target: 192000 },
          '2025-12': { revenue: 152000, trips: 18, avgPerTrip: 8444, target: 160000 },
        },
        annual: { revenue: 1800000, trips: 210, avgPerTrip: 8571, target: 1920000 },
      },
      'TA-002': {
        truckName: 'UD Quester GWE 420 (TA-002)',
        driver: 'Peter Dlamini',
        monthly: {
          '2024-01': { revenue: 105000, trips: 13, avgPerTrip: 8077, target: 112000 },
          '2024-06': { revenue: 115000, trips: 14, avgPerTrip: 8214, target: 122000 },
          '2024-12': { revenue: 98000, trips: 12, avgPerTrip: 8167, target: 105000 },
          '2025-01': { revenue: 125000, trips: 15, avgPerTrip: 8333, target: 132000 },
          '2025-02': { revenue: 132000, trips: 16, avgPerTrip: 8250, target: 140000 },
          '2025-03': { revenue: 140000, trips: 17, avgPerTrip: 8235, target: 150000 },
          '2025-06': { revenue: 148000, trips: 18, avgPerTrip: 8222, target: 156000 },
          '2025-09': { revenue: 152000, trips: 18, avgPerTrip: 8444, target: 160000 },
          '2025-12': { revenue: 125000, trips: 15, avgPerTrip: 8333, target: 132000 },
        },
        annual: { revenue: 1500000, trips: 180, avgPerTrip: 8333, target: 1600000 },
      },
      'TA-003': {
        truckName: 'Mercedes-Benz Actros 2645 (TA-003)',
        driver: 'Sipho Mbeki',
        monthly: {
          '2024-01': { revenue: 85000, trips: 10, avgPerTrip: 8500, target: 90000 },
          '2024-06': { revenue: 92000, trips: 11, avgPerTrip: 8364, target: 98000 },
          '2024-12': { revenue: 80000, trips: 9, avgPerTrip: 8889, target: 85000 },
          '2025-01': { revenue: 103000, trips: 12, avgPerTrip: 8583, target: 108000 },
          '2025-02': { revenue: 108000, trips: 13, avgPerTrip: 8308, target: 112000 },
          '2025-03': { revenue: 112000, trips: 14, avgPerTrip: 8000, target: 120000 },
          '2025-06': { revenue: 119000, trips: 14, avgPerTrip: 8500, target: 126000 },
          '2025-09': { revenue: 121000, trips: 15, avgPerTrip: 8067, target: 128000 },
          '2025-12': { revenue: 103000, trips: 12, avgPerTrip: 8583, target: 108000 },
        },
        annual: { revenue: 1200000, trips: 150, avgPerTrip: 8000, target: 1300000 },
      },
    },
    byTrip: [
      { tripId: 'BT-001', date: '2025-01-15', truck: 'TA-001', route: 'DBN-JHB', customer: 'ABC Mining Ltd', loadType: 'Coal', budgetedRevenue: 12500, actualRevenue: 12100, distance: 580, ratePerKm: 21.55 },
      { tripId: 'BT-002', date: '2025-01-15', truck: 'TA-002', route: 'DBN-PE', customer: 'Fresh Produce Co', loadType: 'Fresh Produce', budgetedRevenue: 15200, actualRevenue: 14800, distance: 680, ratePerKm: 22.35 },
      { tripId: 'BT-003', date: '2025-01-16', truck: 'TA-001', route: 'JHB-DBN', customer: 'XYZ Construction', loadType: 'Building Materials', budgetedRevenue: 11800, actualRevenue: 12200, distance: 580, ratePerKm: 20.34 },
      { tripId: 'BT-004', date: '2025-01-17', truck: 'TA-003', route: 'DBN-BFN', customer: 'Steel Works SA', loadType: 'Steel Coils', budgetedRevenue: 18500, actualRevenue: 17900, distance: 620, ratePerKm: 29.84 },
      { tripId: 'BT-005', date: '2025-01-18', truck: 'TA-001', route: 'DBN-JHB', customer: 'ABC Mining Ltd', loadType: 'Equipment', budgetedRevenue: 14200, actualRevenue: 14500, distance: 580, ratePerKm: 24.48 },
      { tripId: 'BT-006', date: '2025-01-20', truck: 'TA-002', route: 'DBN-BFN', customer: 'Agri Foods', loadType: 'Grain', budgetedRevenue: 9800, actualRevenue: 9500, distance: 520, ratePerKm: 18.85 },
      { tripId: 'BT-007', date: '2025-01-22', truck: 'TA-003', route: 'JHB-CT', customer: 'Retail Giants', loadType: 'General Cargo', budgetedRevenue: 28000, actualRevenue: 27500, distance: 1400, ratePerKm: 20.00 },
      { tripId: 'BT-008', date: '2025-01-25', truck: 'TA-001', route: 'DBN-PE', customer: 'Fresh Produce Co', loadType: 'Fresh Produce', budgetedRevenue: 15200, actualRevenue: 15800, distance: 680, ratePerKm: 22.35 },
      { tripId: 'BT-009', date: '2025-02-02', truck: 'TA-002', route: 'DBN-JHB', customer: 'ABC Mining Ltd', loadType: 'Coal', budgetedRevenue: 12500, actualRevenue: 13200, distance: 580, ratePerKm: 21.55 },
      { tripId: 'BT-010', date: '2025-02-05', truck: 'TA-003', route: 'DBN-PE', customer: 'Pharma Distributors', loadType: 'Pharmaceuticals', budgetedRevenue: 22000, actualRevenue: 21500, distance: 680, ratePerKm: 32.35 },
      { tripId: 'BT-011', date: '2025-02-08', truck: 'TA-001', route: 'JHB-DBN', customer: 'Steel Works SA', loadType: 'Steel Coils', budgetedRevenue: 18500, actualRevenue: 19200, distance: 580, ratePerKm: 31.90 },
      { tripId: 'BT-012', date: '2025-02-12', truck: 'TA-002', route: 'DBN-BFN', customer: 'Agri Foods', loadType: 'Grain', budgetedRevenue: 9800, actualRevenue: 10100, distance: 520, ratePerKm: 18.85 },
      { tripId: 'BT-013', date: '2025-03-01', truck: 'TA-001', route: 'DBN-JHB', customer: 'ABC Mining Ltd', loadType: 'Coal', budgetedRevenue: 12500, actualRevenue: 12800, distance: 580, ratePerKm: 21.55 },
      { tripId: 'BT-014', date: '2025-03-05', truck: 'TA-003', route: 'JHB-CT', customer: 'Retail Giants', loadType: 'General Cargo', budgetedRevenue: 28000, actualRevenue: 29100, distance: 1400, ratePerKm: 20.00 },
      { tripId: 'BT-015', date: '2025-03-10', truck: 'TA-002', route: 'DBN-PE', customer: 'Fresh Produce Co', loadType: 'Fresh Produce', budgetedRevenue: 15200, actualRevenue: 14600, distance: 680, ratePerKm: 22.35 },
    ],
    annual: { totalRevenue: 4500000, tripsPlanned: 540, avgRevenuePerTrip: 8333, target: 4800000 },
  },
  '2': { // Master Builders - Construction
    monthly: {
      '2024-01': { totalRevenue: 3200000, projectsActive: 3, avgRevenuePerProject: 1066667, target: 3400000 },
      '2024-04': { totalRevenue: 3600000, projectsActive: 3, avgRevenuePerProject: 1200000, target: 3800000 },
      '2024-07': { totalRevenue: 3400000, projectsActive: 3, avgRevenuePerProject: 1133333, target: 3600000 },
      '2024-10': { totalRevenue: 3700000, projectsActive: 3, avgRevenuePerProject: 1233333, target: 3900000 },
      '2025-01': { totalRevenue: 3800000, projectsActive: 3, avgRevenuePerProject: 1266667, target: 4000000 },
      '2025-02': { totalRevenue: 4200000, projectsActive: 3, avgRevenuePerProject: 1400000, target: 4500000 },
      '2025-03': { totalRevenue: 4500000, projectsActive: 3, avgRevenuePerProject: 1500000, target: 4800000 },
      '2025-04': { totalRevenue: 4600000, projectsActive: 3, avgRevenuePerProject: 1533333, target: 4900000 },
      '2025-06': { totalRevenue: 4400000, projectsActive: 3, avgRevenuePerProject: 1466667, target: 4700000 },
      '2025-09': { totalRevenue: 4700000, projectsActive: 3, avgRevenuePerProject: 1566667, target: 5000000 },
      '2025-12': { totalRevenue: 3500000, projectsActive: 2, avgRevenuePerProject: 1750000, target: 3800000 },
    },
    byTruck: {},
    byTrip: [],
    annual: { totalRevenue: 45000000, projectsActive: 3, avgRevenuePerProject: 15000000, target: 48000000 },
  },
  '3': { // Excel Academy - Education
    monthly: {
      '2024-01': { totalRevenue: 900000, programsActive: 3, avgRevenuePerProgram: 300000, target: 950000 },
      '2024-04': { totalRevenue: 850000, programsActive: 3, avgRevenuePerProgram: 283333, target: 900000 },
      '2024-07': { totalRevenue: 720000, programsActive: 3, avgRevenuePerProgram: 240000, target: 780000 },
      '2024-10': { totalRevenue: 950000, programsActive: 3, avgRevenuePerProgram: 316667, target: 1000000 },
      '2025-01': { totalRevenue: 1050000, programsActive: 3, avgRevenuePerProgram: 350000, target: 1100000 },
      '2025-02': { totalRevenue: 1100000, programsActive: 3, avgRevenuePerProgram: 366667, target: 1150000 },
      '2025-03': { totalRevenue: 1150000, programsActive: 3, avgRevenuePerProgram: 383333, target: 1200000 },
      '2025-04': { totalRevenue: 1080000, programsActive: 3, avgRevenuePerProgram: 360000, target: 1130000 },
      '2025-06': { totalRevenue: 950000, programsActive: 3, avgRevenuePerProgram: 316667, target: 1000000 },
      '2025-09': { totalRevenue: 1100000, programsActive: 3, avgRevenuePerProgram: 366667, target: 1150000 },
      '2025-12': { totalRevenue: 850000, programsActive: 3, avgRevenuePerProgram: 283333, target: 900000 },
    },
    byTruck: {},
    byTrip: [],
    annual: { totalRevenue: 12500000, programsActive: 3, avgRevenuePerProgram: 4166667, target: 13200000 },
  }
};

// Initial Fleet Data
const initialFleet = {
  '1': { // Transhaul - Haulage
    trucks: [
      { id: '1', fleetNo: 'TA-001', regNo: 'CA 123-456', make: 'UD Trucks', model: 'Quester GWE 420', year: 2022, vin: 'JHDGWE420NN123456', engineNo: 'GH11-987654', color: 'White', status: 'Active', purchaseDate: '2022-03-15', purchasePrice: 1850000, currentKm: 245000, lastServiceKm: 240000, nextServiceKm: 260000, fuelType: 'Diesel', tankCapacity: 400, assignedDriver: 'John Nkosi', licenseDisc: '2025-06-30', notes: 'Primary long-haul vehicle' },
      { id: '2', fleetNo: 'TA-002', regNo: 'CA 234-567', make: 'UD Trucks', model: 'Quester GWE 420', year: 2022, vin: 'JHDGWE420NN234567', engineNo: 'GH11-876543', color: 'White', status: 'Active', purchaseDate: '2022-06-20', purchasePrice: 1850000, currentKm: 198000, lastServiceKm: 195000, nextServiceKm: 215000, fuelType: 'Diesel', tankCapacity: 400, assignedDriver: 'Peter Dlamini', licenseDisc: '2025-08-15', notes: 'Regional deliveries' },
      { id: '3', fleetNo: 'TA-003', regNo: 'CA 345-678', make: 'Mercedes-Benz', model: 'Actros 2645', year: 2023, vin: 'WDB9634031L456789', engineNo: 'OM471-654321', color: 'Silver', status: 'Active', purchaseDate: '2023-02-10', purchasePrice: 2450000, currentKm: 125000, lastServiceKm: 120000, nextServiceKm: 140000, fuelType: 'Diesel', tankCapacity: 450, assignedDriver: 'Sipho Mbeki', licenseDisc: '2025-04-20', notes: 'Premium loads' },
      { id: '4', fleetNo: 'TA-004', regNo: 'CA 456-789', make: 'Scania', model: 'R500', year: 2021, vin: 'YS2R4X20001234567', engineNo: 'DC13-123456', color: 'Blue', status: 'In Workshop', purchaseDate: '2021-08-05', purchasePrice: 2100000, currentKm: 320000, lastServiceKm: 315000, nextServiceKm: 335000, fuelType: 'Diesel', tankCapacity: 400, assignedDriver: 'Unassigned', licenseDisc: '2025-05-10', notes: 'Engine overhaul in progress' },
    ],
    trailers: [
      { id: '1', fleetNo: 'TR-001', regNo: 'CA T12-345', type: 'Side Tipper', make: 'SA Truck Bodies', model: '40m³ Side Tipper', year: 2022, capacity: '40m³', status: 'Active', purchaseDate: '2022-04-01', purchasePrice: 680000, lastServiceDate: '2024-12-15', linkedTruck: 'TA-001' },
      { id: '2', fleetNo: 'TR-002', regNo: 'CA T23-456', type: 'Flatbed', make: 'Henred Fruehauf', model: 'Superlink Flatbed', year: 2022, capacity: '34 tons', status: 'Active', purchaseDate: '2022-05-15', purchasePrice: 520000, lastServiceDate: '2024-11-20', linkedTruck: 'TA-002' },
      { id: '3', fleetNo: 'TR-003', regNo: 'CA T34-567', type: 'Tautliner', make: 'Afrit', model: 'Tautliner Superlink', year: 2023, capacity: '34 tons', status: 'Active', purchaseDate: '2023-03-01', purchasePrice: 750000, lastServiceDate: '2025-01-10', linkedTruck: 'TA-003' },
    ]
  }
};

// Initial Jobs Data
const initialJobs = {
  '1': { // Transhaul - Haulage
    jobs: [
      { id: '1', jobNo: 'JOB-2025-001', date: '2025-01-15', customer: 'ABC Mining Ltd', loadType: 'Coal', origin: 'Durban Port', destination: 'Johannesburg Depot', distance: 580, truck: 'TA-001', trailer: 'TR-001', driver: 'John Nkosi', status: 'Completed', revenue: 12500, fuelCost: 2450, tollCost: 580, otherCosts: 350, notes: 'Delivered on time' },
      { id: '2', jobNo: 'JOB-2025-002', date: '2025-01-16', customer: 'XYZ Construction', loadType: 'Building Materials', origin: 'Johannesburg', destination: 'Durban', distance: 580, truck: 'TA-001', trailer: 'TR-001', driver: 'John Nkosi', status: 'Completed', revenue: 11800, fuelCost: 2380, tollCost: 580, otherCosts: 280, notes: 'Return load' },
      { id: '3', jobNo: 'JOB-2025-003', date: '2025-01-17', customer: 'Fresh Produce Co', loadType: 'Fresh Produce', origin: 'Durban', destination: 'Port Elizabeth', distance: 680, truck: 'TA-002', trailer: 'TR-002', driver: 'Peter Dlamini', status: 'Completed', revenue: 15200, fuelCost: 2850, tollCost: 420, otherCosts: 520, notes: 'Temperature controlled' },
      { id: '4', jobNo: 'JOB-2025-004', date: '2025-01-18', customer: 'Steel Works SA', loadType: 'Steel Coils', origin: 'Vanderbijlpark', destination: 'Durban Port', distance: 520, truck: 'TA-003', trailer: 'TR-003', driver: 'Sipho Mbeki', status: 'Completed', revenue: 18500, fuelCost: 2680, tollCost: 650, otherCosts: 420, notes: 'Heavy load - special permit' },
      { id: '5', jobNo: 'JOB-2025-005', date: '2025-01-20', customer: 'ABC Mining Ltd', loadType: 'Equipment', origin: 'Durban', destination: 'Bloemfontein', distance: 620, truck: 'TA-001', trailer: 'TR-001', driver: 'John Nkosi', status: 'In Transit', revenue: 14200, fuelCost: 0, tollCost: 0, otherCosts: 0, notes: 'ETA: 2025-01-21' },
      { id: '6', jobNo: 'JOB-2025-006', date: '2025-01-22', customer: 'Retail Giants', loadType: 'General Cargo', origin: 'Johannesburg', destination: 'Cape Town', distance: 1400, truck: 'TA-002', trailer: 'TR-002', driver: 'Peter Dlamini', status: 'Scheduled', revenue: 28000, fuelCost: 0, tollCost: 0, otherCosts: 0, notes: 'Long haul - 2 days' },
    ]
  }
};

// Asset Categories for Depreciation
const assetCategories = [
  { id: 'vehicles', name: 'Motor Vehicles', defaultLife: 5, defaultMethod: 'Straight Line' },
  { id: 'trailers', name: 'Trailers', defaultLife: 10, defaultMethod: 'Straight Line' },
  { id: 'machinery', name: 'Machinery & Equipment', defaultLife: 8, defaultMethod: 'Reducing Balance' },
  { id: 'computers', name: 'Computer Equipment', defaultLife: 3, defaultMethod: 'Straight Line' },
  { id: 'furniture', name: 'Furniture & Fittings', defaultLife: 6, defaultMethod: 'Straight Line' },
  { id: 'buildings', name: 'Buildings', defaultLife: 20, defaultMethod: 'Straight Line' },
  { id: 'leasehold', name: 'Leasehold Improvements', defaultLife: 5, defaultMethod: 'Straight Line' },
  { id: 'tools', name: 'Tools & Equipment', defaultLife: 5, defaultMethod: 'Reducing Balance' },
];

const depreciationMethods = [
  { id: 'straight', name: 'Straight Line', description: 'Equal amounts each year' },
  { id: 'reducing', name: 'Reducing Balance', description: 'Percentage of book value' },
  { id: 'units', name: 'Units of Production', description: 'Based on usage/output' },
  { id: 'sumYears', name: 'Sum of Years Digits', description: 'Accelerated depreciation' },
];

// Initial Depreciation Assets Data
const initialAssets = {
  '1': [ // Transhaul - Haulage
    {
      id: '1', assetCode: 'VEH-001', name: 'UD Quester GWE 420 - TA-001', category: 'vehicles',
      description: 'Horse truck for long haul operations', location: 'Durban Depot',
      supplier: 'UD Trucks SA', invoiceNo: 'INV-2022-0145',
      purchaseDate: '2022-03-15', purchaseCost: 1850000, residualValue: 185000,
      usefulLife: 5, depreciationMethod: 'straight', depreciationRate: 20,
      accumulatedDepreciation: 998000, bookValue: 852000,
      lastDepreciationDate: '2025-01-31', status: 'Active',
      linkedFleetNo: 'TA-001'
    },
    {
      id: '2', assetCode: 'VEH-002', name: 'UD Quester GWE 420 - TA-002', category: 'vehicles',
      description: 'Horse truck for regional deliveries', location: 'Durban Depot',
      supplier: 'UD Trucks SA', invoiceNo: 'INV-2022-0198',
      purchaseDate: '2022-06-20', purchaseCost: 1850000, residualValue: 185000,
      usefulLife: 5, depreciationMethod: 'straight', depreciationRate: 20,
      accumulatedDepreciation: 887000, bookValue: 963000,
      lastDepreciationDate: '2025-01-31', status: 'Active',
      linkedFleetNo: 'TA-002'
    },
    {
      id: '3', assetCode: 'VEH-003', name: 'Mercedes-Benz Actros 2645 - TA-003', category: 'vehicles',
      description: 'Premium horse for special loads', location: 'Johannesburg Depot',
      supplier: 'Mercedes-Benz SA', invoiceNo: 'MB-2023-0567',
      purchaseDate: '2023-02-10', purchaseCost: 2450000, residualValue: 245000,
      usefulLife: 5, depreciationMethod: 'straight', depreciationRate: 20,
      accumulatedDepreciation: 931000, bookValue: 1519000,
      lastDepreciationDate: '2025-01-31', status: 'Active',
      linkedFleetNo: 'TA-003'
    },
    {
      id: '4', assetCode: 'TRL-001', name: 'SA Truck Bodies Side Tipper 40m³', category: 'trailers',
      description: 'Side tipper trailer for aggregate transport', location: 'Durban Depot',
      supplier: 'SA Truck Bodies', invoiceNo: 'SATB-2022-0234',
      purchaseDate: '2022-04-01', purchaseCost: 680000, residualValue: 68000,
      usefulLife: 10, depreciationMethod: 'straight', depreciationRate: 10,
      accumulatedDepreciation: 183600, bookValue: 496400,
      lastDepreciationDate: '2025-01-31', status: 'Active',
      linkedFleetNo: 'TR-001'
    },
    {
      id: '5', assetCode: 'TRL-002', name: 'Henred Fruehauf Superlink Flatbed', category: 'trailers',
      description: 'Flatbed trailer for general cargo', location: 'Durban Depot',
      supplier: 'Henred Fruehauf', invoiceNo: 'HF-2022-0891',
      purchaseDate: '2022-05-15', purchaseCost: 520000, residualValue: 52000,
      usefulLife: 10, depreciationMethod: 'straight', depreciationRate: 10,
      accumulatedDepreciation: 136500, bookValue: 383500,
      lastDepreciationDate: '2025-01-31', status: 'Active',
      linkedFleetNo: 'TR-002'
    },
    {
      id: '6', assetCode: 'COMP-001', name: 'Fleet Management Server', category: 'computers',
      description: 'Dell PowerEdge server for fleet tracking', location: 'Head Office',
      supplier: 'Dell Technologies', invoiceNo: 'DELL-2023-4521',
      purchaseDate: '2023-01-10', purchaseCost: 125000, residualValue: 12500,
      usefulLife: 3, depreciationMethod: 'straight', depreciationRate: 33.33,
      accumulatedDepreciation: 75000, bookValue: 50000,
      lastDepreciationDate: '2025-01-31', status: 'Active',
      linkedFleetNo: null
    },
    {
      id: '7', assetCode: 'FURN-001', name: 'Office Furniture Set', category: 'furniture',
      description: 'Executive desks, chairs, cabinets', location: 'Head Office',
      supplier: 'Office National', invoiceNo: 'ON-2021-1234',
      purchaseDate: '2021-08-01', purchaseCost: 85000, residualValue: 8500,
      usefulLife: 6, depreciationMethod: 'straight', depreciationRate: 16.67,
      accumulatedDepreciation: 44625, bookValue: 40375,
      lastDepreciationDate: '2025-01-31', status: 'Active',
      linkedFleetNo: null
    },
    {
      id: '8', assetCode: 'TOOL-001', name: 'Workshop Tools & Equipment', category: 'tools',
      description: 'Hydraulic jacks, diagnostic equipment, hand tools', location: 'Durban Workshop',
      supplier: 'Snap-On Tools', invoiceNo: 'SNAP-2022-0876',
      purchaseDate: '2022-02-01', purchaseCost: 245000, residualValue: 24500,
      usefulLife: 5, depreciationMethod: 'reducing', depreciationRate: 25,
      accumulatedDepreciation: 138281, bookValue: 106719,
      lastDepreciationDate: '2025-01-31', status: 'Active',
      linkedFleetNo: null
    },
  ]
};

// Year-over-Year Data
const yoyData = {
  '1': {
    '2023': { revenue: 3200000, expenses: 2850000, profit: 350000 },
    '2024': { revenue: 3800000, expenses: 3200000, profit: 600000 },
    '2025': { revenue: 4500000, expenses: 3650000, profit: 850000 }, // Budget
    '2025-YTD': { revenue: 1283320, expenses: 1098690, profit: 184630 }, // Actual YTD
  },
  '2': {
    '2023': { revenue: 38000000, expenses: 34500000, profit: 3500000 },
    '2024': { revenue: 42000000, expenses: 37800000, profit: 4200000 },
    '2025': { revenue: 45000000, expenses: 40200000, profit: 4800000 },
    '2025-YTD': { revenue: 12700000, expenses: 11450000, profit: 1250000 },
  },
  '3': {
    '2023': { revenue: 10500000, expenses: 9200000, profit: 1300000 },
    '2024': { revenue: 11800000, expenses: 10100000, profit: 1700000 },
    '2025': { revenue: 12500000, expenses: 10800000, profit: 1700000 },
    '2025-YTD': { revenue: 3210000, expenses: 2850000, profit: 360000 },
  }
};

// ============================================
// ICONS
// ============================================
const Icons = {
  Building: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>,
  Truck: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18h2"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/><path d="M14 18H9"/><path d="M14 8h4l3 3v5h-2"/></svg>,
  GraduationCap: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>,
  Plus: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>,
  Edit: () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>,
  Trash: () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>,
  Download: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>,
  DollarSign: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  TrendingUp: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>,
  TrendingDown: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/></svg>,
  BarChart: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>,
  Users: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>,
  FileText: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>,
  Settings: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>,
  ChevronDown: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>,
  X: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  Check: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>,
  Home: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Wrench: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  Fuel: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 22V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M15 22H3"/><path d="M18 8h2a2 2 0 0 1 2 2v8"/><path d="M22 12h-4"/><circle cx="7" cy="10" r="2"/></svg>,
  Wallet: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>,
  Clipboard: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>,
  Target: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  Calculator: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>,
  Calendar: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M16 2v4"/><path d="M8 2v4"/></svg>,
  Filter: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  ArrowUpRight: () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>,
  ArrowDownRight: () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7 7 10 10"/><path d="M17 7v10H7"/></svg>,
  Printer: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>,
  FileDown: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>,
  TrendingDownRight: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>,
  Layers: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>,
  Percent: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
  Receipt: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg>,
  RefreshCw: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>,
  HardHat: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><path d="M14 6a6 6 0 0 1 6 6v3"/></svg>,
  Package: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg>,
  BookOpen: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>,
  Briefcase: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3"/></svg>,
  Shield: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>,
  Monitor: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>,
  Phone: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  Zap: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>,
  CreditCard: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>,
  MapPin: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>,
  Circle: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>,
  MoreHorizontal: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>,
  LogOut: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>,
};

// ============================================
// COMPONENTS
// ============================================

const Badge = ({ children, variant = 'default' }) => {
  const variants = { 
    default: 'bg-slate-900 text-white', secondary: 'bg-slate-100 text-slate-900', 
    success: 'bg-emerald-100 text-emerald-700', warning: 'bg-amber-100 text-amber-700', 
    info: 'bg-blue-100 text-blue-700', danger: 'bg-red-100 text-red-700',
    purple: 'bg-purple-100 text-purple-700',
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>{children}</span>;
};

const KPICard = ({ title, value, icon, color = 'emerald', trend, trendLabel }) => {
  const colors = { emerald: 'bg-emerald-100 text-emerald-600', blue: 'bg-blue-100 text-blue-600', amber: 'bg-amber-100 text-amber-600', red: 'bg-red-100 text-red-600', purple: 'bg-purple-100 text-purple-600' };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[color]}`}>{icon}</div>
        <div className="flex-1">
          <p className="text-xs text-slate-500 mb-1">{title}</p>
          <p className="text-lg font-bold text-slate-900">{value}</p>
          {trend !== undefined && (
            <div className={`flex items-center gap-1 text-xs mt-1 ${trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {trend >= 0 ? <Icons.ArrowUpRight /> : <Icons.ArrowDownRight />}
              <span>{trend >= 0 ? '+' : ''}{trend.toFixed(1)}%</span>
              {trendLabel && <span className="text-slate-400">{trendLabel}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const VarianceCard = ({ title, budget, actual, showPercentage = true }) => {
  const variance = actual - budget;
  const variancePercent = budget ? ((variance / budget) * 100) : 0;
  const isOver = variance > 0;
  const isRevenue = title.toLowerCase().includes('revenue');
  const isFavorable = isRevenue ? !isOver : isOver;
  
  return (
    <div className="bg-white rounded-xl border p-4">
      <p className="text-sm text-slate-500 mb-2">{title}</p>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-xs text-slate-400">Budget</p>
          <p className="font-semibold">R {budget.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Actual</p>
          <p className="font-semibold">R {actual.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Variance</p>
          <p className={`font-bold ${isFavorable ? 'text-red-600' : 'text-emerald-600'}`}>
            {variance >= 0 ? '+' : ''}R {variance.toLocaleString()}
            {showPercentage && <span className="text-xs ml-1">({variancePercent >= 0 ? '+' : ''}{variancePercent.toFixed(1)}%)</span>}
          </p>
        </div>
      </div>
    </div>
  );
};

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className={`bg-white rounded-xl shadow-xl ${sizes[size]} w-full max-h-[90vh] overflow-y-auto`}>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><Icons.X /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

const FormField = ({ label, children, required }) => (
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1">{label}{required && <span className="text-red-500">*</span>}</label>
    {children}
  </div>
);

const Input = ({ ...props }) => (
  <input {...props} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
);

const Select = ({ children, ...props }) => (
  <select {...props} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm">
    {children}
  </select>
);

const Textarea = (props) => (
  <textarea {...props} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" rows={3} />
);

// Company Selector
const CompanySelector = ({ companies, selectedCompany, onSelect, onManage }) => {
  const [isOpen, setIsOpen] = useState(false);
  const config = industryConfig[selectedCompany?.industry] || industryConfig.haulage;
  
  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-all shadow-sm w-full">
        <div className={`p-2 rounded-lg bg-gradient-to-br ${config.color} text-white`}>
          {Icons[config.icon] ? Icons[config.icon]() : <Icons.Building />}
        </div>
        <div className="flex-1 text-left">
          <p className="font-semibold text-slate-900">{selectedCompany?.tradingAs || selectedCompany?.name}</p>
          <p className="text-xs text-slate-500">{config.label}</p>
        </div>
        <Icons.ChevronDown />
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <p className="text-xs font-medium text-slate-500 px-2">SELECT COMPANY</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {companies.map(company => {
              const compConfig = industryConfig[company.industry] || industryConfig.haulage;
              return (
                <button key={company.id} onClick={() => { onSelect(company); setIsOpen(false); }}
                  className={`flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50 transition-colors ${company.id === selectedCompany?.id ? 'bg-blue-50' : ''}`}>
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${compConfig.color} text-white`}>
                    {Icons[compConfig.icon] ? Icons[compConfig.icon]() : <Icons.Building />}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-slate-900">{company.tradingAs || company.name}</p>
                    <p className="text-xs text-slate-500">{compConfig.label}</p>
                  </div>
                  {company.id === selectedCompany?.id && <Icons.Check />}
                </button>
              );
            })}
          </div>
          <div className="p-2 border-t border-slate-100">
            <button onClick={() => { onManage(); setIsOpen(false); }} className="flex items-center gap-2 w-full px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg text-sm font-medium">
              <Icons.Settings />Manage Companies
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Export Utilities
const exportToPDF = (title, headers, data, company, period = '') => {
  // Create a printable HTML document
  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #1e3a5f; font-size: 24px; margin-bottom: 5px; }
        h2 { color: #64748b; font-size: 14px; font-weight: normal; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #1e3a5f; color: white; padding: 10px; text-align: left; font-size: 12px; }
        td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
        tr:nth-child(even) { background: #f8fafc; }
        .text-right { text-align: right; }
        .footer { margin-top: 30px; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        .total-row { background: #dbeafe !important; font-weight: bold; }
        .header-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .company-name { font-size: 18px; font-weight: bold; color: #1e3a5f; }
        .report-date { font-size: 12px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="header-info">
        <div>
          <div class="company-name">${company?.tradingAs || company?.name || 'Company'}</div>
          <div class="report-date">${period}</div>
        </div>
        <div class="report-date">Generated: ${new Date().toLocaleDateString('en-ZA')}</div>
      </div>
      <h1>${title}</h1>
      <table>
        <thead>
          <tr>
            ${headers.map(h => `<th class="${h.align === 'right' ? 'text-right' : ''}">${h.label}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data.map((row, idx) => `
            <tr class="${row.isTotal ? 'total-row' : ''}">
              ${headers.map(h => `<td class="${h.align === 'right' ? 'text-right' : ''}">${row[h.key] !== undefined ? row[h.key] : ''}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="footer">
        <p>ProcureFlow Job Costing System • ${company?.tradingAs || company?.name} • Report generated on ${new Date().toLocaleString('en-ZA')}</p>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(printContent);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);
};

const exportToExcel = (title, headers, data, company, period = '') => {
  // Create CSV content
  const csvHeaders = headers.map(h => h.label).join(',');
  const csvRows = data.map(row => 
    headers.map(h => {
      let val = row[h.key] !== undefined ? row[h.key] : '';
      // Escape commas and quotes
      if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(',')
  ).join('\n');

  const csvContent = `${company?.tradingAs || company?.name || 'Company'}\n${title}\n${period}\nGenerated: ${new Date().toLocaleDateString('en-ZA')}\n\n${csvHeaders}\n${csvRows}`;

  // Create download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Print current view with charts - converts SVGs to images for reliable PDF export
const printWithCharts = async (elementId, title, company, period = '') => {
  const element = document.getElementById(elementId);
  if (!element) {
    alert('Report content not found');
    return;
  }

  // Show loading indicator
  const loadingDiv = document.createElement('div');
  loadingDiv.innerHTML = '<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999"><div style="background:white;padding:30px;border-radius:10px;text-align:center"><div style="font-size:18px;margin-bottom:10px">Preparing PDF...</div><div style="color:#666">Converting charts to images</div></div></div>';
  document.body.appendChild(loadingDiv);

  try {
    // Clone the element to work with
    const clone = element.cloneNode(true);
    
    // Find all SVG charts in the original element and convert to images
    const svgs = element.querySelectorAll('svg.recharts-surface');
    const cloneSvgs = clone.querySelectorAll('svg.recharts-surface');
    
    for (let i = 0; i < svgs.length; i++) {
      try {
        const svg = svgs[i];
        const cloneSvg = cloneSvgs[i];
        
        // Get the parent recharts-wrapper for dimensions
        const wrapper = svg.closest('.recharts-wrapper');
        const width = wrapper ? wrapper.offsetWidth : svg.getBoundingClientRect().width;
        const height = wrapper ? wrapper.offsetHeight : svg.getBoundingClientRect().height;
        
        // Create a new SVG with proper dimensions and styling
        const svgClone = svg.cloneNode(true);
        svgClone.setAttribute('width', width);
        svgClone.setAttribute('height', height);
        svgClone.style.backgroundColor = 'white';
        
        // Serialize SVG
        const svgData = new XMLSerializer().serializeToString(svgClone);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        
        // Create image from SVG
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = url;
        });
        
        // Create canvas and draw image
        const canvas = document.createElement('canvas');
        canvas.width = width * 2; // 2x for better quality
        canvas.height = height * 2;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/png');
        
        // Replace SVG with image in clone
        const imgElement = document.createElement('img');
        imgElement.src = dataUrl;
        imgElement.style.width = width + 'px';
        imgElement.style.height = height + 'px';
        imgElement.style.display = 'block';
        imgElement.style.margin = '0 auto';
        
        // Find the recharts-wrapper in clone and replace its content
        const cloneWrapper = cloneSvg.closest('.recharts-wrapper');
        if (cloneWrapper) {
          cloneWrapper.innerHTML = '';
          cloneWrapper.appendChild(imgElement);
        }
        
        URL.revokeObjectURL(url);
      } catch (e) {
        console.log('Chart conversion error:', e);
      }
    }

    // Now open print window with converted content
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          @media print {
            body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .chart-container, .bg-white { break-inside: avoid; page-break-inside: avoid; }
          }
          * { box-sizing: border-box; }
          body { 
            font-family: Arial, sans-serif; 
            padding: 20px; 
            margin: 0;
            max-width: 1100px;
            margin: 0 auto;
          }
          .print-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 3px solid #1e3a5f;
          }
          .company-name { font-size: 22px; font-weight: bold; color: #1e3a5f; }
          .report-title { font-size: 18px; color: #475569; margin-top: 5px; }
          .report-date { font-size: 12px; color: #64748b; }
          .print-content { margin-top: 20px; }
          
          /* KPI Cards */
          .grid { display: grid; gap: 15px; margin-bottom: 20px; }
          .grid-cols-1 { grid-template-columns: 1fr; }
          .md\\:grid-cols-4, .grid-cols-4 { grid-template-columns: repeat(4, 1fr); }
          .md\\:grid-cols-5, .grid-cols-5 { grid-template-columns: repeat(5, 1fr); }
          .lg\\:grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
          .gap-4 { gap: 15px; }
          .gap-6 { gap: 20px; }
          
          /* Card styling */
          .bg-white { background: white; }
          .rounded-xl { border-radius: 12px; }
          .border { border: 1px solid #e2e8f0; }
          .p-4, .p-5 { padding: 15px; }
          .p-6 { padding: 20px; }
          .shadow-sm { box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
          
          /* Tables */
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background: #1e3a5f !important; color: white !important; padding: 10px; text-align: left; font-size: 11px; }
          td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
          tr:nth-child(even) { background: #f8fafc !important; }
          
          /* Chart containers */
          .chart-container, .recharts-wrapper { 
            margin: 15px 0;
            text-align: center;
          }
          .recharts-wrapper img {
            max-width: 100%;
            height: auto;
          }
          
          /* Typography */
          .font-semibold { font-weight: 600; }
          .font-bold { font-weight: 700; }
          .text-sm { font-size: 12px; }
          .text-xs { font-size: 10px; }
          .text-2xl { font-size: 20px; }
          .text-3xl { font-size: 24px; }
          .text-slate-500 { color: #64748b; }
          .text-slate-600 { color: #475569; }
          .text-slate-900 { color: #0f172a; }
          .text-blue-600 { color: #2563eb; }
          .text-emerald-600 { color: #059669; }
          .text-red-600 { color: #dc2626; }
          .text-amber-600 { color: #d97706; }
          .text-right { text-align: right; }
          
          /* Badges */
          .inline-flex { display: inline-flex; }
          .rounded-full { border-radius: 9999px; }
          .px-2 { padding-left: 8px; padding-right: 8px; }
          .py-0\\.5 { padding-top: 2px; padding-bottom: 2px; }
          .bg-emerald-100 { background: #d1fae5; }
          .bg-red-100 { background: #fee2e2; }
          .bg-blue-100 { background: #dbeafe; }
          
          /* Spacing */
          .space-y-6 > * + * { margin-top: 20px; }
          .space-y-4 > * + * { margin-top: 15px; }
          .space-y-3 > * + * { margin-top: 12px; }
          .mb-4 { margin-bottom: 15px; }
          .mt-1 { margin-top: 4px; }
          
          .footer { 
            margin-top: 30px; 
            font-size: 10px; 
            color: #64748b; 
            border-top: 1px solid #e2e8f0; 
            padding-top: 10px;
          }
          
          /* Hide interactive elements */
          button, .no-print, select { display: none !important; }
          
          /* Flex utilities */
          .flex { display: flex; }
          .items-center { align-items: center; }
          .justify-between { justify-content: space-between; }
          .flex-1 { flex: 1; }
        </style>
      </head>
      <body>
        <div class="print-header">
          <div>
            <div class="company-name">${company?.tradingAs || company?.name || 'Company'}</div>
            <div class="report-title">${title}</div>
            ${period ? `<div class="report-date" style="margin-top:5px">${period}</div>` : ''}
          </div>
          <div style="text-align:right">
            <div class="report-date">Generated: ${new Date().toLocaleDateString('en-ZA')}</div>
            <div class="report-date">${new Date().toLocaleTimeString('en-ZA')}</div>
          </div>
        </div>
        <div class="print-content">
          ${clone.innerHTML}
        </div>
        <div class="footer">
          <p>ProcureFlow Job Costing System • ${company?.tradingAs || company?.name} • Report generated on ${new Date().toLocaleString('en-ZA')}</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    
    // Wait for images to load then print
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 800);
    
  } catch (e) {
    console.error('Print error:', e);
    alert('Error preparing PDF. Please try again.');
  } finally {
    document.body.removeChild(loadingDiv);
  }
};

const ExportButtons = ({ onPDF, onExcel, onPrintWithCharts }) => (
  <div className="flex gap-2">
    {onPrintWithCharts && (
      <button onClick={onPrintWithCharts} className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
        <Icons.Printer />Print Report
      </button>
    )}
    <button onClick={onPDF} className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"><Icons.FileDown />PDF</button>
    <button onClick={onExcel} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"><Icons.Download />Excel</button>
  </div>
);

// Module Icons
const getModuleIcon = (module) => {
  const icons = {
    dashboard: <Icons.Home />, fleet: <Icons.Truck />, jobs: <Icons.Clipboard />,
    'cost-analysis': <Icons.Calculator />,
    actuals: <Icons.Wallet />, budgets: <Icons.Target />, 'budgeted-revenue': <Icons.DollarSign />,
    reports: <Icons.BarChart />,
    projects: <Icons.Building />, programs: <Icons.GraduationCap />,
    depreciation: <Icons.TrendingDownRight />,
  };
  return icons[module] || <Icons.FileText />;
};

// ============================================
// MAIN APP COMPONENT
// ============================================

export default function MultiCompanyJobCosting() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle', 'syncing', 'synced', 'error'
  
  // Initialize with defaults - will be overwritten by saved data
  const [companies, setCompanies] = useState(initialCompanies);
  const [selectedCompany, setSelectedCompany] = useState(initialCompanies[0]);
  const [activeModule, setActiveModule] = useState('dashboard');
  const [showManageCompanies, setShowManageCompanies] = useState(false);
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [budgets, setBudgets] = useState(initialBudgets);
  const [actuals, setActuals] = useState(initialActuals);
  const [fleet, setFleet] = useState(initialFleet);
  const [jobs, setJobs] = useState(initialJobs);
  const [budgetedRevenue, setBudgetedRevenue] = useState(initialBudgetedRevenue);
  const [assets, setAssets] = useState(initialAssets);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [editAsset, setEditAsset] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [newCompany, setNewCompany] = useState({
    name: '',
    tradingAs: '',
    code: '',
    regNo: '',
    vatNo: '',
    industry: 'haulage',
    status: 'Active'
  });

  // Initialize Firebase and load data on mount
  useEffect(() => {
    const initApp = async () => {
      // Initialize Firebase
      const firebaseReady = initializeFirebase();
      setCloudEnabled(firebaseReady);
      
      // Check auth
      const user = authStorage.getCurrentUser();
      if (user) {
        setCurrentUser(user);
        
        // Try to load from cloud first if Firebase is available
        if (firebaseReady) {
          setSyncStatus('syncing');
          const cloudData = await dataStorage.syncFromCloud(user.id);
          if (cloudData) {
            if (cloudData.companies) setCompanies(cloudData.companies);
            if (cloudData.budgets) setBudgets(cloudData.budgets);
            if (cloudData.actuals) setActuals(cloudData.actuals);
            if (cloudData.fleet) setFleet(cloudData.fleet);
            if (cloudData.jobs) setJobs(cloudData.jobs);
            if (cloudData.budgetedRevenue) setBudgetedRevenue(cloudData.budgetedRevenue);
            if (cloudData.assets) setAssets(cloudData.assets);
            
            const comps = cloudData.companies || initialCompanies;
            if (cloudData.selectedCompanyId) {
              const found = comps.find(c => c.id === cloudData.selectedCompanyId);
              if (found) setSelectedCompany(found);
            }
            setSyncStatus('synced');
            setDataLoaded(true);
            setAuthLoading(false);
            return;
          }
          setSyncStatus('idle');
        }
      }
      
      // Fall back to local storage
      const savedData = dataStorage.loadAllData();
      if (savedData.companies) setCompanies(savedData.companies);
      if (savedData.budgets) setBudgets(savedData.budgets);
      if (savedData.actuals) setActuals(savedData.actuals);
      if (savedData.fleet) setFleet(savedData.fleet);
      if (savedData.jobs) setJobs(savedData.jobs);
      if (savedData.budgetedRevenue) setBudgetedRevenue(savedData.budgetedRevenue);
      if (savedData.assets) setAssets(savedData.assets);
      
      const comps = savedData.companies || initialCompanies;
      if (savedData.selectedCompanyId) {
        const found = comps.find(c => c.id === savedData.selectedCompanyId);
        if (found) setSelectedCompany(found);
      }
      
      setDataLoaded(true);
      setAuthLoading(false);
    };
    
    initApp();
  }, []);

  // Helper function to save data (local + cloud)
  const saveDataWithSync = async (key, value) => {
    // Save locally first
    dataStorage.saveData(key, value);
    setLastSaved(new Date());
    
    // Then sync to cloud if available
    if (cloudEnabled && currentUser) {
      setSyncStatus('syncing');
      const success = await cloudStorage.saveData(currentUser.id, key, value);
      setSyncStatus(success ? 'synced' : 'error');
    }
  };

  // Auto-save all data whenever it changes
  useEffect(() => {
    if (dataLoaded) {
      saveDataWithSync('companies', companies);
    }
  }, [companies, dataLoaded]);

  useEffect(() => {
    if (dataLoaded && selectedCompany) {
      saveDataWithSync('selectedCompanyId', selectedCompany.id);
    }
  }, [selectedCompany, dataLoaded]);

  useEffect(() => {
    if (dataLoaded) {
      saveDataWithSync('budgets', budgets);
    }
  }, [budgets, dataLoaded]);

  useEffect(() => {
    if (dataLoaded) {
      saveDataWithSync('actuals', actuals);
    }
  }, [actuals, dataLoaded]);

  useEffect(() => {
    if (dataLoaded) {
      saveDataWithSync('fleet', fleet);
    }
  }, [fleet, dataLoaded]);

  useEffect(() => {
    if (dataLoaded) {
      saveDataWithSync('jobs', jobs);
    }
  }, [jobs, dataLoaded]);

  useEffect(() => {
    if (dataLoaded) {
      saveDataWithSync('budgetedRevenue', budgetedRevenue);
    }
  }, [budgetedRevenue, dataLoaded]);

  useEffect(() => {
    if (dataLoaded) {
      saveDataWithSync('assets', assets);
    }
  }, [assets, dataLoaded]);

  // Handle logout
  const handleLogout = () => {
    if (confirm('Are you sure you want to sign out?')) {
      authStorage.clearCurrentUser();
      setCurrentUser(null);
    }
  };

  // Show loading while checking auth and loading data
  if (authLoading || !dataLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl mb-4 animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <p className="text-blue-200">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!currentUser) {
    return <AuthScreen onLogin={setCurrentUser} />;
  }

  // Handle adding a new company
  const handleAddCompany = () => {
    if (!newCompany.name || !newCompany.code) {
      alert('Please fill in Company Name and Company Code');
      return;
    }
    
    const companyId = String(Date.now());
    const company = {
      id: companyId,
      ...newCompany
    };
    
    setCompanies([...companies, company]);
    
    // Initialize empty data for the new company
    setBudgets(prev => ({ ...prev, [companyId]: { annual: {}, monthly: {} } }));
    setActuals(prev => ({ ...prev, [companyId]: { monthly: {}, byTruck: {}, byRoute: {} } }));
    setFleet(prev => ({ ...prev, [companyId]: { trucks: [], trailers: [] } }));
    setJobs(prev => ({ ...prev, [companyId]: { jobs: [] } }));
    setBudgetedRevenue(prev => ({ ...prev, [companyId]: { monthly: {}, byTruck: {}, byTrip: [], annual: {} } }));
    setAssets(prev => ({ ...prev, [companyId]: [] }));
    
    // Reset form and close modal
    setNewCompany({
      name: '',
      tradingAs: '',
      code: '',
      regNo: '',
      vatNo: '',
      industry: 'haulage',
      status: 'Active'
    });
    setShowAddCompany(false);
    
    // Select the new company
    setSelectedCompany(company);
  };

  // Handle deleting a company
  const handleDeleteCompany = (companyId) => {
    if (companies.length <= 1) {
      alert('Cannot delete the last company. At least one company must exist.');
      return;
    }
    
    const companyToDelete = companies.find(c => c.id === companyId);
    if (!confirm(`Are you sure you want to delete "${companyToDelete?.name}"?\n\nThis will permanently remove all associated data including budgets, actuals, fleet, jobs, and assets.`)) {
      return;
    }
    
    // Remove company from list
    const updatedCompanies = companies.filter(c => c.id !== companyId);
    setCompanies(updatedCompanies);
    
    // Clean up associated data
    setBudgets(prev => {
      const { [companyId]: _, ...rest } = prev;
      return rest;
    });
    setActuals(prev => {
      const { [companyId]: _, ...rest } = prev;
      return rest;
    });
    setFleet(prev => {
      const { [companyId]: _, ...rest } = prev;
      return rest;
    });
    setJobs(prev => {
      const { [companyId]: _, ...rest } = prev;
      return rest;
    });
    setBudgetedRevenue(prev => {
      const { [companyId]: _, ...rest } = prev;
      return rest;
    });
    setAssets(prev => {
      const { [companyId]: _, ...rest } = prev;
      return rest;
    });
    
    // If deleted company was selected, select another one
    if (selectedCompany?.id === companyId) {
      setSelectedCompany(updatedCompanies[0]);
    }
  };

  const config = industryConfig[selectedCompany?.industry] || industryConfig.haulage;

  const renderModuleContent = () => {
    const categories = getIndustryCategories(selectedCompany?.industry);
    
    switch (activeModule) {
      case 'dashboard':
        return <DashboardModule company={selectedCompany} config={config} budgets={budgets} actuals={actuals} categories={categories} />;
      case 'fleet':
        return <FleetModule 
          company={selectedCompany} 
          config={config} 
          fleet={fleet[selectedCompany.id] || { trucks: [], trailers: [] }}
          setFleet={(newFleet) => setFleet({...fleet, [selectedCompany.id]: newFleet})}
        />;
      case 'jobs':
        return <JobsModule 
          company={selectedCompany} 
          config={config} 
          jobs={jobs[selectedCompany.id]?.jobs || []}
          setJobs={(newJobs) => setJobs({...jobs, [selectedCompany.id]: { jobs: newJobs }})}
          fleet={fleet[selectedCompany.id] || { trucks: [], trailers: [] }}
        />;
      case 'actuals':
        return <ActualsModule company={selectedCompany} config={config} actuals={actuals} setActuals={setActuals} categories={categories} />;
      case 'budgets':
        return <BudgetsModule company={selectedCompany} config={config} budgets={budgets} setBudgets={setBudgets} categories={categories} />;
      case 'budgeted-revenue':
        return <BudgetedRevenueModule
          company={selectedCompany}
          config={config}
          budgetedRevenue={budgetedRevenue}
          setBudgetedRevenue={setBudgetedRevenue}
          budgets={budgets}
          actuals={actuals}
          fleet={fleet[selectedCompany.id] || { trucks: [], trailers: [] }}
        />;
      case 'depreciation':
        return <DepreciationModule 
          company={selectedCompany} 
          config={config} 
          assets={assets[selectedCompany.id] || []} 
          setAssets={(newAssets) => setAssets({...assets, [selectedCompany.id]: newAssets})}
          showModal={showAssetModal}
          setShowModal={setShowAssetModal}
          editAsset={editAsset}
          setEditAsset={setEditAsset}
        />;
      case 'reports':
        return <ReportsModule company={selectedCompany} config={config} budgets={budgets} actuals={actuals} yoyData={yoyData} assets={assets[selectedCompany.id] || []} categories={categories} />;
      case 'cost-analysis':
        return <CostAnalysisModule
          company={selectedCompany}
          config={config}
          jobs={jobs[selectedCompany.id]?.jobs || []}
          fleet={fleet[selectedCompany.id] || { trucks: [], trailers: [] }}
          actuals={actuals}
          budgets={budgets}
        />;
      case 'projects':
        return <ProjectsModule company={selectedCompany} config={config} budgets={budgets} actuals={actuals} categories={categories} />;
      case 'programs':
        return <ProgramsModule company={selectedCompany} config={config} budgets={budgets} actuals={actuals} categories={categories} />;
      default:
        return (
          <div className="bg-white rounded-xl border shadow-sm p-8 text-center">
            <div className="p-4 bg-slate-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              {getModuleIcon(activeModule)}
            </div>
            <h3 className="text-xl font-semibold mb-2 capitalize">{activeModule}</h3>
            <p className="text-slate-500">Module content for {activeModule}</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-slate-900">ProcureFlow</h1>
              <Badge variant="info">Multi-Company</Badge>
            </div>
            <div className="flex items-center gap-4">
              {/* Sync Status Indicator */}
              <div className="hidden md:flex items-center gap-2 text-xs px-3 py-1.5 rounded-full">
                {syncStatus === 'syncing' && (
                  <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
                    <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    <span>Syncing...</span>
                  </div>
                )}
                {syncStatus === 'synced' && cloudEnabled && (
                  <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6 9 17l-5-5"/>
                    </svg>
                    <span>Cloud Synced</span>
                  </div>
                )}
                {(syncStatus === 'idle' || !cloudEnabled) && lastSaved && (
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6 9 17l-5-5"/>
                    </svg>
                    <span>Saved Locally</span>
                  </div>
                )}
                {syncStatus === 'error' && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1.5 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>
                    </svg>
                    <span>Sync Error</span>
                  </div>
                )}
              </div>
              <div className="w-72">
                <CompanySelector companies={companies} selectedCompany={selectedCompany} onSelect={setSelectedCompany} onManage={() => setShowManageCompanies(true)} />
              </div>
              {/* User Menu */}
              <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-slate-900">{currentUser?.name}</p>
                  <p className="text-xs text-slate-500">{currentUser?.email}</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-semibold text-sm">
                  {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Sign out"
                >
                  <Icons.LogOut />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className="w-64 flex-shrink-0">
            <nav className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden sticky top-24">
              <div className={`p-4 bg-gradient-to-r ${config.color} text-white`}>
                <p className="text-sm font-medium text-white/80">Modules</p>
                <p className="font-semibold">{config.label}</p>
              </div>
              <div className="p-2">
                {config.modules.map(module => (
                  <button key={module} onClick={() => setActiveModule(module)}
                    className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left transition-all ${
                      activeModule === module ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
                    }`}>
                    {getModuleIcon(module)}
                    <span className="capitalize">{module === 'budgeted-revenue' ? 'Budgeted Revenue' : module === 'cost-analysis' ? 'Cost Analysis' : module}</span>
                  </button>
                ))}
              </div>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {renderModuleContent()}
          </main>
        </div>
      </div>

      {/* Company Management Modal */}
      <Modal isOpen={showManageCompanies} onClose={() => setShowManageCompanies(false)} title="Manage Companies" size="lg">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-slate-600">{companies.length} companies registered</p>
            <button
              onClick={() => { setShowManageCompanies(false); setShowAddCompany(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <Icons.Plus /> Add Company
            </button>
          </div>
          <div className="space-y-3">
            {companies.map(company => {
              const compConfig = industryConfig[company.industry] || industryConfig.haulage;
              return (
                <div key={company.id} className="flex items-center gap-4 p-4 border rounded-xl hover:border-blue-300 transition-colors">
                  <div 
                    className={`p-3 rounded-lg bg-gradient-to-br ${compConfig.color} text-white cursor-pointer`}
                    onClick={() => { setSelectedCompany(company); setShowManageCompanies(false); }}
                  >
                    {Icons[compConfig.icon] ? Icons[compConfig.icon]() : <Icons.Building />}
                  </div>
                  <div 
                    className="flex-1 cursor-pointer"
                    onClick={() => { setSelectedCompany(company); setShowManageCompanies(false); }}
                  >
                    <h3 className="font-semibold">{company.name}</h3>
                    <p className="text-sm text-slate-500">{compConfig.label} • {company.code}</p>
                  </div>
                  <Badge variant={company.status === 'Active' ? 'success' : 'secondary'}>{company.status}</Badge>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteCompany(company.id); }}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete company"
                  >
                    <Icons.Trash />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* Add Company Modal */}
      <Modal isOpen={showAddCompany} onClose={() => setShowAddCompany(false)} title="Add New Company" size="lg">
        <div className="space-y-6">
          {/* Industry Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">Select Industry / Module Type</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.entries(industryConfig).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setNewCompany({ ...newCompany, industry: key })}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    newCompany.industry === key 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className={`p-3 rounded-lg bg-gradient-to-br ${cfg.color} text-white w-fit mb-2`}>
                    {Icons[cfg.icon] ? Icons[cfg.icon]() : <Icons.Building />}
                  </div>
                  <p className="font-semibold text-slate-900">{cfg.label}</p>
                  <p className="text-xs text-slate-500 mt-1">{cfg.modules.length} modules</p>
                </button>
              ))}
            </div>
          </div>

          {/* Company Details Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Company Name *</label>
              <input
                type="text"
                value={newCompany.name}
                onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                placeholder="e.g. ABC Transport Pty Ltd"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Trading As</label>
              <input
                type="text"
                value={newCompany.tradingAs}
                onChange={(e) => setNewCompany({ ...newCompany, tradingAs: e.target.value })}
                placeholder="e.g. ABC Transport"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Company Code *</label>
              <input
                type="text"
                value={newCompany.code}
                onChange={(e) => setNewCompany({ ...newCompany, code: e.target.value.toUpperCase() })}
                placeholder="e.g. ABC"
                maxLength={5}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Registration Number</label>
              <input
                type="text"
                value={newCompany.regNo}
                onChange={(e) => setNewCompany({ ...newCompany, regNo: e.target.value })}
                placeholder="e.g. 2020/123456/07"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">VAT Number</label>
              <input
                type="text"
                value={newCompany.vatNo}
                onChange={(e) => setNewCompany({ ...newCompany, vatNo: e.target.value })}
                placeholder="e.g. 4123456789"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={newCompany.status}
                onChange={(e) => setNewCompany({ ...newCompany, status: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Selected Industry Info */}
          <div className={`p-4 rounded-lg bg-gradient-to-r ${industryConfig[newCompany.industry]?.color || 'from-blue-500 to-cyan-600'} text-white`}>
            <p className="font-semibold">{industryConfig[newCompany.industry]?.label} Modules:</p>
            <p className="text-sm text-white/80 mt-1">
              {industryConfig[newCompany.industry]?.modules.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(' • ')}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={() => setShowAddCompany(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleAddCompany}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              Create Company
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============================================
// MODULE COMPONENTS
// ============================================

// Dashboard Module
const DashboardModule = ({ company, config, budgets, actuals, categories }) => {
  const [dashMonth, setDashMonth] = useState('2025-01');
  const companyBudget = budgets[company.id] || {};
  const companyActuals = actuals[company.id] || {};
  const dashboardBudget = companyBudget.monthly?.[dashMonth] || {};
  const dashboardActuals = companyActuals.monthly?.[dashMonth] || {};

  const budgetRevenue = dashboardBudget.revenue || 0;
  const actualRevenue = dashboardActuals.revenue || 0;
  const budgetExpenses = Object.entries(dashboardBudget).filter(([k]) => k !== 'revenue').reduce((s, [, v]) => s + v, 0);
  const actualExpenses = Object.entries(dashboardActuals).filter(([k]) => k !== 'revenue').reduce((s, [, v]) => s + v, 0);
  const budgetProfit = budgetRevenue - budgetExpenses;
  const actualProfit = actualRevenue - actualExpenses;
  const profitMargin = actualRevenue > 0 ? (actualProfit / actualRevenue * 100) : 0;

  // Monthly trend data (last 6 months from selected)
  const trendMonths = (() => {
    const allMonths = Object.keys(companyBudget.monthly || {}).sort();
    const idx = allMonths.indexOf(dashMonth);
    const start = Math.max(0, idx - 5);
    return allMonths.slice(start, idx + 1);
  })();

  const trendData = trendMonths.map(m => {
    const bud = companyBudget.monthly?.[m] || {};
    const act = companyActuals.monthly?.[m] || {};
    const bRev = bud.revenue || 0;
    const aRev = act.revenue || 0;
    const bExp = Object.entries(bud).filter(([k]) => k !== 'revenue').reduce((s, [, v]) => s + v, 0);
    const aExp = Object.entries(act).filter(([k]) => k !== 'revenue').reduce((s, [, v]) => s + v, 0);
    return {
      month: new Date(m + '-01').toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' }),
      budgetRev: bRev, actualRev: aRev,
      budgetProfit: bRev - bExp, actualProfit: aRev - aExp,
    };
  });

  // Get top 5 expense categories for this industry
  const topCategories = categories.slice(0, 5).map(cat => ({
    name: cat.name,
    budget: dashboardBudget[cat.id] || 0,
    actual: dashboardActuals[cat.id] || 0
  }));

  const monthLabel = getMonthLabel(dashMonth);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
          <p className="text-slate-500">{company.tradingAs || company.name} • {monthLabel}</p>
        </div>
        <div className="flex gap-3">
          <MonthYearSelector value={dashMonth} onChange={e => setDashMonth(e.target.value)} />
          <button
            onClick={() => printWithCharts('dashboard-content', 'Dashboard Summary', company, monthLabel)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
            <Icons.Printer />Print
          </button>
        </div>
      </div>

      <div id="dashboard-content">
      {/* KPI Cards - Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard title="Budget Revenue" value={`R ${budgetRevenue.toLocaleString()}`} icon={<Icons.Target />} color="blue" />
        <KPICard title="Actual Revenue" value={`R ${actualRevenue.toLocaleString()}`} icon={<Icons.DollarSign />} color="emerald" trend={budgetRevenue ? ((actualRevenue - budgetRevenue) / budgetRevenue * 100) : 0} trendLabel="vs budget" />
        <KPICard title="Budget Expenses" value={`R ${budgetExpenses.toLocaleString()}`} icon={<Icons.Target />} color="amber" />
        <KPICard title="Actual Expenses" value={`R ${actualExpenses.toLocaleString()}`} icon={<Icons.Wallet />} color="red" trend={budgetExpenses ? ((actualExpenses - budgetExpenses) / budgetExpenses * 100) : 0} trendLabel="vs budget" />
        <KPICard title="Net Profit" value={`R ${actualProfit.toLocaleString()}`} icon={<Icons.TrendingUp />} color={actualProfit >= 0 ? 'emerald' : 'red'} trend={budgetProfit ? ((actualProfit - budgetProfit) / Math.abs(budgetProfit) * 100) : 0} trendLabel="vs budget" />
        <KPICard title="Profit Margin" value={`${profitMargin.toFixed(1)}%`} icon={<Icons.Percent />} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Budget vs Actual Bar Chart */}
        <div className="bg-white rounded-xl border p-6 chart-container">
          <h3 className="font-semibold mb-4">Budget vs Actual - {monthLabel}</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={[
              { name: 'Revenue', budget: budgetRevenue, actual: actualRevenue },
              { name: 'Expenses', budget: budgetExpenses, actual: actualExpenses },
              { name: 'Profit', budget: budgetProfit, actual: actualProfit },
            ]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(v) => `R${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => `R ${v.toLocaleString()}`} />
              <Legend />
              <Bar dataKey="budget" fill="#3b82f6" name="Budget" radius={[4,4,0,0]} />
              <Bar dataKey="actual" fill="#10b981" name="Actual" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue & Profit Trend */}
        <div className="bg-white rounded-xl border p-6 chart-container">
          <h3 className="font-semibold mb-4">Revenue & Profit Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `R${(v/1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => `R ${v.toLocaleString()}`} />
              <Legend />
              <Bar dataKey="actualRev" name="Actual Revenue" fill="#10b981" radius={[4,4,0,0]} />
              <Line type="monotone" dataKey="budgetRev" name="Budget Revenue" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#3b82f6' }} />
              <Line type="monotone" dataKey="actualProfit" name="Actual Profit" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Expense Variance */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold mb-4">Top Expense Categories - Variance</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {topCategories.map(item => {
            const variance = item.actual - item.budget;
            const variancePct = item.budget ? (variance / item.budget * 100) : 0;
            const isOver = variance > 0;
            return (
              <div key={item.name} className="p-4 bg-slate-50 rounded-lg">
                <p className="font-medium text-sm mb-2">{item.name}</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Budget</span><span>R {item.budget.toLocaleString()}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Actual</span><span>R {item.actual.toLocaleString()}</span></div>
                  <div className={`flex justify-between text-xs font-bold ${isOver ? 'text-red-600' : 'text-emerald-600'}`}>
                    <span>Variance</span><span>{isOver ? '+' : ''}{variancePct.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>{/* End of dashboard-content */}
    </div>
  );
};

// Fleet Module
const FleetModule = ({ company, config, fleet, setFleet }) => {
  const [activeTab, setActiveTab] = useState('trucks');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [modalType, setModalType] = useState('truck'); // 'truck' or 'trailer'

  const trucks = fleet.trucks || [];
  const trailers = fleet.trailers || [];

  const handleAdd = (type) => {
    setModalType(type);
    setEditItem(null);
    setShowModal(true);
  };

  const handleEdit = (item, type) => {
    setModalType(type);
    setEditItem(item);
    setShowModal(true);
  };

  const handleDelete = (id, type) => {
    if (confirm(`Are you sure you want to delete this ${type}?`)) {
      if (type === 'truck') {
        setFleet({ ...fleet, trucks: trucks.filter(t => t.id !== id) });
      } else {
        setFleet({ ...fleet, trailers: trailers.filter(t => t.id !== id) });
      }
    }
  };

  const handleSave = (formData) => {
    if (modalType === 'truck') {
      if (editItem) {
        setFleet({ ...fleet, trucks: trucks.map(t => t.id === editItem.id ? { ...formData, id: editItem.id } : t) });
      } else {
        const newId = (Math.max(...trucks.map(t => parseInt(t.id)), 0) + 1).toString();
        setFleet({ ...fleet, trucks: [...trucks, { ...formData, id: newId }] });
      }
    } else {
      if (editItem) {
        setFleet({ ...fleet, trailers: trailers.map(t => t.id === editItem.id ? { ...formData, id: editItem.id } : t) });
      } else {
        const newId = (Math.max(...trailers.map(t => parseInt(t.id)), 0) + 1).toString();
        setFleet({ ...fleet, trailers: [...trailers, { ...formData, id: newId }] });
      }
    }
    setShowModal(false);
    setEditItem(null);
  };

  const activeTrucks = trucks.filter(t => t.status === 'Active').length;
  const totalValue = trucks.reduce((s, t) => s + (t.purchasePrice || 0), 0) + trailers.reduce((s, t) => s + (t.purchasePrice || 0), 0);

  const exportFleetData = () => {
    if (activeTab === 'trucks') {
      return {
        title: 'Fleet Register - Trucks',
        headers: [
          { key: 'fleetNo', label: 'Fleet No', align: 'left' },
          { key: 'regNo', label: 'Reg No', align: 'left' },
          { key: 'makeModel', label: 'Make/Model', align: 'left' },
          { key: 'year', label: 'Year', align: 'left' },
          { key: 'driver', label: 'Driver', align: 'left' },
          { key: 'currentKm', label: 'Current KM', align: 'right' },
          { key: 'status', label: 'Status', align: 'left' },
          { key: 'purchasePrice', label: 'Purchase Price', align: 'right' },
        ],
        data: trucks.map(t => ({
          fleetNo: t.fleetNo,
          regNo: t.regNo,
          makeModel: `${t.make} ${t.model}`,
          year: t.year,
          driver: t.assignedDriver || '-',
          currentKm: (t.currentKm || 0).toLocaleString(),
          status: t.status,
          purchasePrice: `R ${(t.purchasePrice || 0).toLocaleString()}`,
        }))
      };
    } else {
      return {
        title: 'Fleet Register - Trailers',
        headers: [
          { key: 'fleetNo', label: 'Fleet No', align: 'left' },
          { key: 'regNo', label: 'Reg No', align: 'left' },
          { key: 'type', label: 'Type', align: 'left' },
          { key: 'makeModel', label: 'Make/Model', align: 'left' },
          { key: 'capacity', label: 'Capacity', align: 'left' },
          { key: 'linkedTruck', label: 'Linked Truck', align: 'left' },
          { key: 'status', label: 'Status', align: 'left' },
          { key: 'purchasePrice', label: 'Purchase Price', align: 'right' },
        ],
        data: trailers.map(t => ({
          fleetNo: t.fleetNo,
          regNo: t.regNo,
          type: t.type,
          makeModel: `${t.make} ${t.model}`,
          capacity: t.capacity || '-',
          linkedTruck: t.linkedTruck || '-',
          status: t.status,
          purchasePrice: `R ${(t.purchasePrice || 0).toLocaleString()}`,
        }))
      };
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Fleet Management</h2>
          <p className="text-slate-500">Manage trucks and trailers</p>
        </div>
        <ExportButtons 
          onPDF={() => {
            const data = exportFleetData();
            exportToPDF(data.title, data.headers, data.data, company, '');
          }}
          onExcel={() => {
            const data = exportFleetData();
            exportToExcel(data.title.replace(/\s+/g, '_'), data.headers, data.data, company, '');
          }}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Total Trucks" value={trucks.length} icon={<Icons.Truck />} color="blue" />
        <KPICard title="Active Trucks" value={activeTrucks} icon={<Icons.Check />} color="emerald" />
        <KPICard title="Total Trailers" value={trailers.length} icon={<Icons.Clipboard />} color="amber" />
        <KPICard title="Fleet Value" value={`R ${(totalValue / 1000000).toFixed(1)}M`} icon={<Icons.DollarSign />} color="purple" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
        <button onClick={() => setActiveTab('trucks')} className={`flex-1 px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'trucks' ? 'bg-white shadow-sm' : ''}`}>
          Trucks ({trucks.length})
        </button>
        <button onClick={() => setActiveTab('trailers')} className={`flex-1 px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'trailers' ? 'bg-white shadow-sm' : ''}`}>
          Trailers ({trailers.length})
        </button>
      </div>

      {/* Trucks Tab */}
      {activeTab === 'trucks' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
            <h3 className="font-semibold">Trucks Register</h3>
            <button onClick={() => handleAdd('truck')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 text-sm">
              <Icons.Plus />Add Truck
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Fleet No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Reg No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Make / Model</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Driver</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Current KM</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {trucks.map(truck => (
                  <tr key={truck.id} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-bold text-blue-600">{truck.fleetNo}</td>
                    <td className="px-4 py-3 text-sm">{truck.regNo}</td>
                    <td className="px-4 py-3 text-sm">
                      <p className="font-medium">{truck.make} {truck.model}</p>
                      <p className="text-xs text-slate-500">{truck.year}</p>
                    </td>
                    <td className="px-4 py-3 text-sm">{truck.assignedDriver || '-'}</td>
                    <td className="px-4 py-3 text-sm text-right">{(truck.currentKm || 0).toLocaleString()} km</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={truck.status === 'Active' ? 'success' : truck.status === 'In Workshop' ? 'warning' : 'danger'}>{truck.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => handleEdit(truck, 'truck')} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Icons.Edit /></button>
                        <button onClick={() => handleDelete(truck.id, 'truck')} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Icons.Trash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {trucks.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No trucks added yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trailers Tab */}
      {activeTab === 'trailers' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
            <h3 className="font-semibold">Trailers Register</h3>
            <button onClick={() => handleAdd('trailer')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 text-sm">
              <Icons.Plus />Add Trailer
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Fleet No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Reg No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Make / Model</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Linked Truck</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {trailers.map(trailer => (
                  <tr key={trailer.id} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-bold text-amber-600">{trailer.fleetNo}</td>
                    <td className="px-4 py-3 text-sm">{trailer.regNo}</td>
                    <td className="px-4 py-3 text-sm">{trailer.type}</td>
                    <td className="px-4 py-3 text-sm">
                      <p className="font-medium">{trailer.make}</p>
                      <p className="text-xs text-slate-500">{trailer.model}</p>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-blue-600">{trailer.linkedTruck || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={trailer.status === 'Active' ? 'success' : 'danger'}>{trailer.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => handleEdit(trailer, 'trailer')} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Icons.Edit /></button>
                        <button onClick={() => handleDelete(trailer.id, 'trailer')} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Icons.Trash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {trailers.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No trailers added yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fleet Modal */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditItem(null); }} 
        title={editItem ? `Edit ${modalType === 'truck' ? 'Truck' : 'Trailer'}` : `Add New ${modalType === 'truck' ? 'Truck' : 'Trailer'}`} size="lg">
        {modalType === 'truck' ? (
          <TruckForm truck={editItem} onSave={handleSave} onCancel={() => { setShowModal(false); setEditItem(null); }} />
        ) : (
          <TrailerForm trailer={editItem} trucks={trucks} onSave={handleSave} onCancel={() => { setShowModal(false); setEditItem(null); }} />
        )}
      </Modal>
    </div>
  );
};

// Truck Form
const TruckForm = ({ truck, onSave, onCancel }) => {
  const [form, setForm] = useState(truck || {
    fleetNo: '', regNo: '', make: '', model: '', year: new Date().getFullYear(), vin: '', engineNo: '',
    color: '', status: 'Active', purchaseDate: '', purchasePrice: 0, currentKm: 0, lastServiceKm: 0,
    nextServiceKm: 0, fuelType: 'Diesel', tankCapacity: 400, assignedDriver: '', licenseDisc: '', notes: ''
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <FormField label="Fleet No" required>
          <Input value={form.fleetNo} onChange={e => setForm({...form, fleetNo: e.target.value.toUpperCase()})} placeholder="TA-001" />
        </FormField>
        <FormField label="Registration No" required>
          <Input value={form.regNo} onChange={e => setForm({...form, regNo: e.target.value.toUpperCase()})} placeholder="CA 123-456" />
        </FormField>
        <FormField label="Status">
          <Select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
            <option value="Active">Active</option>
            <option value="In Workshop">In Workshop</option>
            <option value="Sold">Sold</option>
            <option value="Written Off">Written Off</option>
          </Select>
        </FormField>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <FormField label="Make" required>
          <Input value={form.make} onChange={e => setForm({...form, make: e.target.value})} placeholder="UD Trucks" />
        </FormField>
        <FormField label="Model" required>
          <Input value={form.model} onChange={e => setForm({...form, model: e.target.value})} placeholder="Quester GWE 420" />
        </FormField>
        <FormField label="Year">
          <Input type="number" value={form.year} onChange={e => setForm({...form, year: parseInt(e.target.value) || new Date().getFullYear()})} />
        </FormField>
        <FormField label="Color">
          <Input value={form.color} onChange={e => setForm({...form, color: e.target.value})} placeholder="White" />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="VIN">
          <Input value={form.vin} onChange={e => setForm({...form, vin: e.target.value.toUpperCase()})} placeholder="Vehicle Identification Number" />
        </FormField>
        <FormField label="Engine No">
          <Input value={form.engineNo} onChange={e => setForm({...form, engineNo: e.target.value.toUpperCase()})} placeholder="Engine Number" />
        </FormField>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <FormField label="Purchase Date">
          <Input type="date" value={form.purchaseDate} onChange={e => setForm({...form, purchaseDate: e.target.value})} />
        </FormField>
        <FormField label="Purchase Price (R)">
          <Input type="number" value={form.purchasePrice} onChange={e => setForm({...form, purchasePrice: parseFloat(e.target.value) || 0})} />
        </FormField>
        <FormField label="Assigned Driver">
          <Input value={form.assignedDriver} onChange={e => setForm({...form, assignedDriver: e.target.value})} placeholder="Driver name" />
        </FormField>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <FormField label="Current KM">
          <Input type="number" value={form.currentKm} onChange={e => setForm({...form, currentKm: parseInt(e.target.value) || 0})} />
        </FormField>
        <FormField label="Last Service KM">
          <Input type="number" value={form.lastServiceKm} onChange={e => setForm({...form, lastServiceKm: parseInt(e.target.value) || 0})} />
        </FormField>
        <FormField label="Next Service KM">
          <Input type="number" value={form.nextServiceKm} onChange={e => setForm({...form, nextServiceKm: parseInt(e.target.value) || 0})} />
        </FormField>
        <FormField label="License Disc Expiry">
          <Input type="date" value={form.licenseDisc} onChange={e => setForm({...form, licenseDisc: e.target.value})} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Fuel Type">
          <Select value={form.fuelType} onChange={e => setForm({...form, fuelType: e.target.value})}>
            <option value="Diesel">Diesel</option>
            <option value="Petrol">Petrol</option>
          </Select>
        </FormField>
        <FormField label="Tank Capacity (L)">
          <Input type="number" value={form.tankCapacity} onChange={e => setForm({...form, tankCapacity: parseInt(e.target.value) || 0})} />
        </FormField>
      </div>
      <FormField label="Notes">
        <Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Additional notes..." />
      </FormField>
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg">Cancel</button>
        <button onClick={() => onSave(form)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">{truck ? 'Update' : 'Add'} Truck</button>
      </div>
    </div>
  );
};

// Trailer Form
const TrailerForm = ({ trailer, trucks, onSave, onCancel }) => {
  const [form, setForm] = useState(trailer || {
    fleetNo: '', regNo: '', type: 'Flatbed', make: '', model: '', year: new Date().getFullYear(),
    capacity: '', status: 'Active', purchaseDate: '', purchasePrice: 0, lastServiceDate: '', linkedTruck: ''
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <FormField label="Fleet No" required>
          <Input value={form.fleetNo} onChange={e => setForm({...form, fleetNo: e.target.value.toUpperCase()})} placeholder="TR-001" />
        </FormField>
        <FormField label="Registration No" required>
          <Input value={form.regNo} onChange={e => setForm({...form, regNo: e.target.value.toUpperCase()})} placeholder="CA T12-345" />
        </FormField>
        <FormField label="Status">
          <Select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
            <option value="Active">Active</option>
            <option value="In Workshop">In Workshop</option>
            <option value="Sold">Sold</option>
          </Select>
        </FormField>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <FormField label="Type" required>
          <Select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
            <option value="Flatbed">Flatbed</option>
            <option value="Side Tipper">Side Tipper</option>
            <option value="Tautliner">Tautliner</option>
            <option value="Tanker">Tanker</option>
            <option value="Refrigerated">Refrigerated</option>
            <option value="Lowbed">Lowbed</option>
          </Select>
        </FormField>
        <FormField label="Make">
          <Input value={form.make} onChange={e => setForm({...form, make: e.target.value})} placeholder="SA Truck Bodies" />
        </FormField>
        <FormField label="Model">
          <Input value={form.model} onChange={e => setForm({...form, model: e.target.value})} placeholder="40m³ Side Tipper" />
        </FormField>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <FormField label="Year">
          <Input type="number" value={form.year} onChange={e => setForm({...form, year: parseInt(e.target.value) || new Date().getFullYear()})} />
        </FormField>
        <FormField label="Capacity">
          <Input value={form.capacity} onChange={e => setForm({...form, capacity: e.target.value})} placeholder="34 tons / 40m³" />
        </FormField>
        <FormField label="Purchase Date">
          <Input type="date" value={form.purchaseDate} onChange={e => setForm({...form, purchaseDate: e.target.value})} />
        </FormField>
        <FormField label="Purchase Price (R)">
          <Input type="number" value={form.purchasePrice} onChange={e => setForm({...form, purchasePrice: parseFloat(e.target.value) || 0})} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Last Service Date">
          <Input type="date" value={form.lastServiceDate} onChange={e => setForm({...form, lastServiceDate: e.target.value})} />
        </FormField>
        <FormField label="Linked Truck">
          <Select value={form.linkedTruck} onChange={e => setForm({...form, linkedTruck: e.target.value})}>
            <option value="">-- Not Linked --</option>
            {trucks.map(t => <option key={t.id} value={t.fleetNo}>{t.fleetNo} - {t.make} {t.model}</option>)}
          </Select>
        </FormField>
      </div>
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg">Cancel</button>
        <button onClick={() => onSave(form)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">{trailer ? 'Update' : 'Add'} Trailer</button>
      </div>
    </div>
  );
};

// Jobs Module
const JobsModule = ({ company, config, jobs, setJobs, fleet }) => {
  const [showModal, setShowModal] = useState(false);
  const [editJob, setEditJob] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');

  const trucks = fleet.trucks || [];
  const trailers = fleet.trailers || [];

  const handleAdd = () => {
    setEditJob(null);
    setShowModal(true);
  };

  const handleEdit = (job) => {
    setEditJob(job);
    setShowModal(true);
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this job?')) {
      setJobs(jobs.filter(j => j.id !== id));
    }
  };

  const handleSave = (formData) => {
    if (editJob) {
      setJobs(jobs.map(j => j.id === editJob.id ? { ...formData, id: editJob.id } : j));
    } else {
      const newId = (Math.max(...jobs.map(j => parseInt(j.id)), 0) + 1).toString();
      const newJobNo = `JOB-2025-${String(jobs.length + 1).padStart(3, '0')}`;
      setJobs([...jobs, { ...formData, id: newId, jobNo: newJobNo }]);
    }
    setShowModal(false);
    setEditJob(null);
  };

  const filteredJobs = filterStatus === 'all' ? jobs : jobs.filter(j => j.status === filterStatus);

  const totalRevenue = jobs.reduce((s, j) => s + (j.revenue || 0), 0);
  const totalCosts = jobs.reduce((s, j) => s + (j.fuelCost || 0) + (j.tollCost || 0) + (j.otherCosts || 0), 0);
  const completedJobs = jobs.filter(j => j.status === 'Completed').length;

  const exportJobsData = () => ({
    title: 'Jobs Register',
    headers: [
      { key: 'jobNo', label: 'Job No', align: 'left' },
      { key: 'date', label: 'Date', align: 'left' },
      { key: 'customer', label: 'Customer', align: 'left' },
      { key: 'route', label: 'Route', align: 'left' },
      { key: 'truck', label: 'Truck', align: 'left' },
      { key: 'status', label: 'Status', align: 'left' },
      { key: 'revenue', label: 'Revenue', align: 'right' },
      { key: 'costs', label: 'Costs', align: 'right' },
      { key: 'profit', label: 'Profit', align: 'right' },
    ],
    data: filteredJobs.map(j => ({
      jobNo: j.jobNo,
      date: j.date,
      customer: j.customer,
      route: `${j.origin} → ${j.destination}`,
      truck: j.truck,
      status: j.status,
      revenue: `R ${(j.revenue || 0).toLocaleString()}`,
      costs: `R ${((j.fuelCost || 0) + (j.tollCost || 0) + (j.otherCosts || 0)).toLocaleString()}`,
      profit: `R ${((j.revenue || 0) - (j.fuelCost || 0) - (j.tollCost || 0) - (j.otherCosts || 0)).toLocaleString()}`,
    }))
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Jobs Management</h2>
          <p className="text-slate-500">Manage transport jobs and trips</p>
        </div>
        <div className="flex gap-3">
          <ExportButtons 
            onPDF={() => {
              const data = exportJobsData();
              exportToPDF(data.title, data.headers, data.data, company, '');
            }}
            onExcel={() => {
              const data = exportJobsData();
              exportToExcel(data.title.replace(/\s+/g, '_'), data.headers, data.data, company, '');
            }}
          />
          <button onClick={handleAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
            <Icons.Plus />New Job
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Total Jobs" value={jobs.length} icon={<Icons.Clipboard />} color="blue" />
        <KPICard title="Completed" value={completedJobs} icon={<Icons.Check />} color="emerald" />
        <KPICard title="Total Revenue" value={`R ${totalRevenue.toLocaleString()}`} icon={<Icons.DollarSign />} color="amber" />
        <KPICard title="Gross Profit" value={`R ${(totalRevenue - totalCosts).toLocaleString()}`} icon={<Icons.TrendingUp />} color="purple" />
      </div>

      {/* Filter */}
      <div className="flex gap-4 items-center bg-white p-4 rounded-lg border">
        <Icons.Filter />
        <span className="text-sm font-medium">Filter:</span>
        <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="Scheduled">Scheduled</option>
          <option value="In Transit">In Transit</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </Select>
        <span className="text-sm text-slate-500 ml-auto">{filteredJobs.length} jobs</span>
      </div>

      {/* Jobs Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Job No</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Route</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Truck</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Revenue</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Costs</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Profit</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-600">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map(job => {
                const jobCosts = (job.fuelCost || 0) + (job.tollCost || 0) + (job.otherCosts || 0);
                const profit = (job.revenue || 0) - jobCosts;
                return (
                  <tr key={job.id} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-bold text-blue-600">{job.jobNo}</td>
                    <td className="px-4 py-3 text-sm">{job.date}</td>
                    <td className="px-4 py-3 text-sm font-medium">{job.customer}</td>
                    <td className="px-4 py-3 text-sm">
                      <p>{job.origin}</p>
                      <p className="text-xs text-slate-500">→ {job.destination}</p>
                    </td>
                    <td className="px-4 py-3 text-sm">{job.truck}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">R {(job.revenue || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right text-red-600">R {jobCosts.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-sm text-right font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>R {profit.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={job.status === 'Completed' ? 'success' : job.status === 'In Transit' ? 'info' : job.status === 'Scheduled' ? 'warning' : 'danger'}>
                        {job.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => handleEdit(job)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Icons.Edit /></button>
                        <button onClick={() => handleDelete(job.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Icons.Trash /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredJobs.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">No jobs found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Job Modal */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditJob(null); }} 
        title={editJob ? 'Edit Job' : 'New Job'} size="lg">
        <JobForm job={editJob} trucks={trucks} trailers={trailers} onSave={handleSave} onCancel={() => { setShowModal(false); setEditJob(null); }} />
      </Modal>
    </div>
  );
};

// Job Form
const JobForm = ({ job, trucks, trailers, onSave, onCancel }) => {
  const [form, setForm] = useState(job || {
    jobNo: '', date: new Date().toISOString().split('T')[0], customer: '', loadType: '', origin: '', destination: '',
    distance: 0, truck: '', trailer: '', driver: '', status: 'Scheduled', revenue: 0, fuelCost: 0, tollCost: 0, otherCosts: 0, notes: ''
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <FormField label="Date" required>
          <Input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
        </FormField>
        <FormField label="Customer" required>
          <Input value={form.customer} onChange={e => setForm({...form, customer: e.target.value})} placeholder="Customer name" />
        </FormField>
        <FormField label="Load Type">
          <Input value={form.loadType} onChange={e => setForm({...form, loadType: e.target.value})} placeholder="Coal, Steel, etc." />
        </FormField>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <FormField label="Origin" required>
          <Input value={form.origin} onChange={e => setForm({...form, origin: e.target.value})} placeholder="Pickup location" />
        </FormField>
        <FormField label="Destination" required>
          <Input value={form.destination} onChange={e => setForm({...form, destination: e.target.value})} placeholder="Delivery location" />
        </FormField>
        <FormField label="Distance (km)">
          <Input type="number" value={form.distance} onChange={e => setForm({...form, distance: parseInt(e.target.value) || 0})} />
        </FormField>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <FormField label="Truck" required>
          <Select value={form.truck} onChange={e => setForm({...form, truck: e.target.value})}>
            <option value="">Select Truck</option>
            {trucks.map(t => <option key={t.id} value={t.fleetNo}>{t.fleetNo}</option>)}
          </Select>
        </FormField>
        <FormField label="Trailer">
          <Select value={form.trailer} onChange={e => setForm({...form, trailer: e.target.value})}>
            <option value="">Select Trailer</option>
            {trailers.map(t => <option key={t.id} value={t.fleetNo}>{t.fleetNo}</option>)}
          </Select>
        </FormField>
        <FormField label="Driver">
          <Input value={form.driver} onChange={e => setForm({...form, driver: e.target.value})} placeholder="Driver name" />
        </FormField>
        <FormField label="Status">
          <Select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
            <option value="Scheduled">Scheduled</option>
            <option value="In Transit">In Transit</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </Select>
        </FormField>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <FormField label="Revenue (R)">
          <Input type="number" value={form.revenue} onChange={e => setForm({...form, revenue: parseFloat(e.target.value) || 0})} />
        </FormField>
        <FormField label="Fuel Cost (R)">
          <Input type="number" value={form.fuelCost} onChange={e => setForm({...form, fuelCost: parseFloat(e.target.value) || 0})} />
        </FormField>
        <FormField label="Toll Cost (R)">
          <Input type="number" value={form.tollCost} onChange={e => setForm({...form, tollCost: parseFloat(e.target.value) || 0})} />
        </FormField>
        <FormField label="Other Costs (R)">
          <Input type="number" value={form.otherCosts} onChange={e => setForm({...form, otherCosts: parseFloat(e.target.value) || 0})} />
        </FormField>
      </div>
      <FormField label="Notes">
        <Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Additional notes..." />
      </FormField>
      
      {/* Profit Preview */}
      <div className="bg-blue-50 rounded-lg p-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-blue-600">Revenue</p>
            <p className="font-bold text-blue-900">R {form.revenue.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-blue-600">Total Costs</p>
            <p className="font-bold text-red-600">R {(form.fuelCost + form.tollCost + form.otherCosts).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-blue-600">Gross Profit</p>
            <p className={`font-bold ${(form.revenue - form.fuelCost - form.tollCost - form.otherCosts) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              R {(form.revenue - form.fuelCost - form.tollCost - form.otherCosts).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg">Cancel</button>
        <button onClick={() => onSave(form)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">{job ? 'Update' : 'Create'} Job</button>
      </div>
    </div>
  );
};

// Actuals Module
const ActualsModule = ({ company, config, actuals, setActuals, categories }) => {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('2025-01');
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editCategory, setEditCategory] = useState(null);
  
  const companyActuals = actuals[company.id]?.monthly?.[selectedMonth] || {};

  // Group categories by type
  const directCosts = categories.filter(c => c.type === 'direct');
  const indirectCosts = categories.filter(c => c.type === 'indirect');
  const adminCosts = categories.filter(c => c.type === 'admin');

  const tabs = [
    { id: 'all', name: 'All Categories' },
    { id: 'direct', name: 'Direct Costs' },
    { id: 'indirect', name: 'Indirect Costs' },
    { id: 'admin', name: 'Admin Costs' },
  ];

  const getFilteredCategories = () => {
    switch (activeTab) {
      case 'direct': return directCosts;
      case 'indirect': return indirectCosts;
      case 'admin': return adminCosts;
      default: return categories;
    }
  };

  const totalExpenses = Object.entries(companyActuals).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0);
  const directTotal = directCosts.reduce((s, c) => s + (companyActuals[c.id] || 0), 0);
  const indirectTotal = indirectCosts.reduce((s, c) => s + (companyActuals[c.id] || 0), 0);
  const adminTotal = adminCosts.reduce((s, c) => s + (companyActuals[c.id] || 0), 0);

  const handleAddEntry = () => {
    setEditCategory(null);
    setShowEntryModal(true);
  };

  const handleEditCategory = (cat) => {
    setEditCategory({ ...cat, amount: companyActuals[cat.id] || 0 });
    setShowEntryModal(true);
  };

  const handleSaveEntry = (categoryId, amount) => {
    const updatedActuals = {
      ...actuals,
      [company.id]: {
        ...actuals[company.id],
        monthly: {
          ...actuals[company.id]?.monthly,
          [selectedMonth]: {
            ...companyActuals,
            [categoryId]: amount
          }
        }
      }
    };
    setActuals(updatedActuals);
    setShowEntryModal(false);
    setEditCategory(null);
  };

  const handleDeleteEntry = (categoryId) => {
    if (confirm('Are you sure you want to delete this entry?')) {
      const updatedActuals = {
        ...actuals,
        [company.id]: {
          ...actuals[company.id],
          monthly: {
            ...actuals[company.id]?.monthly,
            [selectedMonth]: {
              ...companyActuals,
              [categoryId]: 0
            }
          }
        }
      };
      setActuals(updatedActuals);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Actuals</h2>
          <p className="text-slate-500">Record actual expenses for {config.label}</p>
        </div>
        <div className="flex gap-3">
          <MonthYearSelector value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
          <ExportButtons
            onPDF={() => {
              const headers = [
                { key: 'category', label: 'Category', align: 'left' },
                { key: 'type', label: 'Type', align: 'left' },
                { key: 'amount', label: 'Amount (R)', align: 'right' },
                { key: 'percent', label: '% of Total', align: 'right' },
              ];
              const data = getFilteredCategories().map(cat => ({
                category: cat.name,
                type: cat.type,
                amount: `R ${(companyActuals[cat.id] || 0).toLocaleString()}`,
                percent: `${totalExpenses ? ((companyActuals[cat.id] || 0) / totalExpenses * 100).toFixed(1) : 0}%`
              }));
              data.push({
                category: 'TOTAL',
                type: '',
                amount: `R ${getFilteredCategories().reduce((s, c) => s + (companyActuals[c.id] || 0), 0).toLocaleString()}`,
                percent: '100%',
                isTotal: true
              });
              exportToPDF('Actuals Report - ' + tabs.find(t => t.id === activeTab)?.name, headers, data, company, new Date(selectedMonth + '-01').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }));
            }}
            onExcel={() => {
              const headers = [
                { key: 'category', label: 'Category', align: 'left' },
                { key: 'type', label: 'Type', align: 'left' },
                { key: 'amount', label: 'Amount (R)', align: 'right' },
                { key: 'percent', label: '% of Total', align: 'right' },
              ];
              const data = getFilteredCategories().map(cat => ({
                category: cat.name,
                type: cat.type,
                amount: companyActuals[cat.id] || 0,
                percent: totalExpenses ? ((companyActuals[cat.id] || 0) / totalExpenses * 100).toFixed(1) + '%' : '0%'
              }));
              exportToExcel('Actuals_Report', headers, data, company, new Date(selectedMonth + '-01').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }));
            }}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard title="Total Revenue" value={`R ${(companyActuals.revenue || 0).toLocaleString()}`} icon={<Icons.DollarSign />} color="emerald" />
        <KPICard title="Direct Costs" value={`R ${directTotal.toLocaleString()}`} icon={<Icons.Wallet />} color="red" />
        <KPICard title="Indirect Costs" value={`R ${indirectTotal.toLocaleString()}`} icon={<Icons.Wallet />} color="amber" />
        <KPICard title="Admin Costs" value={`R ${adminTotal.toLocaleString()}`} icon={<Icons.Wallet />} color="purple" />
        <KPICard title="Net Profit" value={`R ${((companyActuals.revenue || 0) - totalExpenses).toLocaleString()}`} icon={<Icons.TrendingUp />} color="blue" />
      </div>

      {/* Category Type Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 bg-slate-100 p-1 rounded-lg">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>
            {tab.name}
          </button>
        ))}
      </div>

      {/* Category Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
          <h3 className="font-semibold">{tabs.find(t => t.id === activeTab)?.name}</h3>
          <button onClick={handleAddEntry} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 text-sm">
            <Icons.Plus />Add Entry
          </button>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Type</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Amount (R)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">% of Total</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {getFilteredCategories().map(cat => {
              const amount = companyActuals[cat.id] || 0;
              const percent = totalExpenses ? (amount / totalExpenses * 100) : 0;
              return (
                <tr key={cat.id} className="border-b hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium">{cat.name}</td>
                  <td className="px-4 py-3 text-sm">
                    <Badge variant={cat.type === 'direct' ? 'danger' : cat.type === 'indirect' ? 'warning' : 'purple'}>
                      {cat.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold">R {amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-500">{percent.toFixed(1)}%</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => handleEditCategory(cat)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Icons.Edit /></button>
                      <button onClick={() => handleDeleteEntry(cat.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Icons.Trash /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-100">
            <tr>
              <td colSpan={2} className="px-4 py-3 text-sm font-bold">TOTAL</td>
              <td className="px-4 py-3 text-sm text-right font-bold">
                R {getFilteredCategories().reduce((s, c) => s + (companyActuals[c.id] || 0), 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-sm text-right font-bold">
                {totalExpenses ? (getFilteredCategories().reduce((s, c) => s + (companyActuals[c.id] || 0), 0) / totalExpenses * 100).toFixed(1) : 0}%
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Entry Modal */}
      <Modal isOpen={showEntryModal} onClose={() => { setShowEntryModal(false); setEditCategory(null); }} 
        title={editCategory ? `Edit ${editCategory.name}` : 'Add Expense Entry'} size="md">
        <ActualEntryForm 
          categories={getFilteredCategories()} 
          editCategory={editCategory}
          currentValues={companyActuals}
          onSave={handleSaveEntry} 
          onCancel={() => { setShowEntryModal(false); setEditCategory(null); }} 
        />
      </Modal>
    </div>
  );
};

// Actual Entry Form
const ActualEntryForm = ({ categories, editCategory, currentValues, onSave, onCancel }) => {
  const [selectedCategory, setSelectedCategory] = useState(editCategory?.id || '');
  const [amount, setAmount] = useState(editCategory?.amount || 0);
  const [description, setDescription] = useState('');

  const handleSave = () => {
    if (!selectedCategory) {
      alert('Please select a category');
      return;
    }
    onSave(selectedCategory, amount);
  };

  return (
    <div className="space-y-4">
      <FormField label="Category" required>
        {editCategory ? (
          <Input value={editCategory.name} disabled className="bg-slate-100" />
        ) : (
          <Select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
            <option value="">Select Category</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name} (Current: R {(currentValues[cat.id] || 0).toLocaleString()})</option>
            ))}
          </Select>
        )}
      </FormField>
      <FormField label="Amount (R)" required>
        <Input 
          type="number" 
          value={amount} 
          onChange={e => setAmount(parseFloat(e.target.value) || 0)} 
          placeholder="0.00"
          autoFocus
        />
      </FormField>
      <FormField label="Description (Optional)">
        <Input 
          value={description} 
          onChange={e => setDescription(e.target.value)} 
          placeholder="Brief description of expense..."
        />
      </FormField>
      
      {selectedCategory && (
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-blue-600">Current Value</p>
          <p className="font-bold text-blue-900">R {(currentValues[selectedCategory] || 0).toLocaleString()}</p>
          <p className="text-sm text-blue-600 mt-2">New Value</p>
          <p className="font-bold text-blue-900">R {amount.toLocaleString()}</p>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t">
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg">Cancel</button>
        <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg">
          {editCategory ? 'Update' : 'Add'} Entry
        </button>
      </div>
    </div>
  );
};

// Budgeted Revenue Module
const BudgetedRevenueModule = ({ company, config, budgetedRevenue, setBudgetedRevenue, budgets, actuals, fleet }) => {
  const [activeView, setActiveView] = useState('monthly');
  const [selectedMonth, setSelectedMonth] = useState('2025-01');
  const [showAddTripModal, setShowAddTripModal] = useState(false);
  const [filterTruck, setFilterTruck] = useState('all');

  const companyData = budgetedRevenue[company.id] || { monthly: {}, byTruck: {}, byTrip: [], annual: {} };
  const monthlyData = companyData.monthly?.[selectedMonth] || {};
  const annualData = companyData.annual || {};
  const truckData = companyData.byTruck || {};
  const tripData = companyData.byTrip || [];

  // Actual revenue data for comparison
  const actualMonthlyRevenue = actuals[company.id]?.monthly?.[selectedMonth]?.revenue || 0;
  const budgetMonthlyRevenue = budgets[company.id]?.monthly?.[selectedMonth]?.revenue || 0;

  // Calculate annual actuals from available months
  const allMonths = Object.keys(actuals[company.id]?.monthly || {});
  const totalActualRevenue = allMonths.reduce((sum, m) => sum + (actuals[company.id]?.monthly?.[m]?.revenue || 0), 0);

  const isHaulage = company.industry === 'haulage';

  const views = [
    { id: 'monthly', name: 'Per Month' },
    { id: 'truck', name: isHaulage ? 'Per Truck' : company.industry === 'construction' ? 'Per Project' : 'Per Program' },
    { id: 'trip', name: isHaulage ? 'Per Trip' : 'Details' },
  ];

  // Filter trips by month and truck
  const filteredTrips = tripData.filter(trip => {
    const tripMonth = trip.date?.substring(0, 7);
    const matchMonth = selectedMonth.startsWith('annual') || tripMonth === selectedMonth;
    const matchTruck = filterTruck === 'all' || trip.truck === filterTruck;
    return matchMonth && matchTruck;
  });

  // Monthly summary data for chart
  const monthlyChartData = Object.keys(companyData.monthly || {}).map(month => {
    const mData = companyData.monthly[month];
    const actualRev = actuals[company.id]?.monthly?.[month]?.revenue || 0;
    return {
      month: new Date(month + '-01').toLocaleDateString('en-ZA', { month: 'short' }),
      budgeted: mData?.totalRevenue || 0,
      target: mData?.target || 0,
      actual: actualRev,
    };
  });

  // Calculate variance
  const currentBudgetedRev = monthlyData.totalRevenue || 0;
  const variance = actualMonthlyRevenue - currentBudgetedRev;
  const variancePercent = currentBudgetedRev > 0 ? (variance / currentBudgetedRev * 100) : 0;

  // Trip form state
  const [newTrip, setNewTrip] = useState({
    date: '', truck: '', route: '', customer: '', loadType: '', budgetedRevenue: 0, distance: 0, ratePerKm: 0
  });

  const handleAddTrip = () => {
    if (!newTrip.date || !newTrip.truck || !newTrip.budgetedRevenue) {
      alert('Please fill in date, truck, and budgeted revenue');
      return;
    }
    const tripId = `BT-${String(tripData.length + 1).padStart(3, '0')}`;
    const updatedTrips = [...tripData, { ...newTrip, tripId, actualRevenue: 0, budgetedRevenue: parseFloat(newTrip.budgetedRevenue), distance: parseFloat(newTrip.distance) || 0, ratePerKm: parseFloat(newTrip.ratePerKm) || 0 }];
    const updatedData = {
      ...budgetedRevenue,
      [company.id]: {
        ...companyData,
        byTrip: updatedTrips
      }
    };
    setBudgetedRevenue(updatedData);
    setShowAddTripModal(false);
    setNewTrip({ date: '', truck: '', route: '', customer: '', loadType: '', budgetedRevenue: 0, distance: 0, ratePerKm: 0 });
  };

  const handleDeleteTrip = (tripId) => {
    if (confirm('Are you sure you want to delete this budgeted trip?')) {
      const updatedTrips = tripData.filter(t => t.tripId !== tripId);
      setBudgetedRevenue({
        ...budgetedRevenue,
        [company.id]: { ...companyData, byTrip: updatedTrips }
      });
    }
  };

  // Get available trucks for filtering
  const availableTrucks = fleet?.trucks || [];

  // Export helper
  const exportData = () => {
    if (activeView === 'monthly') {
      return {
        title: 'Budgeted Revenue - Monthly Summary',
        headers: [
          { key: 'month', label: 'Month', align: 'left' },
          { key: 'budgeted', label: 'Budgeted Revenue (R)', align: 'right' },
          { key: 'target', label: 'Target (R)', align: 'right' },
          { key: 'actual', label: 'Actual Revenue (R)', align: 'right' },
          { key: 'variance', label: 'Variance (R)', align: 'right' },
        ],
        data: Object.keys(companyData.monthly || {}).map(month => {
          const m = companyData.monthly[month];
          const act = actuals[company.id]?.monthly?.[month]?.revenue || 0;
          return {
            month: new Date(month + '-01').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }),
            budgeted: `R ${(m?.totalRevenue || 0).toLocaleString()}`,
            target: `R ${(m?.target || 0).toLocaleString()}`,
            actual: `R ${act.toLocaleString()}`,
            variance: `R ${(act - (m?.totalRevenue || 0)).toLocaleString()}`,
          };
        })
      };
    }
    if (activeView === 'truck') {
      return {
        title: `Budgeted Revenue - Per ${isHaulage ? 'Truck' : 'Unit'}`,
        headers: [
          { key: 'unit', label: isHaulage ? 'Truck' : 'Unit', align: 'left' },
          { key: 'revenue', label: 'Budgeted Revenue (R)', align: 'right' },
          { key: 'target', label: 'Target (R)', align: 'right' },
          { key: 'items', label: isHaulage ? 'Trips' : 'Items', align: 'right' },
          { key: 'avg', label: 'Avg/Item (R)', align: 'right' },
        ],
        data: Object.entries(truckData).map(([id, data]) => {
          const mData = data.monthly?.[selectedMonth] || data;
          return {
            unit: data.truckName || id,
            revenue: `R ${(mData?.revenue || data?.annual?.revenue || 0).toLocaleString()}`,
            target: `R ${(mData?.target || data?.annual?.target || 0).toLocaleString()}`,
            items: mData?.trips || data?.annual?.trips || 0,
            avg: `R ${(mData?.avgPerTrip || data?.annual?.avgPerTrip || 0).toLocaleString()}`,
          };
        })
      };
    }
    return {
      title: 'Budgeted Revenue - Per Trip',
      headers: [
        { key: 'tripId', label: 'Trip ID', align: 'left' },
        { key: 'date', label: 'Date', align: 'left' },
        { key: 'truck', label: 'Truck', align: 'left' },
        { key: 'route', label: 'Route', align: 'left' },
        { key: 'budgeted', label: 'Budgeted (R)', align: 'right' },
        { key: 'actual', label: 'Actual (R)', align: 'right' },
      ],
      data: filteredTrips.map(t => ({
        tripId: t.tripId,
        date: t.date,
        truck: t.truck,
        route: t.route,
        budgeted: `R ${(t.budgetedRevenue || 0).toLocaleString()}`,
        actual: `R ${(t.actualRevenue || 0).toLocaleString()}`,
      }))
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Budgeted Revenue</h2>
          <p className="text-slate-500">Plan and track revenue targets for {config.label}</p>
        </div>
        <div className="flex gap-3">
          <MonthYearSelector value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} includeAnnual={true} />
          <ExportButtons
            onPDF={() => {
              const data = exportData();
              exportToPDF(data.title, data.headers, data.data, company, selectedMonth.startsWith('annual') ? `Annual ${selectedMonth.split('-')[1] || '2025'}` : new Date(selectedMonth + '-01').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }));
            }}
            onExcel={() => {
              const data = exportData();
              exportToExcel(data.title.replace(/\s+/g, '_'), data.headers, data.data, company, selectedMonth.startsWith('annual') ? `Annual ${selectedMonth.split('-')[1] || '2025'}` : new Date(selectedMonth + '-01').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }));
            }}
          />
          {isHaulage && activeView === 'trip' && (
            <button onClick={() => setShowAddTripModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
              <Icons.Plus />Add Trip Budget
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title={selectedMonth.startsWith('annual') ? 'Annual Budgeted Revenue' : 'Monthly Budgeted Revenue'}
          value={`R ${(selectedMonth.startsWith('annual') ? (annualData.totalRevenue || 0) : (monthlyData.totalRevenue || 0)).toLocaleString()}`}
          icon={<Icons.Target />}
          color="blue"
        />
        <KPICard
          title="Actual Revenue"
          value={`R ${(selectedMonth.startsWith('annual') ? totalActualRevenue : actualMonthlyRevenue).toLocaleString()}`}
          icon={<Icons.DollarSign />}
          color="emerald"
        />
        <KPICard
          title="Variance"
          value={`R ${(selectedMonth.startsWith('annual') ? (totalActualRevenue - (annualData.totalRevenue || 0)) : variance).toLocaleString()}`}
          icon={variance >= 0 ? <Icons.TrendingUp /> : <Icons.TrendingDown />}
          color={variance >= 0 ? 'emerald' : 'red'}
          trend={selectedMonth !== 'annual' ? variancePercent : undefined}
          trendLabel={selectedMonth !== 'annual' ? 'vs budget' : undefined}
        />
        <KPICard
          title={selectedMonth.startsWith('annual') ? 'Annual Target' : 'Monthly Target'}
          value={`R ${(selectedMonth.startsWith('annual') ? (annualData.target || 0) : (monthlyData.target || 0)).toLocaleString()}`}
          icon={<Icons.ArrowUpRight />}
          color="purple"
        />
      </div>

      {/* Revenue Trend Chart */}
      {monthlyChartData.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Revenue Trend: Budgeted vs Actual</h3>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={monthlyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value) => `R ${value.toLocaleString()}`} />
              <Legend />
              <Bar dataKey="budgeted" name="Budgeted" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Actual" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="target" name="Target" stroke="#a855f7" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#a855f7' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* View Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 bg-slate-100 p-1 rounded-lg">
        {views.map(view => (
          <button key={view.id} onClick={() => setActiveView(view.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${activeView === view.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>
            {view.name}
          </button>
        ))}
      </div>

      {/* ===== MONTHLY VIEW ===== */}
      {activeView === 'monthly' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-slate-50">
            <h3 className="font-semibold">Monthly Revenue Budget Summary</h3>
          </div>
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Month</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budgeted Revenue (R)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Target (R)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Revenue (R)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Variance (R)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Variance %</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(companyData.monthly || {}).map(month => {
                const mData = companyData.monthly[month];
                const actualRev = actuals[company.id]?.monthly?.[month]?.revenue || 0;
                const budgetedRev = mData?.totalRevenue || 0;
                const target = mData?.target || 0;
                const mVariance = actualRev - budgetedRev;
                const mVariancePct = budgetedRev > 0 ? (mVariance / budgetedRev * 100) : 0;
                const targetAchieved = actualRev >= target;
                return (
                  <tr key={month} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium">{new Date(month + '-01').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">R {budgetedRev.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right text-purple-600 font-medium">R {target.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">R {actualRev.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-sm text-right font-semibold ${mVariance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {mVariance >= 0 ? '+' : ''}R {mVariance.toLocaleString()}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right ${mVariancePct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {mVariancePct >= 0 ? '+' : ''}{mVariancePct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={targetAchieved ? 'success' : mVariance >= 0 ? 'info' : 'danger'}>
                        {targetAchieved ? 'Target Met' : mVariance >= 0 ? 'On Track' : 'Below Budget'}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-blue-50">
              <tr>
                <td className="px-4 py-3 text-sm font-bold">ANNUAL TOTAL</td>
                <td className="px-4 py-3 text-sm text-right font-bold">R {(annualData.totalRevenue || 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-right font-bold text-purple-700">R {(annualData.target || 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-right font-bold">R {totalActualRevenue.toLocaleString()}</td>
                <td className={`px-4 py-3 text-sm text-right font-bold ${(totalActualRevenue - (annualData.totalRevenue || 0)) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {(totalActualRevenue - (annualData.totalRevenue || 0)) >= 0 ? '+' : ''}R {(totalActualRevenue - (annualData.totalRevenue || 0)).toLocaleString()}
                </td>
                <td className={`px-4 py-3 text-sm text-right font-bold ${(annualData.totalRevenue || 0) > 0 && ((totalActualRevenue - (annualData.totalRevenue || 0)) / (annualData.totalRevenue || 1) * 100) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {(annualData.totalRevenue || 0) > 0 ? (((totalActualRevenue - (annualData.totalRevenue || 0)) / (annualData.totalRevenue || 1) * 100) >= 0 ? '+' : '') + ((totalActualRevenue - (annualData.totalRevenue || 0)) / (annualData.totalRevenue || 1) * 100).toFixed(1) + '%' : 'N/A'}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ===== PER TRUCK VIEW ===== */}
      {activeView === 'truck' && (
        <div className="space-y-4">
          {Object.keys(truckData).length === 0 ? (
            <div className="bg-white rounded-xl border shadow-sm p-8 text-center">
              <div className="p-4 bg-slate-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Icons.Truck />
              </div>
              <h3 className="text-lg font-semibold mb-2">No {isHaulage ? 'Truck' : 'Unit'} Data</h3>
              <p className="text-slate-500">{isHaulage ? 'Truck-level budgeted revenue data is only available for haulage companies.' : 'No unit-level data available.'}</p>
            </div>
          ) : (
            <>
              {/* Truck Summary Table */}
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-slate-50">
                  <h3 className="font-semibold">{isHaulage ? 'Per Truck' : 'Per Unit'} Revenue Budget - {selectedMonth.startsWith('annual') ? 'Annual' : new Date(selectedMonth + '-01').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</h3>
                </div>
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">{isHaulage ? 'Truck' : 'Unit'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Driver</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budgeted Revenue (R)</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Target (R)</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Planned Trips</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Avg/Trip (R)</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(truckData).map(([truckId, data]) => {
                      const isAnnual = selectedMonth.startsWith('annual');
                      const viewData = isAnnual ? data.annual : (data.monthly?.[selectedMonth] || {});
                      const totalBudgetedRevAll = isAnnual
                        ? Object.values(truckData).reduce((s, t) => s + (t.annual?.revenue || 0), 0)
                        : Object.values(truckData).reduce((s, t) => s + (t.monthly?.[selectedMonth]?.revenue || 0), 0);
                      const pctOfTotal = totalBudgetedRevAll > 0 ? ((viewData?.revenue || 0) / totalBudgetedRevAll * 100) : 0;
                      return (
                        <tr key={truckId} className="border-b hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm font-medium">{data.truckName || truckId}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{data.driver || '-'}</td>
                          <td className="px-4 py-3 text-sm text-right font-semibold">R {(viewData?.revenue || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-right text-purple-600 font-medium">R {(viewData?.target || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-right">{viewData?.trips || 0}</td>
                          <td className="px-4 py-3 text-sm text-right text-slate-600">R {(viewData?.avgPerTrip || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-slate-200 rounded-full h-2">
                                <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(pctOfTotal, 100)}%` }}></div>
                              </div>
                              <span className="text-slate-500">{pctOfTotal.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-blue-50">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-sm font-bold">TOTAL</td>
                      <td className="px-4 py-3 text-sm text-right font-bold">
                        R {(selectedMonth.startsWith('annual')
                          ? Object.values(truckData).reduce((s, t) => s + (t.annual?.revenue || 0), 0)
                          : Object.values(truckData).reduce((s, t) => s + (t.monthly?.[selectedMonth]?.revenue || 0), 0)
                        ).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-purple-700">
                        R {(selectedMonth.startsWith('annual')
                          ? Object.values(truckData).reduce((s, t) => s + (t.annual?.target || 0), 0)
                          : Object.values(truckData).reduce((s, t) => s + (t.monthly?.[selectedMonth]?.target || 0), 0)
                        ).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold">
                        {selectedMonth.startsWith('annual')
                          ? Object.values(truckData).reduce((s, t) => s + (t.annual?.trips || 0), 0)
                          : Object.values(truckData).reduce((s, t) => s + (t.monthly?.[selectedMonth]?.trips || 0), 0)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Per-Truck Monthly Breakdown Cards */}
              {selectedMonth.startsWith('annual') && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(truckData).map(([truckId, data]) => (
                    <div key={truckId} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                      <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-cyan-50">
                        <h4 className="font-semibold text-sm">{data.truckName || truckId}</h4>
                        <p className="text-xs text-slate-500">{data.driver || 'Unassigned'}</p>
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Annual Revenue</span>
                          <span className="font-semibold">R {(data.annual?.revenue || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Annual Target</span>
                          <span className="font-medium text-purple-600">R {(data.annual?.target || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Planned Trips</span>
                          <span className="font-medium">{data.annual?.trips || 0}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Avg Revenue/Trip</span>
                          <span className="font-medium">R {(data.annual?.avgPerTrip || 0).toLocaleString()}</span>
                        </div>
                        {/* Progress bar towards target */}
                        <div>
                          <div className="flex justify-between text-xs text-slate-500 mb-1">
                            <span>Progress to Target</span>
                            <span>{data.annual?.target > 0 ? ((data.annual?.revenue || 0) / data.annual.target * 100).toFixed(0) : 0}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(data.annual?.target > 0 ? (data.annual.revenue || 0) / data.annual.target * 100 : 0, 100)}%` }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ===== PER TRIP VIEW ===== */}
      {activeView === 'trip' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          {isHaulage && (
            <div className="flex gap-3 items-center">
              <span className="text-sm text-slate-600">Filter by truck:</span>
              <Select value={filterTruck} onChange={e => setFilterTruck(e.target.value)}>
                <option value="all">All Trucks</option>
                {availableTrucks.map(t => (
                  <option key={t.fleetNo} value={t.fleetNo}>{t.fleetNo} - {t.make} {t.model}</option>
                ))}
                {availableTrucks.length === 0 && Object.keys(truckData).map(id => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </Select>
              <span className="text-sm text-slate-400">Showing {filteredTrips.length} of {tripData.length} trips</span>
            </div>
          )}

          {filteredTrips.length === 0 ? (
            <div className="bg-white rounded-xl border shadow-sm p-8 text-center">
              <div className="p-4 bg-slate-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Icons.Clipboard />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Trip Budgets</h3>
              <p className="text-slate-500 mb-4">{isHaulage ? 'No budgeted trips found for the selected filters.' : 'Trip-level data is only available for haulage companies.'}</p>
              {isHaulage && (
                <button onClick={() => setShowAddTripModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
                  <span className="flex items-center gap-2"><Icons.Plus />Add First Trip Budget</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Trip Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border shadow-sm p-4">
                  <p className="text-xs text-slate-500 mb-1">Total Trips</p>
                  <p className="text-2xl font-bold">{filteredTrips.length}</p>
                </div>
                <div className="bg-white rounded-xl border shadow-sm p-4">
                  <p className="text-xs text-slate-500 mb-1">Total Budgeted</p>
                  <p className="text-2xl font-bold text-blue-600">R {filteredTrips.reduce((s, t) => s + (t.budgetedRevenue || 0), 0).toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-xl border shadow-sm p-4">
                  <p className="text-xs text-slate-500 mb-1">Total Actual</p>
                  <p className="text-2xl font-bold text-emerald-600">R {filteredTrips.reduce((s, t) => s + (t.actualRevenue || 0), 0).toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-xl border shadow-sm p-4">
                  <p className="text-xs text-slate-500 mb-1">Avg Revenue/Trip</p>
                  <p className="text-2xl font-bold text-purple-600">R {filteredTrips.length > 0 ? Math.round(filteredTrips.reduce((s, t) => s + (t.budgetedRevenue || 0), 0) / filteredTrips.length).toLocaleString() : 0}</p>
                </div>
              </div>

              {/* Trips Table */}
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                  <h3 className="font-semibold">Trip Revenue Budgets</h3>
                </div>
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Trip ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Truck</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Route</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Customer</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Distance (km)</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Rate/km (R)</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budgeted (R)</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual (R)</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Variance (R)</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTrips.map(trip => {
                      const tripVar = (trip.actualRevenue || 0) - (trip.budgetedRevenue || 0);
                      return (
                        <tr key={trip.tripId} className="border-b hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm font-medium text-blue-600">{trip.tripId}</td>
                          <td className="px-4 py-3 text-sm">{trip.date}</td>
                          <td className="px-4 py-3 text-sm">
                            <Badge variant="info">{trip.truck}</Badge>
                          </td>
                          <td className="px-4 py-3 text-sm">{trip.route}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{trip.customer || '-'}</td>
                          <td className="px-4 py-3 text-sm text-right">{(trip.distance || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-right text-slate-500">R {(trip.ratePerKm || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm text-right font-semibold">R {(trip.budgetedRevenue || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-right font-semibold">R {(trip.actualRevenue || 0).toLocaleString()}</td>
                          <td className={`px-4 py-3 text-sm text-right font-semibold ${tripVar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {tripVar >= 0 ? '+' : ''}R {tripVar.toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center gap-1">
                              <button onClick={() => handleDeleteTrip(trip.tripId)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Delete trip budget">
                                <Icons.Trash />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-blue-50">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-sm font-bold">TOTAL ({filteredTrips.length} trips)</td>
                      <td className="px-4 py-3 text-sm text-right font-bold">{filteredTrips.reduce((s, t) => s + (t.distance || 0), 0).toLocaleString()}</td>
                      <td></td>
                      <td className="px-4 py-3 text-sm text-right font-bold">R {filteredTrips.reduce((s, t) => s + (t.budgetedRevenue || 0), 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-bold">R {filteredTrips.reduce((s, t) => s + (t.actualRevenue || 0), 0).toLocaleString()}</td>
                      <td className={`px-4 py-3 text-sm text-right font-bold ${(filteredTrips.reduce((s, t) => s + (t.actualRevenue || 0), 0) - filteredTrips.reduce((s, t) => s + (t.budgetedRevenue || 0), 0)) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {(filteredTrips.reduce((s, t) => s + (t.actualRevenue || 0), 0) - filteredTrips.reduce((s, t) => s + (t.budgetedRevenue || 0), 0)) >= 0 ? '+' : ''}
                        R {(filteredTrips.reduce((s, t) => s + (t.actualRevenue || 0), 0) - filteredTrips.reduce((s, t) => s + (t.budgetedRevenue || 0), 0)).toLocaleString()}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Add Trip Budget Modal */}
      <Modal isOpen={showAddTripModal} onClose={() => setShowAddTripModal(false)} title="Add Trip Revenue Budget" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Date" required>
              <Input type="date" value={newTrip.date} onChange={e => setNewTrip({ ...newTrip, date: e.target.value })} />
            </FormField>
            <FormField label="Truck" required>
              <Select value={newTrip.truck} onChange={e => setNewTrip({ ...newTrip, truck: e.target.value })}>
                <option value="">Select Truck</option>
                {availableTrucks.map(t => (
                  <option key={t.fleetNo} value={t.fleetNo}>{t.fleetNo} - {t.make} {t.model}</option>
                ))}
                {availableTrucks.length === 0 && Object.keys(truckData).map(id => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Route">
              <Input value={newTrip.route} onChange={e => setNewTrip({ ...newTrip, route: e.target.value })} placeholder="e.g. DBN-JHB" />
            </FormField>
            <FormField label="Customer">
              <Input value={newTrip.customer} onChange={e => setNewTrip({ ...newTrip, customer: e.target.value })} placeholder="Customer name" />
            </FormField>
            <FormField label="Load Type">
              <Input value={newTrip.loadType} onChange={e => setNewTrip({ ...newTrip, loadType: e.target.value })} placeholder="e.g. Coal, General Cargo" />
            </FormField>
            <FormField label="Distance (km)">
              <Input type="number" value={newTrip.distance} onChange={e => setNewTrip({ ...newTrip, distance: e.target.value })} placeholder="0" />
            </FormField>
            <FormField label="Rate per km (R)">
              <Input type="number" step="0.01" value={newTrip.ratePerKm} onChange={e => setNewTrip({ ...newTrip, ratePerKm: e.target.value })} placeholder="0.00" />
            </FormField>
            <FormField label="Budgeted Revenue (R)" required>
              <Input type="number" value={newTrip.budgetedRevenue} onChange={e => setNewTrip({ ...newTrip, budgetedRevenue: e.target.value })} placeholder="0" />
            </FormField>
          </div>

          {newTrip.budgetedRevenue > 0 && (
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-blue-600">Budgeted Revenue for this Trip</p>
              <p className="font-bold text-blue-900 text-lg">R {parseFloat(newTrip.budgetedRevenue || 0).toLocaleString()}</p>
              {newTrip.distance > 0 && newTrip.ratePerKm > 0 && (
                <p className="text-sm text-blue-600 mt-1">Calculated: {newTrip.distance} km x R{parseFloat(newTrip.ratePerKm).toFixed(2)} = R {(parseFloat(newTrip.distance) * parseFloat(newTrip.ratePerKm)).toLocaleString()}</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setShowAddTripModal(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
            <button onClick={handleAddTrip} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Add Trip Budget</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// Budgets Module
const BudgetsModule = ({ company, config, budgets, setBudgets, categories }) => {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('2025-01');
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const companyBudget = budgets[company.id]?.monthly?.[selectedMonth] || {};
  const annualBudget = budgets[company.id]?.annual || {};

  // Group categories by type
  const directCosts = categories.filter(c => c.type === 'direct');
  const indirectCosts = categories.filter(c => c.type === 'indirect');
  const adminCosts = categories.filter(c => c.type === 'admin');

  const tabs = [
    { id: 'all', name: 'All Categories' },
    { id: 'direct', name: 'Direct Costs' },
    { id: 'indirect', name: 'Indirect Costs' },
    { id: 'admin', name: 'Admin Costs' },
  ];

  const getFilteredCategories = () => {
    switch (activeTab) {
      case 'direct': return directCosts;
      case 'indirect': return indirectCosts;
      case 'admin': return adminCosts;
      default: return categories;
    }
  };

  const isAnnual = selectedMonth.startsWith('annual');
  const budgetData = isAnnual ? annualBudget : companyBudget;
  const totalExpenses = Object.entries(budgetData).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0);

  const exportBudgetData = () => ({
    title: `Budget Report - ${tabs.find(t => t.id === activeTab)?.name}`,
    headers: [
      { key: 'category', label: 'Category', align: 'left' },
      { key: 'type', label: 'Type', align: 'left' },
      { key: 'budget', label: 'Budget (R)', align: 'right' },
      { key: 'pctRevenue', label: '% of Revenue', align: 'right' },
    ],
    data: [
      ...getFilteredCategories().map(cat => ({
        category: cat.name,
        type: cat.type,
        budget: `R ${(budgetData[cat.id] || 0).toLocaleString()}`,
        pctRevenue: `${budgetData.revenue ? ((budgetData[cat.id] || 0) / budgetData.revenue * 100).toFixed(1) : 0}%`,
      })),
      {
        category: 'TOTAL',
        type: '',
        budget: `R ${getFilteredCategories().reduce((s, c) => s + (budgetData[c.id] || 0), 0).toLocaleString()}`,
        pctRevenue: `${budgetData.revenue ? (getFilteredCategories().reduce((s, c) => s + (budgetData[c.id] || 0), 0) / budgetData.revenue * 100).toFixed(1) : 0}%`,
        isTotal: true
      }
    ]
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Budgets</h2>
          <p className="text-slate-500">Set and manage budgets for {config.label}</p>
        </div>
        <div className="flex gap-3">
          <MonthYearSelector value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} includeAnnual={true} />
          <ExportButtons 
            onPDF={() => {
              const data = exportBudgetData();
              exportToPDF(data.title, data.headers, data.data, company, isAnnual ? 'Annual 2025' : new Date(selectedMonth + '-01').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }));
            }}
            onExcel={() => {
              const data = exportBudgetData();
              exportToExcel(data.title.replace(/\s+/g, '_'), data.headers, data.data, company, isAnnual ? 'Annual 2025' : new Date(selectedMonth + '-01').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }));
            }}
          />
          <button onClick={() => setShowBudgetModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
            <Icons.Edit />Edit Budgets
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Budget Revenue" value={`R ${(budgetData.revenue || 0).toLocaleString()}`} icon={<Icons.Target />} color="blue" />
        <KPICard title="Budget Expenses" value={`R ${totalExpenses.toLocaleString()}`} icon={<Icons.Calculator />} color="amber" />
        <KPICard title="Budget Profit" value={`R ${((budgetData.revenue || 0) - totalExpenses).toLocaleString()}`} icon={<Icons.TrendingUp />} color="emerald" />
        <KPICard title="Profit Margin" value={`${budgetData.revenue ? (((budgetData.revenue - totalExpenses) / budgetData.revenue) * 100).toFixed(1) : 0}%`} icon={<Icons.Percent />} color="purple" />
      </div>

      {/* Category Type Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 bg-slate-100 p-1 rounded-lg">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>
            {tab.name}
          </button>
        ))}
      </div>

      {/* Budget Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50">
          <h3 className="font-semibold">{tabs.find(t => t.id === activeTab)?.name} - {isAnnual ? `Annual ${selectedMonth.split('-')[1] || '2025'}` : new Date(selectedMonth + '-01').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</h3>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Type</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget (R)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">% of Revenue</th>
              {!isAnnual && <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Annual Budget</th>}
            </tr>
          </thead>
          <tbody>
            {getFilteredCategories().map(cat => {
              const amount = budgetData[cat.id] || 0;
              const percentOfRev = budgetData.revenue ? (amount / budgetData.revenue * 100) : 0;
              const annualAmt = annualBudget[cat.id] || 0;
              return (
                <tr key={cat.id} className={`border-b hover:bg-slate-50 ${cat.id === 'depreciation' ? 'bg-amber-50' : ''}`}>
                  <td className="px-4 py-3 text-sm font-medium">{cat.name}</td>
                  <td className="px-4 py-3 text-sm">
                    <Badge variant={cat.type === 'direct' ? 'danger' : cat.type === 'indirect' ? 'warning' : 'purple'}>
                      {cat.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold">R {amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-500">{percentOfRev.toFixed(1)}%</td>
                  {!isAnnual && <td className="px-4 py-3 text-sm text-right text-slate-400">R {annualAmt.toLocaleString()}</td>}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-blue-50">
            <tr>
              <td colSpan={2} className="px-4 py-3 text-sm font-bold">TOTAL</td>
              <td className="px-4 py-3 text-sm text-right font-bold">
                R {getFilteredCategories().reduce((s, c) => s + (budgetData[c.id] || 0), 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-sm text-right font-bold">
                {budgetData.revenue ? (getFilteredCategories().reduce((s, c) => s + (budgetData[c.id] || 0), 0) / budgetData.revenue * 100).toFixed(1) : 0}%
              </td>
              {!isAnnual && <td className="px-4 py-3 text-sm text-right font-bold">
                R {getFilteredCategories().reduce((s, c) => s + (annualBudget[c.id] || 0), 0).toLocaleString()}
              </td>}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Budget Edit Modal */}
      <Modal isOpen={showBudgetModal} onClose={() => setShowBudgetModal(false)} title={`Edit ${config.label} Budgets`} size="lg">
        <div className="space-y-4">
          <p className="text-slate-600">Edit budget allocations for each category</p>
          <div className="grid grid-cols-2 gap-4 max-h-96 overflow-y-auto">
            {categories.map(cat => (
              <div key={cat.id} className="p-3 border rounded-lg">
                <label className="block text-sm font-medium mb-1">{cat.name}</label>
                <Input type="number" defaultValue={annualBudget[cat.id] || 0} placeholder="0" />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setShowBudgetModal(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
            <button onClick={() => setShowBudgetModal(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Save Budgets</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// Depreciation Module
const DepreciationModule = ({ company, config, assets, setAssets, showModal, setShowModal, editAsset, setEditAsset }) => {
  const [activeTab, setActiveTab] = useState('register');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // Calculate totals
  const totalCost = assets.reduce((sum, a) => sum + a.purchaseCost, 0);
  const totalAccumulated = assets.reduce((sum, a) => sum + a.accumulatedDepreciation, 0);
  const totalBookValue = assets.reduce((sum, a) => sum + a.bookValue, 0);
  const monthlyDepreciation = assets.filter(a => a.status === 'Active').reduce((sum, a) => {
    if (a.depreciationMethod === 'straight') {
      return sum + ((a.purchaseCost - a.residualValue) / a.usefulLife / 12);
    } else {
      return sum + (a.bookValue * (a.depreciationRate / 100) / 12);
    }
  }, 0);

  const filteredAssets = assets.filter(a => {
    if (filterCategory !== 'all' && a.category !== filterCategory) return false;
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    return true;
  });

  const handleSaveAsset = (formData) => {
    if (editAsset) {
      setAssets(assets.map(a => a.id === editAsset.id ? {...formData, id: editAsset.id} : a));
    } else {
      const newId = (Math.max(...assets.map(a => parseInt(a.id)), 0) + 1).toString();
      setAssets([...assets, {...formData, id: newId}]);
    }
    setShowModal(false);
    setEditAsset(null);
  };

  const handleRunDepreciation = () => {
    const updated = assets.map(a => {
      if (a.status !== 'Active') return a;
      let monthlyDep;
      if (a.depreciationMethod === 'straight') {
        monthlyDep = (a.purchaseCost - a.residualValue) / a.usefulLife / 12;
      } else {
        monthlyDep = a.bookValue * (a.depreciationRate / 100) / 12;
      }
      const newAccumulated = Math.min(a.accumulatedDepreciation + monthlyDep, a.purchaseCost - a.residualValue);
      const newBookValue = a.purchaseCost - newAccumulated;
      return {
        ...a,
        accumulatedDepreciation: newAccumulated,
        bookValue: newBookValue,
        lastDepreciationDate: new Date().toISOString().split('T')[0],
        status: newBookValue <= a.residualValue ? 'Fully Depreciated' : a.status
      };
    });
    setAssets(updated);
    alert('Depreciation run completed for ' + new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }));
  };

  const tabs = [
    { id: 'register', name: 'Asset Register', icon: <Icons.Layers /> },
    { id: 'schedule', name: 'Depreciation Schedule', icon: <Icons.Calendar /> },
    { id: 'summary', name: 'Category Summary', icon: <Icons.BarChart /> },
  ];

  const exportDepreciationData = () => ({
    title: 'Asset Register & Depreciation',
    headers: [
      { key: 'code', label: 'Asset Code', align: 'left' },
      { key: 'description', label: 'Description', align: 'left' },
      { key: 'category', label: 'Category', align: 'left' },
      { key: 'purchaseCost', label: 'Cost', align: 'right' },
      { key: 'accumulatedDep', label: 'Acc. Dep', align: 'right' },
      { key: 'bookValue', label: 'Book Value', align: 'right' },
      { key: 'monthlyDep', label: 'Monthly Dep', align: 'right' },
      { key: 'status', label: 'Status', align: 'left' },
    ],
    data: [
      ...filteredAssets.map(a => {
        let monthlyDep = 0;
        if (a.status === 'Active') {
          if (a.depreciationMethod === 'straight') {
            monthlyDep = (a.purchaseCost - a.residualValue) / a.usefulLife / 12;
          } else {
            monthlyDep = a.bookValue * (a.depreciationRate / 100) / 12;
          }
        }
        return {
          code: a.assetCode,
          description: a.description,
          category: a.category,
          purchaseCost: `R ${a.purchaseCost.toLocaleString()}`,
          accumulatedDep: `R ${Math.round(a.accumulatedDepreciation).toLocaleString()}`,
          bookValue: `R ${Math.round(a.bookValue).toLocaleString()}`,
          monthlyDep: `R ${Math.round(monthlyDep).toLocaleString()}`,
          status: a.status,
        };
      }),
      {
        code: 'TOTAL',
        description: '',
        category: '',
        purchaseCost: `R ${totalCost.toLocaleString()}`,
        accumulatedDep: `R ${Math.round(totalAccumulated).toLocaleString()}`,
        bookValue: `R ${Math.round(totalBookValue).toLocaleString()}`,
        monthlyDep: `R ${Math.round(monthlyDepreciation).toLocaleString()}`,
        status: '',
        isTotal: true
      }
    ]
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Depreciation</h2>
          <p className="text-slate-500">Fixed asset register and depreciation tracking</p>
        </div>
        <div className="flex gap-3">
          <ExportButtons 
            onPDF={() => {
              const data = exportDepreciationData();
              exportToPDF(data.title, data.headers, data.data, company, '');
            }}
            onExcel={() => {
              const data = exportDepreciationData();
              exportToExcel(data.title.replace(/\s+/g, '_'), data.headers, data.data, company, '');
            }}
          />
          <button onClick={handleRunDepreciation} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700">
            <Icons.RefreshCw />Run Depreciation
          </button>
          <button onClick={() => { setEditAsset(null); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
            <Icons.Plus />Add Asset
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Total Asset Cost" value={`R ${totalCost.toLocaleString()}`} icon={<Icons.Receipt />} color="blue" />
        <KPICard title="Accumulated Depreciation" value={`R ${Math.round(totalAccumulated).toLocaleString()}`} icon={<Icons.TrendingDown />} color="red" />
        <KPICard title="Net Book Value" value={`R ${Math.round(totalBookValue).toLocaleString()}`} icon={<Icons.DollarSign />} color="emerald" />
        <KPICard title="Monthly Depreciation" value={`R ${Math.round(monthlyDepreciation).toLocaleString()}`} icon={<Icons.Calendar />} color="purple" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>
            {tab.icon}{tab.name}
          </button>
        ))}
      </div>

      {/* Asset Register Tab */}
      {activeTab === 'register' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-4 items-center bg-white p-4 rounded-lg border">
            <div className="flex items-center gap-2">
              <Icons.Filter />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <Select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="all">All Categories</option>
              {assetCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">All Status</option>
              <option value="Active">Active</option>
              <option value="Disposed">Disposed</option>
              <option value="Fully Depreciated">Fully Depreciated</option>
            </Select>
            <span className="text-sm text-slate-500 ml-auto">{filteredAssets.length} assets</span>
          </div>

          {/* Asset Table */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Asset Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Category</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Accum. Dep</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Book Value</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map(asset => (
                  <tr key={asset.id} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-bold text-blue-600">{asset.assetCode}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium">{asset.name}</p>
                      <p className="text-xs text-slate-500">{asset.location}</p>
                    </td>
                    <td className="px-4 py-3 text-sm">{assetCategories.find(c => c.id === asset.category)?.name}</td>
                    <td className="px-4 py-3 text-sm text-right">R {asset.purchaseCost.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right text-red-600">R {Math.round(asset.accumulatedDepreciation).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-emerald-600">R {Math.round(asset.bookValue).toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={asset.status === 'Active' ? 'success' : asset.status === 'Disposed' ? 'danger' : 'warning'}>{asset.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => { setEditAsset(asset); setShowModal(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Icons.Edit /></button>
                        <button onClick={() => { if(confirm('Are you sure you want to delete this asset?')) { setAssets(assets.filter(a => a.id !== asset.id)); } }} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Icons.Trash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-sm font-bold">TOTALS</td>
                  <td className="px-4 py-3 text-sm text-right font-bold">R {totalCost.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-red-600">R {Math.round(totalAccumulated).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-emerald-600">R {Math.round(totalBookValue).toLocaleString()}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Depreciation Schedule Tab */}
      {activeTab === 'schedule' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-slate-50">
            <h3 className="font-semibold">Monthly Depreciation Schedule - 2025</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-slate-600">Asset</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-slate-600">Method</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-slate-600">Jan</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-slate-600">Feb</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-slate-600">Mar</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-slate-600">Apr</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-slate-600">May</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-slate-600">Jun</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-slate-600">Annual</th>
              </tr>
            </thead>
            <tbody>
              {assets.filter(a => a.status === 'Active').map(asset => {
                const monthlyDep = asset.depreciationMethod === 'straight' 
                  ? (asset.purchaseCost - asset.residualValue) / asset.usefulLife / 12
                  : asset.bookValue * (asset.depreciationRate / 100) / 12;
                return (
                  <tr key={asset.id} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <p className="font-medium">{asset.assetCode}</p>
                      <p className="text-xs text-slate-500 truncate max-w-[200px]">{asset.name}</p>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={asset.depreciationMethod === 'straight' ? 'info' : 'purple'}>
                        {asset.depreciationMethod === 'straight' ? 'SL' : 'RB'}
                      </Badge>
                    </td>
                    {[...Array(6)].map((_, i) => (
                      <td key={i} className="px-3 py-2 text-right text-slate-600">R {Math.round(monthlyDep).toLocaleString()}</td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold">R {Math.round(monthlyDep * 12).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-amber-50">
              <tr>
                <td colSpan={2} className="px-3 py-3 font-bold">MONTHLY TOTAL</td>
                {[...Array(6)].map((_, i) => (
                  <td key={i} className="px-3 py-3 text-right font-bold">R {Math.round(monthlyDepreciation).toLocaleString()}</td>
                ))}
                <td className="px-3 py-3 text-right font-bold text-amber-700">R {Math.round(monthlyDepreciation * 12).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Category Summary Tab */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-slate-50">
              <h3 className="font-semibold">Depreciation by Asset Category</h3>
            </div>
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Category</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-600">Assets</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Total Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Accum. Dep</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Book Value</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">% Depreciated</th>
                </tr>
              </thead>
              <tbody>
                {assetCategories.map(cat => {
                  const catAssets = assets.filter(a => a.category === cat.id);
                  if (catAssets.length === 0) return null;
                  const catCost = catAssets.reduce((s, a) => s + a.purchaseCost, 0);
                  const catAccum = catAssets.reduce((s, a) => s + a.accumulatedDepreciation, 0);
                  const catBook = catAssets.reduce((s, a) => s + a.bookValue, 0);
                  const depPercent = catCost ? (catAccum / catCost * 100) : 0;
                  return (
                    <tr key={cat.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium">{cat.name}</td>
                      <td className="px-4 py-3 text-sm text-center">{catAssets.length}</td>
                      <td className="px-4 py-3 text-sm text-right">R {catCost.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right text-red-600">R {Math.round(catAccum).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-emerald-600">R {Math.round(catBook).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${depPercent}%` }} />
                          </div>
                          <span className="text-sm font-medium w-12 text-right">{depPercent.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100">
                <tr>
                  <td className="px-4 py-3 text-sm font-bold">TOTAL</td>
                  <td className="px-4 py-3 text-sm text-center font-bold">{assets.length}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold">R {totalCost.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-red-600">R {Math.round(totalAccumulated).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-emerald-600">R {Math.round(totalBookValue).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold">{totalCost ? (totalAccumulated / totalCost * 100).toFixed(0) : 0}%</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Chart */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold mb-4">Asset Value by Category</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={assetCategories.map(cat => {
                const catAssets = assets.filter(a => a.category === cat.id);
                return {
                  name: cat.name.split(' ')[0],
                  cost: catAssets.reduce((s, a) => s + a.purchaseCost, 0),
                  accumulated: catAssets.reduce((s, a) => s + a.accumulatedDepreciation, 0),
                  bookValue: catAssets.reduce((s, a) => s + a.bookValue, 0),
                };
              }).filter(c => c.cost > 0)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `R${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => `R ${v.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="cost" fill="#3b82f6" name="Original Cost" />
                <Bar dataKey="accumulated" fill="#ef4444" name="Accumulated Dep" />
                <Bar dataKey="bookValue" fill="#10b981" name="Book Value" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Asset Form Modal */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditAsset(null); }} 
        title={editAsset ? 'Edit Asset' : 'Add New Asset'} size="lg">
        <AssetForm asset={editAsset} onSave={handleSaveAsset} onCancel={() => { setShowModal(false); setEditAsset(null); }} />
      </Modal>
    </div>
  );
};

// Asset Form Component
const AssetForm = ({ asset, onSave, onCancel }) => {
  const [form, setForm] = useState(asset || {
    assetCode: '', name: '', category: 'vehicles', description: '', location: '',
    supplier: '', invoiceNo: '', purchaseDate: '', purchaseCost: 0, residualValue: 0,
    usefulLife: 5, depreciationMethod: 'straight', depreciationRate: 20,
    accumulatedDepreciation: 0, bookValue: 0, lastDepreciationDate: '', status: 'Active',
    linkedFleetNo: ''
  });

  const handleCategoryChange = (categoryId) => {
    const cat = assetCategories.find(c => c.id === categoryId);
    setForm({
      ...form, 
      category: categoryId,
      usefulLife: cat?.defaultLife || 5,
      depreciationMethod: cat?.defaultMethod === 'Straight Line' ? 'straight' : 'reducing',
      depreciationRate: 100 / (cat?.defaultLife || 5)
    });
  };

  const handleCostChange = (cost) => {
    const residual = form.residualValue || 0;
    setForm({...form, purchaseCost: cost, bookValue: cost - form.accumulatedDepreciation});
  };

  return (
    <div className="space-y-6">
      {/* Asset Identification */}
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3 pb-2 border-b">Asset Identification</h3>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Asset Code" required>
            <Input value={form.assetCode} onChange={e => setForm({...form, assetCode: e.target.value.toUpperCase()})} placeholder="VEH-001" />
          </FormField>
          <FormField label="Category" required>
            <Select value={form.category} onChange={e => handleCategoryChange(e.target.value)}>
              {assetCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Status">
            <Select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
              <option value="Active">Active</option>
              <option value="Disposed">Disposed</option>
              <option value="Fully Depreciated">Fully Depreciated</option>
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <FormField label="Asset Name / Description" required>
            <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="UD Quester GWE 420 - TA-001" />
          </FormField>
          <FormField label="Location">
            <Input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="Durban Depot" />
          </FormField>
        </div>
        <div className="mt-4">
          <FormField label="Detailed Description">
            <Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Additional details about the asset..." />
          </FormField>
        </div>
      </div>

      {/* Purchase Information */}
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3 pb-2 border-b">Purchase Information</h3>
        <div className="grid grid-cols-4 gap-4">
          <FormField label="Purchase Date" required>
            <Input type="date" value={form.purchaseDate} onChange={e => setForm({...form, purchaseDate: e.target.value})} />
          </FormField>
          <FormField label="Purchase Cost (R)" required>
            <Input type="number" value={form.purchaseCost} onChange={e => handleCostChange(parseFloat(e.target.value) || 0)} placeholder="0.00" />
          </FormField>
          <FormField label="Supplier">
            <Input value={form.supplier} onChange={e => setForm({...form, supplier: e.target.value})} placeholder="Supplier name" />
          </FormField>
          <FormField label="Invoice Number">
            <Input value={form.invoiceNo} onChange={e => setForm({...form, invoiceNo: e.target.value})} placeholder="INV-2022-0001" />
          </FormField>
        </div>
      </div>

      {/* Depreciation Settings */}
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3 pb-2 border-b">Depreciation Settings</h3>
        <div className="grid grid-cols-4 gap-4">
          <FormField label="Depreciation Method" required>
            <Select value={form.depreciationMethod} onChange={e => setForm({...form, depreciationMethod: e.target.value})}>
              {depreciationMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Useful Life (Years)" required>
            <Input type="number" value={form.usefulLife} onChange={e => {
              const life = parseInt(e.target.value) || 1;
              setForm({...form, usefulLife: life, depreciationRate: 100 / life});
            }} min="1" max="50" />
          </FormField>
          <FormField label="Depreciation Rate (%)">
            <Input type="number" value={form.depreciationRate.toFixed(2)} onChange={e => setForm({...form, depreciationRate: parseFloat(e.target.value) || 0})} step="0.01" />
          </FormField>
          <FormField label="Residual Value (R)">
            <Input type="number" value={form.residualValue} onChange={e => setForm({...form, residualValue: parseFloat(e.target.value) || 0})} placeholder="0.00" />
          </FormField>
        </div>
      </div>

      {/* Current Values */}
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3 pb-2 border-b">Current Values</h3>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Accumulated Depreciation (R)">
            <Input type="number" value={form.accumulatedDepreciation} onChange={e => {
              const accum = parseFloat(e.target.value) || 0;
              setForm({...form, accumulatedDepreciation: accum, bookValue: form.purchaseCost - accum});
            }} placeholder="0.00" />
          </FormField>
          <FormField label="Book Value (R)">
            <Input type="number" value={form.bookValue} readOnly className="bg-slate-100" />
          </FormField>
          <FormField label="Last Depreciation Date">
            <Input type="date" value={form.lastDepreciationDate} onChange={e => setForm({...form, lastDepreciationDate: e.target.value})} />
          </FormField>
        </div>
      </div>

      {/* Linking */}
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3 pb-2 border-b">Fleet Linking (Optional)</h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Linked Fleet Number">
            <Input value={form.linkedFleetNo} onChange={e => setForm({...form, linkedFleetNo: e.target.value})} placeholder="TA-001 or TR-001" />
          </FormField>
          <div className="flex items-end">
            <p className="text-sm text-slate-500 pb-2">Link this asset to a truck or trailer in the fleet register</p>
          </div>
        </div>
      </div>

      {/* Depreciation Preview */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">Depreciation Preview</h4>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-blue-600">Depreciable Amount</p>
            <p className="font-bold text-blue-900">R {(form.purchaseCost - form.residualValue).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-blue-600">Annual Depreciation</p>
            <p className="font-bold text-blue-900">R {form.depreciationMethod === 'straight' 
              ? Math.round((form.purchaseCost - form.residualValue) / form.usefulLife).toLocaleString()
              : Math.round(form.bookValue * (form.depreciationRate / 100)).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-blue-600">Monthly Depreciation</p>
            <p className="font-bold text-blue-900">R {form.depreciationMethod === 'straight' 
              ? Math.round((form.purchaseCost - form.residualValue) / form.usefulLife / 12).toLocaleString()
              : Math.round(form.bookValue * (form.depreciationRate / 100) / 12).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-blue-600">Remaining Life</p>
            <p className="font-bold text-blue-900">{Math.max(0, form.usefulLife - Math.floor(form.accumulatedDepreciation / ((form.purchaseCost - form.residualValue) / form.usefulLife || 1))).toFixed(1)} years</p>
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button onClick={onCancel} className="px-4 py-2 border border-slate-300 rounded-lg font-medium hover:bg-slate-50">Cancel</button>
        <button onClick={() => onSave(form)} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
          {asset ? 'Update Asset' : 'Add Asset'}
        </button>
      </div>
    </div>
  );
};

// Cost Analysis Module (Haulage)
const CostAnalysisModule = ({ company, config, jobs, fleet, actuals, budgets }) => {
  const [activeTab, setActiveTab] = useState('perKm');
  const trucks = fleet?.trucks || [];
  const companyActuals = actuals[company.id] || {};
  const companyBudgets = budgets[company.id] || {};
  const truckActuals = companyActuals.byTruck || {};
  const truckBudgets = companyBudgets.byTruck || {};
  const routeActuals = companyActuals.byRoute || {};
  const routeBudgets = companyBudgets.byRoute || {};

  const completedJobs = jobs.filter(j => j.status === 'Completed');
  const totalRevenue = completedJobs.reduce((s, j) => s + (j.revenue || 0), 0);
  const totalFuel = completedJobs.reduce((s, j) => s + (j.fuelCost || 0), 0);
  const totalTolls = completedJobs.reduce((s, j) => s + (j.tollCost || 0), 0);
  const totalOther = completedJobs.reduce((s, j) => s + (j.otherCosts || 0), 0);
  const totalDistance = completedJobs.reduce((s, j) => s + (j.distance || 0), 0);
  const totalCosts = totalFuel + totalTolls + totalOther;
  const avgCostPerKm = totalDistance > 0 ? (totalCosts / totalDistance) : 0;
  const avgRevenuePerKm = totalDistance > 0 ? (totalRevenue / totalDistance) : 0;

  // Driver performance from jobs
  const driverStats = {};
  completedJobs.forEach(j => {
    if (!driverStats[j.driver]) {
      driverStats[j.driver] = { trips: 0, revenue: 0, fuelCost: 0, distance: 0, totalCosts: 0 };
    }
    driverStats[j.driver].trips += 1;
    driverStats[j.driver].revenue += j.revenue || 0;
    driverStats[j.driver].fuelCost += j.fuelCost || 0;
    driverStats[j.driver].distance += j.distance || 0;
    driverStats[j.driver].totalCosts += (j.fuelCost || 0) + (j.tollCost || 0) + (j.otherCosts || 0);
  });

  const tabs = [
    { id: 'perKm', name: 'Cost per KM' },
    { id: 'drivers', name: 'Driver Performance' },
    { id: 'routes', name: 'Route Profitability' },
    { id: 'trucks', name: 'Truck Efficiency' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Cost Analysis</h2>
          <p className="text-slate-500">Operational efficiency & profitability metrics</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard title="Completed Jobs" value={completedJobs.length} icon={<Icons.Check />} color="emerald" />
        <KPICard title="Total Distance" value={`${totalDistance.toLocaleString()} km`} icon={<Icons.MapPin />} color="blue" />
        <KPICard title="Avg Cost/KM" value={`R ${avgCostPerKm.toFixed(2)}`} icon={<Icons.Calculator />} color="amber" />
        <KPICard title="Avg Revenue/KM" value={`R ${avgRevenuePerKm.toFixed(2)}`} icon={<Icons.DollarSign />} color="emerald" />
        <KPICard title="Profit/KM" value={`R ${(avgRevenuePerKm - avgCostPerKm).toFixed(2)}`} icon={<Icons.TrendingUp />} color="purple" />
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 bg-slate-100 p-1 rounded-lg">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>
            {tab.name}
          </button>
        ))}
      </div>

      {/* Cost per KM Tab */}
      {activeTab === 'perKm' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-slate-50">
              <h3 className="font-semibold">Cost Breakdown per Job</h3>
            </div>
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Job</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Route</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Distance (km)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Revenue (R)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Fuel (R)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Tolls (R)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Other (R)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Cost/km (R)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Rev/km (R)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Profit/km (R)</th>
                </tr>
              </thead>
              <tbody>
                {completedJobs.map(job => {
                  const jCost = (job.fuelCost || 0) + (job.tollCost || 0) + (job.otherCosts || 0);
                  const costPerKm = job.distance > 0 ? jCost / job.distance : 0;
                  const revPerKm = job.distance > 0 ? (job.revenue || 0) / job.distance : 0;
                  return (
                    <tr key={job.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium">{job.jobNo}</td>
                      <td className="px-4 py-3 text-sm">{job.origin} → {job.destination}</td>
                      <td className="px-4 py-3 text-sm text-right">{(job.distance || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">R {(job.revenue || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right">R {(job.fuelCost || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right">R {(job.tollCost || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right">R {(job.otherCosts || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right text-amber-600 font-medium">R {costPerKm.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-right text-blue-600 font-medium">R {revPerKm.toFixed(2)}</td>
                      <td className={`px-4 py-3 text-sm text-right font-bold ${(revPerKm - costPerKm) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>R {(revPerKm - costPerKm).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-blue-50">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-sm font-bold">AVERAGE</td>
                  <td className="px-4 py-3 text-sm text-right font-bold">{completedJobs.length > 0 ? Math.round(totalDistance / completedJobs.length).toLocaleString() : 0}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold">R {completedJobs.length > 0 ? Math.round(totalRevenue / completedJobs.length).toLocaleString() : 0}</td>
                  <td colSpan={3}></td>
                  <td className="px-4 py-3 text-sm text-right font-bold">R {avgCostPerKm.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold">R {avgRevenuePerKm.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold">R {(avgRevenuePerKm - avgCostPerKm).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Driver Performance Tab */}
      {activeTab === 'drivers' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-slate-50">
              <h3 className="font-semibold">Driver Performance Summary</h3>
            </div>
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Driver</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Trips</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Total Distance (km)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Revenue (R)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Total Costs (R)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Profit (R)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Avg Rev/Trip (R)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Cost/km (R)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-600">Efficiency</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(driverStats).map(([driver, stats]) => {
                  const profit = stats.revenue - stats.totalCosts;
                  const costPerKm = stats.distance > 0 ? stats.totalCosts / stats.distance : 0;
                  const efficiency = stats.revenue > 0 ? (profit / stats.revenue * 100) : 0;
                  return (
                    <tr key={driver} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium">{driver}</td>
                      <td className="px-4 py-3 text-sm text-right">{stats.trips}</td>
                      <td className="px-4 py-3 text-sm text-right">{stats.distance.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">R {stats.revenue.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right">R {stats.totalCosts.toLocaleString()}</td>
                      <td className={`px-4 py-3 text-sm text-right font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>R {profit.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right">R {stats.trips > 0 ? Math.round(stats.revenue / stats.trips).toLocaleString() : 0}</td>
                      <td className="px-4 py-3 text-sm text-right">R {costPerKm.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-20 bg-slate-200 rounded-full h-2">
                            <div className={`h-2 rounded-full ${efficiency >= 40 ? 'bg-emerald-500' : efficiency >= 20 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(Math.max(efficiency, 0), 100)}%` }}></div>
                          </div>
                          <span className="text-xs font-medium">{efficiency.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Driver Revenue Chart */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold mb-4">Driver Revenue & Profit Comparison</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={Object.entries(driverStats).map(([driver, stats]) => ({
                name: driver.split(' ')[0],
                revenue: stats.revenue,
                profit: stats.revenue - stats.totalCosts,
                costs: stats.totalCosts,
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `R${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => `R ${v.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" radius={[4,4,0,0]} />
                <Bar dataKey="costs" fill="#ef4444" name="Costs" radius={[4,4,0,0]} />
                <Bar dataKey="profit" fill="#10b981" name="Profit" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Route Profitability Tab */}
      {activeTab === 'routes' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-slate-50">
            <h3 className="font-semibold">Route Profitability Analysis</h3>
          </div>
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Route</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Rev (R)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Rev (R)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Trips</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Trips</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Fuel Cost (R)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Tolls (R)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Rev Variance</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(routeBudgets).map(([route, bData]) => {
                const aData = routeActuals[route] || {};
                const revVar = (aData.revenue || 0) - (bData.revenue || 0);
                const revVarPct = (bData.revenue || 0) > 0 ? (revVar / bData.revenue * 100) : 0;
                return (
                  <tr key={route} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium"><Badge variant="info">{route}</Badge></td>
                    <td className="px-4 py-3 text-sm text-right">R {(bData.revenue || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">R {(aData.revenue || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right">{bData.trips || 0}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">{aData.trips || 0}</td>
                    <td className="px-4 py-3 text-sm text-right">R {(aData.fuel || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right">R {(aData.tolls || 0).toLocaleString()}</td>
                    <td className={`px-4 py-3 text-sm text-right font-bold ${revVar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {revVar >= 0 ? '+' : ''}{revVarPct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Truck Efficiency Tab */}
      {activeTab === 'trucks' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-slate-50">
              <h3 className="font-semibold">Truck Revenue & Cost Efficiency</h3>
            </div>
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Truck</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Make/Model</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Rev (R)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Rev (R)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Fuel (R)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Repairs (R)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Net Profit (R)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-600">ROI</th>
                </tr>
              </thead>
              <tbody>
                {trucks.filter(t => truckBudgets[t.fleetNo] || truckActuals[t.fleetNo]).map(truck => {
                  const bData = truckBudgets[truck.fleetNo] || {};
                  const aData = truckActuals[truck.fleetNo] || {};
                  const aCosts = (aData.fuel || 0) + (aData.repairs || 0) + (aData.tyres || 0) + (aData.tolls || 0) + (aData.depreciation || 0);
                  const netProfit = (aData.revenue || 0) - aCosts;
                  const roi = truck.purchasePrice > 0 ? (netProfit / truck.purchasePrice * 100) : 0;
                  return (
                    <tr key={truck.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium"><Badge variant="info">{truck.fleetNo}</Badge></td>
                      <td className="px-4 py-3 text-sm">{truck.make} {truck.model}</td>
                      <td className="px-4 py-3 text-sm text-right">R {(bData.revenue || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">R {(aData.revenue || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right">R {(aData.fuel || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right">R {(aData.repairs || 0).toLocaleString()}</td>
                      <td className={`px-4 py-3 text-sm text-right font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>R {netProfit.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={roi >= 5 ? 'success' : roi >= 0 ? 'warning' : 'danger'}>{roi.toFixed(1)}%</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// Projects Module (Construction)
const ProjectsModule = ({ company, config, budgets, actuals, categories }) => {
  const projectData = budgets[company.id]?.byProject || {};
  const actualProjectData = actuals[company.id]?.byProject || {};
  const projects = Object.entries(projectData);

  const totalBudgetRevenue = projects.reduce((s, [, p]) => s + (p.revenue || 0), 0);
  const totalActualRevenue = Object.values(actualProjectData).reduce((s, p) => s + (p.revenue || 0), 0);
  const totalBudgetCosts = projects.reduce((s, [, p]) => s + (p.materials || 0) + (p.subcontractors || 0) + (p.labour || 0) + (p.equipment || 0) + (p.depreciation || 0), 0);
  const totalActualCosts = Object.values(actualProjectData).reduce((s, p) => s + (p.materials || 0) + (p.subcontractors || 0) + (p.labour || 0) + (p.equipment || 0) + (p.depreciation || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Projects</h2>
          <p className="text-slate-500">Track project budgets & profitability for {config.label}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Active Projects" value={projects.length} icon={<Icons.Building />} color="blue" />
        <KPICard title="Budget Revenue" value={`R ${totalBudgetRevenue.toLocaleString()}`} icon={<Icons.Target />} color="emerald" />
        <KPICard title="Actual Revenue" value={`R ${totalActualRevenue.toLocaleString()}`} icon={<Icons.DollarSign />} color="amber" />
        <KPICard title="Profit Margin" value={`${totalActualRevenue > 0 ? ((totalActualRevenue - totalActualCosts) / totalActualRevenue * 100).toFixed(1) : 0}%`} icon={<Icons.Percent />} color="purple" />
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50">
          <h3 className="font-semibold">Project Budget vs Actuals</h3>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Project</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Rev (R)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Rev (R)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Costs (R)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Costs (R)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Profit (R)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Profit (R)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Margin %</th>
            </tr>
          </thead>
          <tbody>
            {projects.map(([id, proj]) => {
              const actual = actualProjectData[id] || {};
              const bCosts = (proj.materials || 0) + (proj.subcontractors || 0) + (proj.labour || 0) + (proj.equipment || 0) + (proj.depreciation || 0);
              const aCosts = (actual.materials || 0) + (actual.subcontractors || 0) + (actual.labour || 0) + (actual.equipment || 0) + (actual.depreciation || 0);
              const bProfit = (proj.revenue || 0) - bCosts;
              const aProfit = (actual.revenue || 0) - aCosts;
              const margin = (actual.revenue || 0) > 0 ? (aProfit / actual.revenue * 100) : 0;
              return (
                <tr key={id} className="border-b hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium">{id}</td>
                  <td className="px-4 py-3 text-sm text-right">R {(proj.revenue || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold">R {(actual.revenue || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right">R {bCosts.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold">R {aCosts.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right text-blue-600">R {bProfit.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-sm text-right font-bold ${aProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>R {aProfit.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-sm text-right font-bold ${margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{margin.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-blue-50">
            <tr>
              <td className="px-4 py-3 text-sm font-bold">TOTAL</td>
              <td className="px-4 py-3 text-sm text-right font-bold">R {totalBudgetRevenue.toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-right font-bold">R {totalActualRevenue.toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-right font-bold">R {totalBudgetCosts.toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-right font-bold">R {totalActualCosts.toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-right font-bold text-blue-600">R {(totalBudgetRevenue - totalBudgetCosts).toLocaleString()}</td>
              <td className={`px-4 py-3 text-sm text-right font-bold ${(totalActualRevenue - totalActualCosts) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>R {(totalActualRevenue - totalActualCosts).toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-right font-bold">{totalActualRevenue > 0 ? ((totalActualRevenue - totalActualCosts) / totalActualRevenue * 100).toFixed(1) : 0}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Project Cost Breakdown Chart */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold mb-4">Project Cost Breakdown</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={projects.map(([id, proj]) => {
            const actual = actualProjectData[id] || {};
            return {
              name: id,
              materials: actual.materials || 0,
              subcontractors: actual.subcontractors || 0,
              labour: actual.labour || 0,
              equipment: actual.equipment || 0,
            };
          })}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v) => `R${(v/1000000).toFixed(1)}M`} />
            <Tooltip formatter={(v) => `R ${v.toLocaleString()}`} />
            <Legend />
            <Bar dataKey="materials" stackId="a" fill="#3b82f6" name="Materials" />
            <Bar dataKey="subcontractors" stackId="a" fill="#10b981" name="Subcontractors" />
            <Bar dataKey="labour" stackId="a" fill="#f59e0b" name="Labour" />
            <Bar dataKey="equipment" stackId="a" fill="#8b5cf6" name="Equipment" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Programs Module (Education)
const ProgramsModule = ({ company, config, budgets, actuals, categories }) => {
  const programData = budgets[company.id]?.byProgram || {};
  const actualProgramData = actuals[company.id]?.byProgram || {};
  const programs = Object.entries(programData);

  const totalBudgetRevenue = programs.reduce((s, [, p]) => s + (p.revenue || 0), 0);
  const totalActualRevenue = Object.values(actualProgramData).reduce((s, p) => s + (p.revenue || 0), 0);
  const totalBudgetCosts = programs.reduce((s, [, p]) => s + (p.academicSalaries || 0) + (p.materials || 0) + (p.practicals || 0) + (p.depreciation || 0), 0);
  const totalActualCosts = Object.values(actualProgramData).reduce((s, p) => s + (p.academicSalaries || 0) + (p.materials || 0) + (p.practicals || 0) + (p.depreciation || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Programs</h2>
          <p className="text-slate-500">Track program budgets & enrolment revenue for {config.label}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Active Programs" value={programs.length} icon={<Icons.GraduationCap />} color="purple" />
        <KPICard title="Budget Revenue" value={`R ${totalBudgetRevenue.toLocaleString()}`} icon={<Icons.Target />} color="blue" />
        <KPICard title="Actual Revenue" value={`R ${totalActualRevenue.toLocaleString()}`} icon={<Icons.DollarSign />} color="emerald" />
        <KPICard title="Surplus Margin" value={`${totalActualRevenue > 0 ? ((totalActualRevenue - totalActualCosts) / totalActualRevenue * 100).toFixed(1) : 0}%`} icon={<Icons.Percent />} color="amber" />
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50">
          <h3 className="font-semibold">Program Budget vs Actuals</h3>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Program</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Rev (R)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Rev (R)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Academic Salaries (R)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Materials (R)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Practicals (R)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Surplus (R)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Margin %</th>
            </tr>
          </thead>
          <tbody>
            {programs.map(([id, prog]) => {
              const actual = actualProgramData[id] || {};
              const aCosts = (actual.academicSalaries || 0) + (actual.materials || 0) + (actual.practicals || 0) + (actual.depreciation || 0);
              const surplus = (actual.revenue || 0) - aCosts;
              const margin = (actual.revenue || 0) > 0 ? (surplus / actual.revenue * 100) : 0;
              return (
                <tr key={id} className="border-b hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium">{id}</td>
                  <td className="px-4 py-3 text-sm text-right">R {(prog.revenue || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold">R {(actual.revenue || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right">R {(actual.academicSalaries || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right">R {(actual.materials || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right">R {(actual.practicals || 0).toLocaleString()}</td>
                  <td className={`px-4 py-3 text-sm text-right font-bold ${surplus >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>R {surplus.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-sm text-right font-bold ${margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{margin.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-purple-50">
            <tr>
              <td className="px-4 py-3 text-sm font-bold">TOTAL</td>
              <td className="px-4 py-3 text-sm text-right font-bold">R {totalBudgetRevenue.toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-right font-bold">R {totalActualRevenue.toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-right font-bold">R {Object.values(actualProgramData).reduce((s, p) => s + (p.academicSalaries || 0), 0).toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-right font-bold">R {Object.values(actualProgramData).reduce((s, p) => s + (p.materials || 0), 0).toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-right font-bold">R {Object.values(actualProgramData).reduce((s, p) => s + (p.practicals || 0), 0).toLocaleString()}</td>
              <td className={`px-4 py-3 text-sm text-right font-bold ${(totalActualRevenue - totalActualCosts) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>R {(totalActualRevenue - totalActualCosts).toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-right font-bold">{totalActualRevenue > 0 ? ((totalActualRevenue - totalActualCosts) / totalActualRevenue * 100).toFixed(1) : 0}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Program Revenue Comparison Chart */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold mb-4">Program Revenue: Budget vs Actual</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={programs.map(([id, prog]) => ({
            name: id,
            budget: prog.revenue || 0,
            actual: (actualProgramData[id]?.revenue || 0),
          }))}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v) => `R${(v/1000000).toFixed(1)}M`} />
            <Tooltip formatter={(v) => `R ${v.toLocaleString()}`} />
            <Legend />
            <Bar dataKey="budget" fill="#8b5cf6" name="Budget Revenue" radius={[4,4,0,0]} />
            <Bar dataKey="actual" fill="#10b981" name="Actual Revenue" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Reports Module - Comprehensive Budget vs Actuals
const ReportsModule = ({ company, config, budgets, actuals, yoyData, assets = [], categories = [] }) => {
  const [activeReport, setActiveReport] = useState('summary');
  const [filterMonth, setFilterMonth] = useState('2025-01');
  
  const companyBudget = budgets[company.id] || {};
  const companyActuals = actuals[company.id] || {};
  const companyYOY = yoyData[company.id] || {};

  // Group categories by type
  const directCosts = categories.filter(c => c.type === 'direct');
  const indirectCosts = categories.filter(c => c.type === 'indirect');
  const adminCosts = categories.filter(c => c.type === 'admin');

  // Calculate actual depreciation from assets
  const calculateMonthlyDepreciation = () => {
    return assets.filter(a => a.status === 'Active').reduce((sum, a) => {
      if (a.depreciationMethod === 'straight') {
        return sum + ((a.purchaseCost - a.residualValue) / a.usefulLife / 12);
      } else {
        return sum + (a.bookValue * (a.depreciationRate / 100) / 12);
      }
    }, 0);
  };

  const actualMonthlyDepreciation = calculateMonthlyDepreciation();

  // Get industry-specific report tabs
  const getReportTabs = () => {
    const baseTabs = [
      { id: 'summary', name: 'Summary' },
      { id: 'monthOnMonth', name: 'Month on Month' },
      { id: 'yearOnYear', name: 'Year on Year' },
      { id: 'depreciation', name: 'Depreciation Analysis' },
      { id: 'profitability', name: 'Profitability Statement' },
      { id: 'breakeven', name: 'Breakeven Analysis' },
    ];
    
    if (company.industry === 'haulage') {
      return [
        ...baseTabs.slice(0, 1),
        { id: 'perTruck', name: 'Per Truck' },
        { id: 'perRoute', name: 'Per Route' },
        { id: 'perTrip', name: 'Per Trip' },
        ...baseTabs.slice(1)
      ];
    } else if (company.industry === 'construction') {
      return [
        ...baseTabs.slice(0, 1),
        { id: 'perProject', name: 'Per Project' },
        ...baseTabs.slice(1)
      ];
    } else if (company.industry === 'education') {
      return [
        ...baseTabs.slice(0, 1),
        { id: 'perProgram', name: 'Per Program' },
        ...baseTabs.slice(1)
      ];
    }
    return baseTabs;
  };

  const reportTabs = getReportTabs();

  // Prepare data
  const monthlyData = ['2025-01', '2025-02', '2025-03'].map(month => {
    const budget = companyBudget.monthly?.[month] || {};
    const actual = companyActuals.monthly?.[month] || {};
    return {
      month: new Date(month + '-01').toLocaleDateString('en-ZA', { month: 'short' }),
      budgetRevenue: budget.revenue || 0,
      actualRevenue: actual.revenue || 0,
      budgetExpenses: Object.entries(budget).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0),
      actualExpenses: Object.entries(actual).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0),
      budgetDepreciation: budget.depreciation || 0,
      actualDepreciation: actual.depreciation || 0,
    };
  });

  const truckData = Object.entries(companyBudget.byTruck || {}).map(([truck, budget]) => {
    const actual = companyActuals.byTruck?.[truck] || {};
    return { truck, ...budget, actualRevenue: actual.revenue || 0, actualFuel: actual.fuel || 0, actualRepairs: actual.repairs || 0 };
  });

  const routeData = Object.entries(companyBudget.byRoute || {}).map(([route, budget]) => {
    const actual = companyActuals.byRoute?.[route] || {};
    return { route, ...budget, actualRevenue: actual.revenue || 0, actualTrips: actual.trips || 0, actualFuel: actual.fuel || 0 };
  });

  // Export data generator based on active report
  const getExportData = () => {
    const monthBudget = companyBudget.monthly?.[filterMonth] || {};
    const monthActuals = companyActuals.monthly?.[filterMonth] || {};
    
    switch (activeReport) {
      case 'summary':
        const sumBudgetExp = Object.entries(monthBudget).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0);
        const sumActualExp = Object.entries(monthActuals).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0);
        const sumBudgetProfit = (monthBudget.revenue || 0) - sumBudgetExp;
        const sumActualProfit = (monthActuals.revenue || 0) - sumActualExp;
        return {
          title: 'Budget vs Actuals Summary Report',
          headers: [
            { key: 'metric', label: 'Metric', align: 'left' },
            { key: 'budget', label: 'Budget', align: 'right' },
            { key: 'actual', label: 'Actual', align: 'right' },
            { key: 'variance', label: 'Variance', align: 'right' },
            { key: 'varPct', label: 'Var %', align: 'right' },
          ],
          data: [
            { metric: 'Revenue', budget: `R ${(monthBudget.revenue || 0).toLocaleString()}`, actual: `R ${(monthActuals.revenue || 0).toLocaleString()}`, variance: `R ${((monthActuals.revenue || 0) - (monthBudget.revenue || 0)).toLocaleString()}`, varPct: `${monthBudget.revenue ? (((monthActuals.revenue || 0) - (monthBudget.revenue || 0)) / monthBudget.revenue * 100).toFixed(1) : 0}%` },
            { metric: 'Total Expenses', budget: `R ${sumBudgetExp.toLocaleString()}`, actual: `R ${sumActualExp.toLocaleString()}`, variance: `R ${(sumActualExp - sumBudgetExp).toLocaleString()}`, varPct: `${sumBudgetExp ? ((sumActualExp - sumBudgetExp) / sumBudgetExp * 100).toFixed(1) : 0}%` },
            { metric: 'Net Profit', budget: `R ${sumBudgetProfit.toLocaleString()}`, actual: `R ${sumActualProfit.toLocaleString()}`, variance: `R ${(sumActualProfit - sumBudgetProfit).toLocaleString()}`, varPct: `${sumBudgetProfit ? ((sumActualProfit - sumBudgetProfit) / Math.abs(sumBudgetProfit) * 100).toFixed(1) : 0}%`, isTotal: true },
          ]
        };
      case 'perTruck':
        return {
          title: 'Budget vs Actuals by Truck',
          headers: [
            { key: 'truck', label: 'Truck', align: 'left' },
            { key: 'budgetRev', label: 'Budget Revenue', align: 'right' },
            { key: 'actualRev', label: 'Actual Revenue', align: 'right' },
            { key: 'variance', label: 'Variance', align: 'right' },
            { key: 'varPct', label: 'Var %', align: 'right' },
            { key: 'budgetFuel', label: 'Budget Fuel', align: 'right' },
            { key: 'actualFuel', label: 'Actual Fuel', align: 'right' },
            { key: 'fuelVarPct', label: 'Fuel Var %', align: 'right' },
          ],
          data: truckData.map(t => ({
            truck: t.truck,
            budgetRev: `R ${(t.revenue || 0).toLocaleString()}`,
            actualRev: `R ${(t.actualRevenue || 0).toLocaleString()}`,
            variance: `R ${((t.actualRevenue || 0) - (t.revenue || 0)).toLocaleString()}`,
            varPct: `${t.revenue ? (((t.actualRevenue || 0) - (t.revenue || 0)) / t.revenue * 100).toFixed(1) : 0}%`,
            budgetFuel: `R ${(t.fuel || 0).toLocaleString()}`,
            actualFuel: `R ${(t.actualFuel || 0).toLocaleString()}`,
            fuelVarPct: `${t.fuel ? (((t.actualFuel || 0) - (t.fuel || 0)) / t.fuel * 100).toFixed(1) : 0}%`,
          }))
        };
      case 'perRoute':
        return {
          title: 'Budget vs Actuals by Route',
          headers: [
            { key: 'route', label: 'Route', align: 'left' },
            { key: 'budgetRev', label: 'Budget Revenue', align: 'right' },
            { key: 'actualRev', label: 'Actual Revenue', align: 'right' },
            { key: 'revVariance', label: 'Rev Variance', align: 'right' },
            { key: 'revVarPct', label: 'Rev Var %', align: 'right' },
            { key: 'budgetTrips', label: 'Budget Trips', align: 'right' },
            { key: 'actualTrips', label: 'Actual Trips', align: 'right' },
            { key: 'tripsVarPct', label: 'Trips Var %', align: 'right' },
          ],
          data: routeData.map(r => ({
            route: r.route,
            budgetRev: `R ${(r.revenue || 0).toLocaleString()}`,
            actualRev: `R ${(r.actualRevenue || 0).toLocaleString()}`,
            revVariance: `R ${((r.actualRevenue || 0) - (r.revenue || 0)).toLocaleString()}`,
            revVarPct: `${r.revenue ? (((r.actualRevenue || 0) - (r.revenue || 0)) / r.revenue * 100).toFixed(1) : 0}%`,
            budgetTrips: r.trips || 0,
            actualTrips: r.actualTrips || 0,
            tripsVarPct: `${r.trips ? (((r.actualTrips || 0) - (r.trips || 0)) / r.trips * 100).toFixed(1) : 0}%`,
          }))
        };
      case 'monthOnMonth':
        return {
          title: 'Month on Month Analysis',
          headers: [
            { key: 'month', label: 'Month', align: 'left' },
            { key: 'budgetRev', label: 'Budget Rev', align: 'right' },
            { key: 'actualRev', label: 'Actual Rev', align: 'right' },
            { key: 'revVarPct', label: 'Rev Var %', align: 'right' },
            { key: 'budgetExp', label: 'Budget Exp', align: 'right' },
            { key: 'actualExp', label: 'Actual Exp', align: 'right' },
            { key: 'expVarPct', label: 'Exp Var %', align: 'right' },
            { key: 'budgetProfit', label: 'Budget Profit', align: 'right' },
            { key: 'actualProfit', label: 'Actual Profit', align: 'right' },
            { key: 'profitVarPct', label: 'Profit Var %', align: 'right' },
          ],
          data: monthlyData.map(m => ({
            month: m.month,
            budgetRev: `R ${(m.budgetRevenue || 0).toLocaleString()}`,
            actualRev: `R ${(m.actualRevenue || 0).toLocaleString()}`,
            revVarPct: `${m.budgetRevenue ? (((m.actualRevenue || 0) - (m.budgetRevenue || 0)) / m.budgetRevenue * 100).toFixed(1) : 0}%`,
            budgetExp: `R ${(m.budgetExpenses || 0).toLocaleString()}`,
            actualExp: `R ${(m.actualExpenses || 0).toLocaleString()}`,
            expVarPct: `${m.budgetExpenses ? (((m.actualExpenses || 0) - (m.budgetExpenses || 0)) / m.budgetExpenses * 100).toFixed(1) : 0}%`,
            budgetProfit: `R ${(m.budgetProfit || 0).toLocaleString()}`,
            actualProfit: `R ${(m.actualProfit || 0).toLocaleString()}`,
            profitVarPct: `${m.budgetProfit ? (((m.actualProfit || 0) - (m.budgetProfit || 0)) / Math.abs(m.budgetProfit) * 100).toFixed(1) : 0}%`,
          }))
        };
      case 'profitability':
        // Calculate subtotals
        const directBudgetTotal = directCosts.reduce((s, c) => s + (monthBudget[c.id] || 0), 0);
        const directActualTotal = directCosts.reduce((s, c) => s + (monthActuals[c.id] || 0), 0);
        const indirectBudgetTotal = indirectCosts.reduce((s, c) => s + (monthBudget[c.id] || 0), 0);
        const indirectActualTotal = indirectCosts.reduce((s, c) => s + (monthActuals[c.id] || 0), 0);
        const adminBudgetTotal = adminCosts.reduce((s, c) => s + (monthBudget[c.id] || 0), 0);
        const adminActualTotal = adminCosts.reduce((s, c) => s + (monthActuals[c.id] || 0), 0);
        const totalBudgetExp = directBudgetTotal + indirectBudgetTotal + adminBudgetTotal;
        const totalActualExp = directActualTotal + indirectActualTotal + adminActualTotal;
        const grossProfitBudget = (monthBudget.revenue || 0) - directBudgetTotal;
        const grossProfitActual = (monthActuals.revenue || 0) - directActualTotal;
        
        return {
          title: 'Profitability Statement',
          headers: [
            { key: 'description', label: 'Description', align: 'left' },
            { key: 'type', label: 'Type', align: 'left' },
            { key: 'budget', label: 'Budget', align: 'right' },
            { key: 'actual', label: 'Actual', align: 'right' },
            { key: 'variance', label: 'Variance', align: 'right' },
            { key: 'varPct', label: 'Var %', align: 'right' },
          ],
          data: [
            // Revenue
            { description: 'REVENUE', type: '', budget: `R ${(monthBudget.revenue || 0).toLocaleString()}`, actual: `R ${(monthActuals.revenue || 0).toLocaleString()}`, variance: `R ${((monthActuals.revenue || 0) - (monthBudget.revenue || 0)).toLocaleString()}`, varPct: `${monthBudget.revenue ? (((monthActuals.revenue || 0) - (monthBudget.revenue || 0)) / monthBudget.revenue * 100).toFixed(1) : 0}%`, isTotal: true },
            { description: '', type: '', budget: '', actual: '', variance: '', varPct: '' },
            
            // Direct Costs Header
            { description: 'DIRECT COSTS', type: '', budget: '', actual: '', variance: '', varPct: '', isTotal: true },
            ...directCosts.map(cat => ({
              description: `  ${cat.name}`,
              type: 'Direct',
              budget: `R ${(monthBudget[cat.id] || 0).toLocaleString()}`,
              actual: `R ${(monthActuals[cat.id] || 0).toLocaleString()}`,
              variance: `R ${((monthActuals[cat.id] || 0) - (monthBudget[cat.id] || 0)).toLocaleString()}`,
              varPct: `${monthBudget[cat.id] ? (((monthActuals[cat.id] || 0) - (monthBudget[cat.id] || 0)) / monthBudget[cat.id] * 100).toFixed(1) : 0}%`,
            })),
            { description: 'Total Direct Costs', type: '', budget: `R ${directBudgetTotal.toLocaleString()}`, actual: `R ${directActualTotal.toLocaleString()}`, variance: `R ${(directActualTotal - directBudgetTotal).toLocaleString()}`, varPct: `${directBudgetTotal ? ((directActualTotal - directBudgetTotal) / directBudgetTotal * 100).toFixed(1) : 0}%`, isTotal: true },
            { description: '', type: '', budget: '', actual: '', variance: '', varPct: '' },
            
            // Gross Profit
            { description: 'GROSS PROFIT', type: '', budget: `R ${grossProfitBudget.toLocaleString()}`, actual: `R ${grossProfitActual.toLocaleString()}`, variance: `R ${(grossProfitActual - grossProfitBudget).toLocaleString()}`, varPct: `${grossProfitBudget ? ((grossProfitActual - grossProfitBudget) / grossProfitBudget * 100).toFixed(1) : 0}%`, isTotal: true },
            { description: 'Gross Profit Margin', type: '', budget: `${monthBudget.revenue ? (grossProfitBudget / monthBudget.revenue * 100).toFixed(1) : 0}%`, actual: `${monthActuals.revenue ? (grossProfitActual / monthActuals.revenue * 100).toFixed(1) : 0}%`, variance: '', varPct: '' },
            { description: '', type: '', budget: '', actual: '', variance: '', varPct: '' },
            
            // Indirect Costs Header
            { description: 'INDIRECT COSTS', type: '', budget: '', actual: '', variance: '', varPct: '', isTotal: true },
            ...indirectCosts.map(cat => ({
              description: `  ${cat.name}`,
              type: 'Indirect',
              budget: `R ${(monthBudget[cat.id] || 0).toLocaleString()}`,
              actual: `R ${(monthActuals[cat.id] || 0).toLocaleString()}`,
              variance: `R ${((monthActuals[cat.id] || 0) - (monthBudget[cat.id] || 0)).toLocaleString()}`,
              varPct: `${monthBudget[cat.id] ? (((monthActuals[cat.id] || 0) - (monthBudget[cat.id] || 0)) / monthBudget[cat.id] * 100).toFixed(1) : 0}%`,
            })),
            { description: 'Total Indirect Costs', type: '', budget: `R ${indirectBudgetTotal.toLocaleString()}`, actual: `R ${indirectActualTotal.toLocaleString()}`, variance: `R ${(indirectActualTotal - indirectBudgetTotal).toLocaleString()}`, varPct: `${indirectBudgetTotal ? ((indirectActualTotal - indirectBudgetTotal) / indirectBudgetTotal * 100).toFixed(1) : 0}%`, isTotal: true },
            { description: '', type: '', budget: '', actual: '', variance: '', varPct: '' },
            
            // Admin Costs Header
            { description: 'ADMINISTRATIVE COSTS', type: '', budget: '', actual: '', variance: '', varPct: '', isTotal: true },
            ...adminCosts.map(cat => ({
              description: `  ${cat.name}`,
              type: 'Admin',
              budget: `R ${(monthBudget[cat.id] || 0).toLocaleString()}`,
              actual: `R ${(monthActuals[cat.id] || 0).toLocaleString()}`,
              variance: `R ${((monthActuals[cat.id] || 0) - (monthBudget[cat.id] || 0)).toLocaleString()}`,
              varPct: `${monthBudget[cat.id] ? (((monthActuals[cat.id] || 0) - (monthBudget[cat.id] || 0)) / monthBudget[cat.id] * 100).toFixed(1) : 0}%`,
            })),
            { description: 'Total Admin Costs', type: '', budget: `R ${adminBudgetTotal.toLocaleString()}`, actual: `R ${adminActualTotal.toLocaleString()}`, variance: `R ${(adminActualTotal - adminBudgetTotal).toLocaleString()}`, varPct: `${adminBudgetTotal ? ((adminActualTotal - adminBudgetTotal) / adminBudgetTotal * 100).toFixed(1) : 0}%`, isTotal: true },
            { description: '', type: '', budget: '', actual: '', variance: '', varPct: '' },
            
            // Totals
            { description: 'TOTAL OPERATING EXPENSES', type: '', budget: `R ${totalBudgetExp.toLocaleString()}`, actual: `R ${totalActualExp.toLocaleString()}`, variance: `R ${(totalActualExp - totalBudgetExp).toLocaleString()}`, varPct: `${totalBudgetExp ? ((totalActualExp - totalBudgetExp) / totalBudgetExp * 100).toFixed(1) : 0}%`, isTotal: true },
            { description: '', type: '', budget: '', actual: '', variance: '', varPct: '' },
            { description: 'NET PROFIT / (LOSS)', type: '', budget: `R ${((monthBudget.revenue || 0) - totalBudgetExp).toLocaleString()}`, actual: `R ${((monthActuals.revenue || 0) - totalActualExp).toLocaleString()}`, variance: `R ${(((monthActuals.revenue || 0) - totalActualExp) - ((monthBudget.revenue || 0) - totalBudgetExp)).toLocaleString()}`, varPct: '', isTotal: true },
            { description: 'Net Profit Margin', type: '', budget: `${monthBudget.revenue ? (((monthBudget.revenue || 0) - totalBudgetExp) / monthBudget.revenue * 100).toFixed(1) : 0}%`, actual: `${monthActuals.revenue ? (((monthActuals.revenue || 0) - totalActualExp) / monthActuals.revenue * 100).toFixed(1) : 0}%`, variance: '', varPct: '' },
          ]
        };
      case 'breakeven':
        // Calculate breakeven metrics
        const beDirectCosts = directCosts.reduce((s, c) => s + (monthActuals[c.id] || 0), 0);
        const beIndirectCosts = indirectCosts.reduce((s, c) => s + (monthActuals[c.id] || 0), 0);
        const beAdminCosts = adminCosts.reduce((s, c) => s + (monthActuals[c.id] || 0), 0);
        const beFixedCosts = beIndirectCosts + beAdminCosts;
        const beVariableCosts = beDirectCosts;
        const beRevenue = monthActuals.revenue || 1;
        const beVariableCostRatio = beVariableCosts / beRevenue;
        const beContributionMargin = 1 - beVariableCostRatio;
        const beBreakevenRevenue = beContributionMargin > 0 ? beFixedCosts / beContributionMargin : 0;
        const beMarginOfSafety = beRevenue - beBreakevenRevenue;
        const beMarginOfSafetyPct = beRevenue > 0 ? (beMarginOfSafety / beRevenue) * 100 : 0;
        
        return {
          title: 'Breakeven Analysis',
          headers: [
            { key: 'metric', label: 'Metric', align: 'left' },
            { key: 'value', label: 'Value', align: 'right' },
            { key: 'notes', label: 'Notes', align: 'left' },
          ],
          data: [
            { metric: 'REVENUE ANALYSIS', value: '', notes: '', isTotal: true },
            { metric: 'Total Revenue', value: `R ${beRevenue.toLocaleString()}`, notes: 'Actual revenue for the period' },
            { metric: '', value: '', notes: '' },
            { metric: 'COST CLASSIFICATION', value: '', notes: '', isTotal: true },
            { metric: 'Variable Costs (Direct)', value: `R ${beVariableCosts.toLocaleString()}`, notes: 'Costs that vary with output' },
            { metric: 'Fixed Costs (Indirect + Admin)', value: `R ${beFixedCosts.toLocaleString()}`, notes: 'Costs that remain constant' },
            { metric: 'Total Costs', value: `R ${(beVariableCosts + beFixedCosts).toLocaleString()}`, notes: '' },
            { metric: '', value: '', notes: '' },
            { metric: 'CONTRIBUTION ANALYSIS', value: '', notes: '', isTotal: true },
            { metric: 'Variable Cost Ratio', value: `${(beVariableCostRatio * 100).toFixed(1)}%`, notes: 'Variable costs as % of revenue' },
            { metric: 'Contribution Margin Ratio', value: `${(beContributionMargin * 100).toFixed(1)}%`, notes: 'Revenue available to cover fixed costs' },
            { metric: 'Contribution Margin (R)', value: `R ${(beRevenue - beVariableCosts).toLocaleString()}`, notes: 'Revenue minus variable costs' },
            { metric: '', value: '', notes: '' },
            { metric: 'BREAKEVEN POINT', value: '', notes: '', isTotal: true },
            { metric: 'Breakeven Revenue', value: `R ${Math.round(beBreakevenRevenue).toLocaleString()}`, notes: 'Revenue needed to cover all costs' },
            { metric: 'Current Revenue vs Breakeven', value: beRevenue >= beBreakevenRevenue ? 'ABOVE' : 'BELOW', notes: beRevenue >= beBreakevenRevenue ? 'Operating at profit' : 'Operating at loss' },
            { metric: '', value: '', notes: '' },
            { metric: 'MARGIN OF SAFETY', value: '', notes: '', isTotal: true },
            { metric: 'Margin of Safety (R)', value: `R ${Math.round(beMarginOfSafety).toLocaleString()}`, notes: 'How far revenue can drop before loss' },
            { metric: 'Margin of Safety (%)', value: `${beMarginOfSafetyPct.toFixed(1)}%`, notes: 'Safety buffer as % of revenue' },
            { metric: '', value: '', notes: '' },
            { metric: 'PROFITABILITY', value: '', notes: '', isTotal: true },
            { metric: 'Operating Profit', value: `R ${(beRevenue - beVariableCosts - beFixedCosts).toLocaleString()}`, notes: '' },
            { metric: 'Operating Profit Margin', value: `${((beRevenue - beVariableCosts - beFixedCosts) / beRevenue * 100).toFixed(1)}%`, notes: '' },
          ]
        };
      default:
        return {
          title: 'Report',
          headers: [{ key: 'info', label: 'Information', align: 'left' }],
          data: [{ info: 'Select a report to export' }]
        };
    }
  };

  // Helper to format month name
  const getMonthName = (monthStr) => {
    return new Date(monthStr + '-01').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
  };

  // Get data for selected month
  const selectedBudget = companyBudget.monthly?.[filterMonth] || {};
  const selectedActuals = companyActuals.monthly?.[filterMonth] || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Budget vs Actuals Reports</h2>
          <p className="text-slate-500">Comprehensive variance analysis</p>
        </div>
        <div className="flex items-center gap-3">
          <MonthYearSelector value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
          <ExportButtons 
            onPrintWithCharts={() => printWithCharts('report-content', `${reportTabs.find(t => t.id === activeReport)?.name || 'Report'} - Budget vs Actuals`, company, getMonthName(filterMonth))}
            onPDF={() => {
              const exportData = getExportData();
              exportToPDF(exportData.title, exportData.headers, exportData.data, company, getMonthName(filterMonth));
            }}
            onExcel={() => {
              const exportData = getExportData();
              exportToExcel(exportData.title.replace(/\s+/g, '_'), exportData.headers, exportData.data, company, getMonthName(filterMonth));
            }}
          />
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 bg-blue-100 p-1 rounded-lg no-print">
        {reportTabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveReport(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${activeReport === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>
            {tab.name}
          </button>
        ))}
      </div>

      {/* Report Content - Wrapped for printing */}
      <div id="report-content">
      
      {/* Summary Report */}
      {activeReport === 'summary' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <VarianceCard title="Revenue" budget={selectedBudget.revenue || 0} actual={selectedActuals.revenue || 0} />
            <VarianceCard title="Total Expenses" 
              budget={Object.entries(selectedBudget).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0)}
              actual={Object.entries(selectedActuals).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0)} />
            <VarianceCard title="Depreciation" 
              budget={selectedBudget.depreciation || 0} 
              actual={Math.round(actualMonthlyDepreciation)} />
            <VarianceCard title="Net Profit" 
              budget={(selectedBudget.revenue || 0) - Object.entries(selectedBudget).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0)}
              actual={(selectedActuals.revenue || 0) - Object.entries(selectedActuals).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0)} />
          </div>

          <div className="bg-white rounded-xl border p-6 chart-container">
            <h3 className="font-semibold mb-4">Budget vs Actual Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `R${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => `R ${v.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="budgetRevenue" fill="#93c5fd" name="Budget Revenue" />
                <Bar dataKey="actualRevenue" fill="#3b82f6" name="Actual Revenue" />
                <Line type="monotone" dataKey="budgetExpenses" stroke="#fbbf24" strokeWidth={2} strokeDasharray="5 5" name="Budget Expenses" />
                <Line type="monotone" dataKey="actualExpenses" stroke="#f59e0b" strokeWidth={2} name="Actual Expenses" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per Truck Report */}
      {activeReport === 'perTruck' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-slate-50">
              <h3 className="font-semibold">Budget vs Actual by Truck (Including Depreciation)</h3>
            </div>
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Truck</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Rev</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Rev</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Variance</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Fuel</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Fuel</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Dep</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Dep</th>
                </tr>
              </thead>
              <tbody>
                {truckData.map(t => {
                  const revVar = ((t.actualRevenue - t.revenue) / t.revenue * 100);
                  return (
                    <tr key={t.truck} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-bold text-blue-600">{t.truck}</td>
                      <td className="px-4 py-3 text-sm text-right">R {t.revenue?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">R {t.actualRevenue?.toLocaleString()}</td>
                      <td className={`px-4 py-3 text-sm text-right font-bold ${revVar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{revVar >= 0 ? '+' : ''}{revVar.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-sm text-right">R {t.fuel?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">R {t.actualFuel?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right text-amber-600">R {(t.depreciation || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-amber-600">R {(t.actualDepreciation || Math.round(t.depreciation * 0.95) || 0).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold mb-4">Revenue Variance by Truck</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={truckData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="truck" />
                <YAxis tickFormatter={(v) => `R${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => `R ${v.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="revenue" fill="#93c5fd" name="Budget Revenue" />
                <Bar dataKey="actualRevenue" fill="#3b82f6" name="Actual Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per Route Report */}
      {activeReport === 'perRoute' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-slate-50">
              <h3 className="font-semibold">Budget vs Actual by Route</h3>
            </div>
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Route</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Trips</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Trips</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Revenue</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Revenue</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Variance</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Rev/Trip Var</th>
                </tr>
              </thead>
              <tbody>
                {routeData.map(r => {
                  const revVar = ((r.actualRevenue - r.revenue) / r.revenue * 100);
                  const budgetPerTrip = r.trips ? r.revenue / r.trips : 0;
                  const actualPerTrip = r.actualTrips ? r.actualRevenue / r.actualTrips : 0;
                  const tripVar = budgetPerTrip ? ((actualPerTrip - budgetPerTrip) / budgetPerTrip * 100) : 0;
                  return (
                    <tr key={r.route} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-bold text-blue-600">{r.route}</td>
                      <td className="px-4 py-3 text-sm text-right">{r.trips}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">{r.actualTrips}</td>
                      <td className="px-4 py-3 text-sm text-right">R {r.revenue?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">R {r.actualRevenue?.toLocaleString()}</td>
                      <td className={`px-4 py-3 text-sm text-right font-bold ${revVar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{revVar >= 0 ? '+' : ''}{revVar.toFixed(1)}%</td>
                      <td className={`px-4 py-3 text-sm text-right font-bold ${tripVar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{tripVar >= 0 ? '+' : ''}{tripVar.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold mb-4">Route Performance</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={routeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="route" />
                <YAxis tickFormatter={(v) => `R${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => `R ${v.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="revenue" fill="#fbbf24" name="Budget Revenue" />
                <Bar dataKey="actualRevenue" fill="#f59e0b" name="Actual Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per Trip Report */}
      {activeReport === 'perTrip' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-slate-50">
            <h3 className="font-semibold">Budget vs Actual by Trip</h3>
          </div>
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Trip ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Truck</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Route</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Rev</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Rev</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Fuel</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Fuel</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Profit Var</th>
              </tr>
            </thead>
            <tbody>
              {(companyActuals.byTrip || []).map(t => {
                const profitVar = (t.actualRevenue - t.actualFuel - t.actualTolls) - (t.budgetRevenue - t.budgetFuel - t.budgetTolls);
                return (
                  <tr key={t.tripId} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-bold text-blue-600">{t.tripId}</td>
                    <td className="px-4 py-3 text-sm">{t.date}</td>
                    <td className="px-4 py-3 text-sm">{t.truck}</td>
                    <td className="px-4 py-3 text-sm">{t.route}</td>
                    <td className="px-4 py-3 text-sm text-right">R {t.budgetRevenue?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">R {t.actualRevenue?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right">R {t.budgetFuel?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">R {t.actualFuel?.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-sm text-right font-bold ${profitVar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {profitVar >= 0 ? '+' : ''}R {profitVar.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Month on Month Report */}
      {activeReport === 'monthOnMonth' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold mb-4">Month-on-Month Comparison</h3>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis yAxisId="left" tickFormatter={(v) => `R${(v/1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `R${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => `R ${v.toLocaleString()}`} />
                <Legend />
                <Bar yAxisId="left" dataKey="actualRevenue" fill="#10b981" name="Actual Revenue" />
                <Bar yAxisId="left" dataKey="actualExpenses" fill="#ef4444" name="Actual Expenses" />
                <Line yAxisId="right" type="monotone" dataKey="budgetRevenue" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" name="Budget Revenue" />
                <Line yAxisId="right" type="monotone" dataKey="budgetExpenses" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" name="Budget Expenses" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Month</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Rev</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Rev</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Rev Var %</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Dep</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Dep</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Exp</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Exp</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Budget Profit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actual Profit</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map(m => {
                  const budgetProfit = m.budgetRevenue - m.budgetExpenses;
                  const actualProfit = m.actualRevenue - m.actualExpenses;
                  const revVar = m.budgetRevenue ? ((m.actualRevenue - m.budgetRevenue) / m.budgetRevenue * 100) : 0;
                  return (
                    <tr key={m.month} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-bold">{m.month}</td>
                      <td className="px-4 py-3 text-sm text-right">R {m.budgetRevenue.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">R {m.actualRevenue.toLocaleString()}</td>
                      <td className={`px-4 py-3 text-sm text-right font-bold ${revVar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{revVar >= 0 ? '+' : ''}{revVar.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-sm text-right text-amber-600">R {m.budgetDepreciation.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-amber-600">R {m.actualDepreciation.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right">R {m.budgetExpenses.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">R {m.actualExpenses.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right">R {budgetProfit.toLocaleString()}</td>
                      <td className={`px-4 py-3 text-sm text-right font-bold ${actualProfit >= budgetProfit ? 'text-emerald-600' : 'text-red-600'}`}>R {actualProfit.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Year on Year Report */}
      {activeReport === 'yearOnYear' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border p-5">
              <p className="text-sm text-slate-500 mb-2">2024 (Full Year)</p>
              <p className="text-2xl font-bold text-slate-900">R {(companyYOY['2024']?.revenue || 0).toLocaleString()}</p>
              <p className="text-sm text-emerald-600">Profit: R {(companyYOY['2024']?.profit || 0).toLocaleString()}</p>
            </div>
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-5">
              <p className="text-sm text-blue-600 mb-2">2025 Budget (Full Year)</p>
              <p className="text-2xl font-bold text-blue-900">R {(companyYOY['2025']?.revenue || 0).toLocaleString()}</p>
              <p className="text-sm text-blue-600">Target Profit: R {(companyYOY['2025']?.profit || 0).toLocaleString()}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5">
              <p className="text-sm text-emerald-600 mb-2">2025 YTD Actual</p>
              <p className="text-2xl font-bold text-emerald-900">R {(companyYOY['2025-YTD']?.revenue || 0).toLocaleString()}</p>
              <p className="text-sm text-emerald-600">Actual Profit: R {(companyYOY['2025-YTD']?.profit || 0).toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold mb-4">Year-over-Year Comparison</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[
                { year: '2024 Actual', revenue: companyYOY['2024']?.revenue || 0, expenses: companyYOY['2024']?.expenses || 0, profit: companyYOY['2024']?.profit || 0 },
                { year: '2025 Budget', revenue: companyYOY['2025']?.revenue || 0, expenses: companyYOY['2025']?.expenses || 0, profit: companyYOY['2025']?.profit || 0 },
                { year: '2025 YTD', revenue: companyYOY['2025-YTD']?.revenue || 0, expenses: companyYOY['2025-YTD']?.expenses || 0, profit: companyYOY['2025-YTD']?.profit || 0 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis tickFormatter={(v) => `R${(v/1000000).toFixed(1)}M`} />
                <Tooltip formatter={(v) => `R ${v.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
                <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
                <Bar dataKey="profit" fill="#8b5cf6" name="Profit" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold mb-4">Growth Analysis</h3>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500 mb-2">Revenue Growth (Budget vs 2024)</p>
                <p className="text-3xl font-bold text-emerald-600">+{(((companyYOY['2025']?.revenue || 0) - (companyYOY['2024']?.revenue || 0)) / (companyYOY['2024']?.revenue || 1) * 100).toFixed(1)}%</p>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500 mb-2">Profit Growth (Budget vs 2024)</p>
                <p className="text-3xl font-bold text-emerald-600">+{(((companyYOY['2025']?.profit || 0) - (companyYOY['2024']?.profit || 0)) / (companyYOY['2024']?.profit || 1) * 100).toFixed(1)}%</p>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500 mb-2">YTD Achievement</p>
                <p className="text-3xl font-bold text-blue-600">{((companyYOY['2025-YTD']?.revenue || 0) / (companyYOY['2025']?.revenue || 1) * 100).toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Depreciation Analysis Report */}
      {activeReport === 'depreciation' && (
        <div className="space-y-6">
          {/* Depreciation KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-sm text-slate-500 mb-1">Budget Depreciation (Monthly)</p>
              <p className="text-2xl font-bold text-blue-600">R {(selectedBudget?.depreciation || 0).toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-sm text-slate-500 mb-1">Actual Depreciation (From Assets)</p>
              <p className="text-2xl font-bold text-emerald-600">R {Math.round(actualMonthlyDepreciation).toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-sm text-slate-500 mb-1">Variance</p>
              <p className={`text-2xl font-bold ${actualMonthlyDepreciation > (selectedBudget?.depreciation || 0) ? 'text-red-600' : 'text-emerald-600'}`}>
                R {Math.round(actualMonthlyDepreciation - (selectedBudget?.depreciation || 0)).toLocaleString()}
              </p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-sm text-slate-500 mb-1">Annual Projection</p>
              <p className="text-2xl font-bold text-purple-600">R {Math.round(actualMonthlyDepreciation * 12).toLocaleString()}</p>
            </div>
          </div>

          {/* Budget vs Actual by Asset Category */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-slate-50">
              <h3 className="font-semibold">Budget vs Actual Depreciation by Asset Category</h3>
            </div>
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Category</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-600">Assets</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Total Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Monthly Budget</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Monthly Actual</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Variance</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Annual Budget</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Annual Actual</th>
                </tr>
              </thead>
              <tbody>
                {assetCategories.map(cat => {
                  const catAssets = assets.filter(a => a.category === cat.id && a.status === 'Active');
                  if (catAssets.length === 0) return null;
                  const catCost = catAssets.reduce((s, a) => s + a.purchaseCost, 0);
                  const monthlyActual = catAssets.reduce((s, a) => {
                    if (a.depreciationMethod === 'straight') {
                      return s + ((a.purchaseCost - a.residualValue) / a.usefulLife / 12);
                    }
                    return s + (a.bookValue * (a.depreciationRate / 100) / 12);
                  }, 0);
                  // Budget per category (proportional to asset cost)
                  const totalCost = assets.reduce((s, a) => s + a.purchaseCost, 0);
                  const monthlyBudget = totalCost > 0 ? (selectedBudget?.depreciation || 0) * (catCost / totalCost) : 0;
                  const variance = monthlyActual - monthlyBudget;
                  return (
                    <tr key={cat.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium">{cat.name}</td>
                      <td className="px-4 py-3 text-sm text-center">{catAssets.length}</td>
                      <td className="px-4 py-3 text-sm text-right">R {catCost.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right">R {Math.round(monthlyBudget).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">R {Math.round(monthlyActual).toLocaleString()}</td>
                      <td className={`px-4 py-3 text-sm text-right font-bold ${variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {variance >= 0 ? '+' : ''}R {Math.round(variance).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">R {Math.round(monthlyBudget * 12).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">R {Math.round(monthlyActual * 12).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-amber-50">
                <tr>
                  <td className="px-4 py-3 text-sm font-bold">TOTAL</td>
                  <td className="px-4 py-3 text-sm text-center font-bold">{assets.filter(a => a.status === 'Active').length}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold">R {assets.reduce((s, a) => s + a.purchaseCost, 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold">R {(selectedBudget?.depreciation || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold">R {Math.round(actualMonthlyDepreciation).toLocaleString()}</td>
                  <td className={`px-4 py-3 text-sm text-right font-bold ${actualMonthlyDepreciation > (selectedBudget?.depreciation || 0) ? 'text-red-600' : 'text-emerald-600'}`}>
                    {actualMonthlyDepreciation >= (selectedBudget?.depreciation || 0) ? '+' : ''}R {Math.round(actualMonthlyDepreciation - (selectedBudget?.depreciation || 0)).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold">R {((selectedBudget?.depreciation || 0) * 12).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold">R {Math.round(actualMonthlyDepreciation * 12).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Asset Depreciation Detail */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-slate-50">
              <h3 className="font-semibold">Individual Asset Depreciation</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-slate-600">Asset Code</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-slate-600">Description</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-slate-600">Method</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-slate-600">Cost</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-slate-600">Book Value</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-slate-600">Monthly Dep</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-slate-600">Annual Dep</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-slate-600">YTD Dep</th>
                </tr>
              </thead>
              <tbody>
                {assets.filter(a => a.status === 'Active').map(asset => {
                  const monthlyDep = asset.depreciationMethod === 'straight' 
                    ? (asset.purchaseCost - asset.residualValue) / asset.usefulLife / 12
                    : asset.bookValue * (asset.depreciationRate / 100) / 12;
                  const ytdDep = monthlyDep * 3; // Jan - Mar
                  return (
                    <tr key={asset.id} className="border-b hover:bg-slate-50">
                      <td className="px-3 py-2 font-bold text-blue-600">{asset.assetCode}</td>
                      <td className="px-3 py-2 truncate max-w-[200px]">{asset.name}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={asset.depreciationMethod === 'straight' ? 'info' : 'purple'}>
                          {asset.depreciationMethod === 'straight' ? 'SL' : 'RB'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">R {asset.purchaseCost.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-emerald-600">R {Math.round(asset.bookValue).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-semibold">R {Math.round(monthlyDep).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">R {Math.round(monthlyDep * 12).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-amber-600 font-semibold">R {Math.round(ytdDep).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100">
                <tr>
                  <td colSpan={3} className="px-3 py-3 font-bold">TOTALS</td>
                  <td className="px-3 py-3 text-right font-bold">R {assets.reduce((s, a) => s + a.purchaseCost, 0).toLocaleString()}</td>
                  <td className="px-3 py-3 text-right font-bold text-emerald-600">R {Math.round(assets.reduce((s, a) => s + a.bookValue, 0)).toLocaleString()}</td>
                  <td className="px-3 py-3 text-right font-bold">R {Math.round(actualMonthlyDepreciation).toLocaleString()}</td>
                  <td className="px-3 py-3 text-right font-bold">R {Math.round(actualMonthlyDepreciation * 12).toLocaleString()}</td>
                  <td className="px-3 py-3 text-right font-bold text-amber-600">R {Math.round(actualMonthlyDepreciation * 3).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Depreciation Trend Chart */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold mb-4">Monthly Depreciation: Budget vs Actual</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((month, i) => ({
                month,
                budget: selectedBudget?.depreciation || 45000,
                actual: Math.round(actualMonthlyDepreciation),
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `R${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => `R ${v.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="budget" fill="#93c5fd" name="Budget Depreciation" />
                <Bar dataKey="actual" fill="#fbbf24" name="Actual Depreciation" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Profitability Statement */}
      {activeReport === 'profitability' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className={`p-6 bg-gradient-to-r ${config.color} text-white`}>
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold">Budget vs Actual Profitability Statement</h3>
                <p className="text-white/80">{company.tradingAs || company.name} • {getMonthName(filterMonth)}</p>
              </div>
              <button 
                onClick={() => printWithCharts('report-content', 'Profitability Statement', company, getMonthName(filterMonth))}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20">
                <Icons.Printer />Print
              </button>
            </div>
          </div>
          <div className="p-6">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-300">
                  <th className="py-3 text-left font-semibold">Description</th>
                  <th className="py-3 text-right font-semibold">Budget</th>
                  <th className="py-3 text-right font-semibold">Actual</th>
                  <th className="py-3 text-right font-semibold">Variance</th>
                  <th className="py-3 text-right font-semibold">Var %</th>
                </tr>
              </thead>
              <tbody>
                {/* Revenue */}
                <tr className="bg-emerald-50">
                  <td className="py-3 font-bold text-lg">REVENUE</td>
                  <td className="py-3 text-right font-bold">R {(selectedBudget?.revenue || 0).toLocaleString()}</td>
                  <td className="py-3 text-right font-bold">R {(selectedActuals?.revenue || 0).toLocaleString()}</td>
                  <td className={`py-3 text-right font-bold ${(selectedActuals?.revenue || 0) >= (selectedBudget?.revenue || 0) ? 'text-emerald-600' : 'text-red-600'}`}>
                    R {((selectedActuals?.revenue || 0) - (selectedBudget?.revenue || 0)).toLocaleString()}
                  </td>
                  <td className={`py-3 text-right font-bold ${(selectedActuals?.revenue || 0) >= (selectedBudget?.revenue || 0) ? 'text-emerald-600' : 'text-red-600'}`}>
                    {(((selectedActuals?.revenue || 0) - (selectedBudget?.revenue || 0)) / (selectedBudget?.revenue || 1) * 100).toFixed(1)}%
                  </td>
                </tr>
                
                {/* Direct Costs Header */}
                <tr className="bg-slate-100">
                  <td colSpan={5} className="py-2 font-semibold text-slate-700">DIRECT COSTS</td>
                </tr>
                
                {/* Direct Cost Items */}
                {directCosts.map(cat => {
                  const budget = selectedBudget?.[cat.id] || 0;
                  const actual = selectedActuals?.[cat.id] || 0;
                  const variance = actual - budget;
                  const varPct = budget ? (variance / budget * 100) : 0;
                  return (
                    <tr key={cat.id} className={`border-b hover:bg-slate-50 ${cat.id === 'depreciation' ? 'bg-amber-50' : ''}`}>
                      <td className="py-2 pl-4 text-slate-600">{cat.name}</td>
                      <td className="py-2 text-right">R {budget.toLocaleString()}</td>
                      <td className="py-2 text-right">R {actual.toLocaleString()}</td>
                      <td className={`py-2 text-right ${variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{variance >= 0 ? '+' : ''}R {variance.toLocaleString()}</td>
                      <td className={`py-2 text-right ${variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{varPct >= 0 ? '+' : ''}{varPct.toFixed(1)}%</td>
                    </tr>
                  );
                })}

                {/* Direct Costs Subtotal */}
                <tr className="bg-red-50 font-semibold">
                  <td className="py-2 pl-4">Total Direct Costs</td>
                  <td className="py-2 text-right">R {directCosts.reduce((s, c) => s + (selectedBudget?.[c.id] || 0), 0).toLocaleString()}</td>
                  <td className="py-2 text-right">R {directCosts.reduce((s, c) => s + (selectedActuals?.[c.id] || 0), 0).toLocaleString()}</td>
                  <td className="py-2 text-right text-red-600">
                    R {(directCosts.reduce((s, c) => s + (selectedActuals?.[c.id] || 0), 0) - directCosts.reduce((s, c) => s + (selectedBudget?.[c.id] || 0), 0)).toLocaleString()}
                  </td>
                  <td className="py-2 text-right"></td>
                </tr>

                {/* Indirect Costs Header */}
                <tr className="bg-slate-100">
                  <td colSpan={5} className="py-2 font-semibold text-slate-700">INDIRECT COSTS</td>
                </tr>

                {indirectCosts.map(cat => {
                  const budget = selectedBudget?.[cat.id] || 0;
                  const actual = selectedActuals?.[cat.id] || 0;
                  const variance = actual - budget;
                  const varPct = budget ? (variance / budget * 100) : 0;
                  return (
                    <tr key={cat.id} className="border-b hover:bg-slate-50">
                      <td className="py-2 pl-4 text-slate-600">{cat.name}</td>
                      <td className="py-2 text-right">R {budget.toLocaleString()}</td>
                      <td className="py-2 text-right">R {actual.toLocaleString()}</td>
                      <td className={`py-2 text-right ${variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{variance >= 0 ? '+' : ''}R {variance.toLocaleString()}</td>
                      <td className={`py-2 text-right ${variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{varPct >= 0 ? '+' : ''}{varPct.toFixed(1)}%</td>
                    </tr>
                  );
                })}

                {/* Admin Costs Header */}
                <tr className="bg-slate-100">
                  <td colSpan={5} className="py-2 font-semibold text-slate-700">ADMINISTRATIVE COSTS</td>
                </tr>

                {adminCosts.map(cat => {
                  const budget = selectedBudget?.[cat.id] || 0;
                  const actual = selectedActuals?.[cat.id] || 0;
                  const variance = actual - budget;
                  const varPct = budget ? (variance / budget * 100) : 0;
                  return (
                    <tr key={cat.id} className="border-b hover:bg-slate-50">
                      <td className="py-2 pl-4 text-slate-600">{cat.name}</td>
                      <td className="py-2 text-right">R {budget.toLocaleString()}</td>
                      <td className="py-2 text-right">R {actual.toLocaleString()}</td>
                      <td className={`py-2 text-right ${variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{variance >= 0 ? '+' : ''}R {variance.toLocaleString()}</td>
                      <td className={`py-2 text-right ${variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{varPct >= 0 ? '+' : ''}{varPct.toFixed(1)}%</td>
                    </tr>
                  );
                })}

                {/* Total Expenses */}
                <tr className="bg-red-50 font-semibold">
                  <td className="py-3">TOTAL EXPENSES</td>
                  <td className="py-3 text-right">R {Object.entries(selectedBudget || {}).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0).toLocaleString()}</td>
                  <td className="py-3 text-right">R {Object.entries(selectedActuals || {}).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0).toLocaleString()}</td>
                  <td className="py-3 text-right text-red-600">
                    R {(Object.entries(selectedActuals || {}).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0) - 
                        Object.entries(selectedBudget || {}).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0)).toLocaleString()}
                  </td>
                  <td className="py-3 text-right text-red-600">
                    {((Object.entries(selectedActuals || {}).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0) - 
                       Object.entries(selectedBudget || {}).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0)) /
                      (Object.entries(selectedBudget || {}).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 1) || 1) * 100).toFixed(1)}%
                  </td>
                </tr>

                {/* Net Profit */}
                <tr className="bg-blue-100 font-bold text-lg">
                  <td className="py-4">NET PROFIT</td>
                  <td className="py-4 text-right">
                    R {((selectedBudget?.revenue || 0) - 
                        Object.entries(selectedBudget || {}).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0)).toLocaleString()}
                  </td>
                  <td className="py-4 text-right">
                    R {((selectedActuals?.revenue || 0) - 
                        Object.entries(selectedActuals || {}).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0)).toLocaleString()}
                  </td>
                  <td className={`py-4 text-right ${
                    ((selectedActuals?.revenue || 0) - Object.entries(selectedActuals || {}).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0)) >=
                    ((selectedBudget?.revenue || 0) - Object.entries(selectedBudget || {}).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0))
                    ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    R {(((selectedActuals?.revenue || 0) - Object.entries(selectedActuals || {}).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0)) -
                        ((selectedBudget?.revenue || 0) - Object.entries(selectedBudget || {}).filter(([k]) => k !== 'revenue').reduce((s, [,v]) => s + v, 0))).toLocaleString()}
                  </td>
                  <td className="py-4 text-right"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Breakeven Analysis */}
      {activeReport === 'breakeven' && (() => {
        // Calculate breakeven metrics using selectedBudget and selectedActuals from parent scope
        const beDirectCostsActual = directCosts.reduce((s, c) => s + (selectedActuals[c.id] || 0), 0);
        const beIndirectCostsActual = indirectCosts.reduce((s, c) => s + (selectedActuals[c.id] || 0), 0);
        const beAdminCostsActual = adminCosts.reduce((s, c) => s + (selectedActuals[c.id] || 0), 0);
        const beFixedCostsActual = beIndirectCostsActual + beAdminCostsActual;
        const beVariableCostsActual = beDirectCostsActual;
        const beRevenueActual = selectedActuals.revenue || 1;
        const beVariableCostRatioActual = beVariableCostsActual / beRevenueActual;
        const beContributionMarginActual = 1 - beVariableCostRatioActual;
        const beBreakevenRevenueActual = beContributionMarginActual > 0 ? beFixedCostsActual / beContributionMarginActual : 0;
        const beMarginOfSafetyActual = beRevenueActual - beBreakevenRevenueActual;
        const beMarginOfSafetyPctActual = (beMarginOfSafetyActual / beRevenueActual) * 100;
        const beOperatingProfitActual = beRevenueActual - beVariableCostsActual - beFixedCostsActual;
        
        // Budget breakeven
        const beDirectCostsBudget = directCosts.reduce((s, c) => s + (selectedBudget[c.id] || 0), 0);
        const beIndirectCostsBudget = indirectCosts.reduce((s, c) => s + (selectedBudget[c.id] || 0), 0);
        const beAdminCostsBudget = adminCosts.reduce((s, c) => s + (selectedBudget[c.id] || 0), 0);
        const beFixedCostsBudget = beIndirectCostsBudget + beAdminCostsBudget;
        const beVariableCostsBudget = beDirectCostsBudget;
        const beRevenueBudget = selectedBudget.revenue || 1;
        const beVariableCostRatioBudget = beVariableCostsBudget / beRevenueBudget;
        const beContributionMarginBudget = 1 - beVariableCostRatioBudget;
        const beBreakevenRevenueBudget = beContributionMarginBudget > 0 ? beFixedCostsBudget / beContributionMarginBudget : 0;
        
        // Chart data for breakeven visualization
        const breakevenChartData = [
          { name: 'R0', revenue: 0, totalCost: beFixedCostsActual, fixedCost: beFixedCostsActual },
          { name: `BE: R${Math.round(beBreakevenRevenueActual/1000)}k`, revenue: beBreakevenRevenueActual, totalCost: beBreakevenRevenueActual, fixedCost: beFixedCostsActual },
          { name: `Current: R${Math.round(beRevenueActual/1000)}k`, revenue: beRevenueActual, totalCost: beVariableCostsActual + beFixedCostsActual, fixedCost: beFixedCostsActual },
        ];
        
        return (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600"><Icons.Target /></div>
                  <span className="text-sm text-slate-500">Breakeven Revenue</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">R {Math.round(beBreakevenRevenueActual).toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1">Revenue needed to cover all costs</p>
              </div>
              <div className="bg-white rounded-xl border p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2 rounded-lg ${beMarginOfSafetyActual >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}><Icons.Shield /></div>
                  <span className="text-sm text-slate-500">Margin of Safety</span>
                </div>
                <p className={`text-2xl font-bold ${beMarginOfSafetyActual >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>R {Math.round(beMarginOfSafetyActual).toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1">{beMarginOfSafetyPctActual.toFixed(1)}% safety buffer</p>
              </div>
              <div className="bg-white rounded-xl border p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-purple-100 text-purple-600"><Icons.TrendingUp /></div>
                  <span className="text-sm text-slate-500">Contribution Margin</span>
                </div>
                <p className="text-2xl font-bold text-purple-600">{(beContributionMarginActual * 100).toFixed(1)}%</p>
                <p className="text-xs text-slate-500 mt-1">R {Math.round(beRevenueActual - beVariableCostsActual).toLocaleString()} contribution</p>
              </div>
              <div className="bg-white rounded-xl border p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2 rounded-lg ${beOperatingProfitActual >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}><Icons.DollarSign /></div>
                  <span className="text-sm text-slate-500">Operating Profit</span>
                </div>
                <p className={`text-2xl font-bold ${beOperatingProfitActual >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>R {beOperatingProfitActual.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1">{((beOperatingProfitActual / beRevenueActual) * 100).toFixed(1)}% margin</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Breakeven Chart */}
              <div className="bg-white rounded-xl border p-6 chart-container">
                <h3 className="font-semibold mb-4">Breakeven Analysis Chart</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={breakevenChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={(v) => `R${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => `R ${v.toLocaleString()}`} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} name="Revenue" />
                    <Line type="monotone" dataKey="totalCost" stroke="#ef4444" strokeWidth={3} name="Total Cost" />
                    <Line type="monotone" dataKey="fixedCost" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" name="Fixed Cost" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Cost Structure */}
              <div className="bg-white rounded-xl border p-6">
                <h3 className="font-semibold mb-4">Cost Structure Analysis</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div>
                      <p className="font-medium text-red-800">Variable Costs (Direct)</p>
                      <p className="text-sm text-red-600">Costs that vary with activity</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-red-800">R {beVariableCostsActual.toLocaleString()}</p>
                      <p className="text-sm text-red-600">{(beVariableCostRatioActual * 100).toFixed(1)}% of revenue</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                    <div>
                      <p className="font-medium text-amber-800">Fixed Costs (Indirect + Admin)</p>
                      <p className="text-sm text-amber-600">Costs that remain constant</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-amber-800">R {beFixedCostsActual.toLocaleString()}</p>
                      <p className="text-sm text-amber-600">{((beFixedCostsActual / beRevenueActual) * 100).toFixed(1)}% of revenue</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div>
                      <p className="font-medium text-blue-800">Total Costs</p>
                      <p className="text-sm text-blue-600">All operating expenses</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-blue-800">R {(beVariableCostsActual + beFixedCostsActual).toLocaleString()}</p>
                      <p className="text-sm text-blue-600">{(((beVariableCostsActual + beFixedCostsActual) / beRevenueActual) * 100).toFixed(1)}% of revenue</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Breakeven Table */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className={`p-4 bg-gradient-to-r ${config.color} text-white`}>
                <h3 className="font-semibold">Breakeven Analysis - Budget vs Actual</h3>
                <p className="text-sm text-white/80">{company.tradingAs || company.name} • {getMonthName(filterMonth)}</p>
              </div>
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Metric</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">Budget</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">Actual</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-100">
                    <td colSpan={4} className="px-4 py-2 font-semibold text-slate-700">REVENUE & COSTS</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3">Total Revenue</td>
                    <td className="px-4 py-3 text-right">R {beRevenueBudget.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">R {beRevenueActual.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right ${beRevenueActual >= beRevenueBudget ? 'text-emerald-600' : 'text-red-600'}`}>R {(beRevenueActual - beRevenueBudget).toLocaleString()}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3">Variable Costs</td>
                    <td className="px-4 py-3 text-right">R {beVariableCostsBudget.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">R {beVariableCostsActual.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right ${beVariableCostsActual <= beVariableCostsBudget ? 'text-emerald-600' : 'text-red-600'}`}>R {(beVariableCostsActual - beVariableCostsBudget).toLocaleString()}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3">Fixed Costs</td>
                    <td className="px-4 py-3 text-right">R {beFixedCostsBudget.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">R {beFixedCostsActual.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right ${beFixedCostsActual <= beFixedCostsBudget ? 'text-emerald-600' : 'text-red-600'}`}>R {(beFixedCostsActual - beFixedCostsBudget).toLocaleString()}</td>
                  </tr>
                  <tr className="bg-slate-100">
                    <td colSpan={4} className="px-4 py-2 font-semibold text-slate-700">BREAKEVEN ANALYSIS</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3">Variable Cost Ratio</td>
                    <td className="px-4 py-3 text-right">{(beVariableCostRatioBudget * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right">{(beVariableCostRatioActual * 100).toFixed(1)}%</td>
                    <td className={`px-4 py-3 text-right ${beVariableCostRatioActual <= beVariableCostRatioBudget ? 'text-emerald-600' : 'text-red-600'}`}>{((beVariableCostRatioActual - beVariableCostRatioBudget) * 100).toFixed(1)}%</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3">Contribution Margin Ratio</td>
                    <td className="px-4 py-3 text-right">{(beContributionMarginBudget * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right">{(beContributionMarginActual * 100).toFixed(1)}%</td>
                    <td className={`px-4 py-3 text-right ${beContributionMarginActual >= beContributionMarginBudget ? 'text-emerald-600' : 'text-red-600'}`}>{((beContributionMarginActual - beContributionMarginBudget) * 100).toFixed(1)}%</td>
                  </tr>
                  <tr className="border-b bg-blue-50 font-semibold">
                    <td className="px-4 py-3">Breakeven Revenue</td>
                    <td className="px-4 py-3 text-right">R {Math.round(beBreakevenRevenueBudget).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">R {Math.round(beBreakevenRevenueActual).toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right ${beBreakevenRevenueActual <= beBreakevenRevenueBudget ? 'text-emerald-600' : 'text-red-600'}`}>R {Math.round(beBreakevenRevenueActual - beBreakevenRevenueBudget).toLocaleString()}</td>
                  </tr>
                  <tr className="bg-slate-100">
                    <td colSpan={4} className="px-4 py-2 font-semibold text-slate-700">PERFORMANCE INDICATORS</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3">Margin of Safety (R)</td>
                    <td className="px-4 py-3 text-right">R {Math.round(beRevenueBudget - beBreakevenRevenueBudget).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">R {Math.round(beMarginOfSafetyActual).toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right ${beMarginOfSafetyActual >= (beRevenueBudget - beBreakevenRevenueBudget) ? 'text-emerald-600' : 'text-red-600'}`}>R {Math.round(beMarginOfSafetyActual - (beRevenueBudget - beBreakevenRevenueBudget)).toLocaleString()}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3">Margin of Safety (%)</td>
                    <td className="px-4 py-3 text-right">{(((beRevenueBudget - beBreakevenRevenueBudget) / beRevenueBudget) * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right">{beMarginOfSafetyPctActual.toFixed(1)}%</td>
                    <td className={`px-4 py-3 text-right ${beMarginOfSafetyPctActual >= (((beRevenueBudget - beBreakevenRevenueBudget) / beRevenueBudget) * 100) ? 'text-emerald-600' : 'text-red-600'}`}>{(beMarginOfSafetyPctActual - (((beRevenueBudget - beBreakevenRevenueBudget) / beRevenueBudget) * 100)).toFixed(1)}%</td>
                  </tr>
                  <tr className={`font-bold ${beOperatingProfitActual >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <td className="px-4 py-3">Operating Status</td>
                    <td className="px-4 py-3 text-right">{beRevenueBudget >= beBreakevenRevenueBudget ? 'PROFITABLE' : 'LOSS'}</td>
                    <td className="px-4 py-3 text-right">{beRevenueActual >= beBreakevenRevenueActual ? 'PROFITABLE' : 'LOSS'}</td>
                    <td className="px-4 py-3 text-right">{beRevenueActual >= beBreakevenRevenueActual ? '✓ Above Breakeven' : '✗ Below Breakeven'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
      
      </div>{/* End of report-content */}
    </div>
  );
};
