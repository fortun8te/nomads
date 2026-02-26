import { CampaignProvider } from './context/CampaignContext';
import { ThemeProvider } from './context/ThemeContext';
import { Dashboard } from './components/Dashboard';
import ForzaXLanding from './components/ForzaXLanding';

const SHOW_FORZAX = new URLSearchParams(window.location.search).has('forzax');

function App() {
  if (SHOW_FORZAX) {
    return <ForzaXLanding />;
  }
  return (
    <ThemeProvider>
      <CampaignProvider>
        <Dashboard />
      </CampaignProvider>
    </ThemeProvider>
  );
}

export default App;
