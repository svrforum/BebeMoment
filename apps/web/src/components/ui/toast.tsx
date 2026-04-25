'use client'
import { cn } from '@/lib/cn'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from 'react'

export const ToastProvider = ToastPrimitive.Provider

export const ToastViewport = forwardRef<
  ElementRef<typeof ToastPrimitive.Viewport>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      'fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex w-full max-w-sm flex-col gap-2 px-4',
      className,
    )}
    {...props}
  />
))
ToastViewport.displayName = 'ToastViewport'

export const Toast = forwardRef<
  ElementRef<typeof ToastPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Root> & {
    variant?: 'default' | 'danger' | 'success'
  }
>(({ className, variant = 'default', ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    className={cn(
      'group rounded-2xl bg-base-900 text-base-50 shadow-elevated px-4 py-3 flex items-center gap-3',
      'data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-bottom-4',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out',
      variant === 'danger' && 'bg-danger text-white',
      variant === 'success' && 'bg-emerald-600 text-white',
      className,
    )}
    {...props}
  />
))
Toast.displayName = 'Toast'

export const ToastTitle = ToastPrimitive.Title
export const ToastDescription = ToastPrimitive.Description
export const ToastAction = ToastPrimitive.Action
