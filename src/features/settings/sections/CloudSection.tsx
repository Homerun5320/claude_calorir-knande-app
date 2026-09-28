/**
 * Inställningar → Lagom Moln: en frivillig, krypterad kopia av dagboken i molnet.
 *
 * Laddas BARA med dynamisk import när `CLOUD_ENABLED` är true (se src/config/cloud.ts), så att
 * ingen molnkod finns i appen när Lagom Moln är avstängt.
 *
 * Flödet:
 * 1. Logga in med e-post och en engångskod.
 * 2. Samtycke – en kryssruta som aldrig är förifylld (hälsouppgifter, artikel 9.2 a GDPR).
 * 3. Lösenfras (minst 12 tecken) och återställningsnyckeln, som visas en gång.
 * Därefter: senaste kopian, "Säkerhetskopiera nu", "Återställ från molnet", "Stäng av Lagom Moln"
 * och "Radera konto och molndata".
 */
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CircleCheck,
  Cloud,
  CloudDownload,
  CloudUpload,
  Copy,
  KeyRound,
  LockKeyhole,
  LogOut,
  Mail,
  Merge,
  Power,
  Replace,
  ShieldCheck,
  Trash,
} from 'lucide-react'
import { Badge, Button, Card, Dialog, Sheet, Spinner, Switch, TextField, toast } from '../../../components/ui'
import { useDemoData } from '../../../hooks/useDemoData'
import { BackupError } from '../../../lib/backup'
import { CloudError } from '../../../lib/cloud/http'
import {
  SKIP_MESSAGES,
  deleteAccount,
  deleteCloudData,
  downloadBackup,
  fetchRemoteInfo,
  markRestored,
  uploadBackup,
  type CloudCopy,
} from '../../../lib/cloud/cloudBackup'
import { MIN_PASSPHRASE_LENGTH, acceptNewConsent, loadVaultState, passphraseProblem, recoverHere, setUpVault, unlockHere, type VaultState } from '../../../lib/cloud/cloudSetup'
import { CLOUD_CONSENT_TEXT } from '../../../lib/cloud/consent'
import { isValidEmail, normalizeCode, requestCode, signOut, verifyCode } from '../../../lib/cloud/supabaseAuth'
import { VaultError } from '../../../lib/cloud/vaultCrypto'
import { clearDemoFlag } from '../../../lib/demoFlag'
import { nowTime, relativeDayLabel, toISODate } from '../../../lib/dates'
import { useCloudStore } from '../../../stores/cloudStore'
import { backupDateLabel, restoreBackupSafely } from '../backupImport'
import { ImportSummaryList } from '../ImportSummaryList'
import { formatBytes } from '../settingsLogic'
import { wipeAndReset } from '../wipe'

// ---------------------------------------------------------------------------
// Hjälpare
// ---------------------------------------------------------------------------

/** Felet som svensk text. */
function errorText(e: unknown): string {
  if (e instanceof CloudError || e instanceof VaultError || e instanceof BackupError) return e.message
  return 'Något gick fel. Försök igen.'
}

/** "idag 14:02", "igår 21:15" eller "tisdag 23 september 08:30". */
function cloudTimeLabel(ms: number, now: Date = new Date()): string {
  const d = new Date(ms)
  const day = relativeDayLabel(toISODate(d), toISODate(now))
  const label = day === 'Idag' || day === 'Igår' ? day.toLocaleLowerCase('sv-SE') : day
  return `${label} ${nowTime(d)}`
}

function StepLabel({ step }: { step: 1 | 2 | 3 }) {
  return <>Steg {step} av 3</>
}

function Checkbox({ checked, onChange, children, hint }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl bg-surface-2 p-3 text-left text-[0.9375rem] leading-snug text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 shrink-0 cursor-pointer accent-gran" />
      <span>
        {children}
        {hint && <span className="mt-0.5 block text-[0.8125rem] text-ink-3">{hint}</span>}
      </span>
    </label>
  )
}

function ErrorLine({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="mt-3 text-[0.875rem] leading-snug text-lingon">
      {children}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Sektionen
// ---------------------------------------------------------------------------

/** true när inloggningen har lästs in från enheten – annars syns inloggningsrutan en kort stund. */
function useCloudHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useCloudStore.persist.hasHydrated())
  useEffect(() => {
    if (hydrated) return
    const unsub = useCloudStore.persist.onFinishHydration(() => setHydrated(true))
    setHydrated(useCloudStore.persist.hasHydrated())
    return unsub
  }, [hydrated])
  return hydrated
}

