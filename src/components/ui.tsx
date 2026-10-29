"use client";

import { type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ButtonHTMLAttributes } from "react";
import { ChevronDown, CircleCheck, Info, Loader2, TriangleAlert } from "lucide-react";

/* ---------------------------------------------------------------- Card */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border bg-card text-card-foreground shadow-sm ${className}`}>{children}</div>;
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-5 sm:p-6 ${className}`}>{children}</div>;
}

/* ------------------------------------------------------------ PageHeader */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

/* ---------------------------------------------------------------- Button */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
};

export function Button({ variant = "primary", loading, className = "", children, disabled, ...rest }: ButtonProps) {
  const base =
    "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium shadow-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : variant === "danger"
        ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
        : variant === "ghost"
          ? "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          : "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground";
  return (
    <button className={`${base} ${styles} ${className}`} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- Input */

const fieldBase =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldBase} h-9 ${className}`} {...rest} />;
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${fieldBase} min-h-20 ${className}`} {...rest} />;
}

/* ---------------------------------------------------------------- Select */

export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`relative ${className}`}>
      <select className={`${fieldBase} h-9 w-full cursor-pointer appearance-none bg-background pr-8`} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

/* ----------------------------------------------------------------- Label */

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium leading-none text-foreground">
      {children}
    </label>
  );
}

/* ----------------------------------------------------------------- Badge */

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "red" | "amber" | "indigo" }) {
  const tones: Record<string, string> = {
    slate: "border-transparent bg-secondary text-secondary-foreground",
    green: "border-transparent bg-emerald-100 text-emerald-900",
    red: "border-transparent bg-red-100 text-red-900",
    amber: "border-transparent bg-amber-100 text-amber-900",
    indigo: "border-transparent bg-indigo-100 text-indigo-900",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- Alert */

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: ReactNode }) {
  const styles =
    kind === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : kind === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-border bg-muted/50 text-foreground";
  const Icon = kind === "error" ? TriangleAlert : kind === "success" ? CircleCheck : Info;
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-xs ${styles}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------- EmptyState */

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed bg-card px-6 py-14 text-center shadow-xs">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ SpinnerBlock */

export function SpinnerBlock({ label = "Memuat..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

/* ----------------------------------------------------------------- Table */

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y transition-colors [&>tr:hover:bg-muted/40]">{children}</tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------- StatCard */

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card>
      <CardBody className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground/80">{hint}</p>}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------- ProjectNote */

/** Pilih project aktif — dipakai seluruh halaman berbasis project. */
export function ProjectNote({ name }: { name?: string | null }) {
  return (
    <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
      Project aktif: <span className="font-medium text-foreground">{name || "belum dipilih"}</span>
    </p>
  );
}
