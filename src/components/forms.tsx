"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

const INITIAL: ActionResult = { ok: true };

/**
 * Runs a server action from a form submit. Feedback (toasts, onSuccess) is
 * triggered from the submit callback itself, so it still fires if the form
 * unmounts as a result of the change. Input is preserved when the action fails.
 */
export function useFormAction(action: FormAction, onSuccess?: () => void) {
  const [state, setState] = useState<ActionResult>(INITIAL);
  const [pending, startTransition] = useTransition();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      let result: ActionResult;
      try {
        result = await action(state, fd);
      } catch {
        result = { ok: false, error: "Something went wrong. Please try again." };
      }
      setState(result);
      if (result.ok) {
        if (result.message) toast.success(result.message);
        onSuccess?.();
      } else {
        toast.error(result.error);
      }
    });
  };
  return { state, pending, onSubmit };
}

export function FieldError({ state, name }: { state: ActionResult; name: string }) {
  if (state.ok || !state.fieldErrors?.[name]?.length) return null;
  return (
    <p className="text-xs text-destructive" role="alert">
      {state.fieldErrors[name]![0]}
    </p>
  );
}

export function SubmitButton({ pending, children, className, variant }: { pending: boolean; children: React.ReactNode; className?: string; variant?: "default" | "destructive" | "outline" }) {
  return (
    <Button type="submit" disabled={pending} className={className} variant={variant}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

/** A dialog containing a form bound to a server action; closes on success. */
export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel = "Save",
  children,
  defaultOpen = false,
  wide = false,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  action: FormAction;
  submitLabel?: string;
  children: (state: ActionResult) => React.ReactNode;
  defaultOpen?: boolean;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { state, onSubmit, pending } = useFormAction(action, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={cn("max-h-[90dvh] overflow-y-auto", wide && "sm:max-w-2xl")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          {children(state)}
          {!state.ok && !state.fieldErrors ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Small inline form (e.g. a single button) bound to a server action. */
export function InlineAction({ action, children, className, hidden }: { action: FormAction; children: React.ReactNode; className?: string; hidden?: Record<string, string> }) {
  const { onSubmit } = useFormAction(action);
  return (
    <form onSubmit={onSubmit} className={className}>
      {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      {children}
    </form>
  );
}

/** Destructive action guarded by an explicit confirmation step. */
export function ConfirmAction({
  action,
  hidden,
  trigger,
  title,
  description,
  confirmLabel = "Delete",
}: {
  action: FormAction;
  hidden: Record<string, string>;
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const { onSubmit, pending } = useFormAction(action, () => setOpen(false));
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={onSubmit}>
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            {/* A plain submit button: Radix's AlertDialogAction would close (and unmount) the form before it submits. */}
            <SubmitButton pending={pending} variant="destructive">
              {confirmLabel}
            </SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function TextField({
  label,
  name,
  state,
  hint,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; name: string; state: ActionResult; hint?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={`f-${name}`}>{label}</Label>
      <Input id={`f-${name}`} name={name} aria-invalid={!state.ok && Boolean(state.fieldErrors?.[name])} {...props} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <FieldError state={state} name={name} />
    </div>
  );
}

export function TextAreaField({ label, name, state, className, ...props }: React.ComponentProps<typeof Textarea> & { label: string; name: string; state: ActionResult }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={`f-${name}`}>{label}</Label>
      <Textarea id={`f-${name}`} name={name} {...props} />
      <FieldError state={state} name={name} />
    </div>
  );
}

/** Native select: accessible, form-friendly, and works without JS hydration quirks. */
export function SelectField({
  label,
  name,
  state,
  options,
  defaultValue,
  className,
  required,
}: {
  label: string;
  name: string;
  state: ActionResult;
  options: { value: string; label: string }[];
  defaultValue?: string;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={`f-${name}`}>{label}</Label>
      <select
        id={`f-${name}`}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldError state={state} name={name} />
    </div>
  );
}
