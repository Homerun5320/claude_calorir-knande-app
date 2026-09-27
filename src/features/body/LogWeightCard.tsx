/**
 * "Logga vikt" – stort sifferfält (kg med en decimal), datum (idag som standard) och en
 * valfri anteckning. Sparar med `logWeight` och visar en toast med Ångra.
 */
import { useState, type FormEvent } from 'react'
import { Check, Sunrise } from 'lucide-react'
import { Button, Card, NumberField, TextField, toast } from '../../components/ui'
import { formatDayLong } from '../../lib/dates'
import { formatKg } from '../../lib/format'
import { useBodyStore } from '../../stores/bodyStore'
import { useProfileStore } from '../../stores/profileStore'
import type { ISODate } from '../../types'
import { round1 } from './bodyLogic'

export const MIN_KG = 20
export const MAX_KG = 400
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

interface LogWeightCardProps {
  today: ISODate
  /** Första vägningen – något mer inbjudande rubrik. */
  first?: boolean
  /** Medvetet läge: fyll inte i senaste vikten i förväg och nämn inga siffror i texterna. */
  hideNumbers?: boolean
}

export function LogWeightCard({ today, first, hideNumbers = false }: LogWeightCardProps) {
  // Primitiva värden – stabila för Zustand-selektorer.
  const latestKg = useBodyStore((s) => (s.weights.length ? s.weights[s.weights.length - 1].kg : undefined))
  const startKg = useProfileStore((s) => s.profile?.startWeightKg)

  const [kg, setKg] = useState<number | undefined>(() => (hideNumbers ? undefined : (latestKg ?? startKg)))
  const [date, setDate] = useState<ISODate>(today)
  const [note, setNote] = useState('')

  // Befintlig vägning samma dag (referens ur butiken – stabil).
  const existing = useBodyStore((s) => s.weights.find((w) => w.date === date))

  const kgValid = kg !== undefined && kg >= MIN_KG && kg <= MAX_KG
  const dateValid = ISO_RE.test(date) && date <= today
  const valid = kgValid && dateValid

  const save = (e?: FormEvent) => {
    e?.preventDefault()
    if (!valid || kg === undefined) return
    const store = useBodyStore.getState()
    const previous = store.weights.find((w) => w.date === date)
    const entry = store.logWeight(date, round1(kg), note.trim() || undefined)
    setNote('')
    const when = date === today ? '' : ` för ${formatDayLong(date, today).toLowerCase()}`
    toast(previous ? `Vikten${when} är uppdaterad` : hideNumbers ? `Vikten är sparad${when}` : `${formatKg(entry.kg)} sparat${when}`, {
      tone: 'success',
      action: {
        label: 'Ångra',
        onClick: () => {
          const s = useBodyStore.getState()
          if (previous) s.logWeight(previous.date, previous.kg, previous.note)
          else s.removeWeight(entry.id)
        },
      },
    })
  }

  return (
    <Card
      eyebrow={first ? 'Första steget' : 'Väg dig'}
      title="Logga vikt"
      action={<Sunrise aria-hidden className="size-5 text-sol" strokeWidth={2.2} />}
    >
      <form onSubmit={save} noValidate aria-label="Logga vikt">
        <NumberField
          size="lg"
          label="Vikt i kilo"
          labelHidden
          value={kg}
          onChange={setKg}
          suffix="kg"
          step={0.1}
          decimals={1}
          // Bara min 0 (inga negativa tal): fältet ska inte tyst skriva om en felskriven vikt
          // (t.ex. "7,24" till 20 kg). Intervallet kontrolleras här och visas som fel.
          min={0}
          // Medvetet läge: ingen exempelvikt i fältet – bara ett neutralt streck.
          placeholder={hideNumbers ? '–' : '72,4'}
          error={kg !== undefined && !kgValid ? `Ange en vikt mellan ${MIN_KG} och ${MAX_KG} kg` : undefined}
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <TextField
            type="date"
            label="Datum"
            value={date}
            max={today}
            required
            onValueChange={setDate}
            error={!dateValid ? 'Välj ett datum som inte ligger i framtiden' : undefined}
            hint={existing ? `Ersätter ${hideNumbers ? 'vikten' : formatKg(existing.kg)} som redan finns den dagen` : undefined}
          />
          <TextField
            label="Anteckning"
            optional
            value={note}
            onValueChange={setNote}
            placeholder="T.ex. efter semestern"
            maxLength={140}
            enterKeyHint="done"
          />
        </div>

        <Button type="submit" fullWidth size="lg" iconLeft={Check} disabled={!valid} className="mt-5">
          {existing ? 'Uppdatera vikten' : 'Spara vikt'}
        </Button>
        <p className="mt-3 text-center text-xs leading-relaxed text-ink-3">
          Väg dig helst på morgonen – efter toabesök och före frukost – så blir trenden jämnast.
        </p>
      </form>
    </Card>
  )
}
