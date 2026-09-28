/**
 * Inställningar → Data och säkerhetskopia (dataportabilitet och rätten att radera).
 * All data ligger lokalt – säkerhetskopian är användarens enda "moln".
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRightLeft,
  CircleCheck,
  CloudOff,
  CreditCard,
  Download,
  FileBraces,
  FileSpreadsheet,
  FileUp,
  HardDrive,
  Merge,
  Replace,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import { Badge, Button, Card, Dialog, ProgressBar, Sheet, TextField, confirmDialog, toast } from '../../../components/ui'
import {
  BackupError,
  diaryToCsv,
  parseBackup,
  requestPersistentStorage,
  saveBackup,
  saveFile,
  sharedFileToast,
  storageEstimate,
  summarizeBackup,
  type BackupFile,
  type ImportSummary,
  type SaveOutcome,
} from '../../../lib/backup'
import { applyImport, gateImport, importDays, ImportCsvError, readImportFile, type CsvImport } from '../../../lib/importCsv'
import { UnzipError } from '../../../lib/unzip'
import { clearDemoFlag } from '../../../lib/demoFlag'
import { plural } from '../../../lib/format'
import { useDemoData } from '../../../hooks/useDemoData'
import { currentAccess } from '../../../hooks/useAccess'
import { useLicenseStore } from '../../../stores/licenseStore'
import { hasNewerData } from '../../../stores/storage'
import { useHasNewerData, useMemoryOnlyStorage } from '../../../hooks/useStorageStatus'
import { relativeDayLabel, todayISO, toISODate } from '../../../lib/dates'
import { useDiaryStore } from '../../../stores/diaryStore'
import { SUPPORT_EMAIL } from '../../../config/commerce'
import { isExampleEmail } from '../../../lib/placeholderEmail'
import { CLOUD_ENABLED } from '../../../config/cloud'
import { DISTRIBUTION, isInApp, isNativeApp, isTwa, sellsOnWeb, storagePlace } from '../../../config/platform'
import { StartOwnProfileButton } from '../../premium/AccessGate'
import { backupDateLabel, restoreBackupSafely } from '../backupImport'
import { markBackupNow, useLastBackup } from '../backupStatus'
import { wipeAndReset } from '../wipe'
import { ImportSummaryList } from '../ImportSummaryList'
import { DELETE_WORD, formatBytes, isDeleteConfirmed } from '../settingsLogic'


/**
 * Spara en säkerhetskopia. "Senaste säkerhetskopian" uppdateras bara när filen faktiskt har sparats
 * eller delats – inte om delningsdialogen stängdes. Anropas direkt från klicket (se `saveFile`).
 */
async function exportBackup(): Promise<SaveOutcome> {
  const outcome = await saveBackup()
  if (outcome === 'saved' || outcome === 'shared') {
    // Med data från en nyare version innehåller kopian bara det som gjorts nu – den sparade datan
    // är inte med, så påminnelsen om säkerhetskopia ska inte tystna.
    if (!hasNewerData()) markBackupNow()
    toast(outcome === 'saved' ? 'Säkerhetskopian är sparad – lägg den gärna i molnet eller mejla den till dig själv.' : sharedFileToast(), { tone: 'success' })
  } else if (outcome === 'failed') {
    toast('Säkerhetskopian kunde inte sparas. Försök igen.', { tone: 'error' })
  }
  return outcome
}

/** Butiken som sköter köpen i den här versionen av appen (aldrig en annan plattforms namn i iPhone-appen). */
function purchaseText(): string {
  if (sellsOnWeb()) return 'När du köper en licens på webben sköts betalningen av Stripe.'
  if (DISTRIBUTION === 'appstore' || (isNativeApp() && !isTwa())) return 'Köp sköts av App Store.'
  if (DISTRIBUTION === 'play' || isTwa()) return 'Köp sköts av Google Play.'
  return 'Köp sköts av App Store eller Google Play.'
}

/** Vem som ser IP-adressen hos vårt webbhotell: på webben (och i Play-appen) laddas appen därifrån. */
function hostingText(): string {
  return isNativeApp() && !isTwa()
    ? 'vårt webbhotell Netlify ser din IP-adress när appen anropar våra serverfunktioner'
    : 'vårt webbhotell Netlify ser din IP-adress när appen laddas'
}

