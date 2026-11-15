import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  TOKEN_STORAGE_KEY,
  createRecordApi,
  deleteRecordApi,
  downloadBackupApi,
  fetchAtlas,
  fetchHealth,
  restoreBackupApi,
  updateRecordApi,
  uploadImageApi,
  verifyMasterPin,
} from './api/client.ts';
import { ConfirmModal } from './components/ConfirmModal.tsx';
import { FactionsModal } from './components/FactionsModal.tsx';
import { LocationModal } from './components/LocationModal.tsx';
import { MapCanvas, type MapCanvasHandle } from './components/MapCanvas.tsx';
import { PinModal } from './components/PinModal.tsx';
import { RestoreModal } from './components/RestoreModal.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { ToastContainer, type ToastMessage } from './components/ToastContainer.tsx';
import { TopBar } from './components/TopBar.tsx';
import type { BackupPayload, MapRecord } from './types/morion.ts';
import { findRecord } from './utils/atlas.ts';

export default function App() {
  const mapRef = useRef<MapCanvasHandle | null>(null);

  const [locations, setLocations] = useState<MapRecord[]>([]);
  const [version, setVersion] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLinks, setShowLinks] = useState<boolean>(true);

  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem(TOKEN_STORAGE_KEY)
  );
  const [devDefaultPinActive, setDevDefaultPinActive] = useState<boolean>(false);

  const [pinModalOpen, setPinModalOpen] = useState<boolean>(false);
  const [pinSubmitting, setPinSubmitting] = useState<boolean>(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const [activeRecord, setActiveRecord] = useState<MapRecord | null>(null);
  const [activeIsNew, setActiveIsNew] = useState<boolean>(false);

  const [factionsModalOpen, setFactionsModalOpen] = useState<boolean>(false);
  const [initialFaction, setInitialFaction] = useState<MapRecord | null>(null);
  const [initialFactionIsNew, setInitialFactionIsNew] = useState<boolean>(false);

  const [restoreOpen, setRestoreOpen] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);

  const [pendingDelete, setPendingDelete] = useState<MapRecord | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const isEditing = Boolean(token);

  const notify = useCallback((tone: ToastMessage['tone'], text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, tone, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [atlas, health] = await Promise.all([
        fetchAtlas(),
        fetchHealth().catch(() => ({ storage: 'file' as const, devDefaultPinActive: false })),
      ]);
      setLocations(atlas.locations);
      setVersion(atlas.version);
      setDevDefaultPinActive(health.devDefaultPinActive);
      localStorage.setItem('morion_atlas_cache', JSON.stringify(atlas));
    } catch (err) {
      const cached = localStorage.getItem('morion_atlas_cache');
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as { locations?: MapRecord[]; version?: number };
          if (Array.isArray(parsed.locations)) {
            setLocations(parsed.locations);
            setVersion(parsed.version ?? 1);
            notify('info', 'Сервер недоступен — показана локальная копия');
            return;
          }
        } catch {
          // ignore corrupted cache
        }
      }
      notify('error', err instanceof Error ? err.message : 'Не удалось загрузить карту');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keyboard shortcuts: Ctrl+B toggles sidebar, Escape closes overlays
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        if (pendingDelete) setPendingDelete(null);
        else if (pinModalOpen) setPinModalOpen(false);
        else if (restoreOpen) setRestoreOpen(false);
        else if (factionsModalOpen) setFactionsModalOpen(false);
        else if (activeRecord) {
          setActiveRecord(null);
          setActiveIsNew(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeRecord, factionsModalOpen, pendingDelete, pinModalOpen, restoreOpen]);

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          sessionStorage.removeItem(TOKEN_STORAGE_KEY);
          setToken(null);
          setPinModalOpen(true);
          notify('error', 'Сессия мастера истекла, введите PIN повторно');
          return;
        }
        if (err.status === 409 && err.atlas) {
          setLocations(err.atlas.locations);
          setVersion(err.atlas.version);
          notify('info', err.message);
          return;
        }
        notify('error', err.message);
        return;
      }
      notify('error', err instanceof Error ? err.message : 'Неизвестная ошибка');
    },
    [notify]
  );

  const handlePinSubmit = async (pin: string) => {
    setPinSubmitting(true);
    setPinError(null);
    try {
      const issuedToken = await verifyMasterPin(pin);
      sessionStorage.setItem(TOKEN_STORAGE_KEY, issuedToken);
      setToken(issuedToken);
      setPinModalOpen(false);
      notify('success', 'Режим мастера включён');
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Ошибка проверки PIN');
    } finally {
      setPinSubmitting(false);
    }
  };

  const handleToggleEditMode = () => {
    if (isEditing) {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      setToken(null);
      notify('info', 'Режим просмотра');
    } else {
      setPinError(null);
      setPinModalOpen(true);
    }
  };

  const handleSaveRecord = async (draft: MapRecord, isNew: boolean) => {
    if (!token) return;
    setSaving(true);
    try {
      if (isNew) {
        const res = await createRecordApi(token, draft, version);
        setLocations(res.locations);
        setVersion(res.version);
        setSelectedId(res.record.id);
        notify('success', `Создано: ${res.record.name}`);
      } else {
        const res = await updateRecordApi(token, draft.id, draft, version);
        setLocations(res.locations);
        setVersion(res.version);
        notify('success', `Сохранено: ${draft.name}`);
      }
      setActiveRecord(null);
      setActiveIsNew(false);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleMoveLocation = async (loc: MapRecord, x: number, y: number) => {
    if (!token) return;
    try {
      const res = await updateRecordApi(token, loc.id, { x, y }, version);
      setLocations(res.locations);
      setVersion(res.version);
      notify('success', `Координаты «${loc.name}» обновлены`);
    } catch (err) {
      handleApiError(err);
    }
  };

  const handleConfirmDelete = async () => {
    if (!token || !pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setSaving(true);
    try {
      const res = await deleteRecordApi(token, target.id, version);
      setLocations(res.locations);
      setVersion(res.version);
      if (activeRecord?.id === target.id) {
        setActiveRecord(null);
        setActiveIsNew(false);
      }
      if (selectedId === target.id) {
        setSelectedId(null);
      }
      notify('success', `Удалено: ${target.name}`);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleAttachFaction = async (factionId: string, locId: string) => {
    if (!token) return;
    const fac = findRecord(locations, factionId);
    if (!fac) return;
    const nextBases = Array.from(new Set([...(fac.bases || []), locId]));
    try {
      const res = await updateRecordApi(token, fac.id, { bases: nextBases }, version);
      setLocations(res.locations);
      setVersion(res.version);
      notify('success', `Фракция «${fac.name}» привязана`);
    } catch (err) {
      handleApiError(err);
    }
  };

  const handleDetachFaction = async (factionId: string, locId: string) => {
    if (!token) return;
    const fac = findRecord(locations, factionId);
    if (!fac) return;
    const nextBases = (fac.bases || []).filter((id) => id !== locId);
    try {
      const res = await updateRecordApi(token, fac.id, { bases: nextBases }, version);
      setLocations(res.locations);
      setVersion(res.version);
      notify('info', `Фракция «${fac.name}» отвязана`);
    } catch (err) {
      handleApiError(err);
    }
  };

  const handleToggleLink = async (sourceId: string, targetId: string, add: boolean) => {
    if (!token) return;
    const source = findRecord(locations, sourceId);
    if (!source) return;
    const prev = source.links || [];
    const next = add
      ? Array.from(new Set([...prev, targetId]))
      : prev.filter((id) => id !== targetId);
    try {
      const res = await updateRecordApi(token, sourceId, { links: next }, version);
      setLocations(res.locations);
      setVersion(res.version);
      notify('success', add ? 'Связь добавлена' : 'Связь удалена');
    } catch (err) {
      handleApiError(err);
    }
  };

  const handleUploadImage = async (file: File): Promise<string> => {
    if (!token) throw new Error('Требуется вход мастера');
    try {
      const url = await uploadImageApi(token, file);
      notify('success', 'Изображение загружено');
      return url;
    } catch (err) {
      handleApiError(err);
      throw err;
    }
  };

  const handleSaveFaction = async (draft: MapRecord, isNew: boolean) => {
    if (!token) return;
    setSaving(true);
    try {
      if (isNew) {
        const res = await createRecordApi(token, draft, version);
        setLocations(res.locations);
        setVersion(res.version);
        notify('success', `Фракция «${res.record.name}» создана`);
      } else {
        const res = await updateRecordApi(token, draft.id, draft, version);
        setLocations(res.locations);
        setVersion(res.version);
        notify('success', `Фракция «${draft.name}» обновлена`);
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadBackup = async () => {
    if (!token) return;
    try {
      await downloadBackupApi(token);
      notify('success', 'Файл бэкапа скачан');
    } catch (err) {
      handleApiError(err);
    }
  };

  const handleRestoreBackup = async (backup: BackupPayload) => {
    if (!token) return;
    setRestoring(true);
    try {
      const res = await restoreBackupApi(token, backup);
      await loadData();
      setRestoreOpen(false);
      notify('success', `Восстановлено: ${res.locations} записей, ${res.images} картинок`);
    } catch (err) {
      handleApiError(err);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0b0d10]">
      <TopBar
        sidebarOpen={sidebarOpen}
        isEditing={isEditing}
        showLinks={showLinks}
        onToggleSidebar={() => {
          setSidebarOpen((prev) => !prev);
          window.setTimeout(() => mapRef.current?.invalidateSize(), 220);
        }}
        onOpenFactions={() => {
          setInitialFaction(null);
          setInitialFactionIsNew(false);
          setFactionsModalOpen(true);
        }}
        onToggleLinks={() => setShowLinks((prev) => !prev)}
        onResetView={() => mapRef.current?.resetView()}
        onToggleEditMode={handleToggleEditMode}
        onDownloadBackup={handleDownloadBackup}
        onOpenRestore={() => setRestoreOpen(true)}
      />

      <Sidebar
        open={sidebarOpen}
        loading={loading}
        locations={locations}
        selectedId={selectedId}
        isEditing={isEditing}
        onClose={() => setSidebarOpen(false)}
        onSelectLocation={(loc) => {
          setSelectedId(loc.id);
          mapRef.current?.flyToLocation(loc);
        }}
        onOpenFactions={() => {
          setInitialFaction(null);
          setInitialFactionIsNew(false);
          setFactionsModalOpen(true);
        }}
        onResetView={() => mapRef.current?.resetView()}
        onQuickCreateTip={() => {
          if (!isEditing) {
            setPinError(null);
            setPinModalOpen(true);
          } else {
            notify('info', 'Кликните на любую точку карты, чтобы поставить локацию');
          }
        }}
      />

      <MapCanvas
        ref={mapRef}
        locations={locations}
        selectedId={selectedId}
        isEditing={isEditing}
        sidebarOpen={sidebarOpen}
        showLinks={showLinks}
        onSelectLocation={(loc) => setSelectedId(loc.id)}
        onOpenLocation={(loc) => {
          setSelectedId(loc.id);
          setActiveRecord(loc);
          setActiveIsNew(false);
        }}
        onMoveLocation={handleMoveLocation}
        onCreateAtCoords={(x, y) => {
          setActiveRecord({
            id: '',
            kind: 'location',
            name: '',
            type: 'city',
            parentId: null,
            x,
            y,
            short: '',
            description: '',
            image: '',
            links: [],
          });
          setActiveIsNew(true);
        }}
      />

      <LocationModal
        record={activeRecord}
        isNew={activeIsNew}
        isEditing={isEditing}
        allRecords={locations}
        saving={saving}
        onClose={() => {
          setActiveRecord(null);
          setActiveIsNew(false);
        }}
        onOpenRecord={(rec) => {
          if (rec.kind === 'faction') {
            setInitialFaction(rec);
            setInitialFactionIsNew(false);
            setFactionsModalOpen(true);
            return;
          }
          setActiveRecord(rec);
          setActiveIsNew(false);
        }}
        onStartCreateSublocation={(parentId) => {
          setActiveRecord({
            id: '',
            kind: 'sublocation',
            parentId,
            name: '',
            type: 'district',
            short: '',
            description: '',
            image: '',
          });
          setActiveIsNew(true);
        }}
        onStartCreateFactionAt={(locId) => {
          setInitialFaction({
            id: '',
            kind: 'faction',
            name: '',
            type: 'guild',
            short: '',
            description: '',
            image: '',
            leader: '',
            members: '',
            goals: '',
            bases: [locId],
          });
          setInitialFactionIsNew(true);
          setFactionsModalOpen(true);
        }}
        onAttachFaction={handleAttachFaction}
        onDetachFaction={handleDetachFaction}
        onToggleLink={handleToggleLink}
        onUploadImage={handleUploadImage}
        onSave={handleSaveRecord}
        onRequestDelete={(rec) => setPendingDelete(rec)}
      />

      <FactionsModal
        open={factionsModalOpen}
        initialFaction={initialFaction}
        initialIsNew={initialFactionIsNew}
        isEditing={isEditing}
        allRecords={locations}
        saving={saving}
        onClose={() => {
          setFactionsModalOpen(false);
          setInitialFaction(null);
          setInitialFactionIsNew(false);
        }}
        onUploadImage={handleUploadImage}
        onSaveFaction={handleSaveFaction}
        onRequestDeleteFaction={(fac) => setPendingDelete(fac)}
      />

      <PinModal
        open={pinModalOpen}
        devDefaultPinActive={devDefaultPinActive}
        submitting={pinSubmitting}
        error={pinError}
        onSubmit={handlePinSubmit}
        onClose={() => setPinModalOpen(false)}
      />

      <RestoreModal
        open={restoreOpen}
        restoring={restoring}
        onRestore={handleRestoreBackup}
        onClose={() => setRestoreOpen(false)}
      />

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title={`Удалить «${pendingDelete?.name || ''}»?`}
        description={
          pendingDelete?.kind === 'location'
            ? 'Все вложенные районы/здания и связи с другими локациями также будут удалены.'
            : 'Запись будет удалена без возможности отмены.'
        }
        confirmLabel="Удалить"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}
