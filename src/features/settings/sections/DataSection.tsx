/**
 * Inställningar → Data och säkerhetskopia (GDPR: dataportabilitet och rätten att radera).
 * All data ligger lokalt – säkerhetskopian är användarens enda "moln".
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CircleCheck,
  CloudOff,
  Download,
  FileBraces,
  FileSpreadsheet,
  HardDrive,
  Merge,
  Replace,
  ShieldCheck,
  Sparkles,
  Trash,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import { Badge, Button, Card, Dialog, ProgressBar, Sheet, TextField, confirmDialog, toast } from '../../../components/ui'
import {
  BackupError,
  backupFilename,
  createBackup,
  diaryToCsv,
  downloadFile,
  parseBackup,
  requestPersistentStorage,
  storageEstimate,
  summarizeBackup,
  type BackupFile,
  type ImportSummary,
} from '../../../lib/backup'
import { clearDemoFlag } from '../../../lib/demoFlag'
import { useDemoData } from '../../../hooks/useDemoData'
import { useLicenseStore } from '../../../stores/licenseStore'
import { useMemoryOnlyStorage } from '../../../hooks/useStorageStatus'
import { relativeDayLabel, todayISO, toISODate } from '../../../lib/dates'
import { useDiaryStore } from '../../../stores/diaryStore'
import { backupDateLabel, restoreBackupSafely } from '../backupImport'
import { markBackupNow, useLastBackup } from '../backupStatus'
import { wipeAndReset } from '../wipe'
import { ImportSummaryList } from '../ImportSummaryList'
import { DELETE_WORD, formatBytes, isDeleteConfirmed } from '../settingsLogic'

function exportBackup() {
  try {
    const backup = createBackup()
    downloadFile(backupFilename(), JSON.stringify(backup, null, 1))
    markBackupNow()
    toast('Säkerhetskopian är sparad – lägg den gärna i molnet eller mejla den till dig själv.', { tone: 'success' })
  } catch {
    toast('Säkerhetskopian kunde inte skapas. Försök igen.', { tone: 'error' })
  }
}

function lastBackupText(ms: number | null): string {
  if (ms === null) return 'Ingen säkerhetskopia gjord på den här enheten ännu.'
  const date = toISODate(new Date(ms))
  const label = relativeDayLabel(date)
  return `Senaste säkerhetskopian: ${label === 'Idag' || label === 'Igår' ? label.toLocaleLowerCase('sv-SE') : label}.`
}

export function DataSection() {
  const navigate = useNavigate()
  const lastBackup = useLastBackup()
  const hasDiary = useDiaryStore((s) => Object.values(s.entries).some((l) => l.length > 0))
  // Sparas inget på enheten just nu flyttas lagringskortet överst, så att det syns direkt.
  const memoryOnly = useMemoryOnlyStorage()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ backup: BackupFile; summary: ImportSummary; fileName: string } | null>(null)
  const demo = useDemoData()
  const hasLicense = useLicenseStore((s) => s.licenseKey !== null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [removeLicense, setRemoveLicense] = useState(false)

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // samma fil ska kunna väljas igen
    if (!file) return
    try {
      const backup = parseBackup(await file.text())
      setPending({ backup, summary: summarizeBackup(backup), fileName: file.name })
    } catch (err) {
      toast(err instanceof BackupError ? err.message : 'Filen kunde inte läsas.', { tone: 'error' })
    }
  }

  const doImport = async (mode: 'merge' | 'replace') => {
    if (!pending) return
    if (mode === 'replace') {
      const ok = await confirmDialog({
        title: 'Ersätta all data?',
        message: 'Allt som finns i appen nu ersätts med innehållet i säkerhetskopian. Tips: exportera en säkerhetskopia av nuvarande data först.',
        confirmLabel: 'Ersätt allt',
        tone: 'danger',
        icon: Replace,
      })
      if (!ok) return
    }
    try {
      // Rullar tillbaka allt om något går fel, så att felmeddelandet nedan stämmer.
      restoreBackupSafely(pending.backup, mode)
      if (mode === 'replace') clearDemoFlag()
      setPending(null)
      toast(mode === 'merge' ? 'Säkerhetskopian är ihopslagen med din data' : 'Säkerhetskopian är återställd', { tone: 'success' })
    } catch {
      toast('Importen misslyckades. Ingen data har ändrats.', { tone: 'error' })
    }
  }

  const exportCsv = () => {
    const csv = diaryToCsv(useDiaryStore.getState().entries)
    downloadFile(`lagom-dagbok-${todayISO()}.csv`, csv, 'text/csv')
    toast('Dagboken är exporterad som CSV', { tone: 'success' })
  }

  const clearDemo = async () => {
    const ok = await confirmDialog({
      title: 'Rensa exempeldatan?',
      message: 'Exempelveckan tas bort och du får börja om med dina egna uppgifter.',
      confirmLabel: 'Rensa och börja om',
      tone: 'danger',
    })
    if (!ok) return
    wipeAndReset()
    navigate('/valkommen', { replace: true })
  }

  const startDelete = async () => {
    const ok = await confirmDialog({
      title: 'Radera all data?',
      message:
        'Dagbok, vikt, recept, egna livsmedel, fasta och inställningar raderas från den här enheten. Det går inte att ångra. Provperioden startar inte om, och en licens finns kvar om du inte väljer annat.',
      confirmLabel: 'Fortsätt',
      tone: 'danger',
      icon: TriangleAlert,
    })
    if (ok) {
      setTyped('')
      setRemoveLicense(false)
      setDeleteOpen(true)
    }
  }

  const confirmDelete = () => {
    if (!isDeleteConfirmed(typed)) return
    wipeAndReset({ removeLicense })
    setDeleteOpen(false)
    toast('All data är raderad från enheten')
    navigate('/valkommen', { replace: true })
  }

  return (
    <div className="flex flex-col gap-5">
      {memoryOnly && <StorageCard lastBackup={lastBackup} />}
      {demo && (
        <Card tone="sol" eyebrow="Exempeldata" title="Du tittar på en exempelvecka">
          <p className="mb-3 text-[0.9375rem] leading-relaxed text-ink-2">Allt i dagboken just nu är påhittat, så att du kan utforska Lagom. Rensa när du vill börja på riktigt.</p>
          <Button variant="secondary" iconLeft={Sparkles} onClick={clearDemo}>
            Rensa exempeldata
          </Button>
        </Card>
      )}

      <Card eyebrow="Säkerhetskopia" title="Spara och återställ">
        <p className="-mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
          En fil med allt: dagbok, vikt, recept, egna livsmedel och inställningar. Spara den på ett säkert ställe – då kan du flytta till en ny enhet
          eller återställa om något händer.
        </p>
        <p className="mt-2 text-[0.8125rem] text-ink-3" aria-live="polite">
          {lastBackupText(lastBackup)}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
          <Button iconLeft={Download} onClick={exportBackup}>
            Exportera (JSON)
          </Button>
          <Button variant="secondary" iconLeft={Upload} onClick={() => fileRef.current?.click()}>
            Importera
          </Button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden onChange={onFile} />
      </Card>

      <Card eyebrow="Export" title="Dagboken i Excel">
        <p className="-mt-1 mb-4 text-[0.9375rem] leading-relaxed text-ink-2">
          Alla poster med datum, måltid, mängd och näringsvärden. Semikolon och decimalkomma – öppnas direkt i svenska Excel och Numbers.
        </p>
        <Button variant="secondary" iconLeft={FileSpreadsheet} onClick={exportCsv} disabled={!hasDiary}>
          Exportera dagbok som CSV
        </Button>
        {!hasDiary && <p className="mt-2 text-[0.8125rem] text-ink-3">Dagboken är tom än så länge.</p>}
      </Card>

      {!memoryOnly && <StorageCard lastBackup={lastBackup} />}

      <Card eyebrow="Integritet" title="Din data är din">
        <ul className="flex flex-col gap-3 text-[0.9375rem] leading-relaxed text-ink-2">
          <li className="flex gap-3">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-gran" />
            <span>Allt sparas lokalt i den här webbläsaren. Lagom har inga konton, ingen reklam och ingen spårning – din dagbok finns inte på någon server.</span>
          </li>
          <li className="flex gap-3">
            <CloudOff aria-hidden className="mt-0.5 size-5 shrink-0 text-gran" />
            <span>
              Inget skickas någonstans – förutom när du själv söker eller skannar en streckkod (då skickas bara sökordet eller streckkoden till Open Food
              Facts) och när du köper en licens (betalningen sköts av Stripe).
            </span>
          </li>
          <li className="flex gap-3">
            <FileBraces aria-hidden className="mt-0.5 size-5 shrink-0 text-gran" />
            <span>Du kan när som helst ta med dig all data (export) eller radera den – så som GDPR ger dig rätt till.</span>
          </li>
        </ul>
      </Card>

      <section aria-labelledby="radera-rubrik" className="rounded-card p-4 ring-1 ring-inset ring-lingon/30 sm:p-5">
        <h2 id="radera-rubrik" className="font-display text-[1.1875rem] font-semibold tracking-tight text-ink">
          Radera all data
        </h2>
        <p className="mb-4 mt-1 text-[0.9375rem] leading-relaxed text-ink-2">Tar bort allt från den här enheten. Exportera gärna en säkerhetskopia först.</p>
        <Button variant="danger" iconLeft={Trash} onClick={startDelete}>
          Radera all data
        </Button>
      </section>

      <Sheet
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Importera säkerhetskopia"
        description={pending ? `${pending.fileName} · skapad ${backupDateLabel(pending.backup.exportedAt)}` : undefined}
        footer={
          <div className="flex flex-col gap-2">
            <Button fullWidth iconLeft={Merge} onClick={() => doImport('merge')}>
              Slå ihop med min data
            </Button>
            <Button fullWidth variant="outline" iconLeft={Replace} onClick={() => doImport('replace')}>
              Ersätt allt
            </Button>
          </div>
        }
      >
        {pending && <ImportSummaryList summary={pending.summary} />}
        <p className="mt-4 text-[0.875rem] leading-relaxed text-ink-3">
          <strong className="font-semibold text-ink-2">Slå ihop</strong> behåller det du har och lägger till det som saknas.{' '}
          <strong className="font-semibold text-ink-2">Ersätt allt</strong> gör appen till en exakt kopia av säkerhetskopian.
        </p>
      </Sheet>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Sista steget"
        description={`Skriv ${DELETE_WORD} för att bekräfta att all data ska raderas.`}
        icon={Trash}
        tone="lingon"
        role="alertdialog"
        footer={
          <div className="flex w-full flex-col gap-2">
            <Button variant="danger" fullWidth onClick={confirmDelete} disabled={!isDeleteConfirmed(typed)}>
              Radera allt
            </Button>
            <Button variant="ghost" fullWidth onClick={exportBackup} iconLeft={Download}>
              Exportera säkerhetskopia först
            </Button>
          </div>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            confirmDelete()
          }}
        >
          <TextField
            label={`Skriv ${DELETE_WORD}`}
            labelHidden
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={DELETE_WORD}
          />
          {hasLicense && (
            <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl bg-surface-2 p-3 text-left text-[0.875rem] leading-snug text-ink">
              <input
                type="checkbox"
                checked={removeLicense}
                onChange={(e) => setRemoveLicense(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 cursor-pointer accent-gran"
              />
              <span>
                Ta även bort licensen från den här enheten
                <span className="mt-0.5 block text-[0.8125rem] text-ink-3">Spara licensnyckeln först om du vill kunna aktivera igen.</span>
              </span>
            </label>
          )}
        </form>
      </Dialog>
    </div>
  )
}

/**
 * Sparas ändringarna på enheten just nu? Normalt ja (IndexedDB). Om webbläsaren blockerar
 * lagringen (privat läge, full lagring, avstängda webbplatsdata) ligger ändringarna bara i minnet
 * tills fliken stängs – då är en säkerhetskopia det enda sättet att behålla dem.
 */
