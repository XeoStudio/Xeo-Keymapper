(function(){
  document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('container');
    const addBtn = document.getElementById('addShortcut');

    // إعدادات Tray و App
    const startAtLoginEl = document.getElementById('startAtLogin');
    const minimizeToTrayEl = document.getElementById('minimizeToTray');
    const startMinimizedEl = document.getElementById('startMinimized');
    const saveSettingsBtn = document.getElementById('saveSettings');

    const api = window.xeoAPI;
    if (!api) {
      console.error('xeoAPI not available');
      return;
    }

    let mappings = [];

    // ---- اختصارات ----
    function normalizeKey(e) {
      const k = e.key;
      if (k === 'Meta') return 'Win';
      if (k === 'Control') return 'Ctrl';
      if (k === ' ') return 'Space';
      if (/^F\d+$/i.test(k)) return k.toUpperCase();
      if (k.length === 1) return k.toUpperCase();
      if (k.startsWith('Arrow')) return k;
      return k;
    }

    function attachSequentialRecorder(inputEl) {
      inputEl.addEventListener('click', () => {
        try { api.pauseMapper(); } catch (err) {}
        inputEl.value = '';
        const seq = [];

        function onKeyDown(e) {
          e.preventDefault();
          const keyName = normalizeKey(e);
          seq.push(keyName);
          inputEl.value = seq.join(' + ');
        }

        window.addEventListener('keydown', onKeyDown, true);

        inputEl.addEventListener('blur', () => {
          window.removeEventListener('keydown', onKeyDown, true);
          try { api.resumeMapper(); } catch(err){}
        }, { once: true });
      });
    }

    function makeCard(from = '', to = '', idx = null) {
      const box = document.createElement('div');
      box.className = 'shortcut-box';

      const lblFrom = document.createElement('label'); lblFrom.textContent = 'Original (click to record)';
      const inputFrom = document.createElement('input'); inputFrom.readOnly = true; inputFrom.value = from || '';

      const lblTo = document.createElement('label'); lblTo.textContent = 'Mapped (click to record)';
      const inputTo = document.createElement('input'); inputTo.readOnly = true; inputTo.value = to || '';

      const row = document.createElement('div'); row.style.display = 'flex'; row.style.gap = '8px';
      const saveBtn = document.createElement('button'); saveBtn.textContent = idx === null ? 'Save' : 'Update';
      const deleteBtn = document.createElement('button'); deleteBtn.textContent = 'Delete';

      attachSequentialRecorder(inputFrom);
      attachSequentialRecorder(inputTo);

      saveBtn.addEventListener('click', () => {
        const f = inputFrom.value.trim();
        const t = inputTo.value.trim();
        if (!f || !t) return alert('Both fields are required');
        if (idx === null) mappings.unshift({ from: f, to: t });
        else mappings[idx] = { from: f, to: t };
        api.saveMappings(mappings);
        render();
      });

      deleteBtn.addEventListener('click', () => {
        if (idx === null) { box.remove(); return; }
        mappings.splice(idx, 1);
        api.saveMappings(mappings);
        render();
      });

      box.appendChild(lblFrom); box.appendChild(inputFrom);
      box.appendChild(lblTo); box.appendChild(inputTo);
      row.appendChild(saveBtn); row.appendChild(deleteBtn);
      box.appendChild(row);
      return box;
    }

    function render() {
      container.innerHTML = '';
      mappings.forEach((m, i) => container.appendChild(makeCard(m.from, m.to, i)));
    }

    addBtn.addEventListener('click', () => {
      const card = makeCard('', '', null);
      container.prepend(card);
    });

    // ---- إعدادات التطبيق ----
    async function loadSettings() {
      try {
        const s = await api.getSettings();
        startAtLoginEl.checked = s.startAtLogin;
        minimizeToTrayEl.checked = s.minimizeToTray;
        startMinimizedEl.checked = s.startMinimized;
      } catch(e) {
        console.error('Failed to load settings', e);
      }
    }

    function saveSettings() {
      const s = {
        startAtLogin: startAtLoginEl.checked,
        minimizeToTray: minimizeToTrayEl.checked,
        startMinimized: startMinimizedEl.checked
      };
      api.setSettings(s); // تحديث داخل التطبيق وTray معاً
      alert('Settings saved!');
    }

    saveSettingsBtn.addEventListener('click', saveSettings);

    // ---- تهيئة أولية ----
    (async function init() {
      try { mappings = await api.loadMappings() || []; } catch(e){ mappings=[]; }
      render();
      loadSettings();
    })();
  });
})();
