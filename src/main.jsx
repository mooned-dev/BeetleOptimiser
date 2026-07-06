import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import FlyoutApp from './FlyoutApp.jsx';
import './styles/global.css';
import './styles/animations.css';

// main.js's tray flyout window loads this same bundle with a "#flyout" hash
// instead of a second Vite entry point - see main.js's createFlyoutWindow.
const isFlyout = window.location.hash === '#flyout';

createRoot(document.getElementById('root')).render(isFlyout ? <FlyoutApp /> : <App />);
