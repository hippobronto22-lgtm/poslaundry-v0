
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

  // Payment method data (Pie chart) - based on current year or selected filter?
  // Let's use all transactions for now or filter by current period
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
