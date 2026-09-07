import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { getAppList, getCommission } from '../services/deriv';
import AppCard from '../components/AppCard';

export default function AllApps() {
  const [apps, setApps] = useState([]);
  const [appStats, setAppStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('commission'); // commission, lastMonth, id
  
  // Portfolio stats
  const [totalApps, setTotalApps] = useState(0);
  const [activeApps, setActiveApps] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [topPerformer, setTopPerformer] = useState({ id: '', amount: 0 });

  useEffect(() => {
    loadAllApps();
  }, []);

  const loadAllApps = async () => {
    setLoading(true);
    
    try {
      // Get app list for the authorized account, including zero-markup apps
      const appListRes = await getAppList();
      const appList = appListRes.app_list || [];
      console.log('Authorized account app_list response:', appListRes);
      console.log('Authorized apps count:', appList.length);

      // Get commission breakdown for all apps
      const thisMonthFrom = dayjs().startOf('month').format('YYYY-MM-DD HH:mm:ss');
      const thisMonthTo = dayjs().endOf('month').format('YYYY-MM-DD HH:mm:ss');
      const lastMonthFrom = dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD HH:mm:ss');
      const lastMonthTo = dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD HH:mm:ss');

      const thisMonthRes = await getCommission(thisMonthFrom, thisMonthTo);
      const thisMonthBreakdown = thisMonthRes.app_markup_statistics?.breakdown || [];
      console.log('This month markup response:', thisMonthRes);
      console.log('This month markup breakdown count:', thisMonthBreakdown.length);

      const lastMonthRes = await getCommission(lastMonthFrom, lastMonthTo);
      const lastMonthBreakdown = lastMonthRes.app_markup_statistics?.breakdown || [];
      console.log('Last month markup response:', lastMonthRes);
      console.log('Last month markup breakdown count:', lastMonthBreakdown.length);

      const stats = {};
      let totalRev = 0;
      let topApp = { id: '', amount: 0 };

      appList.forEach(app => {
        const appId = app.app_id;
        stats[appId] = {
          thisMonth: 0,
          lastMonth: 0,
          transactions: 0,
          sharePercent: 0
        };
      });

      thisMonthBreakdown.forEach(item => {
        const appId = item.app_id;
        const commission = item.app_markup_usd || 0;

        if (!stats[appId]) {
          stats[appId] = {
            thisMonth: commission,
            lastMonth: 0,
            transactions: item.transactions_count || 0,
            sharePercent: 0
          };
        } else {
          stats[appId].thisMonth = commission;
          stats[appId].transactions = item.transactions_count || 0;
        }

        totalRev += commission;

        if (commission > topApp.amount) {
          topApp = { id: appId, amount: commission };
        }
      });

      lastMonthBreakdown.forEach(item => {
        const appId = item.app_id;
        const commission = item.app_markup_usd || 0;

        if (!stats[appId]) {
          stats[appId] = {
            thisMonth: 0,
            lastMonth: commission,
            transactions: item.transactions_count || 0,
            sharePercent: 0
          };
        } else {
          stats[appId].lastMonth = commission;
        }
      });

      Object.keys(stats).forEach(appId => {
        const appStats = stats[appId];
        if (totalRev > 0) {
          appStats.sharePercent = ((appStats.thisMonth / totalRev) * 100).toFixed(2);
        }
      });

      const activeCount = appList.filter(app => {
        const appStats = stats[app.app_id];
        return appStats && appStats.thisMonth > 0;
      }).length;

      setApps(appList);
      setTotalApps(appList.length);
      setActiveApps(activeCount);
      setAppStats(stats);
      setTotalRevenue(totalRev);
      setTopPerformer(topApp);

      console.log('Normalized app stats:', stats);
      console.log('Total revenue summary:', totalRev);
      console.log('Top performer:', topApp);
    } catch (err) {
      console.error('Error loading apps:', err);
      console.error('Fatal app listing failure:', err?.message || err);
    }
    
    setLoading(false);
  };

  const formatNumber = (num) => {
    return num.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  const formatCount = (num) => {
    return num.toLocaleString('en-US');
  };

  // Filter and sort apps
  const filteredApps = apps
    .filter(app => {
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        app.app_id.toString().includes(search) ||
        (app.homepage && app.homepage.toLowerCase().includes(search)) ||
        (app.redirect_uri && app.redirect_uri.toLowerCase().includes(search)) ||
        (app.name && app.name.toLowerCase().includes(search))
      );
    })
    .sort((a, b) => {
      const statsA = appStats[a.app_id] || { thisMonth: 0, lastMonth: 0 };
      const statsB = appStats[b.app_id] || { thisMonth: 0, lastMonth: 0 };
      
      if (sortBy === 'commission') {
        return statsB.thisMonth - statsA.thisMonth;
      } else if (sortBy === 'lastMonth') {
        return statsB.lastMonth - statsA.lastMonth;
      } else {
        return b.app_id - a.app_id;
      }
    });

  if (loading) {
    return (
      <div className="all-apps-loading">
        <div className="spinner"></div>
        <p>Loading all applications...</p>
      </div>
    );
  }

  return (
    <div className="all-apps-page">
      <div className="page-header">
        <div className="header-content">
          <h2>All Deriv App IDs</h2>
          <p className="subtitle">Comprehensive overview of your application portfolio</p>
        </div>
      </div>

      {/* Portfolio Overview */}
      <div className="portfolio-overview">
        <div className="portfolio-card">
          <div className="portfolio-card-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </div>
          <span className="portfolio-label">Total Apps</span>
          <span className="portfolio-value">{formatCount(totalApps)}</span>
        </div>
        <div className="portfolio-card">
          <div className="portfolio-card-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
            </svg>
          </div>
          <span className="portfolio-label">Active Apps</span>
          <span className="portfolio-value">{formatCount(activeApps)}</span>
        </div>
        <div className="portfolio-card">
          <div className="portfolio-card-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"></line>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
          </div>
          <span className="portfolio-label">Total Revenue</span>
          <span className="portfolio-value"><span className="currency">$</span>{formatNumber(totalRevenue)}</span>
        </div>
        <div className="portfolio-card">
          <div className="portfolio-card-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </div>
          <span className="portfolio-label">Top Performer</span>
          <span className="portfolio-value"><span className="id-prefix">#</span>{topPerformer.id} <span className="currency">${formatNumber(topPerformer.amount)}</span></span>
        </div>
      </div>

      {/* Search and Sort */}
      <div className="controls-bar">
        <div className="search-wrapper">
          <input
            type="text"
            className="search-input"
            placeholder="Search by App ID, domain, or URL..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <select 
          className="sort-select"
          value={sortBy} 
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="commission">Sort by This Month</option>
          <option value="lastMonth">Sort by Last Month</option>
          <option value="id">Sort by ID</option>
        </select>
      </div>

      {/* App Count */}
      <p className="app-count">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        Showing <strong>{filteredApps.length}</strong> of <strong>{totalApps}</strong> apps
      </p>

      {/* App Cards Grid */}
      <div className="all-apps-grid">
        {filteredApps.map(app => (
          <AppCard 
            key={app.app_id} 
            app={app} 
            stats={appStats[app.app_id] || { thisMonth: 0, lastMonth: 0, transactions: 0, sharePercent: 0 }}
          />
        ))}
      </div>

      {filteredApps.length === 0 && (
        <div className="no-results">
          <p>No apps found matching your search.</p>
        </div>
      )}
    </div>
  );
}
