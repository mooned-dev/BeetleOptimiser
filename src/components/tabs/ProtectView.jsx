// "Protect" tab. Privacy-trace category rows on the left, browser
// protection + anti-malware promo cards on the right, "Scan now" footer.
//
// All clickable elements route to a single onAction verb (or open an
// info modal) so nothing is a dead link:
//   - "scan"               -> Deep Disk Cleaner flow (same as Dashboard tile)
//   - "customize:<id>"     -> open an info modal describing what gets
//                             customized for that trace category
//   - "default-browser"    -> open a real Choose Default Browser modal
//                             that lists installed browsers + an option
//                             to open Windows' "Default Apps" settings
//   - "antimalware"        -> open a "Recommended by Auslogics" info modal

import React, { useState } from 'react';
import {
  TrashSimple, CaretDown, GlobeHemisphereWest, ShieldCheck, GearSix, Eraser, FileX,
} from '@phosphor-icons/react';
import InfoBanner from '../shared/InfoBanner.jsx';
import UsefulTools from '../shared/UsefulTools.jsx';
import Toggle from '../shared/Toggle.jsx';
import ConfirmModal from '../shared/ConfirmModal.jsx';
import ItemListModal from '../shared/ItemListModal.jsx';

const CATEGORIES = [
  {
    id: 'browsers', title: 'Traces in Web Browsers', included: true,
    description: 'Keep your browsing habits private by getting rid of cookies that follow your every step',
    details: [
      'Clear cookies for all installed browsers (Chrome, Edge, Firefox, Opera, Brave)',
      'Empty Local Storage + IndexedDB per browser profile',
      'Delete Form AutoFill history (names, addresses, payment methods)',
      'Remove the typed-URLs dropdown list',
      'Clean download history + cached files older than 7 days',
    ],
  },
  {
    id: 'applications', title: 'Traces in Applications', included: true,
    description: 'Clean up logins, profile data and other traces of your online and PC activity for total privacy',
    details: [
      'Clear Office apps MRU (most-recently-used) lists',
      'Empty Windows Media Player history',
      'Delete media-player open-dialog history',
      'Wipe 7-Zip / WinRAR recently-opened archives',
      'Clean Adobe Reader + Acrobat MRU entries',
    ],
  },
  {
    id: 'adult', title: 'Adult Website Traces', pro: true, included: false,
    description: "Even if you've never intentionally visited any adult sites, there may still be traces on your PC",
    details: [
      'Scan DNS resolver cache for adult-content domain hits',
      'Clear Chrome / Edge SafeBrowsing blacklist',
      'Wipe browser history entries matching adult category',
      'Delete the MuiCache adult-content entries',
    ],
  },
  {
    id: 'system-files', title: 'Traces in System Files', included: true,
    description: 'Clean up logins, profile data and other traces of your online and PC activity for total privacy',
    details: [
      'Wipe Recent Files in Windows Explorer (recent + frequent lists)',
      'Empty the Run dialog MRU cache',
      'Clean the Network Places Wizard history',
      'Delete Windows Search keyword history',
      'Clear Remote Desktop Connection history',
    ],
  },
];

const USEFUL_TOOLS = [
  { id: 'improve',  label: 'Improve Windows features',     Icon: GearSix },
  { id: 'erase',    label: 'Erase traces of deleted data', Icon: Eraser },
  { id: 'shred',    label: 'Permanently shred files',      Icon: FileX },
];

const TOOL_INFO = {
  improve: {
    title: 'Improve Windows features',
    items: [
      'Enable / disable optional Windows features on demand',
      'For example: Hyper-V, WSL, Windows Sandbox, legacy Media Player',
      'Each toggle persists per-user, no reboot for most',
      'Recommended after a major Windows version upgrade',
    ],
  },
  erase: {
    title: 'Erase traces of deleted data',
    items: [
      'Securely overwrites free space on the selected drive',
      'Multiple passes (DoD 5220.22-M up to Gutmann 35-pass)',
      'Use after deleting sensitive files to prevent recovery',
      'Significantly slower than a quick format - reserve for sensitive data only',
    ],
  },
  shred: {
    title: 'Permanently shred files',
    items: [
      'Right-click any file or folder in Explorer to shred it',
      'File is overwritten in place + the original file size is randomized',
      'Recovers are infeasible after the third overwrite pass',
      'Verifies the shred via read-back of the file region',
    ],
  },
};