/** "a", "a och b", "a, b och c". */
function joinSv(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} och ${parts.at(-1)}`
}

/** En riktig supportadress (inte en platshållare som support@example.invalid) – samma regel som byggkontrollen. */
const hasSupportEmail = () => !isExampleEmail(SUPPORT_EMAIL)

interface OtherAppImport {
  fileName: string
  data: CsvImport
  summary: ImportSummary
  /** Dagar från provperiodens start som hoppas över (kräver licens). */
  blockedDays: number
  /** Exempeldata visas – den är skrivskyddad. */
  demo: boolean
}

function otherAppSummaryEmpty(summary: ImportSummary): boolean {
  return summary.entries === 0 && summary.weights === 0 && (summary.measurements ?? 0) === 0
}

function otherAppSummary(data: CsvImport): ImportSummary {
  return {
    days: importDays(data),
    entries: data.quick.length,
    weights: data.weights.length,
    measurements: data.measurements.length,
    customFoods: 0,
    recipes: 0,
    skipped: data.skipped,
    repaired: 0,
    skippedDetails: [],
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
  const otherRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ backup: BackupFile; summary: ImportSummary; fileName: string } | null>(null)
  const [other, setOther] = useState<OtherAppImport | null>(null)
  const [readingOther, setReadingOther] = useState(false)
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

  const doImport = async (requested: 'merge' | 'replace') => {
    if (!pending) return
    // Exempeldatan är skrivskyddad och ska aldrig blandas med riktig data: med exempeldata ersätter
    // säkerhetskopian allt (utan extra fråga – exemplet är påhittat).
    const mode = demo ? 'replace' : requested
    if (mode === 'replace' && !demo) {
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

  const exportCsv = async () => {
    let csv: string
    try {
      csv = diaryToCsv(useDiaryStore.getState().entries)
    } catch {
      toast('Dagboken kunde inte exporteras. Försök igen.', { tone: 'error' })
      return
    }
    const outcome = await saveFile(`lagom-dagbok-${todayISO()}.csv`, csv, 'text/csv')
    if (outcome === 'saved') toast('Dagboken är exporterad som CSV', { tone: 'success' })
    else if (outcome === 'shared') toast(sharedFileToast(), { tone: 'success' })
    else if (outcome === 'failed') toast('Dagboken kunde inte exporteras. Försök igen.', { tone: 'error' })
  }

  const onOtherFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // samma fil ska kunna väljas igen
    if (!file) return
    setReadingOther(true)
    try {
      const all = await readImportFile(file)
      // Betalväggen: allt före provperiodens start importeras alltid, resten bara om man får logga.
      const access = currentAccess()
      const trialStartedAt = useLicenseStore.getState().trialStartedAt
      const { data, blockedDays } = gateImport(all, {
        trialStart: trialStartedAt === null ? null : toISODate(new Date(trialStartedAt)),
        canLog: access.canLog,
      })
      if (all.quick.length === 0 && all.weights.length === 0 && all.measurements.length === 0) {
        toast('Hittade inget att importera i filen.', { tone: 'error' })
        return
      }
      // Med exempeldata importeras inget (den är skrivskyddad) – sammanfattningen visar då vad filen innehåller.
      setOther({ fileName: file.name, data, summary: otherAppSummary(access.demo ? all : data), blockedDays, demo: access.demo })
    } catch (err) {
      toast(err instanceof ImportCsvError || err instanceof UnzipError ? err.message : 'Filen kunde inte läsas.', { tone: 'error' })
    } finally {
      setReadingOther(false)
    }
  }

  const doOtherImport = () => {
    if (!other) return
    try {
      const counts = applyImport(other.data)
      setOther(null)
      const parts = [
        counts.entries > 0 ? plural(counts.entries, 'måltid', 'måltider') : '',
        counts.weights > 0 ? plural(counts.weights, 'vägning', 'vägningar') : '',
        counts.measurements > 0 ? plural(counts.measurements, 'mätning', 'mätningar') : '',
      ].filter(Boolean)
      const updated = counts.updated > 0 ? `${plural(counts.updated, 'måltid', 'måltider')} fick nya värden från filen.` : ''
      const dupes = counts.duplicates > 0 ? ` ${plural(counts.duplicates, 'post', 'poster')} fanns redan och hoppades över.` : ''
      const blocked = other.blockedDays > 0 ? ` ${plural(other.blockedDays, 'dag', 'dagar')} efter provperiodens start hoppades över – de kräver en licens.` : ''
      if (parts.length === 0 && !updated) toast(`Inget nytt att importera – allt fanns redan.${blocked}`)
      else if (parts.length === 0) toast(`${updated}${dupes}${blocked}`, { tone: 'success' })
      else toast(`Importerat: ${joinSv(parts)}.${updated ? ` ${updated}` : ''}${dupes}${blocked}`, { tone: 'success' })
    } catch {
      toast('Importen misslyckades. Försök igen.', { tone: 'error' })
    }
  }

  const clearDemo = async () => {
    const ok = await confirmDialog({
      title: 'Rensa exempeldatan?',
      message: 'Exempelveckan tas bort och du får börja om med dina egna uppgifter.',
      confirmLabel: 'Rensa och börja om',
      tone: 'danger',
    })
    if (!ok) return
    void wipeAndReset()
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
    void wipeAndReset({ removeLicense })
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
          <Button iconLeft={Download} onClick={() => void exportBackup()}>
            Exportera (JSON)
          </Button>
          <Button variant="secondary" iconLeft={Upload} onClick={() => fileRef.current?.click()}>
            Importera
          </Button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden onChange={onFile} />
      </Card>

      <Card eyebrow="Ny enhet" title="Byta telefon eller flytta till appen">
        <div className="-mt-1 flex items-start gap-3">
          <Smartphone aria-hidden className="mt-0.5 size-5 shrink-0 text-gran" />
          <div className="min-w-0 text-[0.9375rem] leading-relaxed text-ink-2">
            <p>
              Din data finns {storagePlace()} och flyttar inte med automatiskt. Spara en säkerhetskopia här, öppna Lagom på den nya enheten eller i
              appen och välj Återställ från säkerhetskopia.
            </p>
            {/* Bara på webben, för den som har en licensnyckel. I apparna nämns aldrig webbköp (Apples
                riktlinjer 3.1.1 och 3.1.3) – webbköpare som byter till iPhone hjälps via supporten. */}
            {hasLicense && !isInApp() && (
              <p className="mt-2">
                Har du en licensnyckel och vill använda Lagom i iPhone-appen?{' '}
                {hasSupportEmail() ? (
                  <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Licensnyckel och iPhone-appen')}`} className="font-semibold text-gran underline underline-offset-2">
                    Mejla oss
                  </a>
                ) : (
                  'Mejla oss'
                )}{' '}
                innan du byter, så hjälper vi dig.
              </p>
            )}
          </div>
        </div>
        <Button className="mt-4" variant="secondary" iconLeft={Download} onClick={() => void exportBackup()}>
          Spara säkerhetskopia
        </Button>
      </Card>

      <Card eyebrow="Export" title="Dagboken i Excel">
        <p className="-mt-1 mb-4 text-[0.9375rem] leading-relaxed text-ink-2">
          Alla poster med datum, måltid, mängd och näringsvärden. Semikolon och decimalkomma – öppnas direkt i svenska Excel och Numbers.
        </p>
        <Button variant="secondary" iconLeft={FileSpreadsheet} onClick={() => void exportCsv()} disabled={!hasDiary}>
          Exportera dagbok som CSV
        </Button>
        {!hasDiary && <p className="mt-2 text-[0.8125rem] text-ink-3">Dagboken är tom än så länge.</p>}
      </Card>

      <Card eyebrow="Import" title="Byt från annan app">
        <p className="-mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
          Har du loggat i MyFitnessPal eller en annan app? Välj exporten – en CSV-fil eller zip-filen från MyFitnessPal – så tar Lagom med vikt,
          midjemått och dagens kalorier och makron per måltid.
        </p>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-3">Enskilda livsmedel följer inte med – varje måltid blir en snabbregistrering.</p>
        <Button className="mt-4" variant="secondary" iconLeft={FileUp} onClick={() => otherRef.current?.click()} loading={readingOther}>
          Välj fil att importera
        </Button>
        <input
          ref={otherRef}
          type="file"
          accept=".csv,.zip,text/csv,application/zip"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="annan-app-fil"
          onChange={onOtherFile}
        />
      </Card>

      {!memoryOnly && <StorageCard lastBackup={lastBackup} />}

      <Card eyebrow="Integritet" title="Din data är din">
        <ul className="flex flex-col gap-3 text-[0.9375rem] leading-relaxed text-ink-2">
          <li className="flex gap-3">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-gran" />
            <span>
              {CLOUD_ENABLED
                ? `Din dagbok sparas ${storagePlace()} – och bara om du själv slår på Lagom Moln även som en krypterad kopia i molnet.`
                : `Din dagbok sparas bara ${storagePlace()}.`}{' '}
              Sökord och streckkoder skickas till Open Food Facts, produktbilder hämtas därifrån och{' '}
              {hostingText()}. Läs mer i{' '}
              <Link to="/integritet" className="font-semibold text-gran underline underline-offset-2">
                integritetspolicyn
              </Link>
              .
            </span>
          </li>
          <li className="flex gap-3">
            <CreditCard aria-hidden className="mt-0.5 size-5 shrink-0 text-gran" />
            <span>{purchaseText()}</span>
          </li>
          <li className="flex gap-3">
            <FileBraces aria-hidden className="mt-0.5 size-5 shrink-0 text-gran" />
            <span>Du kan när som helst ta med dig all data (export) eller radera den.</span>
          </li>
        </ul>
      </Card>

      <section aria-labelledby="radera-rubrik" className="rounded-card p-4 ring-1 ring-inset ring-lingon/30 sm:p-5">
        <h2 id="radera-rubrik" className="font-display text-[1.1875rem] font-semibold tracking-tight text-ink">
          Radera all data
        </h2>
        <p className="mb-4 mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
          Tar bort allt från den här enheten. Exportera gärna en säkerhetskopia först.
          {CLOUD_ENABLED && ' Du loggas också ut från Lagom Moln på den här enheten. Kopian i molnet raderas inte – det gör du under Lagom Moln.'}
        </p>
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
          demo ? (
            <Button fullWidth iconLeft={Replace} onClick={() => doImport('replace')}>
              Ersätt exempeldatan
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <Button fullWidth iconLeft={Merge} onClick={() => doImport('merge')}>
                Slå ihop med min data
              </Button>
              <Button fullWidth variant="outline" iconLeft={Replace} onClick={() => doImport('replace')}>
                Ersätt allt
              </Button>
            </div>
          )
        }
      >
        {pending && <ImportSummaryList summary={pending.summary} />}
        {demo ? (
          <p className="mt-4 text-[0.875rem] leading-relaxed text-ink-3">
            Exempeldatan tas bort och appen blir en exakt kopia av säkerhetskopian – din egen data blandas aldrig med exemplet.
          </p>
        ) : (
          <p className="mt-4 text-[0.875rem] leading-relaxed text-ink-3">
            <strong className="font-semibold text-ink-2">Slå ihop</strong> behåller det du har och lägger till det som saknas.{' '}
            <strong className="font-semibold text-ink-2">Ersätt allt</strong> gör appen till en exakt kopia av säkerhetskopian.
          </p>
        )}
      </Sheet>

      <Sheet
        open={other !== null}
        onClose={() => setOther(null)}
        title={other?.data.source === 'MyFitnessPal' ? 'Importera från MyFitnessPal' : 'Importera från annan app'}
        description={other?.fileName}
        footer={
          <Button fullWidth iconLeft={ArrowRightLeft} onClick={doOtherImport} disabled={!other || other.demo || otherAppSummaryEmpty(other.summary)}>
            Importera
          </Button>
        }
      >
        {other && (
          <>
            <ImportSummaryList summary={other.summary} kind="annan-app" />
            <div className="mt-4 flex flex-col gap-2 text-[0.875rem] leading-relaxed text-ink-3">
              {other.demo ? (
                <>
                  <p className="text-ink-2">Så här mycket finns i filen. Exempeldatan är skrivskyddad – skapa din egen profil först, sedan kan du importera.</p>
                  <StartOwnProfileButton confirm onNavigate={() => setOther(null)} />
                </>
              ) : (
                other.blockedDays > 0 && (
                  <p className="text-ink-2">
                    {plural(other.blockedDays, 'dag', 'dagar')} efter provperiodens start hoppas över – de kräver en licens.{' '}
                    <Link to="/premium" className="font-semibold text-gran underline underline-offset-2">
                      Om licenser
                    </Link>
                  </p>
                )
              )}
              <p>
                Det du själv har loggat i Lagom ändras inte – en egen vikt eller ett eget mått samma dag behålls. Samma fil kan importeras igen utan
                dubbletter, och en nyare export uppdaterar måltider som redan har importerats.
              </p>
              {other.summary.weights > 0 && <p>Vikten läses som kilo, om inte kolumnen anger pund (lb).</p>}
            </div>
          </>
        )}
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
            <Button variant="ghost" fullWidth onClick={() => void exportBackup()} iconLeft={Download}>
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
 * Sparas ändringarna på enheten just nu? Normalt ja (IndexedDB). Om lagringen är blockerad (privat
 * läge, full lagring, avstängda webbplatsdata) ligger ändringarna bara i minnet tills fliken eller
 * appen stängs – då är en säkerhetskopia det enda sättet att behålla dem. Kommer den sparade datan
 * från en nyare version av Lagom lämnas den orörd tills appen har uppdaterats.
 */
