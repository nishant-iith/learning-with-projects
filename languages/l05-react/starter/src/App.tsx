import React from 'react';
import { ThemeProvider } from './context/ThemeContext.tsx';
import Dashboard from './components/Dashboard.tsx';

function App() {
  return (
    <ThemeProvider>
      <div className="min-h-screen transition-colors duration-300">
        <Dashboard />
      </div>
    </ThemeProvider>
  );
}

export default App;
