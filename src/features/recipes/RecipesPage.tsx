/**
 * Recept (/recept) – "Mina recept" och "Svenska klassiker".
 *
 * Sök på namn, ingrediens eller märkning. Klassikerna kan filtreras på grupp. Fliken sparas i
 * adressen (?flik=klassiker) så att den finns kvar när man går tillbaka från ett recept.
 */
import { useDeferredValue, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { BookOpen, ChefHat, Link2, Plus, Scale, Search, Share2, Sparkles } from 'lucide-react'
import type { FoodTag, Recipe } from '../../types'
import { Button, Chip, EmptyState, PageHeader, Tabs, TextField, tabPanelProps } from '../../components/ui'
import { useFoodStore } from '../../stores/foodStore'
import { BUILTIN_RECIPE_GROUPS, builtinRecipeInfo, type BuiltinRecipeGroup } from '../../data/recipes'
import { HIDE_NATIVE_CLEAR, filterRecipes, isVegetarian, recipeFavoriteId, sortOwnRecipes } from './recipeLogic'
import { useBuiltinRecipes, useOwnRecipes } from './useRecipes'
import { RecipeCard, RecipeCardSkeleton } from './components'

type Tab = 'mina' | 'klassiker'
type GroupFilter = 'alla' | 'vego' | Exclude<BuiltinRecipeGroup, 'vego'>

const TABS_ID = 'recept'

/** Alla klassiker är svenska klassiker – märkningarna behöver inte upprepas på korten. */
const CLASSIC_HIDDEN_TAGS: readonly FoodTag[] = ['svensk', 'klassiker']

const GROUP_FILTERS: ReadonlyArray<{ value: GroupFilter; label: string }> = [
  { value: 'alla', label: 'Alla' },
  { value: 'husman', label: BUILTIN_RECIPE_GROUPS.husman },
  { value: 'vardag', label: BUILTIN_RECIPE_GROUPS.vardag },
  { value: 'fisk', label: 'Fisk' },
  { value: 'vego', label: BUILTIN_RECIPE_GROUPS.vego },
  { value: 'fika', label: BUILTIN_RECIPE_GROUPS.fika },
  { value: 'hogtid', label: BUILTIN_RECIPE_GROUPS.hogtid },
]

function matchesGroup(recipe: Recipe, group: GroupFilter): boolean {
  if (group === 'alla') return true
  if (group === 'vego') return isVegetarian(recipe) && builtinRecipeInfo(recipe.id)?.group !== 'fika'
  return builtinRecipeInfo(recipe.id)?.group === group
}

export default function RecipesPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('flik') === 'klassiker' ? 'klassiker' : 'mina'
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [group, setGroup] = useState<GroupFilter>('alla')
  const reduce = useReducedMotion()

  const own = useOwnRecipes()
  const favorites = useFoodStore((s) => s.favorites)
  const favSet = useMemo(() => new Set(favorites), [favorites])
  const { recipes: builtin, error } = useBuiltinRecipes()

  const ownList = useMemo(() => filterRecipes(sortOwnRecipes(own, favSet), deferredQuery), [own, favSet, deferredQuery])
  const builtinList = useMemo(
    () => (builtin ? filterRecipes(builtin, deferredQuery).filter((r) => matchesGroup(r, group)) : null),
    [builtin, deferredQuery, group],
  )

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params)
    if (next === 'klassiker') p.set('flik', 'klassiker')
    else p.delete('flik')
    setParams(p, { replace: true })
  }

  const searching = deferredQuery.trim() !== ''
  // Tomma "Mina recept" har en egen "Skapa recept"-knapp – den flytande knappen skulle bara
  // dubblera den och täcka tipsen under.
  const showFab = !(tab === 'mina' && own.length === 0)

  return (
    <div className="px-4 pb-24">
      <PageHeader
        back
        eyebrow="Kokbok"
        title="Recept"
        subtitle="Dina egna rätter och svenska klassiker – med näring per portion."
        actions={
          <Button size="sm" variant="soft" iconLeft={Link2} to="/recept/importera">
            Importera recept
          </Button>
        }
      >
        <Tabs<Tab>
          id={TABS_ID}
          value={tab}
          onChange={setTab}
          aria-label="Receptsamlingar"
          tabs={[
            { value: 'mina', label: 'Mina recept', icon: BookOpen, count: own.length > 0 ? own.length : undefined },
            { value: 'klassiker', label: 'Svenska klassiker', icon: Sparkles, count: builtin?.length },
          ]}
        />
      </PageHeader>

      {(tab === 'klassiker' || own.length > 0) && (
        <TextField
          label="Sök recept"
          labelHidden
          type="search"
          fieldClassName={HIDE_NATIVE_CLEAR}
          prefix={Search}
          clearable
          value={query}
          onValueChange={setQuery}
          placeholder={tab === 'mina' ? 'Sök bland dina recept' : 'Sök rätt eller ingrediens, t.ex. lax'}
          enterKeyHint="search"
          autoComplete="off"
        />
      )}

      <div {...tabPanelProps(TABS_ID, tab)} className="mt-4 rounded-card">
        {tab === 'mina' ? (
          <OwnRecipes list={ownList} total={own.length} searching={searching} query={deferredQuery} favSet={favSet} onExplore={() => setTab('klassiker')} />
        ) : (
          <>
            <div role="group" aria-label="Filtrera klassiker" className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 py-1.5">
              {GROUP_FILTERS.map((g) => (
                <Chip key={g.value} size="sm" selected={group === g.value} onClick={() => setGroup(g.value)}>
                  {g.label}
                </Chip>
              ))}
            </div>
            {builtinList === null ? (
              <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Laddar recept">
                {Array.from({ length: 6 }, (_, i) => (
                  <RecipeCardSkeleton key={i} />
                ))}
              </div>
            ) : error ? (
              <EmptyState illustration="forest" title="Klassikerna kunde inte laddas" text={error} />
            ) : builtinList.length === 0 ? (
              <EmptyState
                compact
                illustration="search"
                title="Inga klassiker hittades"
                text={searching ? `Inget matchar ”${deferredQuery.trim()}”. Prova ett annat ord eller en annan grupp.` : 'Prova en annan grupp.'}
                action={
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => {
                      setQuery('')
                      setGroup('alla')
                    }}
                  >
                    Visa alla klassiker
                  </Button>
                }
              />
            ) : (
              <>
                <p className="mb-3 px-1 text-[0.8125rem] leading-relaxed text-ink-3">
                  Husmanskost och högtidsmat med näringsvärden från Lagoms databas. Kopiera ett recept för att göra det till ditt eget.
                </p>
                <RecipeGrid list={builtinList} favSet={favSet} hideTags={CLASSIC_HIDDEN_TAGS} />
              </>
            )}
          </>
        )}
      </div>

      {showFab && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30, delay: 0.1 }}
          className="fixed right-4 bottom-[calc(6.25rem+var(--sa-bottom))] z-40 lg:right-8 lg:bottom-8"
        >
          <Button to="/recept/nytt" size="lg" iconLeft={Plus} className="!rounded-full shadow-[var(--shadow-float)]">
            Nytt recept
          </Button>
        </motion.div>
      )}
    </div>
  )
}

