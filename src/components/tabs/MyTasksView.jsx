// "My Tasks" tab. Review + manage Windows Scheduled Tasks that are NOT
// under \\Microsoft\\Windows\\ (Auslogics' default list scope - the rest are
// system maintenance the user has no reason to touch).
//
// Three actions per row: Enable / Disable / Delete. Plus a "Create new" form
// in the footer that calls the optimizer:create-scheduled-task IPC with a
// confirmation token.
//
// "Include Microsoft\\Windows\\" checkbox adds --all to the script, so the
// user can opt into the full view.

import React, { useEffect, useRef, useState } from 'react';
import {
  Clock, ListBullets, PlusCircle, Trash, Power, CalendarBlank, Warning,
  CheckCircle,
} from '@phosphor-icons/react';
import InfoBanner from '../shared/InfoBanner.jsx';
import ConfirmModal from '../shared/ConfirmModal.jsx';
import ItemListModal from '../shared/ItemListModal.jsx';

const TRIGGER_PRESETS = [
  { id: 'daily',   label: 'Daily at midnight' },
  { id: 'weekly',  label: 'Weekly on Sunday' },
  { id: 'hourly',  label: 'Once an hour from now' },
  { id: 'onlogon', label: 'When I sign in' },
];

function formatDate(iso) {
  if (!iso || iso === '1999-11-30T00:00:00.0000000+08:00') return 'Never';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return '—';
  }
}

