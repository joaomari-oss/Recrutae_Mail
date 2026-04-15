import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-brand-coral text-white hover:bg-brand-orange hover:scale-[1.02] hover:shadow-coral active:scale-[0.99]',
        destructive:
          'bg-brand-error/10 text-brand-error border border-brand-error/20 hover:bg-brand-error/20',
        outline:
          'border border-white/10 bg-transparent text-brand-muted hover:text-brand-white hover:border-white/20 hover:bg-white/5',
        secondary:
          'bg-white/8 text-brand-muted hover:bg-white/12 hover:text-brand-white',
        ghost:
          'text-brand-muted hover:text-brand-white hover:bg-white/5',
        link:
          'text-brand-coral underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm:      'h-9 px-3 text-xs',
        lg:      'h-11 px-8',
        icon:    'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
