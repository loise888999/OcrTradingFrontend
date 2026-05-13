import React, { useState } from 'react';
import { Hammer, PackagePlus, PackageSearch, TrendingUp } from 'lucide-react';
import TradingGoodLookupTab from './TradingGoodLookupTab.jsx';
import TradingDealAdvancedTab from './TradingDealAdvancedTab.jsx';
import TradingOtherTab from './TradingOtherTab.jsx';
import TradingSpecialCraftTab from './TradingSpecialCraftTab.jsx';

export default function TradingTab({
  cities,
  tradeGoods,
  latestCity,
  run,
  api,
  refreshCatalogs
}) {
  const [activeSubTab, setActiveSubTab] = useState('goods');

  return (
    <div className="stack">
      <section className="card">
        <div className="card-body">
          <div className="trading-subtabs">
            <button
              type="button"
              className={activeSubTab === 'goods' ? 'active' : ''}
              onClick={() => setActiveSubTab('goods')}
            >
              <PackageSearch size={17} /> Find trade goods
            </button>

            <button
              type="button"
              className={activeSubTab === 'deals' ? 'active' : ''}
              onClick={() => setActiveSubTab('deals')}
            >
              <TrendingUp size={17} /> Deal helper
            </button>

            <button
              type="button"
              className={activeSubTab === 'specialCraft' ? 'active' : ''}
              onClick={() => setActiveSubTab('specialCraft')}
            >
              <Hammer size={17} /> Special Craft
            </button>

            <button
              type="button"
              className={activeSubTab === 'other' ? 'active' : ''}
              onClick={() => setActiveSubTab('other')}
            >
              <PackagePlus size={17} /> Other
            </button>
          </div>
        </div>
      </section>

      {activeSubTab === 'goods' && (
        <TradingGoodLookupTab
          cities={cities}
          tradeGoods={tradeGoods}
          latestCity={latestCity}
          run={run}
          api={api}
        />
      )}

      {activeSubTab === 'deals' && (
        <TradingDealAdvancedTab
          cities={cities}
          tradeGoods={tradeGoods}
          latestCity={latestCity}
          run={run}
          api={api}
        />
      )}

      {activeSubTab === 'specialCraft' && (
        <TradingSpecialCraftTab
          run={run}
          api={api}
        />
      )}

      {activeSubTab === 'other' && (
        <TradingOtherTab
          tradeGoods={tradeGoods}
          run={run}
          api={api}
          refreshCatalogs={refreshCatalogs}
        />
      )}
    </div>
  );
}