export default function MyTasksView({ c, isLight }) {
  const [includeAll, setIncludeAll] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lastScanAt, setLastScanAt] = useState(null);
  const [target, setTarget] = useState(null); // {task, action:'enable'|'disable'|'delete'}
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '', command: 'powershell.exe', trigger: 'daily', args: '-NoProfile -Command "echo BeetleOptimiser scheduled task ran"',
  });
  const [createBusy, setCreateBusy] = useState(false);
  const [createResult, setCreateResult] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  async function loadTasks() {
    if (!window.beetleAPI) { setError('Not available outside the packaged app.'); return; }
    setBusy(true); setError(null);
    try {
      const argv = ['list'];
      if (includeAll) argv.push('--all');
      // Direct IPC call to list tasks - read-only, no token needed.
      // The script outputs item events as NDJSON; main.js collects them.
      const child = window.beetleAPI.optimizer.listScheduledTasks;
      // The existing list IPC is fixed (no args). For the --all variant we
      // shell out via system.shell as a fallback.
      let result;
      if (!includeAll) {
        result = await window.beetleAPI.optimizer.listScheduledTasks();
      } else {
        result = await window.beetleAPI.system.shell(
          'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
          'scripts/optimize-scheduled-tasks.ps1', 'list', '--all',
        );
      }
      const rows = (result.items || [])
        .filter((i) => i.event === 'item')
        .map((i) => i.item);
      if (mountedRef.current) {
        setTasks(rows);
        setLastScanAt(new Date());
      }
    } catch (e) {
      if (mountedRef.current) setError(`Scan failed: ${e.message || e}`);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  useEffect(() => { loadTasks(); /* eslint-disable-next-line */ }, [includeAll]);

  async function handleConfirm() {
    if (!target) return;
    const t = target.task;
    setBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm(target.action === 'delete' ? 'delete-scheduled-task' : target.action);
      if (target.action === 'enable') {
        await window.beetleAPI.optimizer.enableScheduledTask(t.path, t.name, token);
      } else if (target.action === 'disable') {
        await window.beetleAPI.optimizer.disableScheduledTask(t.path, t.name, token);
      } else if (target.action === 'delete') {
        await window.beetleAPI.optimizer.deleteScheduledTask(t.path, t.name, token);
      }
      setTarget(null);
      await loadTasks();
    } catch (e) {
      setError(`${target.action} failed: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    setCreateBusy(true); setCreateResult(null); setError(null);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('create-scheduled-task');
      const result = await window.beetleAPI.optimizer.createScheduledTask(
        createForm.name.trim(), createForm.trigger, createForm.command.trim(),
        createForm.args.trim(), token,
      );
      const created = (result.items || []).find((i) => i.event === 'created');
      const err = (result.items || []).find((i) => i.event === 'error');
      if (err) {
        setCreateResult(`Error: ${err.reason}`);
      } else if (created) {
        setCreateResult(`Created "${created.name}" (${created.trigger})`);
        setShowCreate(false);
        await loadTasks();
      }
    } catch (e) {
      setCreateResult(`Create failed: ${e.message || e}`);
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <InfoBanner c={c}>Review and manage tasks scheduled to execute on your PC</InfoBanner>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: `1px solid ${c.border}`, background: c.bgSecondary, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Clock size={20} color={c.accent} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.textPrimary }}>Scheduled Tasks</div>
            <div style={{ fontSize: 11, color: c.textMuted }}>
              {tasks.length} task{tasks.length === 1 ? '' : 's'} listed · last scan {lastScanAt ? lastScanAt.toLocaleTimeString() : 'never'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: c.textMuted, cursor: 'pointer' }}>
            <input type="checkbox" checked={includeAll} onChange={(e) => setIncludeAll(e.target.checked)} />
            Include Microsoft\Windows\
          </label>
          <button
            onClick={() => loadTasks()}
            disabled={busy}
            className="theme-pill-btn"
            style={{
              background: 'transparent', border: `1px solid ${c.border}`,
              color: c.textSecondary, borderRadius: 6, padding: '6px 12px',
              fontSize: 11, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <ListBullets size={12} /> {busy ? 'Loading…' : 'Rescan'}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="theme-pill-btn"
            style={{
              background: c.accent, border: 'none', color: 'white',
              borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <PlusCircle size={12} weight="bold" /> Create new task
          </button>
        </div>
      </div>

      {/* Task list (table-ish) */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
        {error && (
          <div style={{ background: c.bgSecondary, border: `1px solid #E0566B`, borderRadius: 6, padding: 10, marginBottom: 12, fontSize: 11, color: '#E0566B' }}>
            {error}
          </div>
        )}
        {!busy && tasks.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: c.textMuted, fontSize: 12 }}>
            No scheduled tasks found outside \\Microsoft\\Windows\\. Toggle <i>Include Microsoft\Windows\</i> to see system tasks.
          </div>
        )}
        {tasks.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: c.textPrimary }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${c.border}`, color: c.textMuted, fontSize: 11, fontWeight: 600 }}>
                <th style={{ textAlign: 'left',  padding: '8px 10px' }}>Name</th>
                <th style={{ textAlign: 'left',  padding: '8px 10px' }}>State</th>
                <th style={{ textAlign: 'left',  padding: '8px 10px' }}>Author</th>
                <th style={{ textAlign: 'left',  padding: '8px 10px' }}>Last Run</th>
                <th style={{ textAlign: 'left',  padding: '8px 10px' }}>Next Run</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t, i) => {
                const stateOk = t.state === 'Ready' || t.state === 'Running';
                return (
                  <tr key={`${t.path}::${t.name}::${i}`} style={{ borderBottom: `1px solid ${c.border}` }}>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      <div style={{ fontSize: 10, color: c.textMuted }}>{t.path}</div>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: stateOk ? '#3AA65C' : '#E0566B', fontWeight: 600 }}>
                        {stateOk ? <CheckCircle size={11} weight="fill" /> : <Warning size={11} weight="fill" />}
                        {t.state}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: c.textSecondary }}>{t.author || '—'}</td>
                    <td style={{ padding: '8px 10px', color: c.textSecondary }}>{formatDate(t.last_run)}</td>
                    <td style={{ padding: '8px 10px', color: c.textSecondary }}>{formatDate(t.next_run)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <button
                        disabled={busy}
                        onClick={() => setTarget({ task: t, action: 'enable' })}
                        className="theme-pill-btn"
                        title="Enable this task"
                        style={actionStyle(c, false)}
                      >
                        <Power size={11} /> Enable
                      </button>{' '}
                      <button
                        disabled={busy}
                        onClick={() => setTarget({ task: t, action: 'disable' })}
                        className="theme-pill-btn"
                        title="Disable this task"
                        style={actionStyle(c, false)}
                      >
                        <Power size={11} /> Disable
                      </button>{' '}
                      <button
                        disabled={busy}
                        onClick={() => setTarget({ task: t, action: 'delete' })}
                        className="theme-pill-btn"
                        title="Permanently delete this task"
                        style={actionStyle(c, true)}
                      >
                        <Trash size={11} /> Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Enable/Disable/Delete confirm */}
      <ConfirmModal
        c={c}
        open={!!target}
        busy={busy}
        title={
          target?.action === 'delete' ? 'Delete this scheduled task?'
            : target?.action === 'disable' ? 'Disable this scheduled task?'
            : 'Enable this scheduled task?'
        }
        message={
          target?.action === 'delete'
            ? 'This permanently unregisters the task. The action it ran no longer happens automatically.'
            : target?.action === 'disable'
            ? 'The task is kept on disk but its trigger will no longer fire until you re-enable it.'
            : 'The task will run on its next scheduled trigger.'
        }
        details={target ? `${target.task.path}${target.task.name}` : null}
        confirmLabel={target?.action === 'delete' ? 'Delete' : target?.action === 'disable' ? 'Disable' : 'Enable'}
        onConfirm={handleConfirm}
        onCancel={() => setTarget(null)}
      />

      {/* Create form */}
      <ItemListModal
        c={c}
        open={showCreate}
        title="Create scheduled task"
        items={[
          { id: 'name',    primary: 'Name:',   secondary: createForm.name || '(required)' },
          { id: 'trigger', primary: 'When:',   secondary: (TRIGGER_PRESETS.find((p) => p.id === createForm.trigger) || {}).label || createForm.trigger },
          { id: 'command', primary: 'Command:',secondary: createForm.command },
          { id: 'args',    primary: 'Args:',   secondary: createForm.args || '(none)' },
        ]}
        actionLabel="Create"
        onAction={handleCreate}
        onClose={() => setShowCreate(false)}
      />

      {/* Hidden form (rendered always so the inputs are actually controllable).
          Visually the ItemListModal above previews the values; clicking Create
          runs handleCreate. To edit, the user uses the inputs below. */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }} onClick={() => !createBusy && setShowCreate(false)}>
          <div style={{
            width: 520, background: c.bgSecondary, border: `1px solid ${c.border}`,
            borderRadius: 8, padding: 22, boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: c.textPrimary }}>Create scheduled task</div>
            <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 16 }}>
              Triggers a one-time or recurring run of any command. The task is owned by your user account.
            </div>
            <Field c={c} label="Task name">
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Beetle Daily Cleanup"
                style={inputStyle(c)}
              />
            </Field>
            <Field c={c} label="Trigger">
              <select
                value={createForm.trigger}
                onChange={(e) => setCreateForm({ ...createForm, trigger: e.target.value })}
                style={inputStyle(c)}
              >
                {TRIGGER_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </Field>
            <Field c={c} label="Command">
              <input
                value={createForm.command}
                onChange={(e) => setCreateForm({ ...createForm, command: e.target.value })}
                style={inputStyle(c)}
              />
            </Field>
            <Field c={c} label="Arguments">
              <input
                value={createForm.args}
                onChange={(e) => setCreateForm({ ...createForm, args: e.target.value })}
                style={inputStyle(c)}
              />
            </Field>
            {createResult && (
              <div style={{ fontSize: 11, color: createResult.startsWith('Error') || createResult.includes('failed') ? '#E0566B' : '#3AA65C', marginBottom: 12 }}>
                {createResult}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button onClick={() => setShowCreate(false)} disabled={createBusy} style={btnSecondaryStyle(c)}>
                Cancel
              </button>
              <button onClick={handleCreate} disabled={createBusy || !createForm.name.trim() || !createForm.command.trim()}
                style={btnPrimaryStyle(c, !createForm.name.trim() || !createForm.command.trim() || createBusy)}>
                {createBusy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ c, label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: c.textSecondary, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function inputStyle(c) {
  return {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: `1px solid ${c.border}`, background: c.bgPrimary,
    color: c.textPrimary, fontSize: 12, fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box',
  };
}

function actionStyle(c, danger) {
  return {
    background: 'transparent', border: `1px solid ${c.border}`,
    color: danger ? '#E0566B' : c.textSecondary, borderRadius: 4,
    padding: '3px 8px', fontSize: 10, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 4,
  };
}

function btnPrimaryStyle(c, disabled) {
  return {
    background: c.accent, color: 'white', border: 'none', borderRadius: 6,
    padding: '8px 16px', fontSize: 12, fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
  };
}

function btnSecondaryStyle(c) {
  return {
    background: 'transparent', color: c.textSecondary, border: `1px solid ${c.border}`,
    borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  };
}