function Loading() {
  return (
    <Card>
      <p className="flex items-center gap-3 text-[0.9375rem] text-ink-2" role="status">
        <Spinner /> Hämtar Lagom Moln …
      </p>
    </Card>
  )
}

export default function CloudSection() {
  const hydrated = useCloudHydrated()
  const userId = useCloudStore((s) => s.session?.userId ?? null)
  const email = useCloudStore((s) => s.session?.email ?? '')
  const [deleted, setDeleted] = useState(false)

  if (!hydrated) return <Loading />

  return (
    <div className="flex flex-col gap-5">
      {deleted && userId === null && (
        <Card tone="mossa" eyebrow="Klart" title="Ditt konto är raderat">
          <p role="status" className="-mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
            Kontot och all krypterad data i Lagom Moln är borttagna. Du kan starta Lagom Moln igen när du vill.
          </p>
        </Card>
      )}
      {userId === null ? (
        <>
          <Intro />
          <SignInCard />
        </>
      ) : (
        <SignedIn key={userId} userId={userId} email={email} onDeleted={() => setDeleted(true)} />
      )}
    </div>
  )
}

function Intro() {
  return (
    <Card eyebrow="Lagom Moln" title="Krypterad kopia i molnet">
      <p className="-mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
        Lagom Moln sparar en krypterad kopia av din dagbok, så att du kan få tillbaka den på en ny telefon. Kopian låses med en lösenfras som bara du
        känner till – varken vi eller någon annan kan läsa den.
      </p>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-3">
        Lagom Moln är frivilligt. Utan det fungerar Lagom precis som vanligt och allt stannar på din enhet.
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Steg 1 – logga in
// ---------------------------------------------------------------------------

function SignInCard() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    const address = email.trim()
    if (!isValidEmail(address)) {
      setError('Skriv en giltig e-postadress, t.ex. namn@exempel.se.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await requestCode(address)
      setSentTo(address)
      setCode('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    if (!sentTo) return
    const digits = normalizeCode(code)
    if (!/^\d{6,10}$/.test(digits)) {
      setError('Skriv koden från e-posten – bara siffror.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await verifyCode(sentTo, digits)
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Card eyebrow={<StepLabel step={1} />} title="Logga in med e-post">
      {sentTo === null ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <TextField
            label="E-postadress"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <ErrorLine>{error}</ErrorLine>
          <Button type="submit" className="mt-4" iconLeft={Mail} loading={busy}>
            Skicka kod
          </Button>
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-3">
            Inloggningen skapar ett konto med bara din e-postadress. Inget från dagboken sparas i molnet förrän du har gett ditt samtycke i nästa steg.
          </p>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void verify()
          }}
        >
          <p className="-mt-1 mb-3 text-[0.9375rem] leading-relaxed text-ink-2">
            Vi har skickat en kod till <strong className="font-semibold text-ink">{sentTo}</strong>. Hittar du den inte? Titta i skräpposten.
          </p>
          <TextField
            label="Kod (8 siffror)"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <ErrorLine>{error}</ErrorLine>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" loading={busy}>
              Logga in
            </Button>
            <Button type="button" variant="ghost" onClick={() => void send()} disabled={busy}>
              Skicka en ny kod
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSentTo(null)
                setError(null)
              }}
              disabled={busy}
            >
              Byt e-postadress
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Inloggad
// ---------------------------------------------------------------------------

type Loaded = { kind: 'laddar' } | { kind: 'fel'; message: string } | VaultState

function SignedIn({ userId, email, onDeleted }: { userId: string; email: string; onDeleted: () => void }) {
  const [state, setState] = useState<Loaded>({ kind: 'laddar' })
  const [consentGiven, setConsentGiven] = useState(false)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setState(await loadVaultState(userId))
    } catch (e) {
      setState({ kind: 'fel', message: errorText(e) })
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const finishSetup = () => {
    setRecoveryKey(null)
    useCloudStore.getState().patch({ enabled: true })
    // Första kopian direkt. Exempeldata, en profil som saknas m.m. stoppas i uploadBackup.
    void uploadBackup().then(
      (r) => {
        if (r.status === 'klar') toast('Den första kopian är sparad i Lagom Moln', { tone: 'success' })
      },
      () => undefined,
    )
    void load()
  }

  let body: ReactNode
  if (recoveryKey !== null) {
    body = <RecoveryKeyCard recoveryKey={recoveryKey} onDone={finishSetup} />
  } else if (state.kind === 'laddar') {
    body = <Loading />
  } else if (state.kind === 'fel') {
    body = (
      <Card eyebrow="Lagom Moln" title="Kunde inte hämta ditt konto">
        <p className="-mt-1 text-[0.9375rem] leading-relaxed text-ink-2">{state.message}</p>
        <Button className="mt-4" variant="secondary" onClick={() => void load()}>
          Försök igen
        </Button>
      </Card>
    )
  } else if (state.kind === 'nytt') {
    body = consentGiven ? (
      <PassphraseCard userId={userId} existingRow={state.row !== null} onCreated={setRecoveryKey} onFailed={() => void load()} />
    ) : (
      <ConsentCard onAccept={async () => setConsentGiven(true)} />
    )
  } else if (!state.consentOk) {
    body = (
      <ConsentCard
        changed
        onAccept={async () => {
          await acceptNewConsent(userId)
          await load()
        }}
      />
    )
  } else if (!state.unlockedHere) {
    body = <UnlockCard userId={userId} state={state} onUnlocked={() => void load()} />
  } else {
    body = <CloudMain />
  }

  return (
    <>
      {body}
      <AccountCard email={email} canTurnOff={state.kind === 'finns'} onDeleted={onDeleted} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Steg 2 – samtycke
// ---------------------------------------------------------------------------

function ConsentCard({ onAccept, changed = false }: { onAccept: () => Promise<void>; changed?: boolean }) {
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accept = async () => {
    if (!checked) return
    setBusy(true)
    setError(null)
    try {
      await onAccept()
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Card eyebrow={changed ? 'Lagom Moln' : <StepLabel step={2} />} title={changed ? 'Samtyckestexten har ändrats' : 'Innan något sparas'}>
      <ul className="-mt-1 flex flex-col gap-2.5 text-[0.9375rem] leading-relaxed text-ink-2">
        <li className="flex gap-3">
          <Cloud aria-hidden className="mt-0.5 size-5 shrink-0 text-gran" />
          <span>Det här sparas: din dagbok, vikt, kroppsmått, recept, egna livsmedel och inställningar – samma innehåll som en säkerhetskopia.</span>
        </li>
        <li className="flex gap-3">
          <LockKeyhole aria-hidden className="mt-0.5 size-5 shrink-0 text-gran" />
          <span>
            Allt krypteras på din enhet innan det skickas. Molntjänsten (Supabase, med servrar inom EU) ser bara krypterad data, din e-postadress och
            när kopian sparades.
          </span>
        </li>
        <li className="flex gap-3">
          <KeyRound aria-hidden className="mt-0.5 size-5 shrink-0 text-gran" />
          <span>Glömmer du både lösenfrasen och återställningsnyckeln går kopian inte att få tillbaka – inte heller med vår hjälp.</span>
        </li>
        <li className="flex gap-3">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-gran" />
          <span>
            Du kan när som helst stänga av Lagom Moln och radera kontot med all data i molnet. Läs mer i{' '}
            <Link to="/integritet" className="font-semibold text-gran underline underline-offset-2">
              integritetspolicyn
            </Link>
            .
          </span>
        </li>
      </ul>
      <div className="mt-4">
        <Checkbox checked={checked} onChange={setChecked}>
          {CLOUD_CONSENT_TEXT}
        </Checkbox>
      </div>
      <ErrorLine>{error}</ErrorLine>
      <Button className="mt-4" onClick={() => void accept()} disabled={!checked} loading={busy}>
        Fortsätt
      </Button>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Steg 3 – lösenfras och återställningsnyckel
// ---------------------------------------------------------------------------

function PassphraseCard({
  userId,
  existingRow,
  onCreated,
  onFailed,
}: {
  userId: string
  existingRow: boolean
  onCreated: (recoveryKey: string) => void
  /** Läs om valvet – ett tidigare försök kan ha hunnit spara det (då visas upplåsningen i stället). */
  onFailed: () => void
}) {
  const [pass, setPass] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    const problem = passphraseProblem(pass, repeat)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { recoveryKey } = await setUpVault(userId, pass, existingRow)
      onCreated(recoveryKey)
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
      onFailed()
    }
  }

  return (
    <Card eyebrow={<StepLabel step={3} />} title="Välj en lösenfras">
      <p className="-mt-1 mb-4 text-[0.9375rem] leading-relaxed text-ink-2">
        Lösenfrasen låser din kopia. Välj något långt som bara du känner till, t.ex. fyra ord med mellanslag. Vi kan inte återställa den åt dig.
      </p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <TextField
          label="Lösenfras"
          type="password"
          autoComplete="new-password"
          hint={`Minst ${MIN_PASSPHRASE_LENGTH} tecken`}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
        <TextField label="Upprepa lösenfrasen" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        <ErrorLine>{error}</ErrorLine>
        <Button type="submit" className="mt-1 self-start" iconLeft={LockKeyhole} loading={busy}>
          Skapa krypterad kopia
        </Button>
      </form>
    </Card>
  )
}

function RecoveryKeyCard({ recoveryKey, onDone }: { recoveryKey: string; onDone: () => void }) {
  const keyId = useId()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey)
      toast('Nyckeln är kopierad – klistra in den i en lösenordshanterare')
    } catch {
      toast('Kunde inte kopiera. Skriv av nyckeln i stället.', { tone: 'error' })
    }
  }
  return (
    <Card tone="sol" eyebrow="Visas bara en gång" title="Din återställningsnyckel">
      <p className="-mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
        Glömmer du lösenfrasen är nyckeln det enda sättet att få tillbaka din data. Skriv ner den eller spara den i en lösenordshanterare – inte bara i
        samma telefon som Lagom.
      </p>
      <dl className="mt-4">
        <dt className="sr-only">Återställningsnyckel</dt>
        <dd
          id={keyId}
          className="select-all break-words rounded-2xl bg-surface px-4 py-3 text-center font-mono text-[1.0625rem] leading-relaxed tracking-wider text-ink"
        >
          {recoveryKey}
        </dd>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" iconLeft={Copy} onClick={() => void copy()} aria-describedby={keyId}>
          Kopiera nyckeln
        </Button>
        <Button iconLeft={CircleCheck} onClick={onDone}>
          Jag har sparat nyckeln
        </Button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Lås upp på en ny enhet
// ---------------------------------------------------------------------------

function UnlockCard({ userId, state, onUnlocked }: { userId: string; state: Extract<VaultState, { kind: 'finns' }>; onUnlocked: () => void }) {
  const [mode, setMode] = useState<'losenfras' | 'nyckel'>('losenfras')
  const [pass, setPass] = useState('')
  const [key, setKey] = useState('')
  const [newPass, setNewPass] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (mode === 'nyckel') {
      const problem = passphraseProblem(newPass, repeat)
      if (problem) {
        setError(problem)
        return
      }
    }
    setBusy(true)
    try {
      if (mode === 'losenfras') await unlockHere(userId, state.record, pass)
      else await recoverHere(userId, state.record, key, newPass)
      toast('Lagom Moln är upplåst på den här enheten', { tone: 'success' })
      onUnlocked()
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Card eyebrow="Lagom Moln" title="Lås upp på den här enheten">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {mode === 'losenfras' ? (
          <>
            <p className="-mt-1 text-[0.9375rem] leading-relaxed text-ink-2">Skriv lösenfrasen du valde när du startade Lagom Moln.</p>
            <TextField label="Lösenfras" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          </>
        ) : (
          <>
            <p className="-mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
              Skriv återställningsnyckeln och välj en ny lösenfras. Din data i molnet finns kvar, och nyckeln fortsätter att gälla.
            </p>
            <TextField
              label="Återställningsnyckel"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              hint="52 tecken i grupper om fyra"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <TextField
              label="Ny lösenfras"
              type="password"
              autoComplete="new-password"
              hint={`Minst ${MIN_PASSPHRASE_LENGTH} tecken`}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
            />
            <TextField label="Upprepa den nya lösenfrasen" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </>
        )}
        <ErrorLine>{error}</ErrorLine>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button type="submit" iconLeft={LockKeyhole} loading={busy}>
            {mode === 'losenfras' ? 'Lås upp' : 'Återställ och spara'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setMode(mode === 'losenfras' ? 'nyckel' : 'losenfras')
              setError(null)
            }}
          >
            {mode === 'losenfras' ? 'Glömt lösenfrasen?' : 'Använd lösenfrasen'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Klart – kopior och återställning
// ---------------------------------------------------------------------------

interface RemoteInfo {
  rev: number
  updatedAt: string
  size: number
}

function CloudMain() {
  const navigate = useNavigate()
  const enabled = useCloudStore((s) => s.enabled)
  const lastUploadAt = useCloudStore((s) => s.lastUploadAt)
  const lastError = useCloudStore((s) => s.lastError)
  const backupRev = useCloudStore((s) => s.backupRev)
  const demo = useDemoData()
  const [remote, setRemote] = useState<RemoteInfo | null | undefined>(undefined)
  const [busy, setBusy] = useState<'upp' | 'ner' | 'ersatt' | null>(null)
  const [conflictOpen, setConflictOpen] = useState(false)
  const [copy, setCopy] = useState<CloudCopy | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)

  const refreshRemote = useCallback(async () => {
    try {
      setRemote(await fetchRemoteInfo())
    } catch {
      setRemote(null)
    }
  }, [])

  useEffect(() => {
    void refreshRemote()
  }, [refreshRemote])

  const upload = async (force = false) => {
    setBusy(force ? 'ersatt' : 'upp')
    try {
      const r = await uploadBackup({ force })
      if (r.status === 'klar') {
        setConflictOpen(false)
        toast('Kopian är sparad i Lagom Moln', { tone: 'success' })
        void refreshRemote()
      } else if (r.status === 'konflikt') {
        setConflictOpen(true)
        void refreshRemote()
      } else {
        toast(SKIP_MESSAGES[r.reason])
      }
    } catch (e) {
      toast(errorText(e), { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const openRestore = async () => {
    setBusy('ner')
    try {
      const c = await downloadBackup()
      if (!c) toast('Det finns ingen kopia i molnet ännu.')
      else {
        setConflictOpen(false)
        setConfirmReplace(false)
        setCopy(c)
      }
    } catch (e) {
      toast(errorText(e), { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const restore = (mode: 'merge' | 'replace') => {
    if (!copy) return
    try {
      restoreBackupSafely(copy.backup, mode)
      if (mode === 'replace') clearDemoFlag()
      markRestored(copy)
      setCopy(null)
      toast(mode === 'merge' ? 'Kopian från molnet är ihopslagen med din data' : 'Kopian från molnet är återställd', { tone: 'success' })
      if (mode === 'replace' && demo) navigate('/', { replace: true })
    } catch {
      toast('Återställningen misslyckades. Ingen data har ändrats.', { tone: 'error' })
    }
  }

  // En kopia i molnet som den här enheten inte bygger på (t.ex. en ny telefon).
  const newerInCloud = remote != null && remote.rev !== backupRev

  return (
    <>
      <Card
        eyebrow="Lagom Moln"
        title="Krypterad kopia"
        action={
          enabled ? (
            <Badge tone="good" icon={CircleCheck}>
              På
            </Badge>
          ) : (
            <Badge tone="neutral">Pausad</Badge>
          )
        }
      >
        <dl className="-mt-1 flex flex-col rounded-2xl bg-surface-2 px-4 py-1">
          <div className="flex items-baseline justify-between gap-3 border-b border-line/70 py-2.5">
            <dt className="text-[0.9375rem] text-ink-2">Från den här enheten</dt>
            <dd className="text-right text-[0.9375rem] font-semibold text-ink">{lastUploadAt === null ? 'Ingen ännu' : cloudTimeLabel(lastUploadAt)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="text-[0.9375rem] text-ink-2">I molnet</dt>
            <dd className="text-right text-[0.9375rem] font-semibold text-ink">
              {remote === undefined ? '…' : remote === null ? 'Ingen kopia' : `${cloudTimeLabel(Date.parse(remote.updatedAt))} · ${formatBytes(remote.size)}`}
            </dd>
          </div>
        </dl>

        {demo && (
          <p className="mt-3 rounded-2xl bg-sol-soft p-3 text-[0.875rem] leading-relaxed text-ink-2">
            Du tittar på exempeldata. Den laddas aldrig upp – skapa din egen profil först, så sparas dina kopior här.
          </p>
        )}
        {!demo && newerInCloud && (
          <p className="mt-3 rounded-2xl bg-fjall-soft p-3 text-[0.875rem] leading-relaxed text-ink-2">
            Det finns en kopia i molnet som inte kommer från den här enheten. Vill du ha tillbaka den? Välj Återställ från molnet.
          </p>
        )}
        {lastError && !demo && (
          <p role="status" className="mt-3 rounded-2xl bg-sol-soft p-3 text-[0.875rem] leading-relaxed text-ink-2">
            {lastError}
          </p>
        )}

        <div className="mt-4">
          <Switch
            label="Automatisk kopia"
            description="En gång per dag och när du lämnar appen."
            checked={enabled}
            onChange={(on) => useCloudStore.getState().patch({ enabled: on, lastError: null })}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
          <Button iconLeft={CloudUpload} onClick={() => void upload()} loading={busy === 'upp'} disabled={demo || (busy !== null && busy !== 'upp')}>
            Säkerhetskopiera nu
          </Button>
          <Button variant="secondary" iconLeft={CloudDownload} onClick={() => void openRestore()} loading={busy === 'ner'} disabled={busy !== null && busy !== 'ner'}>
            Återställ från molnet
          </Button>
        </div>
      </Card>

      <Dialog
        open={conflictOpen}
        onClose={() => setConflictOpen(false)}
        title="Det finns en nyare kopia i molnet"
        description="En annan enhet har sparat en kopia sedan den här enheten senast laddade upp. Inget har skrivits över."
        icon={Cloud}
        footer={
          <div className="flex w-full flex-col gap-2">
            <Button fullWidth iconLeft={CloudDownload} onClick={() => void openRestore()} loading={busy === 'ner'}>
              Visa kopian i molnet
            </Button>
            <Button fullWidth variant="outline" iconLeft={Replace} onClick={() => void upload(true)} loading={busy === 'ersatt'}>
              Ersätt med den här enheten
            </Button>
            <Button fullWidth variant="ghost" onClick={() => setConflictOpen(false)}>
              Avbryt
            </Button>
          </div>
        }
      />

      <Sheet
        open={copy !== null}
        onClose={() => setCopy(null)}
        title="Återställ från Lagom Moln"
        description={copy ? `Kopia från ${backupDateLabel(copy.backup.exportedAt)}` : undefined}
        footer={
          confirmReplace ? (
            <div className="flex flex-col gap-2">
              <Button fullWidth variant="danger" iconLeft={Replace} onClick={() => restore('replace')}>
                Ja, ersätt allt
              </Button>
              <Button fullWidth variant="ghost" onClick={() => setConfirmReplace(false)}>
                Tillbaka
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {!demo && (
                <Button fullWidth iconLeft={Merge} onClick={() => restore('merge')}>
                  Slå ihop med min data
                </Button>
              )}
              <Button fullWidth variant={demo ? 'primary' : 'outline'} iconLeft={Replace} onClick={() => setConfirmReplace(true)}>
                {demo ? 'Ersätt exempeldatan' : 'Ersätt allt'}
              </Button>
            </div>
          )
        }
      >
        {copy && <ImportSummaryList summary={copy.summary} />}
        <p className="mt-4 text-[0.875rem] leading-relaxed text-ink-3">
          {confirmReplace ? (
            <>Allt som finns i appen nu ersätts med kopian från molnet. Det går inte att ångra.</>
          ) : (
            <>
              <strong className="font-semibold text-ink-2">Slå ihop</strong> behåller det du har och lägger till det som saknas.{' '}
              <strong className="font-semibold text-ink-2">Ersätt allt</strong> gör appen till en exakt kopia av den i molnet.
            </>
          )}
        </p>
      </Sheet>
    </>
  )
}

// ---------------------------------------------------------------------------
// Konto – stäng av och radera
// ---------------------------------------------------------------------------

function AccountCard({ email, canTurnOff, onDeleted }: { email: string; canTurnOff: boolean; onDeleted: () => void }) {
  const navigate = useNavigate()
  const [turnOffOpen, setTurnOffOpen] = useState(false)
  const [deleteCloud, setDeleteCloud] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [wipeDevice, setWipeDevice] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const turnOff = async () => {
    setBusy(true)
    setError(null)
    try {
      if (deleteCloud) await deleteCloudData()
      await signOut()
      setTurnOffOpen(false)
      toast(deleteCloud ? 'Lagom Moln är avstängt och kopian i molnet är raderad' : 'Lagom Moln är avstängt på den här enheten')
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    setBusy(true)
    setError(null)
    try {
      await deleteAccount()
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
      return
    }
    setDeleteOpen(false)
    onDeleted()
    if (wipeDevice) {
      wipeAndReset()
      toast('Ditt konto är raderat, och all data på enheten är borttagen')
      navigate('/valkommen', { replace: true })
    } else {
      toast('Ditt konto är raderat')
    }
  }

  return (
    <>
      <Card eyebrow="Konto" title="Ditt konto i Lagom Moln">
        <p className="-mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
          Inloggad som <strong className="font-semibold text-ink">{email || 'okänd e-post'}</strong>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {canTurnOff ? (
            <Button
              variant="secondary"
              iconLeft={Power}
              onClick={() => {
                setDeleteCloud(false)
                setError(null)
                setBusy(false)
                setTurnOffOpen(true)
              }}
            >
              Stäng av Lagom Moln
            </Button>
          ) : (
            <Button variant="secondary" iconLeft={LogOut} onClick={() => void signOut()}>
              Avbryt och logga ut
            </Button>
          )}
        </div>
      </Card>

      <section aria-labelledby="radera-konto-rubrik" className="rounded-card p-4 ring-1 ring-inset ring-lingon/30 sm:p-5">
        <h2 id="radera-konto-rubrik" className="font-display text-[1.1875rem] font-semibold tracking-tight text-ink">
          Radera konto och molndata
        </h2>
        <p className="mb-4 mt-1 text-[0.9375rem] leading-relaxed text-ink-2">Tar bort ditt konto och allt som finns i Lagom Moln. Din data på enheten finns kvar om du inte väljer annat.</p>
        <Button
          variant="danger"
          iconLeft={Trash}
          onClick={() => {
            setWipeDevice(false)
            setError(null)
            setBusy(false)
            setDeleteOpen(true)
          }}
        >
          Radera konto och molndata
        </Button>
      </section>

      <Dialog
        open={turnOffOpen}
        onClose={() => !busy && setTurnOffOpen(false)}
        title="Stäng av Lagom Moln?"
        description="Den här enheten slutar ladda upp kopior och loggas ut. Din data på enheten påverkas inte."
        icon={Power}
        footer={
          <div className="flex w-full flex-col gap-2">
            <Button fullWidth onClick={() => void turnOff()} loading={busy}>
              Stäng av
            </Button>
            <Button fullWidth variant="ghost" onClick={() => setTurnOffOpen(false)} disabled={busy}>
              Avbryt
            </Button>
          </div>
        }
      >
        <Checkbox checked={deleteCloud} onChange={setDeleteCloud} hint="Kontot finns kvar tills du raderar det.">
          Radera också kopian i molnet
        </Checkbox>
        <ErrorLine>{error}</ErrorLine>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onClose={() => !busy && setDeleteOpen(false)}
        title="Radera konto och molndata?"
        description="Kontot och all krypterad data i molnet raderas permanent. Din data på den här enheten finns kvar."
        icon={Trash}
        tone="lingon"
        role="alertdialog"
        footer={
          <div className="flex w-full flex-col gap-2">
            <Button fullWidth variant="danger" onClick={() => void confirmDelete()} loading={busy}>
              Radera konto
            </Button>
            <Button fullWidth variant="ghost" onClick={() => setDeleteOpen(false)} disabled={busy}>
              Avbryt
            </Button>
          </div>
        }
      >
        <Checkbox checked={wipeDevice} onChange={setWipeDevice} hint="Dagbok, vikt, recept och inställningar raderas även här. Provperioden startar inte om.">
          Radera också allt på den här enheten
        </Checkbox>
        <ErrorLine>{error}</ErrorLine>
      </Dialog>
    </>
  )
}
