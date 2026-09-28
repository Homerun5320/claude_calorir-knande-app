/**
 * Lagoms UI-kit – "Nordisk natur".
 *
 * Importera allt härifrån: `import { Button, Card, Sheet, toast } from '@/components/ui'`.
 * Alla komponenter använder designsystemets tokens och fungerar i ljust och mörkt läge.
 */

// Delade hjälpare och toner
export { cx, renderIcon, Spinner, BUTTON_VARIANTS, type IconLike } from './Button'
export {
  toneColor,
  toneSoftColor,
  toneInkColor,
  toneTextColor,
  toneVars,
  type Tone,
  type AccentTone,
  type SemanticTone,
} from './Badge'

// Knappar
export { Button, type ButtonProps, type ButtonAsButtonProps, type ButtonAsLinkProps, type ButtonVariant, type ButtonSize } from './Button'
export { IconButton, type IconButtonProps, type IconButtonSize } from './IconButton'
export { Chip, type ChipProps } from './Chip'
export { Badge, type BadgeProps, type BadgeVariant } from './Badge'
export { ExternalLink, externalLinkHint, isAppLink, type ExternalLinkProps } from './ExternalLink'

// Ytor och layout
export { Card, type CardProps, type CardPadding, type CardVariant } from './Card'
export { PageHeader, type PageHeaderProps } from './PageHeader'
export { SectionTitle, type SectionTitleProps } from './SectionTitle'
export { ListRow, ListGroup, type ListRowProps, type ListGroupProps } from './ListRow'
export { EmptyState, type EmptyStateProps, type EmptyIllustration } from './EmptyState'
export { Skeleton, SkeletonText, SkeletonRow, type SkeletonProps } from './Skeleton'

// Modaler och notiser
export { Sheet, useModal, useMediaQuery, ModalBackdrop, type SheetProps, type UseModalOptions, type ReturnFocus } from './Sheet'
export {
  Dialog,
  ConfirmDialog,
  DialogHost,
  confirmDialog,
  useDialogStore,
  type DialogProps,
  type ConfirmDialogProps,
  type ConfirmOptions,
} from './Dialog'
export { toast, ToastViewport, useToastStore, type ToastItem } from './toast'

// Val och navigering
export { SegmentedControl, type SegmentedControlProps, type SegmentOption } from './SegmentedControl'
export { Tabs, tabId, tabPanelId, tabPanelProps, type TabsProps, type TabItem } from './Tabs'

// Formulär
export { TextField, Field, type TextFieldProps, type TextFieldInputProps, type TextFieldAreaProps, type FieldProps } from './TextField'
export { NumberField, type NumberFieldProps } from './NumberField'
export { Select, type SelectProps, type SelectOption, type SelectOptionGroup } from './Select'
export { Switch, type SwitchProps } from './Switch'
export { Slider, type SliderProps, type SliderMark } from './Slider'
export { Stepper, StepButton, usePressRepeat, stepNumber, clampNumber, type StepperProps, type StepButtonProps } from './Stepper'

// Förlopp och nyckeltal
export { ProgressBar, type ProgressBarProps } from './ProgressBar'
export { ProgressRing, type ProgressRingProps } from './ProgressRing'
export { Stat, type StatProps, type StatTrend } from './Stat'