export function StorageStatus({ lastBackup }: { lastBackup: number | null }) {
  const memoryOnly = useMemoryOnlyStorage()
  if (memoryOnly) {
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-2xl bg-sol-soft p-3.5">
        <div className="flex items-start gap-3">
          <CloudOff aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-2" />
          <div className="min-w-0">
            <p className="text-[0.9375rem] font-semibold text-ink">Sparas inte på enheten just nu</p>
            <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-2">
              Webbläsaren låter inte Lagom spara – t.ex. i privat läge, när lagringen är full eller när webbplatsdata är avstängd. Det du gör finns
              kvar tills du stänger fliken, men inte längre. Spara en säkerhetskopia nu, så går inget förlorat.
            </p>
          </div>
        </div>
        <Button size="sm" iconLeft={Download} onClick={exportBackup}>
          Spara säkerhetskopia nu
        </Button>
      </div>
    )
  }
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl bg-surface-2 p-3.5">
      <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-good" />
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-semibold text-ink">Sparas på enheten</p>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-3">
          Allt du gör sparas direkt i den här webbläsaren.{' '}
          {lastBackup === null
            ? 'Exportera gärna en säkerhetskopia – den är ditt enda moln om du byter enhet eller webbläsarens data rensas.'
            : 'Exportera gärna en ny säkerhetskopia då och då – den är ditt enda moln om du byter enhet eller webbläsarens data rensas.'}
        </p>
      </div>
    </div>
  )
}

