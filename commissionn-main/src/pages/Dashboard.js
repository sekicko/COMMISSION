import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { getCommission } from '../services/deriv';

import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import CommissionCard from '../components/CommissionCard';
import CommissionChart from '../components/CommissionChart';
import AllApps from './AllApps';

export default function Dashboard({ onLogout }) {
  const [today, setToday] = useState(0);
  const [todayTxns, setTodayTxns] = useState(0);
  const [thisMonth, setThisMonth] = useState(0);
  const [thisMonthTxns, setThisMonthTxns] = useState(0);
  const [lastMonth, setLastMonth] = useState(0);
  const [lastMonthTxns, setLastMonthTxns] = useState(0);
  const [custom, setCustom] = useState(null);
  const [customTxns, setCustomTxns] = useState(0);
  const [selectedRange, setSelectedRange] = useState({
    from: dayjs().subtract(6, 'day').startOf('day').format('YYYY-MM-DD HH:mm:ss'),
    to: dayjs().endOf('day').format('YYYY-MM-DD HH:mm:ss')
  });

  const [chartData, setChartData] = useState([]);
  const [chartTitle, setChartTitle] = useState('Monthly Commission Distribution');
  const [activeTab, setActiveTab] = useState('monthly');
  const [chartLoading, setChartLoading] = useState(false);
  
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState('overview');
  
  // App filtering
  const [activeApps, setActiveApps] = useState([]);
  const [selectedAppId, setSelectedAppId] = useState(null);

  // Load initial data on mount
  useEffect(() => {
    loadActiveApps();
    loadDefaultCards();
    loadMonthlyChart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload data when app filter or tab changes
  useEffect(() => {
    loadDefaultCards();
    if (activeTab === 'monthly') {
      loadMonthlyChart();
    } else if (activeTab === 'daily') {
      loadDailyChart();
    } else if (activeTab === 'hourly') {
      loadHourlyChart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAppId, activeTab]);

  const loadActiveApps = async () => {
    try {
      // Get this month's commission breakdown to find active apps
      const monthFrom = dayjs().startOf('month').format('YYYY-MM-DD HH:mm:ss');
      const monthTo = dayjs().endOf('month').format('YYYY-MM-DD HH:mm:ss');
      const monthRes = await getCommission(monthFrom, monthTo);
      const breakdown = monthRes.app_markup_statistics?.breakdown || [];
      
      // Filter apps with commission > 0 and sort by commission
      const active = breakdown
        .filter(app => app.app_markup_usd > 0)
        .map(app => ({
          app_id: app.app_id,
          commission: app.app_markup_usd
        }))
        .sort((a, b) => b.commission - a.commission);
      
      setActiveApps(active);
    } catch (error) {
      console.error('Error loading active apps:', error);
    }
  };

  const getAppData = (breakdown, appId) => {
    if (!appId) {
      // Return total if no app selected
      return breakdown.reduce((acc, app) => ({
        commission: acc.commission + (app.app_markup_usd || 0),
        transactions: acc.transactions + (app.transactions_count || 0)
      }), { commission: 0, transactions: 0 });
    }
    
    // Return data for specific app
    const appData = breakdown.find(app => app.app_id === appId);
    return {
      commission: appData?.app_markup_usd || 0,
      transactions: appData?.transactions_count || 0
    };
  };

  const loadDefaultCards = async () => {
    try {
      const rangeFrom = selectedRange.from;
      const rangeTo = selectedRange.to;

      const rangeRes = await getCommission(rangeFrom, rangeTo);
      const rangeBreakdown = rangeRes.app_markup_statistics?.breakdown || [];
      const rangeData = getAppData(rangeBreakdown, selectedAppId);
      setCustom(rangeRes.app_markup_statistics?.total_app_markup_usd || 0);
      setCustomTxns(rangeRes.app_markup_statistics?.total_transactions_count || 0);

      // TODAY
      const todayFrom = dayjs().startOf('day').format('YYYY-MM-DD HH:mm:ss');
      const todayTo = dayjs().endOf('day').format('YYYY-MM-DD HH:mm:ss');
      const todayRes = await getCommission(todayFrom, todayTo);
      const todayBreakdown = todayRes.app_markup_statistics?.breakdown || [];
      const todayData = getAppData(todayBreakdown, selectedAppId);
      setToday(todayData.commission);
      setTodayTxns(todayData.transactions);

      // THIS MONTH
      const monthFrom = dayjs().startOf('month').format('YYYY-MM-DD HH:mm:ss');
      const monthTo = dayjs().endOf('month').format('YYYY-MM-DD HH:mm:ss');
      const monthRes = await getCommission(monthFrom, monthTo);
      const monthBreakdown = monthRes.app_markup_statistics?.breakdown || [];
      const monthData = getAppData(monthBreakdown, selectedAppId);
      setThisMonth(monthData.commission);
      setThisMonthTxns(monthData.transactions);

      // LAST MONTH
      const lastFrom = dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD HH:mm:ss');
      const lastTo = dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD HH:mm:ss');
      const lastRes = await getCommission(lastFrom, lastTo);
      const lastBreakdown = lastRes.app_markup_statistics?.breakdown || [];
      const lastData = getAppData(lastBreakdown, selectedAppId);
      setLastMonth(lastData.commission);
      setLastMonthTxns(lastData.transactions);

      if (selectedAppId) {
        setCustom(rangeData.commission);
      }
    } catch (error) {
      console.error('Error loading commission cards:', error);
    }
  };

  const loadMonthlyChart = async () => {
    setChartLoading(true);
    try {
      const data = [];
      const currentYear = dayjs().year();

      for (let i = 0; i < 12; i++) {
        const from = dayjs().year(currentYear).month(i).startOf('month').format('YYYY-MM-DD HH:mm:ss');
        const to = dayjs().year(currentYear).month(i).endOf('month').format('YYYY-MM-DD HH:mm:ss');

        const res = await getCommission(from, to);
        const breakdown = res.app_markup_statistics?.breakdown || [];
        const monthData = getAppData(breakdown, selectedAppId);
        
        data.push({
          label: dayjs().month(i).format('MMM'),
          value: monthData.commission
        });
      }

      setChartData(data);
      setChartTitle(selectedAppId ? `Monthly Commission - App #${selectedAppId}` : 'Monthly Commission Distribution');
    } catch (error) {
      console.error('Error loading monthly chart:', error);
    } finally {
      setChartLoading(false);
    }
  };

  const loadDailyChart = async () => {
    setChartLoading(true);
    try {
      const data = [];
      const daysInMonth = dayjs().daysInMonth();

      for (let i = 1; i <= Math.min(daysInMonth, 30); i++) {
        const from = dayjs().date(i).startOf('day').format('YYYY-MM-DD HH:mm:ss');
        const to = dayjs().date(i).endOf('day').format('YYYY-MM-DD HH:mm:ss');

        const res = await getCommission(from, to);
        const breakdown = res.app_markup_statistics?.breakdown || [];
        const dayData = getAppData(breakdown, selectedAppId);
        
        data.push({
          label: `Day ${i}`,
          value: dayData.commission
        });
      }

      setChartData(data);
      setChartTitle(selectedAppId ? `Daily Commission - App #${selectedAppId}` : 'Daily Commission Distribution');
    } catch (error) {
      console.error('Error loading daily chart:', error);
    } finally {
      setChartLoading(false);
    }
  };

  const loadHourlyChart = async () => {
    setChartLoading(true);
    try {
      const data = [];
      const today = dayjs();

      for (let i = 0; i < 24; i++) {
        const from = today.hour(i).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
        const to = today.hour(i).minute(59).second(59).format('YYYY-MM-DD HH:mm:ss');

        const res = await getCommission(from, to);
        const breakdown = res.app_markup_statistics?.breakdown || [];
        const hourData = getAppData(breakdown, selectedAppId);
        
        data.push({
          label: `${i}:00`,
          value: hourData.commission
        });
      }

      setChartData(data);
      setChartTitle(selectedAppId ? `Hourly Commission - App #${selectedAppId}` : 'Hourly Commission Distribution');
    } catch (error) {
      console.error('Error loading hourly chart:', error);
    } finally {
      setChartLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'monthly') {
      loadMonthlyChart();
    } else if (tab === 'daily') {
      loadDailyChart();
    } else if (tab === 'hourly') {
      loadHourlyChart();
    }
  };

  const checkCustom = async (from, to) => {
    try {
      setSelectedRange({ from, to });
      const res = await getCommission(from, to);
      setCustom(res.app_markup_statistics?.total_app_markup_usd || 0);
      setCustomTxns(res.app_markup_statistics?.total_transactions_count || 0);
      // Don't update chart for custom range
    } catch (error) {
      console.error('Error loading custom commission:', error);
      // Silently fail - just log the error
    }
  };

  return (
    <div className="dashboard">
      <Header 
        onLogout={onLogout} 
        onDateRangeChange={checkCustom}
        activeApps={activeApps}
        selectedAppId={selectedAppId}
        onAppSelect={setSelectedAppId}
      />

      <div className="dashboard-content">
        <div className="tabs">
          <button
            className={`tab ${activeMainTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveMainTab('overview')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px', display: 'inline' }}>
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
            </svg>
            Overview
          </button>
          <button
            className={`tab ${activeMainTab === 'apps' ? 'active' : ''}`}
            onClick={() => setActiveMainTab('apps')}
          >
            All APP_IDs
          </button>
        </div>

        {activeMainTab === 'overview' ? (
          <>
            <div className="cards-grid">
              <CommissionCard
                title="This Month"
                value={thisMonth}
                icon="dollar"
                trend={lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth * 100).toFixed(1) : null}
                transactions={thisMonthTxns}
              />
              <CommissionCard
                title="Today's Commission"
                value={today}
                icon="trending"
                transactions={todayTxns}
              />
              <CommissionCard
                title="Last Month"
                value={lastMonth}
                icon="calendar"
                transactions={lastMonthTxns}
              />
              {custom !== null && (
                <CommissionCard
                  title="Custom Range"
                  value={custom}
                  icon="dollar"
                  transactions={customTxns}
                />
              )}
            </div>

            <CommissionChart
              title={chartTitle}
              data={chartData}
              activeTab={activeTab}
              onTabChange={handleTabChange}
              loading={chartLoading}
            />
          </>
        ) : (
          <AllApps />
        )}
      </div>

      {showSidebar && (
        <Sidebar 
          onCheck={checkCustom} 
          onClose={() => setShowSidebar(false)}
        />
      )}
    </div>
  );
}