function RecipeGrid({ list, favSet, hideTags }: { list: readonly Recipe[]; favSet: ReadonlySet<string>; hideTags?: readonly FoodTag[] }) {
  const reduce = useReducedMotion()
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {list.map((r, i) => (
        <motion.li
          key={r.id}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: Math.min(i, 8) * 0.03, ease: [0.22, 1, 0.36, 1] }}
        >
          <RecipeCard recipe={r} favorite={favSet.has(recipeFavoriteId(r.id))} hideTags={hideTags} />
        </motion.li>
      ))}
    </ul>
  )
}

function OwnRecipes({
  list,
  total,
  searching,
  query,
  favSet,
  onExplore,
}: {
  list: readonly Recipe[]
  total: number
  searching: boolean
  query: string
  favSet: ReadonlySet<string>
  onExplore: () => void
}) {
  if (total === 0) {
    return (
      <div className="card mt-2 overflow-hidden">
        <EmptyState
          illustration="plate"
          titleAs="h2"
          title="Ditt första recept väntar"
          text="Samla familjens favoriter här. Lagom räknar ut näringen per portion – och tar hänsyn till att vatten kokar bort."
          action={
            <>
              <Button to="/recept/nytt" iconLeft={ChefHat}>
                Skapa recept
              </Button>
              <Button variant="soft" iconLeft={Link2} to="/recept/importera">
                Importera från länk
              </Button>
              {/* Delade recept (länk eller fil) – i apparna öppnas länkarna i webbläsaren, så här klistrar man in dem. */}
              <Button variant="soft" iconLeft={Share2} to="/dela">
                Öppna delat recept
              </Button>
              <Button variant="soft" iconLeft={Sparkles} onClick={onExplore}>
                Utforska klassiker
              </Button>
            </>
          }
        />
        <ul className="grid gap-2 border-t border-line/70 bg-surface-2/50 px-5 py-4 text-sm text-ink-2 sm:grid-cols-3">
          <li className="flex items-start gap-2.5">
            <Search aria-hidden className="mt-0.5 size-4 shrink-0 text-gran" />
            <span>Lägg till ingredienser med svenska mått – dl, msk och styck.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <Scale aria-hidden className="mt-0.5 size-4 shrink-0 text-gran" />
            <span>Väg rätten när den är klar så blir varje portion rätt.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <Plus aria-hidden className="mt-0.5 size-4 shrink-0 text-gran" />
            <span>Logga en portion i dagboken med ett tryck.</span>
          </li>
        </ul>
      </div>
    )
  }
  if (list.length === 0) {
    return (
      <EmptyState
        compact
        illustration="search"
        title="Inga recept matchar"
        text={searching ? `Inget av dina recept innehåller ”${query.trim()}”.` : undefined}
      />
    )
  }
  return (
    <>
      <RecipeGrid list={list} favSet={favSet} />
      <div className="mt-4 flex justify-center">
        <Button variant="ghost" iconLeft={Share2} to="/dela">
          Öppna delat recept
        </Button>
      </div>
    </>
  )
}
