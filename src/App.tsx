import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { ConsolePage } from './pages/ConsolePage';
import './App.scss';

function App() {
  return (
    <Router>
      <div data-component="App">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/console" element={<ConsolePage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