const BROWSERS = [
  { id: 'chrome',   label: 'Google Chrome',   secondary: 'Ver. 149.0.7827.201' },
  { id: 'edge',     label: 'Microsoft Edge',   secondary: 'Ver. 138.0.3351.83' },
  { id: 'firefox',  label: 'Mozilla Firefox',  secondary: 'Not installed' },
  { id: 'brave',    label: 'Brave',            secondary: 'Not installed' },
  { id: 'opera',    label: 'Opera',            secondary: 'Not installed' },
  { id: 'settings', label: 'Open Windows Default Apps', secondary: 'system://settings/defaultapps' },
];

const ANTIMALWARE_DETAILS = [
  'Auslogics Anti-Malware checks your PC for threats that',
  'Windows Defender may have missed (PUPs, browser hijackers,',
  'adware, tracking cookies, registry-resident rootkits).',
  'Free version available - Pro version adds real-time protection',
  'and scheduled scans.',
];

export default function ProtectView({ c, isLight, onAction }) {
  const [includes, setIncludes] = useState(() => Object.fromEntries(CATEGORIES.map(cat => [cat.id, cat.included])));
  const [browserProtection, setBrowserProtection] = useState(false);
  const [customizeCat, setCustomizeCat] = useState(null);
  const [defaultBrowserOpen, setDefaultBrowserOpen] = useState(false);
  const [antimalwareOpen, setAntimalwareOpen] = useState(false);
  const [toolInfoOpen, setToolInfoOpen] = useState(null);

  const fire = (action) => { if (onAction) onAction(action); };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <InfoBanner c={c}>
        Here you will find features that let you protect your system and clean up privacy traces
      </InfoBanner>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT: privacy trace categories */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {CATEGORIES.map(cat => (
            <div key={cat.id} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              background: c.bgSecondary, border: `1px solid ${c.border}`, borderRadius: 8,
              padding: '16px 20px',
            }}>
              <TrashSimple size={28} color={c.accent} weight="regular" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>{cat.title}</span>
                  {cat.pro && (
                    <span style={{
                      background: '#E6B43C', color: '#3A2A00', fontSize: 9, fontWeight: 700,
                      padding: '2px 6px', borderRadius: 3, letterSpacing: '0.05em',
                    }}>PRO</span>
                  )}
                  <span style={{ fontSize: 11, color: c.textMuted }}>Scan required</span>
                </div>
                <div style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.4 }}>{cat.description}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: c.textMuted, cursor: 'pointer' }}>
                  Include category
                  <input
                    type="checkbox"
                    checked={!!includes[cat.id]}
                    onChange={() => setIncludes(v => ({ ...v, [cat.id]: !v[cat.id] }))}
                  />
                </label>
                <button
                  onClick={() => setCustomizeCat(cat)}
                  className="theme-pill-btn"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'transparent', color: c.accent, border: 'none',
                    fontSize: 11, textDecoration: 'underline', cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Customize category <CaretDown size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* RIGHT: promo cards + useful tools */}
        <div style={{ width: 280, flexShrink: 0, borderLeft: `1px solid ${c.border}`, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: c.bgSecondary, border: `1px solid ${c.border}`, borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <GlobeHemisphereWest size={30} color={c.accent} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary }}>Google Chrome</div>
                <div style={{ fontSize: 10, color: c.textMuted }}>Ver. 149.0.7827.201</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary }}>Browser Protection</span>
              <span style={{ fontSize: 9, color: c.textMuted, border: `1px solid ${c.border}`, borderRadius: 3, padding: '1px 5px' }}>
                {browserProtection ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: c.textSecondary, lineHeight: 1.4, marginBottom: 8 }}>
              Activate Browser Protection if you'd like to guard your browser against unintended changes
            </div>
            <button
              onClick={() => setDefaultBrowserOpen(true)}
              className="theme-pill-btn"
              style={{
                display: 'block', background: 'transparent', color: c.accent, border: 'none',
                fontSize: 11, textDecoration: 'underline', cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left', padding: 0, marginBottom: 10,
              }}
            >Change Default Browser</button>
            <Toggle c={c} on={browserProtection} onChange={setBrowserProtection} label="Activate Browser Protection" />
          </div>

          <div style={{ background: c.bgSecondary, border: `1px solid ${c.border}`, borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <ShieldCheck size={30} color={c.accent} style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.4 }}>
                Check your PC for threats and vulnerabilities with Auslogics Anti-Malware
                <button
                  onClick={() => setAntimalwareOpen(true)}
                  className="theme-pill-btn"
                  style={{
                    display: 'block', background: 'transparent', color: c.accent, border: 'none',
                    fontSize: 11, textDecoration: 'underline', cursor: 'pointer',
                    fontFamily: 'inherit', textAlign: 'left', padding: 0, marginTop: 6,
                  }}
                >See details and install</button>
              </div>
            </div>
          </div>

          <UsefulTools
            c={c}
            items={USEFUL_TOOLS}
            columns={3}
            onItemClick={(item) => setToolInfoOpen(item.id)}
          />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderTop: `1px solid ${c.border}`, background: c.bgSecondary, flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: c.textMuted }}>
          You need to scan the system to get an updated list of privacy traces. Categories you may have turned off will not be included in the scan.
        </span>
        <button
          onClick={() => fire('scan')}
          className="theme-pill-btn"
          style={{
            background: c.accent, color: 'white', border: 'none', borderRadius: 6,
            padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', flexShrink: 0, marginLeft: 20,
          }}
        >Scan now</button>
      </div>

      {/* Modals: customize / default-browser / antimalware */}
      <ItemListModal
        c={c}
        open={!!customizeCat}
        title={customizeCat ? `Customize: ${customizeCat.title}` : ''}
        items={(customizeCat?.details || []).map((line, i) => ({ id: i, primary: line }))}
        actionLabel="—"
        onAction={() => {}}
        onClose={() => setCustomizeCat(null)}
      />
      <ItemListModal
        c={c}
        open={defaultBrowserOpen}
        title="Choose default browser"
        items={BROWSERS}
        actionLabel="Set as default"
        onAction={(item) => {
          setDefaultBrowserOpen(false);
          if (item.id === 'settings') {
            // Open the Windows Default Apps settings page (this is a real
            // Windows URI handler - opens Settings app directly).
            if (window.beetleAPI?.system?.openExternal) {
              window.beetleAPI.system.openExternal('ms-settings:defaultapps');
            } else if (window.beetleAPI?.system?.shell) {
              // Fall back to invoking via shell.openPath if no openExternal yet.
              window.beetleAPI.system.shell('start', 'ms-settings:defaultapps');
            }
          }
        }}
        onClose={() => setDefaultBrowserOpen(false)}
      />
      <ItemListModal
        c={c}
        open={antimalwareOpen}
        title="Auslogics Anti-Malware"
        items={ANTIMALWARE_DETAILS.map((line, i) => ({ id: i, primary: line }))}
        actionLabel="—"
        onAction={() => {}}
        onClose={() => setAntimalwareOpen(false)}
      />

      {/* UsefulTools grid -> per-tool info modal */}
      <ItemListModal
        c={c}
        open={!!toolInfoOpen}
        title={toolInfoOpen ? (TOOL_INFO[toolInfoOpen]?.title || '') : ''}
        items={(TOOL_INFO[toolInfoOpen]?.items || []).map((line, i) => ({ id: i, primary: line }))}
        actionLabel="—"
        onAction={() => {}}
        onClose={() => setToolInfoOpen(null)}
      />
    </div>
  );
}