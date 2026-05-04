import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import OcrCalibrationApp from './components/OcrCalibrationApp.jsx';
import './styles.css';

const params = new URLSearchParams(window.location.search);
const calibrationMode =
  params.get('calibration') === '1' ||
  params.get('ocrCalibration') === '1';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {calibrationMode ? <OcrCalibrationApp /> : <App />}
  </React.StrictMode>
);
