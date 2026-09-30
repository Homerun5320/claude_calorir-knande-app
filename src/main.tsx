import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { logError } from './lib/errorLog'
import { reloadOnce } from './components/layout/chunkReload'
import { CLOUD_ENABLED } from './config/cloud'

// Fel som inte fångas någon annanstans sparas i den lokala felloggen (utan livsmedel och värden),
// så att användaren kan skicka en felrapport från Om Lagom → Felsökning. Inget skickas automatiskt.
window.addEventListener('error', (event) => {
  logError(event.error ?? event.message, 'global')
})
window.addEventListener('unhandledrejection', (event) => {
  logError(event.reason, 'promise')
})

// En koddel kunde inte förhandsladdas – oftast för att en ny version har publicerats medan fliken
// var öppen. Ladda om en gång; händer det igen strax efter visar felsidan "Lagom har uppdaterats".
window.addEventListener('vite:preloadError', (event) => {
  logError(event.payload, 'preload')
  if (reloadOnce()) event.preventDefault()
})

// Lagom Moln (avstängt tills VITE_SUPABASE_URL finns): automatiska, krypterade kopior. Molnkoden
// laddas bara med dynamisk import när funktionen finns i bygget.
if (CLOUD_ENABLED) {
  void import('./lib/cloud/cloudBackup')
    .then((m) => m.startCloudAutoBackup())
    .catch((err: unknown) => logError(err, 'moln'))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
