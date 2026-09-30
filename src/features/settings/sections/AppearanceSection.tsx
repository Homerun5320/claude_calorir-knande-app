/**
 * Inställningar → Utseende och visning: tema, energienhet och vad som visas.
 */
import { useId } from 'react'
import { HeartHandshake, Monitor, Moon, Sun } from 'lucide-react'
import { Card, ExternalLink, SegmentedControl, Switch } from '../../../components/ui'
import { formatNumber } from '../../../lib/format'
import { KJ_PER_KCAL } from '../../../lib/nutrients'
import { useProfileStore } from '../../../stores/profileStore'
import type { Settings, ThemeMode } from '../../../types'
import { Note } from '../../onboarding/AboutFields'
import { toggleDashboardNutrient } from '../settingsLogic'

export function AppearanceSection() {
  const settings = useProfileStore((s) => s.settings)
  const updateSettings = useProfileStore((s) => s.updateSettings)
  const themeId = useId()
  const unitId = useId()
  const set = (patch: Partial<Settings>) => updateSettings(patch)

  return (
    <div className="flex flex-col gap-5">
      <Card eyebrow="Utseende" title="Tema">
        <div id={themeId} className="sr-only">
          Tema
        </div>
        <SegmentedControl<ThemeMode>
          aria-labelledby={themeId}
          fullWidth
          value={settings.theme}
          onChange={(theme) => set({ theme })}
          options={[
            { value: 'system', label: 'System', icon: Monitor },
            { value: 'ljust', label: 'Ljust', icon: Sun },
            { value: 'morkt', label: 'Mörkt', icon: Moon },
          ]}
        />
        <p className="mt-2 text-[0.8125rem] leading-snug text-ink-3">Midsommar på dagen, midvinter på kvällen. System följer enhetens inställning.</p>
        <div className="mt-4">
          <Switch
            label="Säsongstema"
            description="Himlen och landskapet överst på Idag följer årstiden och tiden på dygnet."
            checked={settings.seasonalTheme}
            onChange={(seasonalTheme) => set({ seasonalTheme })}
          />
        </div>
      </Card>

      <Card eyebrow="Enheter" title="Energi">
        <div id={unitId} className="sr-only">
          Energienhet
        </div>
        <SegmentedControl<'kcal' | 'kJ'>
          aria-labelledby={unitId}
          fullWidth
          value={settings.energyUnit}
          onChange={(energyUnit) => set({ energyUnit })}
          options={[
            { value: 'kcal', label: 'kcal', 'aria-label': 'Kilokalorier (kcal)' },
            { value: 'kJ', label: 'kJ', 'aria-label': 'Kilojoule (kJ)' },
          ]}
        />
        <p className="mt-2 text-[0.8125rem] leading-snug text-ink-3">
          1{'\u00a0'}kcal = {formatNumber(KJ_PER_KCAL, 3)}{'\u00a0'}kJ. Förpackningar visar ofta båda – kcal är vanligast i Sverige.
        </p>
      </Card>

      <Card eyebrow="Visning" title="Vad som visas">
        <div className="flex flex-col gap-3">
          <Switch
            label="Klimatpåverkan"
            description="Ungefärliga kg CO₂e för måltider och dagar (RISE Klimatdatabas)."
            checked={settings.showClimate}
            onChange={(showClimate) => set({ showClimate })}
          />
          <Switch
            label="Vitaminer och mineraler"
            description="Visa mikronäringsämnen i livsmedel och insikter."
            checked={settings.showMicros}
            onChange={(showMicros) => set({ showMicros })}
          />
          <Switch
            label="Fibrer på Idag"
            description="Visa fibrer bredvid protein, kolhydrater och fett."
            checked={settings.dashboardNutrients.includes('fiber')}
            onChange={(on) => set({ dashboardNutrients: toggleDashboardNutrient(settings.dashboardNutrients, 'fiber', on) })}
          />
        </div>
      </Card>

      <Card eyebrow="Må bra" title="Medvetet läge" tone={settings.mindfulMode ? 'vinbar' : undefined}>
        <Switch
          label="Dölj siffrorna"
          description="Kalorier och vikt göms i översikten, dagboken och insikterna. I stället visar Lagom Tallriksmodellen, hur du mår och ord som ”lagom” och ”lite kvar”. Siffrorna finns kvar under Inställningar – i Mål och makron och i Profil – om du behöver dem."
          checked={settings.mindfulMode}
          onChange={(mindfulMode) => set({ mindfulMode })}
        />
        <div className="mt-3">
          <Note tone="mossa" icon={HeartHandshake}>
            Känns det jobbigt att räkna eller tänker du mycket på mat och vikt? Du är inte ensam. Prata med{' '}
            <ExternalLink href="https://www.1177.se" className="font-semibold text-gran underline underline-offset-2">
              1177 Vårdguiden
            </ExternalLink>{' '}
            eller{' '}
            <ExternalLink href="https://www.friskfri.se" className="font-semibold text-gran underline underline-offset-2">
              Frisk &amp; Fri
            </ExternalLink>
            .
          </Note>
        </div>
      </Card>
    </div>
  )
}