function StorageCard({ lastBackup }: { lastBackup: number | null }) {
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null | undefined>(undefined)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    let alive = true
    void storageEstimate().then((e) => alive && setEstimate(e))
    try {
      const p = navigator.storage?.persisted?.()
      if (p) void p.then((v) => alive && setPersisted(v), () => alive && setPersisted(null))
    } catch {
      /* stöds inte */
    }
    return () => {
      alive = false
    }
  }, [])

  const protect = async () => {
    setAsking(true)
    const ok = await requestPersistentStorage()
    setAsking(false)
    setPersisted(ok)
    toast(ok ? 'Datan är nu skyddad mot automatisk rensning' : 'Webbläsaren sa nej just nu. Lägg till Lagom på hemskärmen – då brukar det gå.', {
      tone: ok ? 'success' : 'default',
    })
  }

  return (
    <Card eyebrow="Lagring" title="På den här enheten">
      <div className="mb-4">
        <StorageStatus lastBackup={lastBackup} />
      </div>
      {estimate === undefined ? (
        <div className="h-10 animate-pulse rounded-xl bg-surface-2" aria-busy="true" aria-label="Läser lagring" />
      ) : estimate ? (
        <ProgressBar
          value={estimate.usage}
          max={Math.max(estimate.quota, 1)}
          size="sm"
          label={
            <span className="flex items-center gap-1.5">
              <HardDrive aria-hidden className="size-4 text-ink-3" />
              Använt utrymme
            </span>
          }
          valueLabel={`${formatBytes(estimate.usage)} av ${formatBytes(estimate.quota)}`}
          valueText={`${formatBytes(estimate.usage)} av ${formatBytes(estimate.quota)}`}
        />
      ) : (
        <p className="text-[0.9375rem] text-ink-2">Webbläsaren visar inte hur mycket utrymme som används.</p>
      )}

      <div className="mt-4 flex flex-col items-start gap-3 rounded-2xl bg-surface-2 p-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
            Skydd mot automatisk rensning
            {persisted && (
              <Badge tone="good" icon={CircleCheck}>
                På
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-3">
            {persisted
              ? 'Webbläsaren rensar inte Lagoms data även om det blir ont om utrymme.'
              : 'Utan skydd kan webbläsaren i sällsynta fall rensa data när enheten får ont om utrymme.'}
          </p>
        </div>
        {!persisted && (
          <Button size="sm" variant="soft" onClick={protect} loading={asking}>
            Skydda min data
          </Button>
        )}
      </div>
    </Card>
  )
}