export function StorageStatus({ lastBackup }: { lastBackup: number | null }) {
  const memoryOnly = useMemoryOnlyStorage()
  const newer = useHasNewerData()
  const inApp = isInApp()
  if (memoryOnly) {
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-2xl bg-sol-soft p-3.5">
        <div className="flex items-start gap-3">
          <CloudOff aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-2" />
          <div className="min-w-0">
            <p className="text-[0.9375rem] font-semibold text-ink">Sparas inte på enheten just nu</p>
            <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-2">
              {newer
                ? 'Din data är från en nyare version av Lagom – uppdatera appen. Den sparade datan lämnas orörd, och det du gör nu finns bara kvar tills du stänger appen.'
                : inApp
                  ? 'Lagom kan inte spara på enheten just nu – t.ex. när lagringen är full. Det du gör finns kvar tills du stänger appen, men inte längre. Spara en säkerhetskopia nu, så går inget förlorat.'
                  : 'Webbläsaren låter inte Lagom spara – t.ex. i privat läge, när lagringen är full eller när webbplatsdata är avstängd. Det du gör finns kvar tills du stänger fliken, men inte längre. Spara en säkerhetskopia nu, så går inget förlorat.'}
            </p>
          </div>
        </div>
        <Button size="sm" iconLeft={Download} onClick={() => void exportBackup()}>
          Spara säkerhetskopia nu
        </Button>
      </div>
    )
  }
  const moln = `den är ditt enda moln om du byter enhet${inApp ? '' : ' eller webbläsarens data rensas'}.`
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl bg-surface-2 p-3.5">
      <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-good" />
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-semibold text-ink">Sparas på enheten</p>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-3">
          Allt du gör sparas direkt {storagePlace()}.{' '}
          {lastBackup === null ? `Exportera gärna en säkerhetskopia – ${moln}` : `Exportera gärna en ny säkerhetskopia då och då – ${moln}`}
        </p>
      </div>
    </div>
  )
}

/**
 * Lagringskortet. I appen (butiksapparna) visas bara om ändringarna sparas: uppskattningen av
 * utrymmet och skyddet mot automatisk rensning gäller webbläsaren, och hemskärmstipset är
 * meningslöst där.
 */
function StorageCard({ lastBackup }: { lastBackup: number | null }) {
  const inApp = isInApp()
  return (
    <Card eyebrow="Lagring" title="På den här enheten">
      <StorageStatus lastBackup={lastBackup} />
      {!inApp && <BrowserStorageDetails />}
    </Card>
  )
}

/** Använt utrymme och skydd mot automatisk rensning (bara i webbläsaren). */
function BrowserStorageDetails() {
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
    <>
      <div className="mt-4">
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
      </div>

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
    </>
  )
}
