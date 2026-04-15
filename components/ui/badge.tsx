import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-brand-coral/10 text-brand-coral hover:bg-brand-coral/20',
        secondary:
          'border-transparent bg-white/8 text-brand-muted hover:bg-white/12',
        destructive:
          'border-brand-error/20 bg-brand-error/10 text-brand-error hover:bg-brand-error/20',
        outline:
          'border-white/10 text-brand-muted',
        success:
          'border-brand-success/20 bg-brand-success/10 text-brand-success hover:bg-brand-success/20',
        warning:
          'border-brand-warning/20 bg-brand-warning/10 text-brand-warning hover:bg-brand-warning/20',
        info:
          'border-brand-coral/20 bg-brand-coral/10 text-brand-coral hover:bg-brand-coral/20',
        muted:
          'border-white/10 bg-white/5 text-brand-muted hover:bg-white/8',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
